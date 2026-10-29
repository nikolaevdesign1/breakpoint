# The club's golf cart for the booking map (round 8): a modern two-seat utility cart at real size,
# built from code so it can be rebuilt and tuned. Exports blender/life/cart.raw.glb; then
#   node scripts/life/optimize-cart.mjs   (→ public/models/life/cart.glb, quantised + meshopt)
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/life/build_cart.py [-- --preview]
#
# Coordinates are written in the page's cart space (three.js): x to the cart's left, y up, z forward,
# origin on the ground under the middle of the cart; V() turns them into Blender's z-up axes so the
# glTF export (+Y up) lands exactly in three's frame. Nodes: `cart_body` (shell, seat, canopy,
# cargo), `cart_driver`, `cart_glass`, and `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` with
# their origins at the wheel centres (the page spins and steers them).
#
# Size: 2.40 m long, 1.20 m wide, 1.80 m to the roof; wheelbase 1.64 m, 18-inch tyres on 8-inch rims.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'blender', 'life')
os.makedirs(OUT_DIR, exist_ok=True)
PREVIEW = '--preview' in sys.argv

WHEEL_R = 0.229
TYRE_W = 0.19
TRACK = 0.94  # wheel centre to wheel centre, across
FRONT_Z = 0.80
REAR_Z = -0.84
ROOF_Y = 1.74


def V(x, y, z):
    """Cart space (x left, y up, z forward) → Blender (x, −z, y)."""
    return Vector((x, -z, y))


# --- Scene + materials ----------------------------------------------------------------------------

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
COL = scene.collection

MATS = {}


def mat(name, hex_, rough=0.5, metal=0.0, alpha=1.0, emit=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    h = hex_.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if emit > 0:
        b.inputs['Emission Color'].default_value = (*lin, 1)
        b.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m


PAINT = mat('paint', '#ECEAE4', 0.32)          # gel-coated fibreglass, off-white
UNDER = mat('paint_under', '#D9D6CE', 0.6)     # roof lining
DARK = mat('trim', '#2A2B2D', 0.55)            # moulded plastic, struts, bumpers
RUBBER = mat('rubber', '#151515', 0.92)
METAL = mat('metal', '#C4C7CA', 0.28, 1.0)
SEAT = mat('seat', '#36251B', 0.48)            # vinyl
GLASS = mat('glass', '#DCE6E8', 0.04, 0.0, 0.22)
LAMP = mat('lamp', '#F4F1E6', 0.08, 0.0, 1.0, 0.6)
TAIL = mat('tail', '#7E1C14', 0.3)
COOLER = mat('cooler', '#9C441F', 0.42)
CREAM = mat('cream', '#FFF3DA', 0.5)
OLIVE = mat('olive', '#646544', 0.7)
BOTTLE = mat('bottle', '#C6DAE0', 0.18)
BALL = mat('ball', '#CFDB3C', 0.9)
SKIN = mat('skin', '#9A6A4F', 0.62)
KHAKI = mat('khaki', '#BFAE8E', 0.82)
CAP = mat('cap', '#36251B', 0.75)
SHOE = mat('shoe', '#EFEDE7', 0.6)
POLO = mat('polo', '#646544', 0.78)


# --- Mesh helpers ---------------------------------------------------------------------------------

def link(name, mesh, m=None):
    o = bpy.data.objects.new(name, mesh)
    COL.objects.link(o)
    if m is not None:
        mesh.materials.append(m)
    return o


def from_bm(name, bm, m):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(name, me, m)


def bake(o):
    """Applies the object's modifiers (evaluated mesh), keeps its materials."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    old = o.data
    o.modifiers.clear()
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return o


def bevel(o, width, seg=3, angle=None):
    md = o.modifiers.new('bevel', 'BEVEL')
    md.width = width
    md.segments = seg
    md.limit_method = 'ANGLE' if angle else 'NONE'
    if angle:
        md.angle_limit = math.radians(angle)
    md.harden_normals = False
    return o


def smooth(o, angle=35):
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError:
        pass
    return o


def rbox(name, w, h, d, c, m, r=0.02, seg=3, rot=None):
    """Rounded box: w (x) × h (y) × d (z) centred at cart-space c."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    o = from_bm(name, bm, m)
    if r > 0:
        bevel(o, min(r, w / 2.05, h / 2.05, d / 2.05), seg)
        bake(o)
    if rot is not None:
        o.data.transform(rot)
    o.data.transform(Matrix.Translation(V(*c)))
    return smooth(o)


def cyl(name, r, depth, c, axis, m, n=24, r2=None, bev=0.0, cap=True):
    """Cylinder (or cone, r2) of `depth` along cart-space `axis` ('x', 'y', 'z'), centred at c."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    o = from_bm(name, bm, m)
    if bev > 0:
        bevel(o, bev, 2, 40)
        bake(o)
    rot = {'y': Matrix.Rotation(0, 4, 'X'), 'z': Matrix.Rotation(math.pi / 2, 4, 'X'), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y')}[axis]
    o.data.transform(rot)
    o.data.transform(Matrix.Translation(V(*c)))
    return smooth(o, 50)


def sphere(name, r, c, m, scale=(1, 1, 1), seg=16, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=Vector((scale[0], scale[2], scale[1])), verts=bm.verts)
    o = from_bm(name, bm, m)
    o.data.transform(Matrix.Translation(V(*c)))
    return smooth(o, 80)


def tube(name, pts, r, m, closed=False, res=6, caps=True, smooth_pts=False):
    """A round tube through cart-space points (struts, rails, limbs)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(1, res // 4)
    cu.use_fill_caps = caps
    cu.resolution_u = 6 if smooth_pts else 1
    if smooth_pts:
        sp = cu.splines.new('BEZIER')
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = V(*p)
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
    else:
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for sp_pt, p in zip(sp.points, pts):
            sp_pt.co = (*V(*p), 1)
    sp.use_cyclic_u = closed
    o = bpy.data.objects.new(name + '_c', cu)
    COL.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.curves.remove(cu)
    out = link(name, me, m)
    return smooth(out, 60)


def capsule(name, a, b, r, m, r_b=None):
    """Limb: a tapered tube a → b with round ends."""
    rb = r if r_b is None else r_b
    parts = [tube(name, [a, b], (r + rb) / 2, m, res=8)]
    parts.append(sphere(name + '_a', r, a, m, seg=12, rings=8))
    parts.append(sphere(name + '_b', rb, b, m, seg=12, rings=8))
    return join(parts, name)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def profile_solid(name, prof, width, m, taper=None, xsegs=6):
    """A side profile [(z, y), …] (cart space, counter-clockwise seen from +x) extruded across
    `width`; taper(z, y) → x scale, for a body that narrows towards the nose."""
    bm = bmesh.new()
    rings = []
    for k in range(xsegs + 1):
        x = -width / 2 + width * k / xsegs
        ring = []
        for (z, y) in prof:
            s = taper(z, y) if taper else 1.0
            ring.append(bm.verts.new(V(x * s, y, z)))
        rings.append(ring)
    n = len(prof)
    for k in range(xsegs):
        for i in range(n):
            a, b = rings[k][i], rings[k][(i + 1) % n]
            c, d = rings[k + 1][(i + 1) % n], rings[k + 1][i]
            bm.faces.new((a, b, c, d))
    caps = [bm.faces.new(list(reversed(rings[0]))), bm.faces.new(rings[-1])]
    bmesh.ops.triangulate(bm, faces=caps, quad_method='BEAUTY', ngon_method='EAR_CLIP')  # concave profiles
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bm(name, bm, m)


def cut(o, cutters):
    """Boolean difference with the cutter objects (deleted afterwards)."""
    for c in cutters:
        md = o.modifiers.new('cut', 'BOOLEAN')
        md.operation = 'DIFFERENCE'
        md.solver = 'EXACT'
        md.object = c
        c.hide_render = True
        c.hide_viewport = True
    bake(o)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    return o


def arch_cutters(z, r, inner=0.30):
    out = []
    for s in (-1, 1):
        x0 = s * inner
        x1 = s * 0.75
        out.append(cyl('arch', r, abs(x1 - x0), ((x0 + x1) / 2, WHEEL_R, z), 'x', DARK, n=40))
    return out


body = []

# --- Front cowl: one fibreglass shell over the front wheels, headlights in its face ---------------
cowl_prof = [
    (0.47, 0.27), (0.80, 0.27), (1.12, 0.27), (1.185, 0.33), (1.215, 0.45), (1.215, 0.56),
    (1.19, 0.66), (1.12, 0.735), (1.00, 0.785), (0.84, 0.82), (0.66, 0.845), (0.55, 0.85),
    (0.50, 0.80), (0.48, 0.62), (0.455, 0.42),
]
cowl = profile_solid('cowl', cowl_prof, 1.16, PAINT,
                     taper=lambda z, y: 1 - 0.13 * max(0, (z - 0.9) / 0.32) ** 2 - 0.04 * max(0, (y - 0.6) / 0.25), xsegs=8)
bevel(cowl, 0.045, 4, 25)
bake(cowl)
cut(cowl, arch_cutters(FRONT_Z, 0.285))
body.append(smooth(cowl, 32))

# Front bumper (a dark moulded bar wrapping the nose) and a lower grille slot.
bumper = profile_solid('bumper', [(1.16, 0.22), (1.25, 0.22), (1.26, 0.31), (1.20, 0.34), (1.16, 0.34)], 1.06, DARK,
                       taper=lambda z, y: 1 - 0.05 * max(0, (z - 1.18) / 0.08))
bevel(bumper, 0.02, 3)
bake(bumper)
body.append(smooth(bumper))
body.append(rbox('grille', 0.46, 0.035, 0.03, (0, 0.40, 1.205), DARK, r=0.012))

# Headlights: round lenses in dark bezels on the cowl's face, a hint of glow.
for s in (-1, 1):
    hx = s * 0.35
    body.append(cyl('bezel', 0.072, 0.03, (hx, 0.56, 1.205), 'z', DARK, n=28, bev=0.008))
    body.append(sphere('lens', 0.06, (hx, 0.56, 1.215), LAMP, scale=(1, 1, 0.32), seg=24, rings=10))
    body.append(rbox('indicator', 0.07, 0.025, 0.02, (s * 0.35, 0.47, 1.205), mat('amber', '#C7792B', 0.3), r=0.008))

# Dashboard: dark moulded panel behind the cowl, glovebox recesses, a key switch.
dash = profile_solid('dash', [(0.42, 0.58), (0.50, 0.58), (0.56, 0.87), (0.48, 0.88), (0.42, 0.80)], 1.06, DARK)
bevel(dash, 0.02, 3)
bake(dash)
body.append(smooth(dash))
for s in (-1, 1):
    body.append(rbox('cubby', 0.36, 0.09, 0.03, (s * 0.25, 0.72, 0.415), mat('trim_deep', '#151617', 0.7), r=0.01))
body.append(cyl('key', 0.018, 0.02, (0.04, 0.78, 0.43), 'z', METAL, n=12))

# Floor: dark chassis rails, floorboard and a ribbed rubber mat; side steps.
body.append(rbox('chassis', 0.84, 0.10, 2.0, (0, 0.20, -0.02), DARK, r=0.02))
body.append(rbox('floor', 1.10, 0.04, 0.46, (0, 0.285, 0.25), DARK, r=0.012))
body.append(rbox('mat', 0.94, 0.012, 0.38, (0, 0.31, 0.26), RUBBER, r=0.004))
for i in range(8):
    body.append(rbox('rib', 0.86, 0.006, 0.012, (0, 0.318, 0.10 + i * 0.045), RUBBER, r=0.0))
for s in (-1, 1):
    body.append(rbox('step', 0.07, 0.05, 0.50, (s * 0.565, 0.29, 0.22), RUBBER, r=0.012))

# Seat pod and rear body: one moulded shell from the seat to the tail, arches over the rear wheels.
rear_prof = [
    (-1.17, 0.29), (-0.84, 0.29), (-0.40, 0.29), (0.07, 0.29), (0.07, 0.56), (0.03, 0.60),
    (-0.62, 0.60), (-0.66, 0.68), (-1.13, 0.68), (-1.17, 0.64),
]
rear = profile_solid('rear', rear_prof, 1.14, PAINT, xsegs=6)
bevel(rear, 0.035, 3, 25)
bake(rear)
cut(rear, arch_cutters(REAR_Z, 0.28, inner=0.32))
body.append(smooth(rear, 32))
for s in (-1, 1):
    body.append(rbox('tail', 0.11, 0.06, 0.02, (s * 0.44, 0.55, -1.175), TAIL, r=0.008))
    body.append(rbox('reflector', 0.06, 0.03, 0.015, (s * 0.44, 0.47, -1.172), TAIL, r=0.005))
body.append(rbox('rear_bumper', 1.04, 0.07, 0.07, (0, 0.27, -1.19), DARK, r=0.02))

# Bench seat: cushion with a front roll and side bolsters, a backrest with two panels.
body.append(rbox('cushion', 1.02, 0.11, 0.54, (0, 0.655, -0.27), SEAT, r=0.045, seg=4))
body.append(rbox('cushion_roll', 1.02, 0.06, 0.07, (0, 0.69, 0.0), SEAT, r=0.03, seg=3))
for s in (-1, 1):
    body.append(rbox('bolster', 0.07, 0.05, 0.52, (s * 0.49, 0.73, -0.27), SEAT, r=0.024, seg=3))
lean = Matrix.Rotation(math.radians(-10), 4, 'X')  # back leans back (Blender X = cart x)
body.append(rbox('backrest', 1.02, 0.40, 0.10, (0, 0.95, -0.60), SEAT, r=0.04, seg=4, rot=lean))
body.append(rbox('back_seam', 0.012, 0.34, 0.11, (0, 0.95, -0.598), mat('seam', '#24180F', 0.6), r=0.0, rot=lean))
body.append(rbox('back_shell', 1.06, 0.44, 0.04, (0, 0.95, -0.665), DARK, r=0.015, rot=lean))

# Hip restraints: bent tubes at the ends of the seat.
for s in (-1, 1):
    x = s * 0.56
    body.append(tube('hip', [(x, 0.60, -0.52), (x, 0.86, -0.50), (x, 0.88, -0.30), (x, 0.84, -0.14), (x, 0.62, -0.10)], 0.014, DARK, smooth_pts=True))

# Canopy: four thin struts and a moulded roof with soft edges, lining underneath, a mirror.
for s in (-1, 1):
    x = s * 0.535
    body.append(tube('strut_f', [(x, 0.80, 0.60), (x * 1.01, ROOF_Y, 0.72)], 0.017, DARK))
    body.append(tube('strut_r', [(x, 0.62, -0.69), (x * 1.01, ROOF_Y, -0.70)], 0.017, DARK))
    body.append(cyl('strut_foot', 0.03, 0.03, (x, 0.82, 0.60), 'y', DARK, n=12))
roof_prof = [(-0.82, ROOF_Y), (0.88, ROOF_Y), (0.93, ROOF_Y + 0.03), (0.90, ROOF_Y + 0.07), (0.70, ROOF_Y + 0.085),
             (-0.60, ROOF_Y + 0.085), (-0.83, ROOF_Y + 0.07), (-0.86, ROOF_Y + 0.03)]
roof = profile_solid('roof', roof_prof, 1.20, PAINT, taper=lambda z, y: 1 - 0.03 * ((y - ROOF_Y) / 0.085), xsegs=8)
bevel(roof, 0.03, 4, 25)
bake(roof)
body.append(smooth(roof, 32))
for s in (-1, 1):  # two moulded ribs along the roof, a drip edge at the front
    body.append(rbox('roof_rib', 0.07, 0.025, 1.36, (s * 0.30, ROOF_Y + 0.085, 0.02), PAINT, r=0.012, seg=2))
body.append(rbox('roof_lip', 1.12, 0.02, 0.03, (0, ROOF_Y + 0.02, 0.925), UNDER, r=0.008, seg=2))
body.append(rbox('lining', 1.10, 0.012, 1.58, (0, ROOF_Y - 0.004, 0.04), UNDER, r=0.005))
body.append(rbox('mirror', 0.20, 0.055, 0.02, (0, ROOF_Y - 0.08, 0.68), DARK, r=0.01))
body.append(tube('mirror_arm', [(0, ROOF_Y - 0.05, 0.68), (0, ROOF_Y - 0.005, 0.69)], 0.008, DARK))

# Windshield: thin tinted glass in the front struts' plane, a rubber edge along the top.
gl_bot, gl_top = (0.88, 0.615), (ROOF_Y - 0.05, 0.71)
bm = bmesh.new()
quad = [bm.verts.new(V(x, y, z)) for (x, y, z) in [(-0.51, gl_bot[0], gl_bot[1]), (0.51, gl_bot[0], gl_bot[1]),
                                                    (0.51, gl_top[0], gl_top[1]), (-0.51, gl_top[0], gl_top[1])]]
bm.faces.new(quad)
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.006)
glass = from_bm('cart_glass', bm, GLASS)
body.append(tube('glass_top', [(-0.51, gl_top[0], gl_top[1]), (0.51, gl_top[0], gl_top[1])], 0.01, RUBBER))
body.append(tube('glass_bot', [(-0.51, gl_bot[0], gl_bot[1]), (0.51, gl_bot[0], gl_bot[1])], 0.009, RUBBER))

# Steering column and wheel (driver on the left, +x), three spokes.
SW = Vector((0.27, 1.03, 0.27))  # wheel centre (cart space)
tilt = math.radians(38)          # wheel plane from horizontal, facing the driver
n_sw = Vector((0, math.cos(tilt), -math.sin(tilt)))
body.append(tube('column', [(0.27, 0.70, 0.47), (SW.x, SW.y - n_sw.y * 0.05, SW.z - n_sw.z * 0.05)], 0.022, DARK))
body.append(cyl('column_boot', 0.04, 0.10, (0.27, 0.70, 0.45), 'z', DARK, n=16, r2=0.03))
ring = []
for i in range(33):
    a = 2 * math.pi * i / 32
    # Circle in the plane ⟂ n_sw: u = x axis, v = n × u.
    u = Vector((1, 0, 0))
    v = n_sw.cross(u)
    p = SW + (u * math.cos(a) + v * math.sin(a)) * 0.18
    ring.append(tuple(p))
body.append(tube('steer_ring', ring[:-1], 0.016, DARK, closed=True, res=8))
for a in (math.pi * 0.5, math.pi * 1.17, math.pi * 1.83):
    u = Vector((1, 0, 0))
    v = n_sw.cross(u)
    p = SW + (u * math.cos(a) + v * math.sin(a)) * 0.17
    body.append(tube('spoke', [tuple(SW), tuple(p)], 0.012, DARK))
body.append(sphere('hub', 0.045, tuple(SW), DARK, scale=(1, 0.5, 1), seg=16, rings=8))

# Cargo bed: dark deck with low rails on three sides, carrying a water cooler, a crate of
# bottles and two baskets of balls.
BED_Y = 0.70
body.append(rbox('bed', 1.10, 0.04, 0.56, (0, BED_Y - 0.02, -0.92), DARK, r=0.012))
for s in (-1, 1):
    x = s * 0.53
    body.append(tube('rail_side', [(x, BED_Y, -0.66), (x, BED_Y + 0.15, -0.68), (x, BED_Y + 0.15, -1.16), (x, BED_Y, -1.18)], 0.012, DARK))
body.append(tube('rail_back', [(-0.53, BED_Y + 0.15, -1.17), (0.53, BED_Y + 0.15, -1.17)], 0.012, DARK))
for x in (-0.26, 0.0, 0.26):
    body.append(tube('rail_post', [(x, BED_Y, -1.17), (x, BED_Y + 0.15, -1.17)], 0.009, DARK))
body.append(rbox('bed_lip', 1.10, 0.05, 0.03, (0, BED_Y + 0.01, -1.18), DARK, r=0.008))

# Water cooler: orange barrel, cream lid, tap.
cx, cz = -0.28, -0.82
body.append(cyl('cooler', 0.16, 0.38, (cx, BED_Y + 0.19, cz), 'y', COOLER, n=32, bev=0.02))
body.append(cyl('cooler_lid', 0.165, 0.05, (cx, BED_Y + 0.40, cz), 'y', CREAM, n=32, bev=0.015))
body.append(sphere('cooler_knob', 0.035, (cx, BED_Y + 0.43, cz), CREAM, scale=(1, 0.5, 1), seg=12, rings=6))
body.append(rbox('cooler_tap', 0.04, 0.04, 0.05, (cx, BED_Y + 0.06, cz + 0.17), CREAM, r=0.01))
for s in (-1, 1):
    body.append(rbox('cooler_handle', 0.025, 0.05, 0.08, (cx + s * 0.165, BED_Y + 0.33, cz), CREAM, r=0.01))

# Crate of water bottles (3 × 4).
kx, kz = -0.26, -1.05
body.append(rbox('crate', 0.40, 0.20, 0.22, (kx, BED_Y + 0.10, kz), OLIVE, r=0.012))
body.append(rbox('crate_in', 0.36, 0.02, 0.18, (kx, BED_Y + 0.195, kz), mat('olive_deep', '#3E3F2A', 0.8), r=0.0))
for i in range(4):
    for j in range(3):
        bx, bz = kx - 0.135 + i * 0.09, kz - 0.06 + j * 0.06
        body.append(cyl('bottle', 0.027, 0.12, (bx, BED_Y + 0.25, bz), 'y', BOTTLE, n=10))
        body.append(cyl('bottle_cap', 0.014, 0.025, (bx, BED_Y + 0.32, bz), 'y', CREAM, n=8))

# Two wire baskets of balls.
def basket(bx, bz):
    out = []
    w, h = 0.26, 0.26
    y0 = BED_Y
    for (sx, sz) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        out.append(tube('bk_leg', [(bx + sx * w / 2, y0, bz + sz * w / 2), (bx + sx * w / 2, y0 + h, bz + sz * w / 2)], 0.006, DARK))
    for yy in (y0 + 0.01, y0 + h * 0.5, y0 + h):
        sq = [(bx - w / 2, yy, bz - w / 2), (bx + w / 2, yy, bz - w / 2), (bx + w / 2, yy, bz + w / 2), (bx - w / 2, yy, bz + w / 2)]
        out.append(tube('bk_ring', sq, 0.005, DARK, closed=True, res=4))
    for k in range(1, 4):
        t = -w / 2 + w * k / 4
        for side in (-1, 1):
            out.append(tube('bk_bar', [(bx + t, y0, bz + side * w / 2), (bx + t, y0 + h, bz + side * w / 2)], 0.004, DARK, caps=False))
            out.append(tube('bk_bar', [(bx + side * w / 2, y0, bz + t), (bx + side * w / 2, y0 + h, bz + t)], 0.004, DARK, caps=False))
    # Handles folded down along two sides.
    for side in (-1, 1):
        out.append(tube('bk_handle', [(bx - w / 2 + 0.03, y0 + h, bz + side * (w / 2 + 0.01)), (bx - w / 2 + 0.05, y0 + h + 0.04, bz + side * (w / 2 + 0.02)),
                                      (bx + w / 2 - 0.05, y0 + h + 0.04, bz + side * (w / 2 + 0.02)), (bx + w / 2 - 0.03, y0 + h, bz + side * (w / 2 + 0.01))], 0.005, DARK))
    # Balls: a heaped top layer (what shows from above) over a dark fill.
    out.append(rbox('bk_fill', w - 0.02, h - 0.06, w - 0.02, (bx, y0 + (h - 0.06) / 2 + 0.01, bz), mat('ball_deep', '#6C7224', 0.95), r=0.0))
    r = 0.033
    import random
    rnd = random.Random(int(bx * 100 + bz * 1000))
    for i in range(4):
        for j in range(4):
            px = bx - w / 2 + r + 0.004 + i * (w - 2 * r - 0.008) / 3 + rnd.uniform(-0.006, 0.006)
            pz = bz - w / 2 + r + 0.004 + j * (w - 2 * r - 0.008) / 3 + rnd.uniform(-0.006, 0.006)
            dome = 0.02 * (1 - ((i - 1.5) ** 2 + (j - 1.5) ** 2) / 4.5)
            out.append(sphere('ball', r, (px, y0 + h - 0.02 + dome + rnd.uniform(0, 0.01), pz), BALL, seg=8, rings=5))
    for i in range(3):
        for j in range(3):
            px = bx - w / 3 + i * w / 3
            pz = bz - w / 3 + j * w / 3
            out.append(sphere('ball', r, (px, y0 + h + 0.03 + rnd.uniform(-0.005, 0.01), pz), BALL, seg=8, rings=5))
    return out


body += basket(0.25, -0.79)
body += basket(0.25, -1.06)

# --- Driver: a member of staff in an olive club polo, khaki shorts and a dark cap ----------------
DX = 0.27
drv = []
drv.append(rbox('hips', 0.36, 0.15, 0.30, (DX, 0.79, -0.30), KHAKI, r=0.06, seg=3))
for s in (-1, 1):
    hx = DX + s * 0.095
    drv.append(capsule('thigh', (hx, 0.79, -0.26), (hx + s * 0.01, 0.82, -0.02), 0.078, KHAKI, 0.07))
    drv.append(capsule('knee', (hx + s * 0.01, 0.82, -0.02), (hx + s * 0.015, 0.83, 0.13), 0.066, SKIN, 0.055))
    drv.append(capsule('shin', (hx + s * 0.015, 0.83, 0.13), (hx + s * 0.02, 0.42, 0.28), 0.05, SKIN, 0.04))
    drv.append(rbox('sock', 0.075, 0.05, 0.08, (hx + s * 0.02, 0.41, 0.28), SHOE, r=0.025))
    drv.append(rbox('shoe', 0.10, 0.075, 0.27, (hx + s * 0.02, 0.36, 0.33), SHOE, r=0.035, seg=3))
    drv.append(rbox('sole', 0.10, 0.02, 0.27, (hx + s * 0.02, 0.325, 0.33), mat('sole', '#8C8579', 0.8), r=0.008))
torso_rot = Matrix.Rotation(math.radians(-6), 4, 'X')
torso = rbox('torso', 0.38, 0.50, 0.23, (0, 0, 0), POLO, r=0.09, seg=4, rot=torso_rot)
torso.data.transform(Matrix.Translation(V(DX, 1.11, -0.36)))
# narrower at the waist: pull the lower vertices in
for v in torso.data.vertices:
    p = v.co
    y = p.z  # Blender z = cart y
    k = max(0.0, min(1.0, (1.0 - y) / 0.15))
    p.x = DX + (p.x - DX) * (1 - 0.12 * k)
drv.append(torso)
drv.append(rbox('collar', 0.17, 0.035, 0.12, (DX, 1.365, -0.35), POLO, r=0.015))
drv.append(cyl('neck', 0.052, 0.10, (DX, 1.40, -0.34), 'y', SKIN, n=14))
drv.append(sphere('head', 0.095, (DX, 1.53, -0.32), SKIN, scale=(0.92, 1.12, 1.02), seg=20, rings=12))
drv.append(sphere('nose', 0.02, (DX, 1.52, -0.225), SKIN, scale=(0.8, 1.2, 1), seg=8, rings=6))
for s in (-1, 1):
    drv.append(sphere('ear', 0.022, (DX + s * 0.088, 1.53, -0.33), SKIN, scale=(0.5, 1.2, 0.9), seg=8, rings=6))
# Cap: crown, band, brim (plain, no logo).
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.103)
for v in list(bm.verts):
    if v.co.z < -0.005:
        v.co.z = -0.005
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
crown = from_bm('cap', bm, CAP)
crown.data.transform(Matrix.Scale(1.0, 4))
crown.data.transform(Matrix.Translation(V(DX, 1.575, -0.325)))
drv.append(smooth(crown, 70))
brim = cyl('brim', 0.085, 0.008, (0, 0, 0), 'y', CAP, n=20)
for v in brim.data.vertices:
    if v.co.y > 0:  # Blender +y = cart −z: the back half folds under the crown
        v.co.y *= 0.2
brim.data.transform(Matrix.Rotation(math.radians(-8), 4, 'X'))
brim.data.transform(Matrix.Translation(V(DX, 1.585, -0.24)))
drv.append(brim)
# Arms: short sleeves, forearms to the wheel at ten to two.
for s in (-1, 1):
    sh = (DX + s * 0.20, 1.30, -0.36)
    el = (DX + s * 0.23, 1.08, -0.17)
    u = Vector((1, 0, 0))
    v = n_sw.cross(u)
    hand = SW + (u * math.cos(math.pi / 2 - s * 1.0) + v * math.sin(math.pi / 2 - s * 1.0)) * 0.18
    hand = (hand.x, hand.y + 0.01, hand.z)
    drv.append(capsule('sleeve', sh, ((sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2, (sh[2] + el[2]) / 2), 0.062, POLO, 0.056))
    drv.append(capsule('upper', ((sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2, (sh[2] + el[2]) / 2), el, 0.046, SKIN, 0.042))
    drv.append(capsule('fore', el, hand, 0.04, SKIN, 0.032))
    drv.append(sphere('hand', 0.042, hand, SKIN, scale=(0.8, 0.9, 1.2), seg=10, rings=8))

# --- Wheels: 18-inch tyres with a block tread on 8-inch rims, hubcaps facing out ------------------
def wheel(name, centre, outward):
    """Built at the origin around the x axis, moved to `centre`; `outward` = ±1 (hubcap side)."""
    parts = []
    # Tyre: a lathe of a rounded section around the x axis.
    sec = []
    rim_r = 0.105
    hw = TYRE_W / 2
    for i in range(13):
        t = i / 12
        a = math.pi * (t - 0.5)
        x = math.sin(a) * hw
        r = rim_r + (WHEEL_R - 0.012 - rim_r) * (0.5 + 0.5 * math.cos(a) ** 0.6) + 0.0
        sec.append((x, r))
    sec = [(-hw * 0.82, rim_r)] + sec + [(hw * 0.82, rim_r)]
    bm = bmesh.new()
    n = 48
    rings = []
    for k in range(n):
        th = 2 * math.pi * k / n
        rings.append([bm.verts.new((x, math.cos(th) * r, math.sin(th) * r)) for (x, r) in sec])
    for k in range(n):
        a_, b_ = rings[k], rings[(k + 1) % n]
        for i in range(len(sec) - 1):
            bm.faces.new((a_[i], a_[i + 1], b_[i + 1], b_[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tyre = from_bm(name + '_tyre', bm, RUBBER)
    parts.append(smooth(tyre, 50))
    # Tread: staggered blocks around the crown.
    nb = 26
    for k in range(nb):
        th = 2 * math.pi * k / nb
        for row, off in ((-1, 0.0), (1, math.pi / nb)):
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1)
            bmesh.ops.scale(bm, vec=Vector((0.075, 0.034, 0.02)), verts=bm.verts)
            bmesh.ops.translate(bm, vec=Vector((row * 0.042, 0, WHEEL_R - 0.012)), verts=bm.verts)
            bmesh.ops.rotate(bm, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(th + off, 3, 'X'), verts=bm.verts)
            parts.append(from_bm('tread', bm, RUBBER))
    # Rim and hubcap.
    rim = cyl('rim', rim_r, TYRE_W * 0.8, (0, 0, 0), 'x', DARK, n=32, cap=True)
    parts.append(rim)
    cap = cyl('hubcap', 0.098, 0.02, (0, 0, 0), 'x', METAL, n=32, bev=0.008)
    cap.data.transform(Matrix.Translation((outward * (TYRE_W * 0.4 + 0.004), 0, 0)))
    parts.append(cap)
    dome = sphere('dome', 0.035, (0, 0, 0), METAL, scale=(0.5, 1, 1), seg=16, rings=8)
    dome.data.transform(Matrix.Translation((outward * (TYRE_W * 0.4 + 0.016), 0, 0)))
    parts.append(dome)
    for k in range(6):
        th = 2 * math.pi * k / 6
        slot = rbox('slot', 0.006, 0.022, 0.05, (0, 0, 0), DARK, r=0.0)
        slot.data.transform(Matrix.Translation((outward * (TYRE_W * 0.4 + 0.014), -0.065, 0)))
        slot.data.transform(Matrix.Rotation(th, 4, 'X'))
        parts.append(slot)
    for k in range(4):
        th = 2 * math.pi * k / 4 + math.pi / 4
        nut = cyl('nut', 0.009, 0.014, (0, 0, 0), 'x', METAL, n=6)
        nut.data.transform(Matrix.Translation((outward * (TYRE_W * 0.4 + 0.018), 0.045 * math.cos(th), 0.045 * math.sin(th))))
        parts.append(nut)
    w = join(parts, name)
    w.location = V(*centre)
    return w


wheels = [
    wheel('wheel_fl', (TRACK / 2, WHEEL_R, FRONT_Z), 1),
    wheel('wheel_fr', (-TRACK / 2, WHEEL_R, FRONT_Z), -1),
    wheel('wheel_rl', (TRACK / 2, WHEEL_R, REAR_Z), 1),
    wheel('wheel_rr', (-TRACK / 2, WHEEL_R, REAR_Z), -1),
]

cart_body = join(body, 'cart_body')
cart_driver = join(drv, 'cart_driver')

# Merge by distance where parts share vertices, outward normals on every closed part.
for o in [cart_body, cart_driver] + wheels:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in [cart_body, cart_driver, glass] + wheels)
print(f'[cart] triangles: {tris}')
for o in [cart_body, cart_driver, glass] + wheels:
    print(f'[cart] {o.name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris')

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, 'cart.blend'))

bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT_DIR, 'cart.raw.glb'), export_format='GLB', use_selection=False,
    export_apply=True, export_yup=True, export_texcoords=False, export_normals=True,
    export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False,
    export_extras=False,
)
print('[cart] exported', os.path.join(OUT_DIR, 'cart.raw.glb'))

if PREVIEW:
    sys.path.insert(0, os.path.dirname(__file__))
    from lib_life import setup_world
    setup_world(scene)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    ground = bpy.context.object
    ground.data.materials.append(mat('ground', '#8C8A84', 0.9))
    for i, (name, loc) in enumerate([('three_q', V(3.4, 2.2, 3.6)), ('side', V(4.2, 1.2, 0.2)), ('top', V(1.4, 5.0, -2.4)), ('back', V(-2.6, 2.0, -3.4))]):
        cam_data = bpy.data.cameras.new(name)
        cam_data.lens = 50
        cam = bpy.data.objects.new(name, cam_data)
        COL.objects.link(cam)
        cam.location = loc
        d = V(0, 0.8, 0) - loc
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.camera = cam
        scene.render.filepath = os.path.join(OUT_DIR, f'preview_{name}.png')
        bpy.ops.render.render(write_still=True)
