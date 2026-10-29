# Row 150: the club's kitchen garden on the north lawn behind the clubhouse (outside the fence):
# two greenhouses on a gravel yard and raised vegetable beds in front of them. The orchard,
# flowering shrubs and flower beds around it are impostor sprites placed on the page
# (src/js/booking/impostors.js, GARDEN); keep the two layouts in step. Re-runnable.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/garden.py
#
# Row 179: the greenhouses are real glass houses now. White aluminium frame (glazing bars, ridge,
# eaves gutters, corner posts) on a low brick wall with a concrete coping, see-through panes
# (`mat_greenhouse_glass`: a 256 px RGBA texture with four pane looks, clean, misted, dirty at the
# foot, streaked, picked per pane), roof vents propped open, a sliding glass door on a top track
# with a handle, a sill and a step. Inside: a slab path between soil borders with tomatoes on
# strings (west house) or staging benches of orchids, bromeliads and foliage plants with hanging
# baskets (east house, door slid half open). Repeated plants are linked duplicates of a few
# variants: the optimizer turns them into GPU instances. The glass casts no shadow (scene.js).
import bpy, bmesh, math, os, sys, random
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection, TEX
from decor import leaf

rnd = random.Random(150)
grnd = random.Random(179)
# Blender x, y (three.js x, −z). The yard: x 44…72, y 63…82 (three z −63…−82).
GREENHOUSES = [(52.0, 75.0), (60.0, 75.0)]
BEDS = [(46.5 + 3.6 * i, 66.2) for i in range(6)]
YARD = (44.0, 66.0, 63.4, 71.2)  # gravel round the beds and up to the greenhouse doors

W, L, EAVE, RIDGE = 3.6, 6.0, 2.0, 2.95
HW, HL = W / 2, L / 2
WALL = 0.52  # top of the brick wall (coping on top)
SILL = 0.6  # foot of the glazing
TRANSOM = 1.3
BAYS = 8  # along the long walls and the roof (0.75 m)
DOOR = 0.45  # half width of the door opening
DOOR_TOP = 2.0
UP = Vector((0, 0, 1))


def roof_z(x):
    return EAVE + (RIDGE - EAVE) * (1 - abs(x) / HW)


# --- Helpers --------------------------------------------------------------------------------
def uncap(p, faces, axis):
    """Drops a bar's end faces (hidden where it meets the next member): a third fewer triangles."""
    axis = Vector(axis).normalized()
    ends = []
    for f in faces:
        f.normal_update()
        if abs(f.normal.dot(axis)) > 0.98:
            ends.append(f)
    bmesh.ops.delete(p.bm, geom=ends, context='FACES_ONLY')


def bar(p, lo, hi, sw, M, axis):
    uncap(p, p.box(lo, hi, sw, matrix=M), M.to_3x3() @ Vector(axis))


def beam(p, a, b, w, h, sw, up=UP, caps=False):
    """Box of section w × h from a to b; h is measured along `up` (made square to the beam)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    x = d.normalized()
    u = Vector(up) - x * Vector(up).dot(x)
    if u.length < 1e-6:
        u = Vector((1, 0, 0)) - x * x.x
    u.normalize()
    s = x.cross(u)
    R = Matrix((s, x, u)).transposed().to_4x4()
    faces = p.box((-w / 2, 0, -h / 2), (w / 2, d.length, h / 2), sw, matrix=Matrix.Translation(a) @ R)
    if not caps:
        uncap(p, faces, x)


class Glass:
    """Pane polygons with UVs into one of the four pane looks of the glass texture."""
    LOOKS = {'wall': (0.32, 0.22, 0.26, 0.2), 'roof': (0.36, 0.3, 0.14, 0.2)}

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')

    def pane(self, pts, M=None, look='wall'):
        P = []
        for q in pts:  # drop repeated corners (a bay that meets the roof at the eave)
            v = M @ Vector(q) if M else Vector(q)
            if not P or (v - P[-1]).length > 1e-5:
                P.append(v)
        if (P[0] - P[-1]).length < 1e-5:
            P.pop()
        if len(P) < 3:
            return None
        n = (P[1] - P[0]).cross(P[2] - P[0]).normalized()
        e1 = UP.cross(n)
        e1 = e1.normalized() if e1.length > 1e-4 else Vector((1, 0, 0))
        e2 = n.cross(e1)
        if e2.z < 0:
            e2, e1 = -e2, -e1
        c = [(q.dot(e1), q.dot(e2)) for q in P]
        u0, u1 = min(t[0] for t in c), max(t[0] for t in c)
        v0, v1 = min(t[1] for t in c), max(t[1] for t in c)
        k = grnd.choices(range(4), self.LOOKS[look])[0]
        qx, qy = (k % 2) * 0.5, (k // 2) * 0.5
        flip = grnd.random() < 0.5  # mirror sideways: fewer repeats
        f = self.bm.faces.new([self.bm.verts.new(q) for q in P])
        for loop, (u, v) in zip(f.loops, c):
            uu = (u - u0) / max(u1 - u0, 1e-6)
            if flip:
                uu = 1 - uu
            loop[self.uv].uv = (qx + 0.012 + uu * 0.476, qy + 0.012 + (v - v0) / max(v1 - v0, 1e-6) * 0.476)
        return f

    def to_object(self, name, coll, mat):
        me = bpy.data.meshes.new(name + '_mesh')
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(mat)
        o = bpy.data.objects.new(name, me)
        coll.objects.link(o)
        return o


# --- Glass ------------------------------------------------------------------------------------
def _noise(rs, size, cells):
    """Smooth value noise in 0…1 (bilinear upsampling of a random grid)."""
    g = rs.random((cells + 1, cells + 1))
    t = np.linspace(0, cells, size, endpoint=False)
    i = t.astype(int); f = t - i
    f = f * f * (3 - 2 * f)
    a = g[i][:, i] * (1 - f)[None, :] + g[i][:, i + 1] * f[None, :]
    b = g[i + 1][:, i] * (1 - f)[None, :] + g[i + 1][:, i + 1] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


def glass_texture():
    """256 px RGBA, four 128 px pane looks (Blender rows start at the bottom: row 0 = foot of the pane)."""
    S, Q = 256, 128
    rs = np.random.default_rng(179)
    img = np.zeros((S, S, 4), np.float32)
    clean = np.array([0.80, 0.87, 0.85])  # linear-ish tints, written as sRGB below
    mist = np.array([0.93, 0.95, 0.95])
    dirt = np.array([0.42, 0.42, 0.33])
    y = (np.arange(Q) / (Q - 1))[:, None] * np.ones((1, Q))
    for k in range(4):
        n1 = _noise(rs, Q, 4) * 0.6 + _noise(rs, Q, 9) * 0.4
        n2 = _noise(rs, Q, 16)
        streak = _noise(rs, Q, 24)[0][None, :] * np.ones((Q, 1))  # vertical runs
        a = np.full((Q, Q), 0.15) + (n1 - 0.5) * 0.04
        col = np.ones((Q, Q, 3)) * clean
        m = np.zeros((Q, Q))
        foot = np.zeros((Q, Q))
        if k == 1:  # misted: condensation patches, heavier higher up
            m = np.clip((n1 - 0.38) * 2.2, 0, 1) * (0.55 + 0.45 * y) + np.clip((n2 - 0.7) * 3, 0, 1) * 0.3
        if k == 2:  # dirty foot: dust and algae where the water runs off
            foot = np.clip(1 - y / (0.16 + n1 * 0.12), 0, 1) ** 1.4
            m = np.clip((n2 - 0.6) * 1.6, 0, 1) * 0.35
        if k == 3:  # streaked, a little of both
            m = np.clip((streak - 0.55) * 2.4, 0, 1) * (0.25 + 0.75 * y) * 0.7 + np.clip((n1 - 0.55) * 2, 0, 1) * 0.4
            foot = np.clip(1 - y / (0.08 + n2 * 0.08), 0, 1) * 0.7
        m = np.clip(m, 0, 1)
        a = a + m * 0.24 + foot * 0.42
        col = col * (1 - m[..., None]) + mist * m[..., None]
        col = col * (1 - foot[..., None]) + dirt * foot[..., None]
        r0, c0 = (k // 2) * Q, (k % 2) * Q
        img[r0:r0 + Q, c0:c0 + Q, :3] = col
        img[r0:r0 + Q, c0:c0 + Q, 3] = np.clip(a, 0.1, 0.62)
    name = 'greenhouse_glass'
    im = bpy.data.images.get(name) or bpy.data.images.new(name, S, S, alpha=True)
    if tuple(im.size) != (S, S):
        im.scale(S, S)
    im.colorspace_settings.name = 'sRGB'
    im.alpha_mode = 'STRAIGHT'
    im.pixels.foreach_set(img.ravel())
    im.filepath_raw = os.path.join(TEX, name + '.png')
    im.file_format = 'PNG'
    im.save()
    im.source = 'FILE'
    im.filepath = '//textures/' + name + '.png'
    im.reload()
    return im


def glass_material():
    m = bpy.data.materials.get('mat_greenhouse_glass') or bpy.data.materials.new('mat_greenhouse_glass')
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = glass_texture()
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.06
    b.inputs['Metallic'].default_value = 0.0
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False
    return m


# --- The house --------------------------------------------------------------------------------
def shell(p, g, bk, M, door_open, vents):
    """Base wall (into `bk`: the clubhouse brick), frame, glazing, gutters, vents and the sliding door. `vents`: [(side, bay)]."""
    T = lambda v: M @ Vector(v)
    # footing and brick base wall with a concrete coping; the door gable is open over the door
    p.box((-HW - 0.12, -HL - 0.12, -0.03), (HW + 0.12, HL + 0.12, 0.04), 'concrete', matrix=M)
    for sx in (-1, 1):
        bk.box((sx * HW - 0.06, -HL - 0.06, 0.04), (sx * HW + 0.06, HL + 0.06, WALL), 'brick', matrix=M)
        p.box((sx * HW - 0.08, -HL - 0.08, WALL), (sx * HW + 0.09, HL + 0.08, WALL + 0.045), 'concrete', matrix=M)
    bk.box((-HW + 0.06, HL - 0.06, 0.04), (HW - 0.06, HL + 0.06, WALL), 'brick', matrix=M)
    p.box((-HW + 0.08, HL - 0.08, WALL), (HW - 0.08, HL + 0.09, WALL + 0.045), 'concrete', matrix=M)
    for sx in (-1, 1):
        lo, hi = sorted((sx * DOOR, sx * (HW - 0.06)))
        bk.box((lo, -HL - 0.06, 0.04), (hi, -HL + 0.06, WALL), 'brick', matrix=M)
        lo, hi = sorted((sx * (DOOR + 0.06), sx * (HW - 0.08)))
        p.box((lo, -HL - 0.09, WALL), (hi, -HL + 0.08, WALL + 0.045), 'concrete', matrix=M)
    zs = WALL + 0.045  # frame stands on the coping
    # sill rails and corner posts
    for sx in (-1, 1):
        p.box((sx * HW - 0.03, -HL, zs), (sx * HW + 0.03, HL, zs + 0.04), 'gutter', matrix=M)
        for sy in (-1, 1):
            p.box((sx * HW - 0.035, sy * HL - 0.035, zs), (sx * HW + 0.035, sy * HL + 0.035, EAVE + 0.02), 'gutter', matrix=M)
    p.box((-HW, HL - 0.03, zs), (HW, HL + 0.03, zs + 0.04), 'gutter', matrix=M)
    for sx in (-1, 1):
        lo, hi = sorted((sx * DOOR, sx * HW))
        p.box((lo, -HL - 0.03, zs), (hi, -HL + 0.03, zs + 0.04), 'gutter', matrix=M)
    z0 = zs + 0.04
    # long walls: a bar every bay, a transom; panes between
    ys = [-HL + L * i / BAYS for i in range(BAYS + 1)]
    for sx in (-1, 1):
        x = sx * HW
        for y in ys[1:-1]:
            bar(p, (x - 0.022, y - 0.02, z0), (x + 0.022, y + 0.02, EAVE), 'gutter', M, (0, 0, 1))
        bar(p, (x - 0.022, -HL, TRANSOM - 0.018), (x + 0.022, HL, TRANSOM + 0.018), 'gutter', M, (0, 1, 0))
        for ya, yb in zip(ys, ys[1:]):
            for za, zb in ((z0, TRANSOM), (TRANSOM, EAVE)):
                g.pane([(x, ya, za), (x, yb, za), (x, yb, zb), (x, ya, zb)], M)
        # eave rail and gutter (open box section, outside), downpipes at both ends
        p.box((x - 0.035, -HL - 0.04, EAVE - 0.03), (x + 0.035, HL + 0.04, EAVE + 0.035), 'gutter', matrix=M)
        gx = x + sx * 0.035
        lo, hi = sorted((gx, gx + sx * 0.11))
        p.box((lo, -HL - 0.08, EAVE - 0.07), (hi, HL + 0.08, EAVE - 0.055), 'gutter', matrix=M)
        lo, hi = sorted((gx + sx * 0.1, gx + sx * 0.112))
        p.box((lo, -HL - 0.08, EAVE - 0.07), (hi, HL + 0.08, EAVE + 0.01), 'gutter', matrix=M)
        for sy in (-1, 1):
            px, py = gx + sx * 0.055, sy * (HL + 0.03)
            p.cyl(T((px, py, EAVE - 0.06)), T((px, py, 0.1)), 0.028, 'gutter', seg=8)
            p.cyl(T((px, py, 0.1)), T((px, py + sy * 0.12, 0.04)), 0.028, 'gutter', seg=8)
    # gables: bars, transom, panes up to the roof line; barge rafters
    for sy, xs in ((1, [-HW + W * i / 6 for i in range(7)]), (-1, [-HW, -HW + (HW - DOOR) / 2, -DOOR, DOOR, HW - (HW - DOOR) / 2, HW])):
        y = sy * HL
        for x in xs[1:-1]:
            top = roof_z(x)
            foot = 0.04 if abs(abs(x) - DOOR) < 1e-6 and sy < 0 else z0
            bar(p, (x - 0.022, y - 0.022, foot), (x + 0.022, y + 0.022, top), 'gutter', M, (0, 0, 1))
        for xa, xb in zip(xs, xs[1:]):
            door_bay = sy < 0 and abs(xa + DOOR) < 1e-6
            if not door_bay:
                bar(p, (xa, y - 0.018, TRANSOM - 0.018), (xb, y + 0.018, TRANSOM + 0.018), 'gutter', M, (1, 0, 0))
                g.pane([(xa, y, z0), (xb, y, z0), (xb, y, TRANSOM), (xa, y, TRANSOM)], M)
                g.pane([(xa, y, TRANSOM), (xb, y, TRANSOM), (xb, y, EAVE), (xa, y, EAVE)], M)
                bar(p, (xa, y - 0.018, EAVE - 0.018), (xb, y + 0.018, EAVE + 0.018), 'gutter', M, (1, 0, 0))
                bottom = EAVE
            else:
                p.box((xa, y - 0.03, DOOR_TOP - 0.02), (xb, y + 0.03, DOOR_TOP + 0.04), 'gutter', matrix=M)
                bottom = DOOR_TOP + 0.04
            pts = [(xa, y, bottom), (xb, y, bottom), (xb, y, roof_z(xb))]
            if xa < 0 < xb:
                pts.append((0, y, RIDGE))
            pts.append((xa, y, roof_z(xa)))
            g.pane(pts, M)
        for sx in (-1, 1):
            beam(p, T((sx * (HW + 0.02), y, EAVE)), T((0, y, RIDGE + 0.01)), 0.07, 0.07, 'gutter', up=Vector((0, 1, 0)))
    # roof: ridge, rafters, a purlin halfway, panes; vents (upper panes) propped open
    p.box((-0.045, -HL - 0.06, RIDGE - 0.035), (0.045, HL + 0.06, RIDGE + 0.05), 'gutter', matrix=M)
    p.box((-0.025, -HL - 0.06, RIDGE + 0.05), (0.025, HL + 0.06, RIDGE + 0.075), 'gutter', matrix=M)
    rise = RIDGE - EAVE
    for sx in (-1, 1):
        n = Vector((sx * rise, 0, HW)).normalized()
        mid = lambda y, t: Vector((sx * HW * (1 - t), y, EAVE + rise * t))
        for y in ys[1:-1]:
            beam(p, T(mid(y, 0) + n * 0.01), T(mid(y, 1) + n * 0.01), 0.045, 0.06, 'gutter', up=n)
        beam(p, T(mid(-HL, 0.5) + n * 0.01), T(mid(HL, 0.5) + n * 0.01), 0.05, 0.045, 'gutter', up=n)
        for i, (ya, yb) in enumerate(zip(ys, ys[1:])):
            g.pane([mid(ya, 0), mid(yb, 0), mid(yb, 0.5), mid(ya, 0.5)], M, 'roof')
            if (sx, i) in vents:
                vent(p, g, M, sx, ya, yb, n)
            else:
                g.pane([mid(ya, 0.5), mid(yb, 0.5), mid(yb, 1), mid(ya, 1)], M, 'roof')
    door(p, g, M, door_open)


def vent(p, g, M, sx, ya, yb, n, angle=20):
    """Upper roof pane hinged at the ridge, its foot lifted `angle`° on a stay."""
    T = lambda v: M @ Vector(v)
    rise = RIDGE - EAVE
    a = math.radians(angle) * sx

    def lift(v):  # rotate about the ridge line (parallel to y) in the x-z plane
        dx, dz = v.x, v.z - RIDGE
        return Vector((dx * math.cos(a) - dz * math.sin(a), v.y, RIDGE + dx * math.sin(a) + dz * math.cos(a)))

    off = n * 0.045
    ya, yb = ya + 0.03, yb - 0.03
    foot = lambda y: Vector((sx * HW * 0.5, y, EAVE + rise * 0.5))
    top = lambda y: Vector((sx * 0.05, y, RIDGE - rise * 0.05 / HW))
    c = [lift(foot(ya)) + off, lift(foot(yb)) + off, lift(top(yb)) + off, lift(top(ya)) + off]
    for q0, q1 in zip(c, c[1:] + c[:1]):
        beam(p, T(q0), T(q1), 0.04, 0.035, 'gutter', up=(c[1] - c[0]).cross(c[3] - c[0]).normalized())
    g.pane(c, M, 'roof')
    # the stay: from the purlin up to the vent's foot rail
    ym = (ya + yb) / 2
    s0 = foot(ym) + n * 0.03
    s1 = (c[0] + c[1]) / 2
    beam(p, T(s0), T(s1), 0.014, 0.014, 'steel_dark')


def door(p, g, M, open_by):
    """Sliding glass door outside the gable on a top track, handle on its leading stile; sill and step."""
    T = lambda v: M @ Vector(v)
    y = -HL - 0.075
    w, h = DOOR + 0.04, 1.96
    x0 = open_by  # door slides towards +x
    # track over the opening, the hangers, a floor guide
    p.box((-DOOR - 0.06, y - 0.025, DOOR_TOP + 0.02), (DOOR + 2 * DOOR + 0.1, y + 0.03, DOOR_TOP + 0.08), 'gutter', matrix=M)
    p.box((DOOR + 0.06, y - 0.02, 0.04), (DOOR + 0.12, y + 0.03, 0.07), 'steel_dark', matrix=M)
    # sill across the opening and a concrete step outside
    p.box((-DOOR, -HL - 0.07, 0.04), (DOOR, -HL + 0.07, 0.065), 'steel_galv', matrix=M)
    p.box((-0.62, -HL - 0.58, -0.02), (0.62, -HL - 0.13, 0.055), 'concrete', matrix=M, bevel=0.012)
    # the leaf: stiles, rails, an aluminium kick panel, two panes
    def lb(lo, hi, sw):
        p.box((lo[0] + x0, lo[1], lo[2]), (hi[0] + x0, hi[1], hi[2]), sw, matrix=M)
    z0 = 0.075
    lb((-w, y - 0.02, z0), (-w + 0.05, y + 0.02, z0 + h), 'gutter')
    lb((w - 0.05, y - 0.02, z0), (w, y + 0.02, z0 + h), 'gutter')
    for za, zb in ((z0, z0 + 0.06), (0.36, 0.41), (1.12, 1.16), (z0 + h - 0.06, z0 + h)):
        lb((-w + 0.05, y - 0.02, za), (w - 0.05, y + 0.02, zb), 'gutter')
    lb((-w + 0.05, y - 0.008, z0 + 0.06), (w - 0.05, y + 0.008, 0.36), 'gutter')  # kick panel
    for za, zb in ((0.41, 1.12), (1.16, z0 + h - 0.06)):
        g.pane([(-w + 0.05 + x0, y, za), (w - 0.05 + x0, y, za), (w - 0.05 + x0, y, zb), (-w + 0.05 + x0, y, zb)], M)
    # rollers on the track, a pull handle on the leading (west) stile, both faces
    for xr in (-w + 0.12, w - 0.12):
        p.cyl(T((xr + x0, y - 0.03, DOOR_TOP + 0.05)), T((xr + x0, y + 0.03, DOOR_TOP + 0.05)), 0.03, 'steel_dark', seg=8)
        lb((xr - 0.012, y - 0.012, z0 + h), (xr + 0.012, y + 0.012, DOOR_TOP + 0.05), 'steel_dark')
    for sy in (-1, 1):
        yy = y + sy * 0.045
        lb((-w + 0.018, yy - 0.012, 0.92), (-w + 0.04, yy + 0.012, 1.2), 'plastic_black')
        lb((-w + 0.022, min(yy, y + sy * 0.02), 0.93), (-w + 0.036, max(yy, y + sy * 0.02), 0.95), 'plastic_black')
        lb((-w + 0.022, min(yy, y + sy * 0.02), 1.17), (-w + 0.036, max(yy, y + sy * 0.02), 1.19), 'plastic_black')


def floor(p, M):
    """Gravel under the benches, a slab path down the middle."""
    p.box((-HW + 0.065, -HL + 0.065, 0.0), (HW - 0.065, HL - 0.065, 0.045), 'gravel', matrix=M)
    n, a, b = 10, -HL + 0.08, HL - 0.08
    for i in range(n):
        p.box((-0.4, a + (b - a) * i / n + 0.01, 0.045), (0.4, a + (b - a) * (i + 1) / n - 0.01, 0.07), 'concrete', matrix=M)


# --- Plants (built once per variant at the origin, placed as linked duplicates) ----------------------
def pot(p, r, h, sw, soil='soil', M=None):
    M = M or Matrix()
    p.lathe([(r * 0.78, 0), (r, h * 0.92), (r * 1.06, h), (r * 0.94, h)], sw, seg=8, matrix=M, cap_bottom=True)
    p.lathe([(r * 0.94, h - 0.025), (0.0, h - 0.025)], soil, seg=8, matrix=M)
    return h - 0.025


def tomato(p, height, seed):
    """Tomato vine climbing a string (soil at z 0, string tied 1.9 m up): leaves, trusses red below, green above."""
    r = random.Random(seed)
    p.box((-0.003, -0.003, 0), (0.003, 0.003, 1.9), 'canvas')
    pts = [Vector((0.022 * math.cos(k * 1.3), 0.022 * math.sin(k * 1.3), height * k / 7)) for k in range(8)]
    for a, b in zip(pts, pts[1:]):
        p.cyl(a, b, 0.011, 'lettuce_dark', seg=5, caps=False)
    z, k = 0.22, 0
    while z < height:
        yaw = k * 2.4 + r.uniform(-0.3, 0.3)
        R = Matrix.Translation((0, 0, z)) @ Matrix.Rotation(yaw, 4, 'Z')
        ln = 0.34 * (1 - 0.35 * z / height) + r.uniform(-0.03, 0.03)
        leaf(p, R, ln, 0.085, 0.07, 0.2, 'lettuce' if k % 3 else 'lettuce_dark', 'lettuce_dark', seg=3)
        leaf(p, R @ Matrix.Rotation(0.5, 4, 'Z'), ln * 0.6, 0.06, 0.05, 0.12, 'lettuce_dark', 'lettuce_dark', seg=2)
        z += r.uniform(0.17, 0.22)
        k += 1
    for i, tz in enumerate((0.42, 0.7, 0.98, 1.26)):
        if tz > height - 0.2:
            break
        a = i * 2.1 + r.uniform(-0.4, 0.4)
        c = Vector((0.09 * math.cos(a), 0.09 * math.sin(a), tz))
        for j in range(r.randint(3, 5)):
            off = Vector((r.uniform(-0.045, 0.045), r.uniform(-0.045, 0.045), -0.04 * j + r.uniform(-0.01, 0.01)))
            sw = 'tomato' if i == 0 or (i == 1 and j < 3) else ('paint_terracotta' if i == 1 else 'leaf_lime')
            p.sphere(c + off, r.uniform(0.028, 0.036), sw, seg=6, rings=3, scale=(1, 1, 0.86))
    for j in range(4):  # the growing tip
        leaf(p, Matrix.Translation((0, 0, height)) @ Matrix.Rotation(j * 1.6, 4, 'Z') @ Matrix.Rotation(-0.5, 4, 'X'), 0.14, 0.05, 0.08, 0.02, 'leaf_lime', 'lettuce', seg=2)


def orchid(p, flower, seed):
    """Phalaenopsis in a clear-ish pot: broad leaves, a staked arching spike of blooms."""
    r = random.Random(seed)
    top = pot(p, 0.06, 0.12, 'plastic_white', 'mulch')
    for i in range(4):
        R = Matrix.Translation((0, 0, top)) @ Matrix.Rotation(i * math.pi / 2 + r.uniform(-0.3, 0.3), 4, 'Z')
        leaf(p, R, r.uniform(0.15, 0.19), 0.05, 0.03, 0.07, 'frond_dark', 'frond', seg=2)
    st = Vector((0.0, 0.01, top))
    sh = r.uniform(0.34, 0.42)
    p.box((-0.003, 0.007, top), (0.003, 0.013, top + sh), 'steel_dark')
    lean = r.uniform(0, 2 * math.pi)
    d = Vector((math.cos(lean), math.sin(lean), 0))
    prev = st + Vector((0, 0, sh))
    for k in range(6):
        t = (k + 1) / 6
        q = st + Vector((0, 0, sh + 0.05 * math.sin(t * math.pi * 0.8))) + d * (0.2 * t)
        q.z -= 0.08 * t * t
        p.cyl(prev, q, 0.004, 'lettuce_dark', seg=4, caps=False)
        if k > 0:
            p.sphere(q + Vector((0, 0, -0.012)), 0.03 - 0.003 * k, flower, seg=6, rings=3, scale=(1, 1, 0.55))
        prev = q


def bromeliad(p, seed):
    r = random.Random(seed)
    top = pot(p, 0.075, 0.13, 'plastic_black')
    for i in range(9):
        R = Matrix.Translation((0, 0, top)) @ Matrix.Rotation(i * 2.4, 4, 'Z')
        leaf(p, R, r.uniform(0.2, 0.28), 0.04, 0.14, 0.12, 'frond' if i % 2 else 'agave', 'frond_dark', seg=2)
    for i in range(4):
        R = Matrix.Translation((0, 0, top + 0.02)) @ Matrix.Rotation(i * 1.57 + 0.4, 4, 'Z')
        leaf(p, R, 0.11, 0.03, 0.12, 0.0, 'tomato', 'tomato', seg=2)


def foliage(p, seed):
    """Calathea-like pot plant: broad paddle leaves on short stems."""
    r = random.Random(seed)
    top = pot(p, 0.09, 0.15, 'towel_red')
    for i in range(7):
        R = Matrix.Translation((0, 0, top)) @ Matrix.Rotation(i * 0.9 + r.uniform(-0.2, 0.2), 4, 'Z')
        leaf(p, R, r.uniform(0.24, 0.32), 0.075, 0.2, 0.1, 'lettuce_dark' if i % 2 else 'agave_dark', 'agave', seg=3)


def monstera(p, seed):
    r = random.Random(seed)
    top = pot(p, 0.17, 0.28, 'towel_red')
    for i in range(8):
        R = Matrix.Translation((0, 0, top)) @ Matrix.Rotation(i * 0.8 + r.uniform(-0.2, 0.2), 4, 'Z')
        p.cyl(Vector((0, 0, top)), R @ Vector((0, 0.18, 0.32)), 0.008, 'lettuce_dark', seg=4, caps=False)
        leaf(p, R @ Matrix.Translation((0, 0.18, 0.32)), r.uniform(0.34, 0.44), 0.17, 0.05, 0.22, 'frond_dark', 'frond', seg=3)


def basket(p, seed):
    """Hanging fern basket: coir bowl on three chains to a hook 0.55 m above, trailing fronds."""
    r = random.Random(seed)
    p.lathe([(0.05, -0.12), (0.15, -0.05), (0.18, 0.04), (0.17, 0.04)], 'mulch', seg=10, cap_bottom=True)
    p.lathe([(0.17, 0.02), (0.0, 0.02)], 'soil', seg=10)
    for i in range(3):
        a = i * 2 * math.pi / 3
        p.cyl(Vector((0.17 * math.cos(a), 0.17 * math.sin(a), 0.04)), Vector((0, 0, 0.55)), 0.004, 'steel_dark', seg=3, caps=False)
    for i in range(8):
        R = Matrix.Translation((0, 0, 0.04)) @ Matrix.Rotation(i * 0.785 + r.uniform(-0.2, 0.2), 4, 'Z')
        leaf(p, R, r.uniform(0.3, 0.42), 0.06, 0.12, 0.42, 'lettuce' if i % 2 else 'lettuce_dark', 'lettuce_dark', seg=3)


def tray(p, M):
    """Seedling tray: black plastic, a carpet of seedlings."""
    p.box((-0.27, -0.14, 0), (0.27, 0.14, 0.05), 'plastic_black', matrix=M)
    p.box((-0.255, -0.125, 0.05), (0.255, 0.125, 0.06), 'leaf_lime', matrix=M)
    for i in range(4):
        for j in range(2):
            p.ico(M @ Vector((-0.19 + i * 0.127, -0.06 + j * 0.12, 0.066)), 0.034, 'lettuce' if (i + j) % 2 else 'leaf_lime', sub=0, scale=(1.3, 1, 0.42), jitter=0.25, rnd=grnd)


def watering_can(p, M):
    T = lambda v: M @ Vector(v)
    p.cyl(T((0, 0, 0)), T((0, 0, 0.24)), 0.1, 'steel_galv', seg=12)
    p.cyl(T((0.08, 0, 0.04)), T((0.34, 0, 0.3)), 0.014, 'steel_galv', seg=6)
    p.cyl(T((0.33, 0, 0.29)), T((0.37, 0, 0.33)), 0.016, 'steel_galv', seg=8, r2=0.035)
    beam(p, T((-0.09, 0, 0.18)), T((-0.06, 0, 0.34)), 0.02, 0.012, 'steel_galv', up=M.to_3x3() @ Vector((0, 1, 0)))
    beam(p, T((-0.06, 0, 0.34)), T((0.06, 0, 0.32)), 0.02, 0.012, 'steel_galv', up=M.to_3x3() @ Vector((0, 1, 0)))


def hose_reel(p, M, hose_to=None):
    T = lambda v: M @ Vector(v)
    for sx in (-1, 1):
        p.cyl(T((sx * 0.12, 0, 0.3)), T((sx * 0.14, 0, 0.3)), 0.22, 'agave_dark', seg=14)
        beam(p, T((sx * 0.15, -0.18, 0.0)), T((sx * 0.15, 0, 0.3)), 0.025, 0.025, 'steel_dark', up=Vector((1, 0, 0)))
        beam(p, T((sx * 0.15, 0.18, 0.0)), T((sx * 0.15, 0, 0.3)), 0.025, 0.025, 'steel_dark', up=Vector((1, 0, 0)))
    p.cyl(T((-0.12, 0, 0.3)), T((0.12, 0, 0.3)), 0.15, 'lettuce_dark', seg=14)
    p.cyl(T((0.14, 0, 0.3)), T((0.24, 0, 0.3)), 0.012, 'steel_dark', seg=6)
    p.cyl(T((0.24, 0, 0.3)), T((0.24, 0.08, 0.3)), 0.016, 'plastic_black', seg=6)
    if hose_to:  # the hose off the drum, across the floor
        pts = [T((0, 0.12, 0.17)), T((0, 0.3, 0.07))] + [Vector(q) for q in hose_to]
        for a, b in zip(pts, pts[1:]):
            p.cyl(a, b, 0.012, 'lettuce_dark', seg=5, caps=False)


def staging(p, M, y0, y1, x0, x1, top=0.8):
    """Staging bench: galvanised legs and rails, slatted top, a slatted shelf below."""
    T = lambda v: M @ Vector(v)
    n = max(2, round((y1 - y0) / 1.3) + 1)
    for i in range(n):
        y = y0 + 0.03 + (y1 - y0 - 0.06) * i / (n - 1)
        for x in (x0 + 0.03, x1 - 0.03):
            p.box((x - 0.02, y - 0.02, 0.04), (x + 0.02, y + 0.02, top - 0.03), 'steel_galv', matrix=M)
        p.box((x0, y - 0.02, top - 0.07), (x1, y + 0.02, top - 0.03), 'steel_galv', matrix=M)
    for x in (x0, x1 - 0.03):
        p.box((x, y0, top - 0.07), (x + 0.03, y1, top - 0.03), 'steel_galv', matrix=M)
    k = 6
    for i in range(k):
        xa = x0 + (x1 - x0) * i / k + 0.012
        xb = x0 + (x1 - x0) * (i + 1) / k - 0.012
        p.box((xa, y0, top - 0.03), (xb, y1, top), 'timber', matrix=M)
        if i % 2 == 0:
            p.box((xa, y0 + 0.05, 0.26), (xb + (x1 - x0) / k, y1 - 0.05, 0.285), 'timber_dark', matrix=M)


def border(p, M, x0, x1, y0, y1):
    """Soil border edged with boards."""
    h = 0.22
    p.box((x0, y0, 0.04), (x1, y0 + 0.04, h), 'timber', matrix=M)
    p.box((x0, y1 - 0.04, 0.04), (x1, y1, h), 'timber', matrix=M)
    inner = x0 if abs(x0) < abs(x1) else x1 - 0.04
    p.box((inner, y0 + 0.04, 0.04), (inner + 0.04, y1 - 0.04, h), 'timber', matrix=M)
    lo, hi = sorted((x0 + 0.04 if inner == x0 else x0, x1 if inner == x0 else x1 - 0.04))
    p.box((lo, y0 + 0.04, 0.04), (hi, y1 - 0.04, h - 0.04), 'soil', matrix=M)
    return h - 0.04


def brick_object(bk, name, coll):
    """The base walls in the clubhouse's brick (mat_clubhouse_wall: box-projected UVs in metres, as clubhouse_detail.py)."""
    o = bk.to_object(name, coll, mat=bpy.data.materials['mat_clubhouse_wall'], smooth_angle=30)
    me = o.data
    uv = me.uv_layers['UVMap'].data
    for poly in me.polygons:
        nx, ny, nz = (abs(c) for c in poly.normal)
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (v.y, v.z) if nx >= max(ny, nz) else (v.x, v.z) if ny >= nz else (v.x, v.y)
    return o


# --- Assembly -------------------------------------------------------------------------------------
class Variants:
    """Plant variants as meshes at the origin; `put` places a linked duplicate."""

    def __init__(self, coll):
        self.coll, self.meshes, self.n = coll, {}, {}

    def add(self, key, build):
        p = Props()
        build(p)
        o = p.to_object('gh_' + key, self.coll, smooth_angle=80)  # low-poly fruit and stems read round
        self.meshes[key] = o
        self.n[key] = 1
        o.location = (0, 0, -50)  # parked until first placed
        return o

    def put(self, key, loc, yaw=0.0, scale=1.0):
        src = self.meshes[key]
        if src.location.z == -50:
            o = src
        else:
            self.n[key] += 1
            o = bpy.data.objects.new(f'gh_{key}.{self.n[key]:03d}', src.data)
            self.coll.objects.link(o)
        o.location = loc
        o.rotation_euler = (0, 0, yaw)
        o.scale = (scale, scale, scale)
        return o


def tomato_house(p, V, gx, gy):
    M = Matrix.Translation((gx, gy, 0))
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 0.5, sx * (HW - 0.08)))
        soil = border(p, M, x0, x1, -HL + 0.42, HL - 0.62)
        wx = sx * 1.08
        p.cyl(M @ Vector((wx, -HL + 0.3, 2.1)), M @ Vector((wx, HL - 0.3, 2.1)), 0.006, 'steel_galv', seg=4)
        y = -HL + 0.66
        while y < HL - 0.75:
            k = grnd.randrange(2)
            V.put(f'tomato_{k}', (gx + wx + grnd.uniform(-0.03, 0.03), gy + y, soil), grnd.uniform(0, 6.28), grnd.uniform(0.92, 1.05))
            y += grnd.uniform(0.44, 0.5)
    # potting bench across the far end: trays and terracotta pots
    pb = Matrix.Translation((gx, gy + HL - 0.36, 0))
    staging(p, pb @ Matrix.Rotation(math.pi / 2, 4, 'Z'), -1.1, 1.1, -0.26, 0.26, top=0.78)
    for i, xx in enumerate((-0.75, -0.2)):
        tray(p, pb @ Matrix.Translation((xx, 0, 0.78)))
    for i in range(5):
        pt = pb @ Matrix.Translation((0.25 + i * 0.17, grnd.uniform(-0.1, 0.1), 0.78))
        t = pot(p, 0.06, 0.11, 'towel_red', M=pt)
        for j in range(2):
            p.ico(pt @ Vector((grnd.uniform(-0.02, 0.02), grnd.uniform(-0.02, 0.02), t + 0.04 + j * 0.03)), 0.045 - 0.01 * j, 'lettuce', sub=0, jitter=0.3, rnd=grnd)
    watering_can(p, M @ Matrix.Translation((0.12, -0.9, 0.07)) @ Matrix.Rotation(2.2, 4, 'Z'))
    V.put('basket', (gx, gy + 1.9, RIDGE - 0.6), 0.4)  # a fern over the potting bench
    p.box((-0.01, 1.89, RIDGE - 0.07), (0.01, 1.91, RIDGE - 0.04), 'steel_dark', matrix=M)
    # hose on a wall bracket by the door, coiled
    for i in range(3):
        p.lathe([(0.17 + i * 0.012, 0.0), (0.17 + i * 0.012, 0.024)], 'lettuce_dark', seg=12,
                matrix=M @ Matrix.Translation((-HW + 0.1, -HL + 0.27, 1.05)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Translation((0, 0, i * 0.024)))
    p.box((-HW + 0.06, -HL + 0.25, 1.17), (-HW + 0.16, -HL + 0.29, 1.21), 'steel_dark', matrix=M)


def orchid_house(p, V, gx, gy):
    M = Matrix.Translation((gx, gy, 0))
    top = 0.8
    y0, y1 = -HL + 0.42, HL - 0.25
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 0.52, sx * (HW - 0.1)))
        staging(p, M, y0, y1, x0, x1, top)
        # two rows of pots, a few gaps, trays near the door
        for row, xr in enumerate((sx * 0.78, sx * 1.32)):
            y = y0 + 0.2
            while y < y1 - 0.15:
                if y < y0 + 0.7 and row == 0:
                    tray(p, M @ Matrix.Translation((xr + sx * 0.02, y + 0.15, top)) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
                    y += 0.6
                    continue
                if grnd.random() > 0.12:
                    key = grnd.choices(['orchid_w', 'orchid_p', 'bromeliad', 'foliage'], (0.34, 0.24, 0.2, 0.22))[0]
                    V.put(key, (gx + xr + grnd.uniform(-0.04, 0.04), gy + y, top), grnd.uniform(0, 6.28), grnd.uniform(0.9, 1.1))
                y += grnd.uniform(0.3, 0.38)
        # under the bench: a couple of bigger pots and a stack of empties
        p.box((sx * 1.0 - 0.15, y1 - 0.9, 0.285), (sx * 1.0 + 0.15, y1 - 0.6, 0.31), 'plastic_black', matrix=M)
    # far end of the path: two monsteras and a small areca palm
    V.put('monstera_0', (gx - 0.25, gy + HL - 0.3, 0.045), 0.6)
    V.put('monstera_1', (gx + 0.3, gy + HL - 0.34, 0.045), 2.4)
    pot(p, 0.12, 0.3, 'planter_dark', M=Matrix.Translation((gx + 0.02, gy + HL - 0.66, 0.045)))
    V.put('foliage', (gx + 0.02, gy + HL - 0.66, 0.32), 1.1, 1.3)
    # hanging baskets off the ridge
    for i, y in enumerate((-2.0, -0.7, 0.6, 1.9)):
        V.put('basket', (gx, gy + y, RIDGE - 0.6), grnd.uniform(0, 6.28))
        p.box((-0.01, y - 0.01, RIDGE - 0.07), (0.01, y + 0.01, RIDGE - 0.04), 'steel_dark', matrix=M)
    # hose reel just inside the half-open door, the hose down the path; a can on the bench end
    hose_reel(p, M @ Matrix.Translation((0.25, -HL + 0.42, 0.07)) @ Matrix.Rotation(0.15, 4, 'Z'),
              hose_to=[(gx + 0.22, gy - HL + 1.2, 0.075), (gx - 0.1, gy - HL + 2.0, 0.075), (gx + 0.15, gy - HL + 2.9, 0.075)])
    watering_can(p, M @ Matrix.Translation((-0.22, -1.25, 0.07)) @ Matrix.Rotation(0.4, 4, 'Z'))
    # outside: a water butt under the south-east downpipe
    wb = M @ Matrix.Translation((HW + 0.3, -HL - 0.05, 0))
    p.cyl(wb @ Vector((0, 0, 0.0)), wb @ Vector((0, 0, 0.86)), 0.3, 'agave_dark', seg=14)
    p.cyl(wb @ Vector((0, 0, 0.86)), wb @ Vector((0, 0, 0.9)), 0.32, 'plastic_black', seg=14)


def bed(p, M, crop):
    """Raised timber bed 1.2 × 4 m, soil sunk below the boards, a crop in rows."""
    L_, W_, h = 2.0, 0.6, 0.34
    for lo, hi in (((-W_, -L_, 0), (W_, -L_ + 0.05, h)), ((-W_, L_ - 0.05, 0), (W_, L_, h)), ((-W_, -L_ + 0.05, 0), (-W_ + 0.05, L_ - 0.05, h)), ((W_ - 0.05, -L_ + 0.05, 0), (W_, L_ - 0.05, h))):
        p.box(lo, hi, 'timber', matrix=M)
    p.box((-W_ + 0.052, -L_ + 0.052, 0.02), (W_ - 0.052, L_ - 0.052, h - 0.05), 'soil', matrix=M)
    top = h - 0.05
    for row in (-0.3, 0.0, 0.3):
        y = -L_ + 0.25
        while y < L_ - 0.2:
            if crop == 'lettuce':
                r = rnd.uniform(0.1, 0.14)
                p.ico(M @ Vector((row, y, top + r * 0.3)), r, rnd.choice(('lettuce', 'lettuce_dark')), sub=1, scale=(1, 1, 0.55), jitter=0.15, rnd=rnd)
                y += 0.3
            else:  # tomatoes / beans on canes
                p.cyl(M @ Vector((row, y, top)), M @ Vector((row, y, top + 1.1)), 0.008, 'timber_dark', seg=4)
                for z in (0.35, 0.65, 0.9):
                    p.ico(M @ Vector((row + rnd.uniform(-0.05, 0.05), y, top + z)), rnd.uniform(0.09, 0.13), 'lettuce_dark', sub=1, scale=(1, 1, 0.8), jitter=0.2, rnd=rnd)
                y += 0.45


def main():
    props_material()
    gmat = glass_material()
    coll = collection('gen_garden')
    p = Props()
    x0, x1, y0, y1 = YARD
    p.box((x0, y0, -0.03), (x1, y1, 0.012), 'gravel')  # gravel yard (the lawn sits at −0.02)
    for x, _ in GREENHOUSES:  # and a strip along each greenhouse
        p.box((x - 2.4, y1, -0.03), (x + 2.4, 78.6, 0.012), 'gravel')
    for k, (x, y) in enumerate(BEDS):
        bed(p, Matrix.Translation((x, y, 0)), 'canes' if k in (1, 4) else 'lettuce')

    V = Variants(coll)
    for k in range(2):
        V.add(f'tomato_{k}', lambda q, k=k: tomato(q, 1.52 + 0.26 * k, 17 + k))
    V.add('orchid_w', lambda q: orchid(q, 'towel_white', 3))
    V.add('orchid_p', lambda q: orchid(q, 'orchid', 4))
    V.add('bromeliad', lambda q: bromeliad(q, 5))
    V.add('foliage', lambda q: foliage(q, 6))
    V.add('monstera_0', lambda q: monstera(q, 7))
    V.add('monstera_1', lambda q: monstera(q, 8))
    V.add('basket', lambda q: basket(q, 9))

    g = Glass()
    bk = Props()
    (ax, ay), (bx, by) = GREENHOUSES
    shell(p, g, bk, Matrix.Translation((ax, ay, 0)), 0.0, vents={(1, 2), (-1, 5)})
    shell(p, g, bk, Matrix.Translation((bx, by, 0)), 0.52, vents={(-1, 1), (1, 3), (-1, 6)})
    for gx, gy in GREENHOUSES:
        floor(p, Matrix.Translation((gx, gy, 0)))
    tomato_house(p, V, ax, ay)
    orchid_house(p, V, bx, by)

    # anything not placed goes (none expected)
    for key, o in V.meshes.items():
        if o.location.z == -50:
            bpy.data.objects.remove(o)
    o = p.to_object('garden', coll, smooth_angle=40)
    go = g.to_object('garden_glass', coll, gmat)
    brick_object(bk, 'garden_brick', coll)
    bpy.ops.wm.save_mainfile()
    inst = sum(len(x.data.polygons) for x in coll.objects if x.name.startswith('gh_'))
    tri = lambda ob: sum(len(pp.vertices) - 2 for pp in ob.data.polygons)
    print('garden done', tri(o), 'tris +', len(go.data.polygons), 'panes;', sum(V.n.values()), 'plants of', len(V.meshes), 'variants,',
          sum(tri(x) for x in coll.objects if x.name.startswith('gh_')), 'plant tris drawn')


if __name__ == '__main__':
    main()
