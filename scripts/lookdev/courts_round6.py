# Round 6, court fixes (rows 63, 69, 70). Re-runnable.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/courts_round6.py
# 69  Court furniture (benches, tables, ball baskets) of every tennis court is re-placed from the
#     clay-1 layout: benches sit on the apron just outside the doubles sideline next to the net post,
#     facing the court (the hard courts had them lying across the net).
# 63  The imported grass-court asset ("Tennis Court") becomes two bookable courts like the others:
#     grass-N (court surface), grass-N_apron, grass-N_hl (overlay over court + apron), net, posts,
#     umpire chair, benches, table, ball basket, sign and four floodlight masts. Its own fences, nets,
#     tarps, poles, screws and lights are removed; a chain-link fence like the other courts replaces them.
# 70  Padel: a real 20 × 10 m box — glass back walls (3 m) with mesh on top to 4 m, 2 m of glass
#     at each end of the side walls, welded mesh (3 m) in between with a door gap; posts every 2 m.
#     The apron shrinks to a 0.5 m margin, the overlay follows it, masts move to the box corners.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection, ROOT, TEX

props_material()
gen = collection('gen_courts')


def centre(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(((min(c.x for c in cs) + max(c.x for c in cs)) / 2, (min(c.y for c in cs) + max(c.y for c in cs)) / 2, 0))


def remove(name):
    o = bpy.data.objects.get(name)
    if o:
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)


def link(o, coll=None):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    (coll or bpy.context.scene.collection).objects.link(o)


C1 = centre(bpy.data.objects['clay-1'])
FURNITURE = ['bench1', 'bench2', 'table1', 'table2', 'basket', 'basket_handle'] + [f'basket_ball_{i}' for i in range(1, 6)]


def place_from_clay1(court, suffix, M, coll=None):
    """court_suffix ← clay-1_suffix carried by M (clay-1 frame → court frame)."""
    src = bpy.data.objects[f'clay-1_{suffix}']
    name = f'{court}_{suffix}'
    o = bpy.data.objects.get(name)
    if o is None:
        o = bpy.data.objects.new(name, src.data)
        (coll or bpy.context.scene.collection).objects.link(o)
    o.data = src.data
    o.parent = None
    o.matrix_world = M @ src.matrix_world
    return o


# --- 69: furniture of the clay and hard courts --------------------------------------------
for kind, n in (('clay', 6), ('hard', 4)):
    for i in range(1, n + 1):
        court = f'{kind}-{i}'
        if court == 'clay-1':
            continue
        M = Matrix.Translation(centre(bpy.data.objects[court]) - C1)
        for s in FURNITURE:
            place_from_clay1(court, s, M)


# --- 63: grass courts ----------------------------------------------------------------------
asset = bpy.data.objects.get('Tennis Court')
GRASS = {}  # court id → (centre, apron (x0, x1, y0, y1), side ±1 where the furniture goes)
if asset:
    keep = {'Plane.001': 'grass-1_apron', 'Plane.005': 'grass-2_apron'}
    for o in list(asset.children_recursive):
        if o.name in keep:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
            o.name = keep[o.name]
            o.data.name = o.name + '_mesh'
        else:
            me = o.data if o.type == 'MESH' else None
            bpy.data.objects.remove(o)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
    bpy.data.objects.remove(asset)
for i, side in ((1, -1), (2, 1)):
    ap = bpy.data.objects[f'grass-{i}_apron']
    cs = [ap.matrix_world @ Vector(c) for c in ap.bound_box]
    box = (min(c.x for c in cs), max(c.x for c in cs), min(c.y for c in cs), max(c.y for c in cs))
    lines = bpy.data.objects[f'grass-court-{i}_lines']
    GRASS[f'grass-{i}'] = (centre(lines), box, side)

grass_mat = bpy.data.materials['mat_tenniscourt_grass_simple']
hl_mat = bpy.data.materials['mat_hl']


def plane(name, x0, x1, y0, y1, z, mat, uv_fn=None, coll=None):
    remove(name)
    me = bpy.data.meshes.new(name + '_mesh')
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
    if uv_fn:
        uv = me.uv_layers.new(name='UVMap')
        for li, lp in enumerate(me.loops):
            uv.data[li].uv = uv_fn(me.vertices[lp.vertex_index].co)
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(o)
    return o


HALF_L, HALF_W = 23.77 / 2, 10.97 / 2
for cid, (c, (x0, x1, y0, y1), side) in GRASS.items():
    ap = bpy.data.objects[f'{cid}_apron']
    # Court surface: same stripes as the apron (its UVs span the apron 0..1), a hair above it.
    zt = max((ap.matrix_world @ v.co).z for v in ap.data.vertices) + 0.004
    uvf = lambda co, x0=x0, x1=x1, y0=y0, y1=y1: ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))
    plane(cid, c.x - HALF_L, c.x + HALF_L, c.y - HALF_W, c.y + HALF_W, zt, grass_mat, uvf)
    hl = plane(f'{cid}_hl', x0, x1, y0, y1, 0.07, hl_mat)
    # Furniture: clay-1 layout turned so its "bench side" faces away from the other grass court.
    M = Matrix.Translation(c) @ Matrix.Rotation(side * math.pi / 2, 4, 'Z') @ Matrix.Translation(-C1)
    for s in FURNITURE + ['umpire', 'sign', 'sign_post', 'net']:
        place_from_clay1(cid, s, M)
    # Net posts (the clay ones live in the court-line meshes).
    p = Props()
    for k in (-1, 1):
        p.cyl((0, k * 5.985, 0.05), (0, k * 5.985, 1.07), 0.045, 'steel_galv', seg=10)
        p.cyl((0, k * 5.985, 1.07), (0, k * 5.985, 1.1), 0.05, 'steel_galv', seg=10)
    p.to_object(f'{cid}_posts', gen, location=(c.x, c.y, 0))
    # Floodlight masts behind both baselines (on the apron, inside the fence), aimed at the court.
    pole_mesh, lens_mesh = bpy.data.meshes['flood_pole_mesh'], bpy.data.meshes['flood_lens_mesh']
    for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1)), start=1):
        pos = Vector((c.x + sx * (HALF_L + 3.0), c.y + sy * 4.4, 0))  # row 80: inside the fence, off the path
        d = c - pos
        rz = math.atan2(-d.x, d.y)
        for part, me in (('pole', pole_mesh), ('bulb', lens_mesh)):
            name = f'{cid}_lamp{k}_{part}'
            o = bpy.data.objects.get(name) or bpy.data.objects.new(name, me)
            if o.name not in bpy.context.scene.collection.objects:
                bpy.context.scene.collection.objects.link(o)
            o.data = me
            o.location = pos
            o.rotation_euler = (0, 0, rz)

# Chain-link fence around both grass courts (like the other courts: tall behind the baselines,
# low along the sides), with a gate towards the main path and posts every few metres.
fence_mat, post_mat = bpy.data.materials['mat_fence_chainlink'], bpy.data.materials['mat_fence_post']
gx0 = min(b[1][0] for b in GRASS.values()); gx1 = max(b[1][1] for b in GRASS.values())
gy0 = min(b[1][2] for b in GRASS.values()); gy1 = max(b[1][3] for b in GRASS.values())
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')


def panel(a, b, h, mat=0):
    a, b = Vector(a), Vector(b)
    vs = [bm.verts.new(p) for p in (a, b, b + Vector((0, 0, h)), a + Vector((0, 0, h)))]
    f = bm.faces.new(vs)
    f.material_index = mat
    L = (b - a).length
    for l, uv in zip(f.loops, ((0, 0), (L / 3, 0), (L / 3, h / 3.6), (0, h / 3.6))):
        l[uvl].uv = uv


def bar(lo, hi):
    r = bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=Vector(hi) - Vector(lo), verts=r['verts'])
    bmesh.ops.translate(bm, vec=(Vector(hi) + Vector(lo)) / 2, verts=r['verts'])
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = 1


TALL, LOW = 3.6, 1.4
gate = (-1.0, 1.0)
panel((gx0, gy0, 0), (gx0, gate[0], 0), TALL)
panel((gx0, gate[1], 0), (gx0, gy1, 0), TALL)
panel((gx1, gy0, 0), (gx1, gy1, 0), TALL)
panel((gx0, gy0, 0), (gx1, gy0, 0), LOW)
panel((gx0, gy1, 0), (gx1, gy1, 0), LOW)
r = 0.04
for x in (gx0, gx1):
    n = int((gy1 - gy0) / 3.5)
    for k in range(n + 1):
        y = gy0 + (gy1 - gy0) * k / n
        bar((x - r, y - r, 0), (x + r, y + r, TALL + 0.05))
    bar((x - 0.025, gy0, TALL - 0.03), (x + 0.025, gy1, TALL + 0.02))
for y in (gy0, gy1):
    n = int((gx1 - gx0) / 3.5)
    for k in range(1, n):
        x = gx0 + (gx1 - gx0) * k / n
        bar((x - r, y - r, 0), (x + r, y + r, LOW + 0.05))
    bar((gx0, y - 0.025, LOW - 0.03), (gx1, y + 0.025, LOW + 0.02))
for y in gate:
    bar((gx0 - 0.06, y - 0.06, 0), (gx0 + 0.06, y + 0.06, TALL + 0.1))
remove('grass_fence')
me = bpy.data.meshes.new('grass_fence_mesh')
bm.to_mesh(me); bm.free()
me.materials.append(fence_mat); me.materials.append(post_mat)
o = bpy.data.objects.new('grass_fence', me)
bpy.context.scene.collection.objects.link(o)


# --- 70: padel boxes ------------------------------------------------------------------------
def tex_padel_mesh():
    """Welded square mesh (5 cm cells, 0.5 m tile) as an alpha texture: a dark veil from afar."""
    import numpy as np
    n = 128
    a = np.zeros((n, n), np.float32)
    for k in range(0, n, 16):
        a[:, k:k + 2] = 1
        a[k:k + 2, :] = 1
    img = bpy.data.images.get('padel_mesh') or bpy.data.images.new('padel_mesh', n, n, alpha=True)
    px = np.zeros((n, n, 4), np.float32)
    px[..., :3] = 0.03
    px[..., 3] = a
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = os.path.join(TEX, 'padel_mesh.png')
    img.file_format = 'PNG'
    img.save()
    img.source = 'FILE'; img.filepath = '//textures/padel_mesh.png'; img.reload()
    return img


def mesh_material():
    m = bpy.data.materials.get('mat_padel_mesh') or bpy.data.materials.new('mat_padel_mesh')
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex_padel_mesh()
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.55
    b.inputs['Metallic'].default_value = 0.4
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False
    return m


glass = bpy.data.materials['mat_glass_padel']
glass.use_backface_culling = False
gb = glass.node_tree.nodes.get('Principled BSDF')
gb.inputs['Base Color'].default_value = (0.45, 0.56, 0.57, 1)
gb.inputs['Alpha'].default_value = 0.13
gb.inputs['Roughness'].default_value = 0.04
mesh_mat = mesh_material()

for i in range(1, 5):
    cid = f'padel-{i}'
    court = bpy.data.objects[cid]
    c = centre(court)
    MARGIN = 0.5
    ax0, ax1, ay0, ay1 = c.x - 10 - MARGIN, c.x + 10 + MARGIN, c.y - 5 - MARGIN, c.y + 5 + MARGIN
    for name, z in ((f'{cid}_apron', None), (f'{cid}_hl', None)):
        o = bpy.data.objects[name]
        mi = o.matrix_world.inverted()
        me = o.data
        for v in me.vertices:
            w = o.matrix_world @ v.co
            w.x = ax0 if w.x < c.x else ax1
            w.y = ay0 if w.y < c.y else ay1
            v.co = mi @ w
        if 'UVMap' in me.uv_layers:
            uv = me.uv_layers['UVMap']
            for li, lp in enumerate(me.loops):
                w = o.matrix_world @ me.vertices[lp.vertex_index].co
                uv.data[li].uv = (w.x, w.y)
        me.update()
    # Net: 10 m between the side walls.
    net = bpy.data.objects[f'{cid}_net']
    mi = net.matrix_world.inverted()
    for v in net.data.vertices:
        w = net.matrix_world @ v.co
        w.y = c.y + (5.0 if w.y > c.y else -5.0)
        v.co = mi @ w
    # The enclosure (local: long axis x ∈ [-10, 10], width y ∈ [-5, 5]).
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')

    def wall(a, b, z0, z1, mat, t=0.0):
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        nrm = Vector((-d.y, d.x, 0)) * (t / 2)
        if t:
            r = bmesh.ops.create_cube(bm, size=1)
            L = (b - a).length
            rot = Matrix.Rotation(math.atan2(d.y, d.x), 4, 'Z')
            bmesh.ops.scale(bm, vec=(L, t, z1 - z0), verts=r['verts'])
            bmesh.ops.transform(bm, matrix=Matrix.Translation(((a + b) / 2) + Vector((0, 0, (z0 + z1) / 2))) @ rot, verts=r['verts'])
            for f in {f for v in r['verts'] for f in v.link_faces}:
                f.material_index = mat
                for l in f.loops:
                    l[uvl].uv = (0.5, 0.5)
            return
        vs = [bm.verts.new(p) for p in (a + Vector((0, 0, z0)), b + Vector((0, 0, z0)), b + Vector((0, 0, z1)), a + Vector((0, 0, z1)))]
        f = bm.faces.new(vs)
        f.material_index = mat
        L = (b - a).length
        for l, uv in zip(f.loops, ((0, z0 / 0.5), (L / 0.5, z0 / 0.5), (L / 0.5, z1 / 0.5), (0, z1 / 0.5))):
            l[uvl].uv = uv

    def post(x, y, h, s=0.08):
        r = bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(s, s, h), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(x, y, h / 2), verts=r['verts'])
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = 2
            for l in f.loops:
                l[uvl].uv = (0.5, 0.5)

    def rail(a, b, z, s=0.05):
        a, b = Vector(a), Vector(b)
        r = bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(abs(b.x - a.x) or s, abs(b.y - a.y) or s, s), verts=r['verts'])
        bmesh.ops.translate(bm, vec=((a + b) / 2) + Vector((0, 0, z)), verts=r['verts'])
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = 2
            for l in f.loops:
                l[uvl].uv = (0.5, 0.5)

    G = 0.012  # glass thickness
    for sx in (-1, 1):  # back walls: 5 glass panes of 2 m, mesh band 3–4 m
        x = sx * 10.0
        for k in range(5):
            y0, y1 = -5 + 2 * k + 0.015, -5 + 2 * (k + 1) - 0.015
            wall((x, y0, 0), (x, y1, 0), 0.0, 3.0, 0, t=G)
        wall((x, -5, 0), (x, 5, 0), 3.0, 4.0, 1)
        rail((x, -5, 0), (x, 5, 0), 3.0); rail((x, -5, 0), (x, 5, 0), 4.0)
        for k in range(6):
            post(x, -5 + 2 * k, 4.0)
    for sy in (-1, 1):
        y = sy * 5.0
        door = (1.0, 2.0) if sy > 0 else (-2.0, -1.0)
        for sx in (-1, 1):  # 2 m of glass at each end (3 m) + mesh to 4 m
            xa, xb = sx * 10.0, sx * 8.0
            wall((min(xa, xb) + 0.015, y, 0), (max(xa, xb) - 0.015, y, 0), 0.0, 3.0, 0, t=G)
            wall((min(xa, xb), y, 0), (max(xa, xb), y, 0), 3.0, 4.0, 1)
            rail((min(xa, xb), y, 0), (max(xa, xb), y, 0), 4.0)
            # step: the mesh drops from 4 m to 3 m at the 2 m post
        wall((-8, y, 0), (door[0], y, 0), 0.0, 3.0, 1)
        wall((door[1], y, 0), (8, y, 0), 0.0, 3.0, 1)
        wall((door[0], y, 0), (door[1], y, 0), 2.2, 3.0, 1)  # over the door opening
        rail((-10, y, 0), (10, y, 0), 3.0)
        for k in range(1, 8):
            xk = -8 + 2 * k
            post(xk, y, 3.0)
        for xk in door:
            post(xk, y, 3.0, 0.07)
        rail((door[0], y, 0), (door[1], y, 0), 2.2, 0.04)
        for sx in (-1, 1):
            post(sx * 8.0, y, 4.0)
    remove(f'{cid}_fence')
    me = bpy.data.meshes.new(f'{cid}_fence_mesh')
    bm.to_mesh(me); bm.free()
    for m in (glass, mesh_mat, post_mat):
        me.materials.append(m)
    o = bpy.data.objects.new(f'{cid}_fence', me)
    bpy.context.scene.collection.objects.link(o)
    o.location = c
    # Masts at the corners of the box, aimed at its centre.
    for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1)), start=1):
        pos = Vector((c.x + sx * 10.75, c.y + sy * 5.75, 0))
        d = c - pos
        for part in ('pole', 'bulb'):
            lo = bpy.data.objects[f'{cid}_lamp{k}_{part}']
            lo.location = pos
            lo.rotation_euler = (0, 0, math.atan2(-d.x, d.y))
    # One bench outside the side wall that faces the drone, next to the door, facing the court.
    src = bpy.data.objects['clay-1_bench1']
    name = f'{cid}_bench1'
    b = bpy.data.objects.get(name) or bpy.data.objects.new(name, src.data)
    if b.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(b)
    b.location = (c.x - 3.6, c.y - 5.85, 0)
    b.rotation_euler = (0, 0, 0)
    remove(f'{cid}_netposts')
    p = Props()
    for k in (-1, 1):
        p.cyl((0, k * 5.0, 0.03), (0, k * 5.0, 0.92), 0.04, 'steel_dark', seg=8)
    p.to_object(f'{cid}_netposts', gen, location=(c.x, c.y, 0))

# Nets seen from the drone: the grass and padel nets run along the view, so the mesh plane is
# edge-on. A white headband and the dark net body make them read as on the other courts.
for cid, (c, _, _) in GRASS.items():
    remove(f'{cid}_netband')
    p = Props()
    p.box((-0.025, -5.94, 0.93), (0.025, 5.94, 1.0), 'towel_white')
    p.box((-0.008, -5.94, 0.08), (0.008, 5.94, 0.93), 'seam')
    p.to_object(f'{cid}_netband', gen, location=(c.x, c.y, 0))
line_mat = bpy.data.materials['mat_line']
for i in range(1, 5):
    cid = f'padel-{i}'
    c = centre(bpy.data.objects[cid])
    remove(f'{cid}_netband')
    p = Props()
    p.box((-0.025, -4.98, 0.85), (0.025, 4.98, 0.91), 'towel_white')
    p.box((-0.008, -4.98, 0.06), (0.008, 4.98, 0.85), 'seam')
    p.to_object(f'{cid}_netband', gen, location=(c.x, c.y, 0))
    # Court lines: service lines 6.95 m from the net, centre service line between them (5 cm).
    deco = bpy.data.objects[f'{cid}_deco']
    w, z = 0.025, 0.045
    rects = [(-6.95 - w, -5, -6.95 + w, 5), (6.95 - w, -5, 6.95 + w, 5), (-6.95, -w, 6.95, w)]
    verts, faces = [], []
    for x0, y0, x1, y1 in rects:
        k = len(verts)
        verts += [(c.x + x0, c.y + y0, z), (c.x + x1, c.y + y0, z), (c.x + x1, c.y + y1, z), (c.x + x0, c.y + y1, z)]
        faces.append((k, k + 1, k + 2, k + 3))
    me = bpy.data.meshes.new(f'{cid}_deco_mesh')
    me.from_pydata(verts, [], faces)
    me.materials.append(line_mat)
    old = deco.data
    deco.data = me
    deco.matrix_world = Matrix.Identity(4)
    if old.users == 0:
        bpy.data.meshes.remove(old)

bpy.ops.wm.save_mainfile()
print('courts round6 done', {k: (tuple(round(x, 2) for x in v[0]), tuple(round(x, 2) for x in v[1])) for k, v in GRASS.items()})
