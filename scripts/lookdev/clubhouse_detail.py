# Row 65: the clubhouse, rebuilt with much more detail. Re-runnable.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/clubhouse_detail.py
# - Brick masonry (Poly Haven "Red Brick", CC0), tiled so a brick is ~0.25 m long, box-projected in metres.
# - Front facade with real openings: 0.16 m reveals, dark reflective glass, aluminium frames with
#   mullions, concrete sills and lintels; glazed doors (a double main door) with steel canopies and steps.
# - Rendered plinth, hipped terracotta roof with fascia, soffits, ridge/hip caps, gutters, downpipes.
# - Extras: AC condensers on pads, wall lanterns, framed club posters (scripts/lookdev/posters),
#   weathering decals (ambientCG "Leaking" 007/008, CC0): streaks under the sills, splash zone above the
#   plinth, staining under the eaves.
# The clubhouse object stays one lightmapped mesh (walls, roof, glass and trim); extras, posters and
# grime are separate unlit-by-lightmap meshes.
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection, ROOT, TEX, swatch_uv, NAMES

PH = os.path.join(ROOT, 'blender', 'assets', 'polyhaven')
props_mat = props_material()
gen = collection('gen_clubhouse')
rnd = random.Random(65)

X0, X1, Y0, Y1, H = -25.0, 60.0, 52.0, 57.4, 3.1
D = 0.16  # reveal depth
DOORS = [(-9.5, 1.1, 2.2, False), (9.5, 2.4, 2.4, True), (47.5, 1.1, 2.2, False)]  # centre x, width, height, main (row 80: on the walkways' axes)
WIN_W, WIN_Z0, WIN_Z1 = 2.4, 1.0, 2.45


def img(path, colour):
    i = bpy.data.images.load(path, check_existing=True)
    i.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    return i


def tiled_material(mat, diff, rough, nor, tile, strength):
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    td = nt.nodes.new('ShaderNodeTexImage'); td.image = img(diff, True)
    tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = img(rough, False)
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img(nor, False)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = strength
    for t in (td, tr, tn):
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(td.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tr.outputs['Color'], b.inputs['Roughness'])
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])


wall_mat = bpy.data.materials['mat_clubhouse_wall']
rb = os.path.join(PH, 'red_brick', 'red_brick_')
tiled_material(wall_mat, rb + 'diff_1k.jpg', rb + 'rough_1k.jpg', rb + 'nor_gl_1k.jpg', 1.15, 0.9)
roof_mat = bpy.data.materials['mat_clubhouse_roof']
glass_mat = bpy.data.materials['mat_clubhouse_glass']
gb = glass_mat.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.010, 0.013, 0.016, 1)
gb.inputs['Roughness'].default_value = 0.035
gb.inputs['Alpha'].default_value = 1.0
glass_mat.surface_render_method = 'DITHERED'


def simple_material(name, image, blend=False, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if blend:
        nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
        m.surface_render_method = 'BLENDED'
    b.inputs['Roughness'].default_value = rough
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m


def tex(name):
    i = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    i.filepath = '//textures/' + name
    i.reload()
    return i


poster_mat = simple_material('mat_posters', tex('posters.png'), rough=0.45)
grime_img = tex('grime_atlas.png'); grime_img.alpha_mode = 'STRAIGHT'
grime_mat = simple_material('mat_grime', grime_img, blend=True, rough=0.95)

# --- Openings ---------------------------------------------------------------------------
openings = []  # (x0, x1, z0, z1, kind)
for cx, w, h, main in DOORS:
    openings.append((cx - w / 2, cx + w / 2, 0.0, h, 'main' if main else 'door'))
cx = X0 + 3.0
while cx <= X1 - 3.0 + 1e-6:
    if all(abs(cx - dx) >= dw / 2 + WIN_W / 2 + 0.9 for dx, dw, _, _ in DOORS):
        openings.append((cx - WIN_W / 2, cx + WIN_W / 2, WIN_Z0, WIN_Z1, 'window'))
    cx += 4.6
openings.sort()

# --- Walls, roof, glass (bmesh with explicit metre UVs) -----------------------------------
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')


def quad(pts, mat, uvs):
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.material_index = mat
    for l, uv in zip(f.loops, uvs):
        l[uvl].uv = uv
    return f


def wall_xz(x0, x1, z0, z1, y, outward):
    """Quad on a facade parallel to x; outward = -1 (front, faces −y) or +1 (back)."""
    pts = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
    uvs = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    if outward > 0:
        pts.reverse(); uvs.reverse()
    quad(pts, 0, uvs)


# Front facade: a grid split at every opening edge, cells inside openings left out.
xs = sorted({X0, X1} | {o[0] for o in openings} | {o[1] for o in openings})
zs = sorted({0.0, H} | {o[2] for o in openings} | {o[3] for o in openings})
for i in range(len(xs) - 1):
    for j in range(len(zs) - 1):
        mx, mz = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
        if any(o[0] < mx < o[1] and o[2] < mz < o[3] for o in openings):
            continue
        wall_xz(xs[i], xs[i + 1], zs[j], zs[j + 1], Y0, -1)
for x0, x1, z0, z1, kind in openings:
    yb = Y0 + D
    quad([(x0, Y0, z0), (x0, yb, z0), (x0, yb, z1), (x0, Y0, z1)], 0, [(Y0, z0), (yb, z0), (yb, z1), (Y0, z1)])      # left jamb
    quad([(x1, yb, z0), (x1, Y0, z0), (x1, Y0, z1), (x1, yb, z1)], 0, [(yb, z0), (Y0, z0), (Y0, z1), (yb, z1)])      # right jamb
    quad([(x0, Y0, z1), (x0, yb, z1), (x1, yb, z1), (x1, Y0, z1)], 0, [(x0, Y0), (x0, yb), (x1, yb), (x1, Y0)])      # head
    if z0 > 0:
        quad([(x0, yb, z0), (x0, Y0, z0), (x1, Y0, z0), (x1, yb, z0)], 0, [(x0, yb), (x0, Y0), (x1, Y0), (x1, yb)])  # sill
    quad([(x0, yb, z0), (x1, yb, z0), (x1, yb, z1), (x0, yb, z1)], 2, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)])      # glass
wall_xz(X0, X1, 0, H, Y1, 1)
quad([(X0, Y1, 0), (X0, Y0, 0), (X0, Y0, H), (X0, Y1, H)], 0, [(Y1, 0), (Y0, 0), (Y0, H), (Y1, H)])
quad([(X1, Y0, 0), (X1, Y1, 0), (X1, Y1, H), (X1, Y0, H)], 0, [(Y0, 0), (Y1, 0), (Y1, H), (Y0, H)])

# Hipped roof.
EO = 0.45
ex0, ex1, ey0, ey1 = X0 - EO, X1 + EO, Y0 - EO, Y1 + EO
ze = H + 0.12
run = (ey1 - ey0) / 2
pitch = math.radians(24)
zr = ze + run * math.tan(pitch)
ym = (ey0 + ey1) / 2
xr0, xr1 = ex0 + run, ex1 - run
k = 1 / math.cos(pitch)  # horizontal → along-slope metres
quad([(ex0, ey0, ze), (ex1, ey0, ze), (xr1, ym, zr), (xr0, ym, zr)], 1, [(ex0, 0), (ex1, 0), (xr1, run * k), (xr0, run * k)])
quad([(ex1, ey1, ze), (ex0, ey1, ze), (xr0, ym, zr), (xr1, ym, zr)], 1, [(-ex1, 0), (-ex0, 0), (-xr0, run * k), (-xr1, run * k)])
quad([(ex0, ey1, ze), (ex0, ey0, ze), (xr0, ym, zr)], 1, [(-ey1, 0), (-ey0, 0), (-ym, run * k)])
quad([(ex1, ey0, ze), (ex1, ey1, ze), (xr1, ym, zr)], 1, [(ey0, 0), (ey1, 0), (ym, run * k)])

me = bpy.data.meshes.new('clubhouse_shell')
bm.to_mesh(me); bm.free()
for m in (wall_mat, roof_mat, glass_mat, props_mat):
    me.materials.append(m)
shell = bpy.data.objects.new('clubhouse_shell', me)
gen.objects.link(shell)

# --- Trim that belongs to the lit shell (frames, sills, lintels, plinth, fascia, gutters) ----
t = Props()
for x0, x1, z0, z1, kind in openings:
    yb = Y0 + D
    fw = 0.06
    t.box((x0, yb - 0.06, z0), (x0 + fw, yb + 0.01, z1), 'alu_frame')
    t.box((x1 - fw, yb - 0.06, z0), (x1, yb + 0.01, z1), 'alu_frame')
    t.box((x0, yb - 0.06, z1 - fw), (x1, yb + 0.01, z1), 'alu_frame')
    t.box((x0, yb - 0.06, z0), (x1, yb + 0.01, z0 + (fw if kind == 'window' else 0.1)), 'alu_frame')
    w = x1 - x0
    if kind == 'window':
        for f in (1 / 3, 2 / 3):
            xm = x0 + w * f
            t.box((xm - 0.025, yb - 0.05, z0), (xm + 0.025, yb + 0.005, z1), 'alu_frame')
        t.box((x0, yb - 0.05, z0 + (z1 - z0) * 0.72), (x1, yb + 0.005, z0 + (z1 - z0) * 0.72 + 0.045), 'alu_frame')
        t.box((x0 - 0.07, Y0 - 0.06, z0 - 0.07), (x1 + 0.07, yb, z0 + 0.005), 'concrete', bevel=0.01)   # sill
    else:
        leaves = 2 if kind == 'main' else 1
        for f in range(1, leaves):
            xm = x0 + w * f / leaves
            t.box((xm - 0.04, yb - 0.06, z0), (xm + 0.04, yb + 0.005, z1), 'alu_frame')
        t.box((x0, yb - 0.05, z1 - 0.5), (x1, yb + 0.005, z1 - 0.45), 'alu_frame')  # transom
        for f in range(leaves):
            xm = x0 + w * (f + 0.5) / leaves
            t.box((xm - 0.22, yb - 0.09, 1.0), (xm + 0.22, yb - 0.06, 1.04), 'chrome')  # push bar
        t.box((x0 - 0.35, Y0 - 0.7, 0.0), (x1 + 0.35, Y0 + D, 0.12), 'concrete', bevel=0.01)  # step
    t.box((x0 - 0.18, Y0 - 0.014, z1), (x1 + 0.18, Y0 + 0.02, z1 + 0.17), 'concrete')     # lintel
# Plinth (rendered base, splash zone) all round, broken at the doors.
PL = 0.42
cuts = [(o[0], o[1]) for o in openings if o[2] == 0]
x = X0 - 0.025
for c0, c1 in cuts + [(X1 + 0.025, X1 + 0.025)]:
    t.box((x, Y0 - 0.025, 0), (c0, Y0 + 0.01, PL), 'plinth')
    x = c1
t.box((X0 - 0.025, Y1 - 0.01, 0), (X1 + 0.025, Y1 + 0.025, PL), 'plinth')
t.box((X0 - 0.025, Y0, 0), (X0 + 0.01, Y1, PL), 'plinth')
t.box((X1 - 0.01, Y0, 0), (X1 + 0.025, Y1, PL), 'plinth')
# Fascia, soffit, gutters, ridge and hip caps.
FH = 0.22
for (a, b) in (((ex0, ey0), (ex1, ey0)), ((ex1, ey1), (ex0, ey1))):
    y = a[1]
    s = -1 if y < ym else 1
    t.box((ex0, min(y, y - s * 0.03), ze - FH), (ex1, max(y, y - s * 0.03), ze + 0.01), 'white_paint')
    t.quad([(ex0, y, ze - FH), (ex1, y, ze - FH), (ex1, Y0 if s < 0 else Y1, ze - FH), (ex0, Y0 if s < 0 else Y1, ze - FH)][::(-1 if s < 0 else 1)], 'white_paint')
    gy = y + s * 0.075
    t.cyl((ex0, gy, ze - 0.1), (ex1, gy, ze - 0.1), 0.075, 'gutter', seg=10)
for x in (ex0, ex1):
    s = -1 if x < 0 else 1
    t.box((min(x, x - s * 0.03), ey0, ze - FH), (max(x, x - s * 0.03), ey1, ze + 0.01), 'white_paint')
    t.quad([(x, ey0, ze - FH), (x, ey1, ze - FH), (X0 if s < 0 else X1, ey1, ze - FH), (X0 if s < 0 else X1, ey0, ze - FH)][::(1 if s < 0 else -1)], 'white_paint')
t.cyl((xr0, ym, zr - 0.02), (xr1, ym, zr - 0.02), 0.11, 'ridge_tile', seg=8)
for (a, b) in (((ex0, ey0), (xr0, ym)), ((ex0, ey1), (xr0, ym)), ((ex1, ey0), (xr1, ym)), ((ex1, ey1), (xr1, ym))):
    t.cyl((a[0], a[1], ze + 0.01), (b[0], b[1], zr - 0.02), 0.09, 'ridge_tile', seg=8)
# Downpipes on the front, in the gaps between openings, with a splash block.
pipes = [X0 + 0.25, X1 - 0.25]
for i in range(len(openings) - 1):
    gap0, gap1 = openings[i][1], openings[i + 1][0]
    if gap1 - gap0 > 1.0 and len(pipes) < 7 and i % 3 == 1:
        pipes.append((gap0 + gap1) / 2 + 0.35)
for px in pipes:
    gy = ey0 - 0.075
    t.cyl((px, gy, ze - 0.12), (px, Y0 - 0.07, ze - 0.45), 0.045, 'gutter', seg=8)
    t.cyl((px, Y0 - 0.07, ze - 0.45), (px, Y0 - 0.07, 0.18), 0.045, 'gutter', seg=8)
    t.cyl((px, Y0 - 0.07, 0.18), (px, Y0 - 0.22, 0.06), 0.045, 'gutter', seg=8)
    for z in (0.9, 1.9, 2.7):
        t.box((px - 0.06, Y0 - 0.12, z), (px + 0.06, Y0, z + 0.03), 'gutter')
    t.box((px - 0.18, Y0 - 0.6, 0.0), (px + 0.18, Y0 - 0.12, 0.05), 'concrete_dark')
trim = t.to_object('clubhouse_trim', gen, smooth_angle=40)

# --- Join into the lightmapped `clubhouse` (keeps its name; old mesh replaced) --------------
old = bpy.data.objects.get('clubhouse')
lm_old = old.data if old else None
bpy.ops.object.select_all(action='DESELECT')
for o in (shell, trim):
    o.select_set(True)
bpy.context.view_layer.objects.active = shell
bpy.ops.object.join()
shell.data.name = 'clubhouse_mesh'
if old:
    bpy.data.objects.remove(old)
if lm_old and lm_old.users == 0:
    bpy.data.meshes.remove(lm_old)
shell.name = 'clubhouse'
for c in list(shell.users_collection):
    c.objects.unlink(shell)
bpy.context.scene.collection.objects.link(shell)
print('clubhouse tris', sum(len(p.vertices) - 2 for p in shell.data.polygons), 'openings', len(openings))

# --- Extras: canopies, lanterns, AC units, poster frames ---------------------------------
e = Props()
for cx_, w, h, main in DOORS:
    hw, dep = (w / 2 + 0.55, 1.35) if main else (w / 2 + 0.35, 0.95)
    z = h + 0.22
    e.box((cx_ - hw, Y0 - dep, z), (cx_ + hw, Y0, z + 0.1), 'steel_dark', bevel=0.01)
    e.box((cx_ - hw, Y0 - dep - 0.02, z - 0.06), (cx_ + hw, Y0 - dep + 0.02, z + 0.12), 'steel_dark')
    for sx in (-1, 1):
        e.cyl((cx_ + sx * (hw - 0.15), Y0 - dep + 0.12, z + 0.1), (cx_ + sx * (hw - 0.15), Y0, z + 0.62), 0.012, 'steel_dark', seg=6)
        lx = cx_ + sx * (w / 2 + (0.45 if not main else 0.7))
        e.box((lx - 0.07, Y0 - 0.13, 1.95), (lx + 0.07, Y0, 2.24), 'steel_dark', bevel=0.01)
        e.box((lx - 0.05, Y0 - 0.135, 2.0), (lx + 0.05, Y0 - 0.12, 2.18), 'lamp_warm')
# Lanterns between some windows too.
for i in range(0, len(openings) - 1, 2):
    a, b = openings[i], openings[i + 1]
    if a[4] == b[4] == 'window' and b[0] - a[1] > 1.6:
        lx = (a[1] + b[0]) / 2
        e.box((lx - 0.07, Y0 - 0.13, 2.45), (lx + 0.07, Y0, 2.72), 'steel_dark', bevel=0.01)
        e.box((lx - 0.05, Y0 - 0.135, 2.5), (lx + 0.05, Y0 - 0.12, 2.66), 'lamp_warm')


def condenser(x, y, w, d, h, front, top_fan=False):
    e.box((x - w / 2 - 0.1, y - d / 2 - 0.1, 0), (x + w / 2 + 0.1, y + d / 2 + 0.1, 0.08), 'concrete', bevel=0.01)
    e.box((x - w / 2, y - d / 2, 0.08), (x + w / 2, y + d / 2, 0.08 + h), 'ac_white', bevel=0.02)
    if top_fan:
        e.cyl((x, y, 0.08 + h - 0.01), (x, y, 0.08 + h + 0.02), min(w, d) * 0.38, 'ac_grille', seg=16)
    else:
        e.cyl((x - w * 0.12, y + front * d / 2, 0.08 + h * 0.5), (x - w * 0.12, y + front * (d / 2 + 0.02), 0.08 + h * 0.5), h * 0.36, 'ac_grille', seg=16)
        e.box((x + w * 0.28, y + front * (d / 2) - 0.01, 0.08 + 0.08), (x + w * 0.42, y + front * (d / 2) + 0.01, 0.08 + h - 0.08), 'ac_grille')


ac_x = []
for i in range(len(openings) - 1):
    g0, g1 = openings[i][1], openings[i + 1][0]
    if g1 - g0 > 2.0 and openings[i][4] == openings[i + 1][4] == 'window' and len(ac_x) < 3 and (i % 3 == 1):
        ac_x.append((g0 + g1) / 2)
for x in ac_x:
    condenser(x, Y0 - 0.42, 0.86, 0.32, 0.6, -1)
    e.cyl((x + 0.3, Y0 - 0.06, 0.6), (x + 0.3, Y0 - 0.06, 2.75), 0.025, 'white_paint', seg=6)  # line set
for y in (53.3, 55.2):
    condenser(X1 + 1.1, y, 1.0, 0.95, 0.95, 1, top_fan=True)
POSTERS = []
for i in range(len(openings) - 1):
    g0, g1 = openings[i][1], openings[i + 1][0]
    if g1 - g0 > 2.0 and (openings[i][4] != 'window' or openings[i + 1][4] != 'window'):
        POSTERS.append((g0 + g1) / 2)
POSTERS = POSTERS[:4]
PW, PH_, PZ = 0.78, 1.17, 1.02
for x in POSTERS:
    e.box((x - PW / 2 - 0.035, Y0 - 0.03, PZ - 0.035), (x + PW / 2 + 0.035, Y0, PZ + PH_ + 0.035), 'steel_dark')
e.to_object('clubhouse_extras', gen, smooth_angle=40)

# Posters: one quad per frame, UVs on its cell of posters.png (4 × 256 × 384).
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
for k, x in enumerate(POSTERS):
    vs = [bm.verts.new(p) for p in ((x - PW / 2, Y0 - 0.032, PZ), (x + PW / 2, Y0 - 0.032, PZ), (x + PW / 2, Y0 - 0.032, PZ + PH_), (x - PW / 2, Y0 - 0.032, PZ + PH_))]
    f = bm.faces.new(vs)
    for l, uv in zip(f.loops, ((k / 4, 0), ((k + 1) / 4, 0), ((k + 1) / 4, 1), (k / 4, 1))):
        l[uvl].uv = uv
me = bpy.data.meshes.new('clubhouse_posters_mesh'); bm.to_mesh(me); bm.free()
me.materials.append(poster_mat)
gen.objects.link(bpy.data.objects.new('clubhouse_posters', me))

# Grime decals: streaks below every sill, a splash band above the plinth, stains under the eaves.
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')


def decal(x0, x1, z0, z1, strip, hang, y=Y0 - 0.006, alpha_scale=1.0):
    """strip 0/1 = Leaking007/008 (each 4:1); hang → the dense end of the streaks at the top."""
    h = z1 - z0
    span = (x1 - x0) / (4 * h * 1.6)
    u0 = rnd.random()
    v_lo, v_hi = (0.5, 1.0) if strip == 0 else (0.0, 0.5)
    if hang:  # texture's bottom (dense) edge at the top of the quad
        vb, vt = v_hi, v_lo
    else:
        vb, vt = v_lo, v_hi
    vs = [bm.verts.new(p) for p in ((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1))]
    f = bm.faces.new(vs)
    for l, uv in zip(f.loops, ((u0, vb), (u0 + span, vb), (u0 + span, vt), (u0, vt))):
        l[uvl].uv = uv


for x0, x1, z0, z1, kind in openings:
    if kind == 'window':
        decal(x0 - 0.05, x1 + 0.05, PL + 0.02, z0 - 0.07, rnd.choice((0, 1)), True)
x = X0
for c0, c1 in cuts + [(X1, X1)]:
    if c0 - x > 0.3:
        decal(x, c0, PL, PL + 0.55, 1, False, y=Y0 - 0.008)
    x = c1
x = X0
while x < X1 - 1:
    w = rnd.uniform(4, 9)
    if rnd.random() < 0.6:
        decal(x, min(x + w, X1), H - 0.55, H - 0.02, 0, True, y=Y0 - 0.007)
    x += w
me = bpy.data.meshes.new('clubhouse_grime_mesh'); bm.to_mesh(me); bm.free()
me.materials.append(grime_mat)
gen.objects.link(bpy.data.objects.new('clubhouse_grime', me))

bpy.ops.wm.save_mainfile()
print('clubhouse detail done; posters at', [round(x, 2) for x in POSTERS], 'ac', ac_x)
