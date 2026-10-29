# Row 80: one coherent footpath network for the club (+ row 79: ground trimmed to what the drone can see).
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/footpaths.py
# Re-runnable: everything is set to absolute positions.
#
# Blender coordinates (three.js: x = x, z = −y). Layout of the network:
#   spine      entrance lane from the west (off into the trees) → perimeter gate (x −34) → the corridor
#              between the two tennis rows (fence to fence, 4.24 m) → grass courts' gate (x 72.51)
#   walkways   between every pair of court columns, fence to fence (2.04 m), full length of both rows
#   ring       south path (tennis | padel), north promenade (in front of the clubhouse), west and east
#              paths, all 3 m and flush with the court fences; the east path runs on to the car park
#   clubhouse  forecourt with the pergola terrace, an apron along the facade, a walk to every door
#   padel      a spine between the two padel columns, a path between the two padel rows (ends at the
#              shed door), a walk along the south doors, a short spur to every padel door
# Built as ONE union of rectangles on a common grid: no overlapping planes, clean T-junctions/corners.
# The paving (`paths`, mat_path, lightmapped) is a single plane; kerbs (12 cm, 5 cm proud) sit on every
# edge except thresholds (court/padel/clubhouse/shed doors, gates, the car park) and are `mat_props`.
# Also here: tennis floodlight masts move from the walkways onto their own apron corners, the perimeter
# fence is rebuilt around the new gates (the car park is outside it now, not cut in half), the old flat
# vending boxes go and three proper vending machines stand by paths, trees standing on paths step aside,
# and the lawn plane is trimmed from 1.9 km to what any allowed view can reach (+ a wide margin).
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection, swatch_uv, ROOT, TEX

props_material()
gen = collection('gen_paths')


def bounds(name):
    o = bpy.data.objects[name]
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (min(c.x for c in cs), max(c.x for c in cs), min(c.y for c in cs), max(c.y for c in cs))


def remove(name):
    o = bpy.data.objects.get(name)
    if o:
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)


# --- Layout (from the scene, so it follows the courts) ---------------------------------------
TENNIS = [f'clay-{i}' for i in range(1, 7)] + [f'hard-{i}' for i in range(1, 5)]
AP = {c: bounds(f'{c}_apron') for c in TENNIS}
RA0 = min(AP[c][2] for c in TENNIS)            # far baseline fences of row A (near the padel)
RA1 = max(AP[c][3] for c in TENNIS if AP[c][3] < 0)
RB0 = min(AP[c][2] for c in TENNIS if AP[c][2] > 0)
RB1 = max(AP[c][3] for c in TENNIS)
RA1, RB0 = round(RA1, 2), round(RB0, 2)       # −2.12 / 2.12: corridor between the rows
RA0, RB1 = round(RA0, 2), round(RB1, 2)       # −36.88 / 36.88
cols = sorted({(round(AP[c][0], 2), round(AP[c][1], 2)) for c in TENNIS})
XW, XE = cols[0][0], cols[-1][1]               # −27.49 / 65.49
GAPS = [(cols[i][1], cols[i + 1][0]) for i in range(len(cols) - 1)]
gx0 = round(min(bounds(f'grass-{i}_apron')[0] for i in (1, 2)), 2)   # 72.51 grass fence line
gy1 = round(max(bounds(f'grass-{i}_apron')[3] for i in (1, 2)), 2)   # 17.62
PADEL = {f'padel-{i}': bounds(f'padel-{i}') for i in range(1, 5)}
PC = {k: ((v[0] + v[1]) / 2, (v[2] + v[3]) / 2) for k, v in PADEL.items()}
CLUB_Y0 = 52.0                                 # clubhouse facade (clubhouse_detail.py: Y0)
CLUB_X0, CLUB_X1 = -25.0, 60.0
DOORS_X = (-9.5, 9.5, 47.5)                    # clubhouse doors (clubhouse_detail.py: DOORS)
SHED = bounds('storage_shed')
SAND = bounds('chill_sand')
PER_X0, PER_Y0, PER_Y1 = -34.0, -80.0, 58.0    # perimeter fence (west, south, north)
PARK = bounds('parking_lot')                   # (60, 102, −67, −45)

W3 = 3.0
ROW_S = (RA0 - W3, RA0)                        # south path: tennis | padel
ROW_N = (RB1, RB1 + W3)                        # north promenade
COL_W = (XW - W3, XW)                          # west path
COL_E = (XE, XE + W3)                          # east path (runs on to the car park)
PADEL_SPINE = (19.5, 22.5)
PADEL_MID = (-57.5, -54.5)                     # between the padel rows
PADEL_SOUTH = (-74.5, -72.5)                   # along the south doors of padel 1/2
PER_GATE_PARK = (COL_E[0] - 0.2, COL_E[1] + 0.2)

# Padel doors (courts_round6.py): +y wall door at local x 1..2, −y wall door at local x −2..−1.
spurs, thresholds = [], []
for k, (cx, cy) in PC.items():
    x0, x1, y0, y1 = PADEL[k]
    for side, dx in ((1, 1.5), (-1, -1.5)):
        sx0, sx1 = cx + dx - 0.75, cx + dx + 0.75
        edge = (y1 + 0.5) if side > 0 else (y0 - 0.5)          # apron edge
        if side > 0:
            far = ROW_S[0] if cy > -50 else PADEL_MID[0]
            spurs.append((sx0, sx1, edge, far)); thresholds.append((sx0, sx1, edge - 0.4, edge))
        else:
            far = PADEL_MID[1] if cy > -50 else PADEL_SOUTH[1]
            spurs.append((sx0, sx1, far, edge)); thresholds.append((sx0, sx1, edge, edge + 0.4))
south_doors = sorted(s for s in spurs if s[3] < -70)          # padel 1 and 2, towards the drone
north_doors = sorted(s for s in spurs if -62 < s[2] < -59)    # padel 1 and 2, towards the mid path

# Rendered rectangles (x0, x1, y0, y1). Order matters only for the lightmap islands (first wins).
R = []
R += [(-160.0, PER_X0, RA1, RB0),                              # lane in from the west, off into the trees
      (PER_X0, XW, RA1, RB0), (XW, XE, RA1, RB0), (XE, gx0, RA1, RB0)]   # spine
R += [(COL_W[0], COL_E[1], *ROW_S), (COL_W[0], COL_E[1], *ROW_N)]
R += [(*COL_W, ROW_S[0], RA1), (*COL_W, RB0, ROW_N[1])]
R += [(*COL_E, PARK[3], RA1), (*COL_E, RB0, ROW_N[1])]
for a, b in GAPS:
    R += [(a, b, ROW_S[1], RA1), (a, b, RB0, ROW_N[0])]
R += [(GAPS[0][0], GAPS[1][1], ROW_N[1], CLUB_Y0),             # forecourt + pergola terrace
      (CLUB_X0, SAND[0], CLUB_Y0 - 2.5, CLUB_Y0),              # apron along the facade
      (GAPS[-1][0], GAPS[-1][1], ROW_N[1], CLUB_Y0 - 2.5)]     # walk to the east door
R += [(*PADEL_SPINE, PADEL_SOUTH[0], ROW_S[0]),
      (SHED[1], north_doors[-1][1], *PADEL_MID),
      (south_doors[0][0], south_doors[-1][1], *PADEL_SOUTH),
      (24.6, 25.8, PADEL_MID[1], PADEL_MID[1] + 1.15)]           # bay for a vending machine (north edge, faces the drone)
R += spurs
# Thresholds: count as paving for the kerb test, so no kerb is laid across them, but aren't drawn.
V = list(thresholds)
for c in TENNIS:                                               # court gates in the corridor fences
    cx = (AP[c][0] + AP[c][1]) / 2
    V.append((cx - 0.85, cx + 0.85, RA1 - 0.4, RA1) if AP[c][3] < 0 else (cx - 0.85, cx + 0.85, RB0, RB0 + 0.4))
V += [(gx0, gx0 + 0.5, -1.0, 1.0),                             # grass courts' gate
      (COL_E[0], COL_E[1], PARK[3] - 0.5, PARK[3]),            # car park
      (CLUB_X0, SAND[0], CLUB_Y0, CLUB_Y0 + 0.5),              # clubhouse wall (doors, steps, plinth)
      (SHED[1] - 0.5, SHED[1], *PADEL_MID),                    # shed door
      (-160.5, -160.0, RA1, RB0)]                              # lane end (far off screen)

KW, ZG, ZP, ZK = 0.12, -0.02, 0.015, 0.065                     # kerb width, lawn, paving, kerb top


def inside(rects, x, y):
    return any(r[0] <= x <= r[1] and r[2] <= y <= r[3] for r in rects)


def seg_of(x, y):
    for i, r in enumerate(R):
        if r[0] <= x <= r[1] and r[2] <= y <= r[3]:
            return i
    return -1


xs = sorted({round(v, 4) for r in R + V for v in (r[0], r[1], r[0] - KW, r[0] + KW, r[1] - KW, r[1] + KW)})
ys = sorted({round(v, 4) for r in R + V for v in (r[2], r[3], r[2] - KW, r[2] + KW, r[3] - KW, r[3] + KW)})
nx, ny = len(xs) - 1, len(ys) - 1
kind = np.zeros((nx, ny), np.int8)    # 0 lawn, 1 paving, 2 kerb, 3 threshold (open, not drawn)
seg = np.full((nx, ny), -1, np.int32)
RV = R + V
for i in range(nx):
    cx = (xs[i] + xs[i + 1]) / 2
    if not any(r[0] <= cx <= r[1] for r in RV):
        continue
    for j in range(ny):
        cy = (ys[j] + ys[j + 1]) / 2
        s = seg_of(cx, cy)
        if s < 0:
            kind[i, j] = 3 if inside(V, cx, cy) else 0
            continue
        seg[i, j] = s
        edge = any(not inside(RV, cx + dx * KW, cy + dy * KW) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)
        kind[i, j] = 2 if edge else 1
print('paths grid', nx, 'x', ny, 'paving cells', int((kind == 1).sum()), 'kerb cells', int((kind == 2).sum()))


# --- Paving: one plane, islands per segment for the lightmap -----------------------------------
def build_plane():
    bm = bmesh.new()
    vid = {}

    def v(x, y):
        k = (round(x, 4), round(y, 4))
        if k not in vid:
            vid[k] = bm.verts.new((x, y, ZP))
        return vid[k]
    fseg = bm.faces.layers.int.new('seg')
    for i in range(nx):
        for j in range(ny):
            if kind[i, j] in (1, 2):  # under the kerbs too: one continuous surface for the bake
                f = bm.faces.new((v(xs[i], ys[j]), v(xs[i + 1], ys[j]), v(xs[i + 1], ys[j + 1]), v(xs[i], ys[j + 1])))
                f[fseg] = seg[i, j]
    bm.edges.ensure_lookup_table()
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.link_faces[0][fseg] != e.link_faces[1][fseg]:
            e.seam = True
    bm.normal_update()
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), use_dissolve_boundaries=False,
                             verts=list(bm.verts), edges=list(bm.edges), delimit={'SEAM'})
    # UV0 in world metres (tiling lives in the material); Lightmap: planar per segment, islands apart.
    uv0 = bm.loops.layers.uv.new('UVMap')
    lm = bm.loops.layers.uv.new('Lightmap')
    fseg = bm.faces.layers.int.get('seg')
    for f in bm.faces:
        off = f[fseg] * 400.0
        for l in f.loops:
            co = l.vert.co
            l[uv0].uv = (co.x, co.y)
            l[lm].uv = ((co.x + off) * 0.001, co.y * 0.001)
    remove('paths')
    me = bpy.data.meshes.new('paths_mesh')
    bm.to_mesh(me); bm.free()
    me.materials.append(bpy.data.materials['mat_path'])
    o = bpy.data.objects.new('paths', me)
    gen.objects.link(o)
    return o


# --- Kerbs: tops + faces where they meet paving / lawn; lips at open path ends ------------------
def build_kerbs():
    bm = bmesh.new()
    vid = {}

    def v(x, y, z):
        k = (round(x, 4), round(y, 4), round(z, 4))
        if k not in vid:
            vid[k] = bm.verts.new(k)
        return vid[k]

    def wall(a, b, z0, z1, flip):
        (x0, y0), (x1, y1) = a, b
        q = (v(x0, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y0, z1))
        bm.faces.new(q[::-1] if flip else q)

    def k(i, j):
        return kind[i, j] if 0 <= i < nx and 0 <= j < ny else 0
    for i in range(nx):
        for j in range(ny):
            t = kind[i, j]
            if t not in (1, 2):
                continue
            x0, x1, y0, y1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
            if t == 2:
                bm.faces.new((v(x0, y0, ZK), v(x1, y0, ZK), v(x1, y1, ZK), v(x0, y1, ZK)))
            # side faces towards lower neighbours (outward normals)
            for (ni, nj), a, b, flip in (((i + 1, j), (x1, y0), (x1, y1), False), ((i - 1, j), (x0, y1), (x0, y0), False),
                                         ((i, j + 1), (x1, y1), (x0, y1), False), ((i, j - 1), (x0, y0), (x1, y0), False)):
                n = k(ni, nj)
                top = ZK if t == 2 else ZP
                if n in (0, 3):
                    wall(a, b, ZG, top, flip)                  # kerb face to the lawn / lip at an open end
                elif t == 2 and n == 1:
                    wall(a, b, ZP, ZK, flip)                   # kerb face to the paving
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update()
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), use_dissolve_boundaries=False, verts=list(bm.verts), edges=list(bm.edges))
    uv = bm.loops.layers.uv.new('UVMap')
    u = swatch_uv('concrete')
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = u
    remove('path_kerbs')
    me = bpy.data.meshes.new('path_kerbs_mesh')
    bm.to_mesh(me); bm.free()
    me.materials.append(bpy.data.materials['mat_props'])
    o = bpy.data.objects.new('path_kerbs', me)
    gen.objects.link(o)
    return o


# --- Paver texture: the tinted brushed concrete cut into 0.625 m slabs ---------------------------
def paver_texture():
    src = bpy.data.images.load(os.path.join(ROOT, 'blender', 'assets', 'polyhaven', 'brushed_concrete', 'path_diff_1k.jpg'), check_existing=True)
    n = src.size[0]
    a = np.array(src.pixels[:], np.float32).reshape(n, n, 4).copy()
    slab = n // 4                                              # tile 2.5 m → 0.625 m slabs
    rng = np.random.default_rng(80)
    tone = 1 + rng.normal(0, 0.018, (4, 4))
    yy, xx = np.mgrid[0:n, 0:n]
    a[..., :3] *= tone[(yy // slab) % 4, (xx // slab) % 4][..., None]
    d = np.minimum(np.minimum(xx % slab, slab - 1 - xx % slab), np.minimum(yy % slab, slab - 1 - yy % slab))
    shade = np.where(d < 2, 0.62, np.where(d < 4, 0.9 + 0.04 * (d - 2), 1.0))   # joint + worn arris
    a[..., :3] *= shade[..., None]
    img = bpy.data.images.get('path_pavers') or bpy.data.images.new('path_pavers', n, n, alpha=False)
    if tuple(img.size) != (n, n):
        img.scale(n, n)
    img.colorspace_settings.name = 'sRGB'
    img.pixels.foreach_set(np.clip(a, 0, 1).ravel())
    img.filepath_raw = os.path.join(TEX, 'path_pavers.png')
    img.file_format = 'PNG'
    img.save()
    img.source = 'FILE'; img.filepath = '//textures/path_pavers.png'; img.reload()
    m = bpy.data.materials['mat_path']
    for nd in m.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image and ('path_diff' in nd.image.name or 'path_pavers' in nd.image.name):
            nd.image = img


# --- Tennis floodlights: off the walkways, onto their own apron corners --------------------------
def move_masts():
    pole = bpy.data.meshes['flood_pole_mesh']
    IN = 0.6
    for c in TENNIS:
        x0, x1, y0, y1 = AP[c]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1)), start=1):
            pos = Vector((x0 + IN if sx < 0 else x1 - IN, y0 + IN if sy < 0 else y1 - IN, 0))
            rz = math.atan2(-(cx - pos.x), cy - pos.y)
            for part in ('pole', 'bulb'):
                o = bpy.data.objects.get(f'{c}_lamp{k}_{part}')
                if o:
                    o.location = pos
                    o.rotation_euler = (0, 0, rz)


# --- Perimeter fence: west entrance gate, gate to the car park; the car park stays outside --------
def perimeter():
    for o in [o for o in bpy.data.objects if o.name.startswith('perimeter_')]:
        remove(o.name)
    fence_mat, post_mat = bpy.data.materials['mat_fence_chainlink'], bpy.data.materials['mat_fence_post']
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    H = 3.6

    def panel(a, b):
        a, b = Vector(a), Vector(b)
        vs = [bm.verts.new(p) for p in (a, b, b + Vector((0, 0, H)), a + Vector((0, 0, H)))]
        f = bm.faces.new(vs)
        L = (b - a).length
        for l, uv in zip(f.loops, ((0, 0), (L / 3, 0), (L / 3, H / 3.6), (0, H / 3.6))):
            l[uvl].uv = uv

    def bar(lo, hi):
        r = bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector(hi) - Vector(lo), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(Vector(hi) + Vector(lo)) / 2, verts=r['verts'])
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = 1
            for l in f.loops:
                l[uvl].uv = (0.5, 0.5)

    gate_w = (RA1 - 0.38, RB0 + 0.38)                          # ±2.5 m
    runs = [((PER_X0, PER_Y0), (PER_X0, gate_w[0])), ((PER_X0, gate_w[1]), (PER_X0, PER_Y1)),
            ((PER_X0, PER_Y1), (gx0, PER_Y1)), ((gx0, PER_Y1), (gx0, gy1)),
            ((gx0, -gy1), (gx0, PARK[3] + 3.5)), ((gx0, PARK[3] + 3.5), (PER_GATE_PARK[1], PARK[3] + 3.5)),
            ((PER_GATE_PARK[0], PARK[3] + 3.5), (PARK[0] - 2.0, PARK[3] + 3.5)),
            ((PARK[0] - 2.0, PARK[3] + 3.5), (PARK[0] - 2.0, PER_Y0)), ((PARK[0] - 2.0, PER_Y0), (PER_X0, PER_Y0))]
    r = 0.045
    placed = {(round(gx0, 1), round(gy1, 1)), (round(gx0, 1), round(-gy1, 1))}  # grass fence has these posts
    for a, b in runs:
        panel((*a, 0), (*b, 0))
        L = (Vector(b) - Vector(a)).length
        n = max(1, round(L / 3.5))
        for k in range(n + 1):
            p = Vector(a).lerp(Vector(b), k / n)
            key = (round(p.x, 1), round(p.y, 1))
            if key in placed:
                continue
            placed.add(key)
            bar((p.x - r, p.y - r, 0), (p.x + r, p.y + r, H + 0.05))
        lo = Vector((min(a[0], b[0]), min(a[1], b[1]), H - 0.04)); hi = Vector((max(a[0], b[0]), max(a[1], b[1]), H))
        lo.x -= 0.025 if a[0] == b[0] else 0; hi.x += 0.025 if a[0] == b[0] else 0
        lo.y -= 0.025 if a[1] == b[1] else 0; hi.y += 0.025 if a[1] == b[1] else 0
        bar(lo, hi)
    g = 0.07  # gates: heavier posts and a header beam
    for y in gate_w:
        bar((PER_X0 - g, y - g, 0), (PER_X0 + g, y + g, H + 0.2))
    bar((PER_X0 - 0.05, gate_w[0], H + 0.1), (PER_X0 + 0.05, gate_w[1], H + 0.2))
    yp = PARK[3] + 3.5
    for x in PER_GATE_PARK:
        bar((x - g, yp - g, 0), (x + g, yp + g, H + 0.2))
    bar((PER_GATE_PARK[0], yp - 0.05, H + 0.1), (PER_GATE_PARK[1], yp + 0.05, H + 0.2))
    me = bpy.data.meshes.new('perimeter_fence_mesh')
    bm.to_mesh(me); bm.free()
    me.materials.append(fence_mat); me.materials.append(post_mat)
    o = bpy.data.objects.new('perimeter_fence', me)
    gen.objects.link(o)


# --- Vending machines (unbranded): two against the clubhouse, one in a bay by the padel spine -------
def vending(p, M, body, accent):
    W, D, Hh = 0.92, 0.78, 1.92
    p.box((-W / 2, -D / 2, 0.0), (W / 2, D / 2, 0.08), 'plastic_black', matrix=M)                 # plinth
    p.box((-W / 2, -D / 2 + 0.02, 0.08), (W / 2, D / 2, Hh), body, matrix=M, bevel=0.02)
    p.box((-W / 2 + 0.01, -D / 2 + 0.03, Hh - 0.01), (W / 2 - 0.01, D / 2 - 0.01, Hh + 0.025), 'steel_dark', matrix=M)  # lid
    p.box((-W / 2 + 0.03, -D / 2 - 0.005, Hh - 0.2), (W / 2 - 0.03, -D / 2 + 0.03, Hh - 0.05), accent, matrix=M)  # header
    gx0_, gx1_ = -W / 2 + 0.05, W / 2 - 0.27
    p.box((gx0_, -D / 2 - 0.004, 0.62), (gx1_, -D / 2 + 0.03, Hh - 0.25), 'car_glass', matrix=M)  # window
    goods = ('bottle_blue', 'towel_red', 'plastic_white', 'cone_orange', 'ball', 'agave')
    for r in range(5):                                         # shelves of goods behind the glass
        z = 0.7 + r * 0.2
        p.box((gx0_ + 0.02, -D / 2 + 0.03, z - 0.012), (gx1_ - 0.02, -D / 2 + 0.06, z), 'steel_galv', matrix=M)
        for c in range(5):
            x = gx0_ + 0.05 + c * (gx1_ - gx0_ - 0.1) / 4.6
            p.box((x, -D / 2 + 0.035, z), (x + 0.07, -D / 2 + 0.09, z + 0.13), goods[(r * 2 + c) % len(goods)], matrix=M)
    px0 = W / 2 - 0.24
    p.box((px0, -D / 2 - 0.004, 0.62), (W / 2 - 0.04, -D / 2 + 0.03, Hh - 0.25), 'machine', matrix=M)  # panel
    p.box((px0 + 0.04, -D / 2 - 0.01, 1.32), (W / 2 - 0.08, -D / 2, 1.42), 'lamp_front', matrix=M)    # display
    for k in range(3):
        for c in range(3):
            p.box((px0 + 0.045 + c * 0.04, -D / 2 - 0.01, 1.12 + k * 0.05), (px0 + 0.075 + c * 0.04, -D / 2, 1.15 + k * 0.05), 'plastic_white', matrix=M)
    p.box((px0 + 0.07, -D / 2 - 0.01, 0.96), (px0 + 0.13, -D / 2, 1.04), 'chrome', matrix=M)          # coin slot
    p.box((-W / 2 + 0.08, -D / 2 - 0.01, 0.2), (W / 2 - 0.08, -D / 2 + 0.01, 0.48), 'plastic_black', matrix=M)  # tray
    p.box((-W / 2 + 0.12, -D / 2 - 0.02, 0.24), (W / 2 - 0.12, -D / 2, 0.44), 'grille_dark', matrix=M)


def vending_machines():
    for i in range(1, 5):
        remove(f'vending_{i}')
    for m in ('mat_vending_body', 'mat_vending_panel'):
        mat = bpy.data.materials.get(m)
        if mat and mat.users == 0:
            bpy.data.materials.remove(mat)
    p = Props()
    # Facade, between the windows at x 19.4 and 24.0 (wall 20.6–22.8), backs to the wall.
    for x, body, accent in ((21.2, 'machine_accent', 'plastic_white'), (22.2, 'ac_white', 'bottle_blue')):
        vending(p, Matrix.Translation((x, CLUB_Y0 - 0.41, 0)), body, accent)
    # Padel: in a bay on the north edge of the mid path, next to the spine, front to the path (and the drone).
    vending(p, Matrix.Translation((25.2, PADEL_MID[1] + 0.47, ZP)), 'ac_white', 'bottle_blue')
    p.to_object('vending_machines', gen, smooth_angle=30)


# --- Trees standing on the new paths step aside (positions ride along as impostor anchors) ---------
TREE_MOVES = {'tree_02': (-32.6, 36.4), 'tree_12': (-32.4, 6.6), 'tree_30': (-32.4, -18.9),
              'tree_lowpoly_base': (-32.5, 16.0), 'tree_20': (70.6, -32.2)}


def trees():
    for n, (x, y) in TREE_MOVES.items():
        o = bpy.data.objects.get(n)
        if o:
            o.location.x, o.location.y = x, y
    for o in bpy.data.objects:
        if o.name.startswith('tree_') and inside(R, o.location.x, o.location.y):
            print('WARNING tree on a path', o.name, tuple(o.location))


# --- Ground: 1.9 km → the region any allowed view reaches, with a wide margin --------------------
# Widest views (camera-rig.js: FOV 34°, pitch 52°, pan x −30…105 / z −70…80): landscape 21:9 at 92 m
# sees x −120…195, three z −117…109; a portrait phone may pull back to ~256 m and then sees
# three z −201…160 (x ±49 around the target). Kept: x −330…410, three z −330…280 (≥130 m beyond).
def trim_ground():
    g = bpy.data.objects['ground']
    me = g.data
    X0, X1, Y0, Y1 = -330.0, 410.0, -280.0, 330.0
    mi = g.matrix_world.inverted()
    for v in me.vertices:
        w = g.matrix_world @ v.co
        w.x = X0 if w.x < 0 else X1
        w.y = Y0 if w.y < 0 else Y1
        v.co = mi @ w
    for l in me.loops:
        w = g.matrix_world @ me.vertices[l.vertex_index].co
        me.uv_layers['UVMap'].data[l.index].uv = (w.x, w.y)
        me.uv_layers['Lightmap'].data[l.index].uv = ((w.x - X0) / (X1 - X0), (w.y - Y0) / (Y1 - Y0))
    me.update()


paver_texture()
plane = build_plane()
kerbs = build_kerbs()
move_masts()
perimeter()
vending_machines()
trees()
trim_ground()

bpy.context.view_layer.update()
# Anything else standing on the paving? (fences/gates on the kerb line and furniture on the forecourt are fine)
OK = ('fence', 'gate', 'pergola', 'bench_', 'table_', 'clubhouse', 'paths', 'path_kerbs', 'vending', 'ground', 'apron', '_hl',
      'parking', 'chill', 'restzone', 'tree_', 'storage_shed', 'grass-')
for o in bpy.data.objects:
    if o.type != 'MESH' or any(s in o.name for s in OK) or 'template' in o.name:
        continue
    b = bounds(o.name)
    if b[1] - b[0] > 30 or b[3] - b[2] > 30:
        continue
    cx, cy = (b[0] + b[1]) / 2, (b[2] + b[3]) / 2
    if inside(R, cx, cy):
        print('ON PATH', o.name, tuple(round(x, 2) for x in b))

bpy.ops.wm.save_mainfile()
print('footpaths done: paving', len(plane.data.polygons), 'faces; kerbs', sum(len(p.vertices) - 2 for p in kerbs.data.polygons), 'tris')
