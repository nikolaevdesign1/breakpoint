# Row 68: a little life around the courts — not too much. Re-runnable.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/decor.py
# The pieces (planter, agave, palm, …) are importable: rest_zone.py builds with them.
# Row 154: planters are hollow (soil sunk below the rim: no coplanar faces to flicker).
# Row 153: the boulders are Poly Haven scans (Rock Moss Set 02, CC0), decimated, partly sunk.
# Per tennis court (on the apron, off the playing lines): a water cooler on a stand next to the
# benches, towels and a kit bag on some benches; a ball machine with a stack of cones behind the
# baseline on a few courts. Padel: a ball basket by the bench. Around the club: big concrete
# planters with agaves or small palms, decorative boulders, litter bins. All in `mat_props`.
import bpy, math, os, sys, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection

rnd = random.Random(68)
ROCKS = os.path.join(os.path.dirname(__file__), '..', '..', 'blender', 'assets', 'polyhaven', 'models', 'rock_moss_set_02', 'rock_moss_set_02.gltf')


def centre(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(((min(c.x for c in cs) + max(c.x for c in cs)) / 2, (min(c.y for c in cs) + max(c.y for c in cs)) / 2, 0))


# --- Pieces (local, origin on the ground) ----------------------------------------------------
def cooler(p, M):
    p.box((-0.2, -0.2, 0), (0.2, 0.2, 0.05), 'steel_dark', matrix=M)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cyl(M @ Vector((sx * 0.17, sy * 0.17, 0.0)), M @ Vector((sx * 0.15, sy * 0.15, 0.62)), 0.015, 'steel_dark', seg=6)
    p.box((-0.21, -0.21, 0.6), (0.21, 0.21, 0.64), 'steel_dark', matrix=M)
    p.lathe([(0.17, 0.64), (0.19, 0.67), (0.19, 1.02), (0.17, 1.05)], 'plastic_white', seg=14, matrix=M)
    p.lathe([(0.17, 1.05), (0.175, 1.08), (0.1, 1.11)], 'towel_red', seg=14, matrix=M, cap_top=True)
    p.box((-0.03, -0.22, 0.7), (0.03, -0.18, 0.75), 'plastic_black', matrix=M)
    p.lathe([(0.04, 0.64), (0.045, 0.8)], 'plastic_white', seg=8, matrix=M @ Matrix.Translation((0.17, -0.12, 0)), cap_top=True)  # cup stack


def ball_machine(p, M):
    for sx in (-1, 1):
        p.cyl(M @ Vector((sx * 0.3, -0.1, 0.12)), M @ Vector((sx * 0.24, -0.1, 0.12)), 0.12, 'tyre', seg=12)
    p.box((-0.25, -0.3, 0.12), (0.25, 0.25, 0.5), 'machine', matrix=M, bevel=0.03)
    p.box((-0.255, -0.31, 0.38), (0.255, 0.26, 0.42), 'machine_accent', matrix=M)
    p.cyl(M @ Vector((0, -0.3, 0.32)), M @ Vector((0, -0.36, 0.32)), 0.06, 'plastic_black', seg=10)  # launch tube
    p.lathe([(0.16, 0.5), (0.3, 0.78), (0.31, 0.8)], 'machine', seg=14, matrix=M)
    p.sphere(M @ Vector((0, 0, 0.74)), 0.29, 'ball', seg=12, rings=6, scale=(1, 1, 0.3))
    for b in range(9):
        a = b * 2.4
        r = 0.08 + 0.18 * (b % 3) / 2
        p.sphere(M @ Vector((r * math.cos(a), r * math.sin(a), 0.81)), 0.034, 'ball', seg=6, rings=4)
    p.cyl(M @ Vector((-0.2, 0.25, 0.45)), M @ Vector((-0.2, 0.55, 0.85)), 0.015, 'steel_galv', seg=6)
    p.cyl(M @ Vector((0.2, 0.25, 0.45)), M @ Vector((0.2, 0.55, 0.85)), 0.015, 'steel_galv', seg=6)
    p.cyl(M @ Vector((-0.2, 0.55, 0.85)), M @ Vector((0.2, 0.55, 0.85)), 0.02, 'plastic_black', seg=6)


def cones(p, M, n=5):
    for k in range(n):
        z = k * 0.035
        p.box((-0.12, -0.12, z), (0.12, 0.12, z + 0.02), 'cone_orange', matrix=M)
        p.lathe([(0.1, z + 0.02), (0.035, z + 0.21), (0.022, z + 0.235)], 'cone_orange', seg=10, matrix=M, cap_top=True)


def towel(p, M, sw):
    p.box((-0.32, -0.14, 0.0), (0.22, 0.16, 0.025), sw, matrix=M, bevel=0.008)
    p.box((-0.32, 0.165, -0.2), (0.22, 0.19, 0.02), sw, matrix=M, bevel=0.006)  # hangs over the front edge


def bag(p, M):
    p.box((-0.33, -0.15, 0), (0.33, 0.15, 0.3), 'plastic_black', matrix=M, bevel=0.06, seg=2)
    p.box((-0.34, -0.155, 0.12), (0.34, 0.155, 0.16), 'towel_red', matrix=M)
    p.cyl(M @ Vector((-0.12, 0, 0.3)), M @ Vector((0.12, 0, 0.3)), 0.02, 'plastic_black', seg=6)


def bin_(p, M):
    p.lathe([(0.27, 0.0), (0.28, 0.82), (0.3, 0.84), (0.3, 0.9), (0.22, 0.92)], 'bin_dark', seg=14, matrix=M, cap_top=True)
    p.lathe([(0.1, 0.92), (0.1, 0.925)], 'plastic_black', seg=10, matrix=M, cap_top=True)


def planter(p, M, plant, size=1.1):
    """Concrete planter: four walls round a soil bed sunk 6 cm below the rim (row 154)."""
    s, t, h = size / 2, 0.07, 0.62
    for lo, hi in (((-s, -s, 0), (s, -s + t, h)), ((-s, s - t, 0), (s, s, h)), ((-s, -s + t, 0), (-s + t, s - t, h)), ((s - t, -s + t, 0), (s, s - t, h))):
        p.box(lo, hi, 'planter', matrix=M, bevel=0.012)
    soil = h - 0.06
    p.box((-s + t + 0.002, -s + t + 0.002, 0.05), (s - t - 0.002, s - t - 0.002, soil), 'mulch', matrix=M)
    top = M @ Matrix.Translation((0, 0, soil))
    (agave if plant == 'agave' else palm)(p, top)


def leaf(p, M, length, width, lift, droop, sw, sw_under, seg=4):
    """Thin, slightly folded leaf/frond from the origin along +y, closed (top + underside)."""
    pts_l, pts_r, pts_c = [], [], []
    for i in range(seg + 1):
        t = i / seg
        y = length * t
        z = lift * math.sin(t * math.pi * 0.6) - droop * t * t
        w = width * (math.sin(math.pi * min(1.0, t * 1.15)) * 0.85 + 0.15) * (1 - t * 0.85)
        pts_l.append(M @ Vector((-w, y, z - 0.03 * w / max(width, 1e-3))))
        pts_r.append(M @ Vector((w, y, z - 0.03 * w / max(width, 1e-3))))
        pts_c.append(M @ Vector((0, y, z + 0.02)))
    for i in range(seg):
        p.quad([pts_l[i], pts_c[i], pts_c[i + 1], pts_l[i + 1]][::-1], sw)
        p.quad([pts_c[i], pts_r[i], pts_r[i + 1], pts_c[i + 1]][::-1], sw)
        drop = Vector((0, 0, -0.012))
        p.quad([pts_l[i] + drop, pts_c[i] + drop, pts_c[i + 1] + drop, pts_l[i + 1] + drop], sw_under)
        p.quad([pts_c[i] + drop, pts_r[i] + drop, pts_r[i + 1] + drop, pts_c[i + 1] + drop], sw_under)


def agave(p, M):
    k = 0
    for ring, (n, L, lift, droop) in enumerate(((7, 0.62, 0.42, 0.22), (6, 0.48, 0.5, 0.1), (5, 0.32, 0.45, 0.0))):
        for i in range(n):
            a = 2 * math.pi * (i + 0.5 * ring) / n + rnd.uniform(-0.15, 0.15)
            R = Matrix.Rotation(a, 4, 'Z')
            leaf(p, M @ R, L * rnd.uniform(0.9, 1.1), 0.075, lift, droop, 'agave' if k % 3 else 'agave_dark', 'agave_dark', seg=3)
            k += 1
    p.lathe([(0.04, 0.0), (0.0, 0.25)], 'agave_tip', seg=6, matrix=M)


def palm(p, M):
    h = rnd.uniform(1.5, 1.9)
    prof = []
    for i in range(7):
        z = h * i / 6
        prof.append((0.1 - 0.03 * i / 6 + (0.012 if i % 2 else 0), z))
    p.lathe(prof, 'trunk', seg=8, matrix=M)
    top = M @ Matrix.Translation((0, 0, h))
    for i in range(10):
        a = 2 * math.pi * i / 10 + rnd.uniform(-0.2, 0.2)
        tilt = Matrix.Rotation(math.radians(rnd.uniform(-10, 25)), 4, 'X')
        leaf(p, top @ Matrix.Rotation(a, 4, 'Z') @ tilt, rnd.uniform(1.05, 1.35), 0.2, 0.35, 0.75, 'frond' if i % 2 else 'frond_dark', 'frond_dark', seg=5)
    p.sphere(top.translation, 0.12, 'frond_dark', seg=6, rings=4)


def rock_sources():
    """The scanned rocks, decimated to a few hundred triangles each (their normal map keeps the detail)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(ROCKS))
    src = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in src:
        dec = o.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.045
        bpy.context.view_layer.objects.active = o
        with bpy.context.temp_override(object=o):
            bpy.ops.object.modifier_apply(modifier='dec')
        o.data.transform(o.matrix_world); o.matrix_world = Matrix()
        bb = [Vector(c) for c in o.bound_box]
        o.data.transform(Matrix.Translation(-Vector(((min(c.x for c in bb) + max(c.x for c in bb)) / 2, (min(c.y for c in bb) + max(c.y for c in bb)) / 2, min(c.z for c in bb)))))
    for o in [o for o in bpy.data.objects if o not in before and o not in src]:
        bpy.data.objects.remove(o)
    return src


def rocks(spots, coll):
    """Boulder groups: (x, y, n). One big rock and smaller ones round it, turned at random, sunk by a
    fifth of their height so they sit in the lawn rather than on it. One object, one material."""
    src = rock_sources()
    parts = []
    for x, y, n in spots:
        for k in range(n):
            o = src[rnd.randrange(len(src))]
            size = rnd.uniform(0.5, 0.75) if k else rnd.uniform(0.8, 1.1)  # longest side, m
            sc = size / max(o.dimensions.x, o.dimensions.y)
            off = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * (0.0 if k == 0 else 1.0)
            c = o.copy(); c.data = o.data.copy()
            coll.objects.link(c)
            c.matrix_world = (Matrix.Translation((x + off.x, y + off.y, -o.dimensions.z * sc * 0.2))
                              @ Matrix.Rotation(rnd.uniform(0, 6.28), 4, 'Z') @ Matrix.Scale(sc, 4))
            parts.append(c)
    for o in src:
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = 'club_rocks'
    return parts[0]


def main():
    props_material()
    coll = collection('gen_decor')
    # --- Court decor ---------------------------------------------------------------------------
    C1 = centre(bpy.data.objects['clay-1'])
    courts = [(f'clay-{i}', 0) for i in range(1, 7)] + [(f'hard-{i}', 0) for i in range(1, 5)] + [('grass-1', -1), ('grass-2', 1)]
    MACHINES = {'clay-2', 'clay-5', 'hard-1', 'hard-4', 'grass-2'}
    bench = bpy.data.objects['clay-1_bench1']
    seat = max((v.co.z for v in bench.data.vertices if v.co.z < 0.6 and abs(v.co.y) < 0.12), default=0.45)
    print('bench seat height', round(seat, 3))
    for k, (cid, side) in enumerate(courts):
        p = Props()
        c = centre(bpy.data.objects[f'{cid}_hl']) if cid.startswith('grass') else centre(bpy.data.objects[cid])
        if cid.startswith('grass'):
            c = centre(bpy.data.objects[f'{cid}_posts'])
            c = bpy.data.objects[f'{cid}_posts'].location.copy()
        M = Matrix.Translation(c) @ Matrix.Rotation(side * math.pi / 2, 4, 'Z')  # clay-1 frame: bench side = +x
        cooler(p, M @ Matrix.Translation((7.5, 4.0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z'))
        if k % 2 == 0:
            b1 = bpy.data.objects[f'{cid}_bench1'].matrix_world
            towel(p, b1 @ Matrix.Translation((rnd.uniform(-0.3, 0.2), 0.0, seat + 0.005)), ('towel_white', 'towel_red', 'towel_cream')[k % 3])
        if k % 3 == 1:
            b2 = bpy.data.objects[f'{cid}_bench2'].matrix_world
            towel(p, b2 @ Matrix.Translation((0.25, 0.0, seat + 0.005)), 'towel_white')
            bag(p, b2 @ Matrix.Translation((-0.2, 0.62, 0)) @ Matrix.Rotation(0.15, 4, 'Z'))
        if cid in MACHINES:
            far = 1 if k % 2 else -1  # behind one of the baselines (on the apron)
            ball_machine(p, M @ Matrix.Translation((0.6, far * 14.3, 0)) @ Matrix.Rotation(0 if far < 0 else math.pi, 4, 'Z'))
            cones(p, M @ Matrix.Translation((2.2, far * 14.6, 0)))
        p.to_object(f'{cid}_decor', coll, smooth_angle=40)

    # Padel: a ball basket next to the bench (on the side away from the door).
    for i in range(1, 5):
        c = centre(bpy.data.objects[f'padel-{i}'])
        p = Props()
        M = Matrix.Translation((c.x - 5.0, c.y - 6.0, 0))  # row 80: clear of the door spur
        for sx in (-1, 1):
            for sy in (-1, 1):
                p.cyl(M @ Vector((sx * 0.2, sy * 0.2, 0)), M @ Vector((sx * 0.17, sy * 0.17, 0.55)), 0.012, 'wire', seg=5)
        p.lathe([(0.2, 0.5), (0.24, 0.85)], 'wire', seg=8, matrix=M)
        p.sphere(M @ Vector((0, 0, 0.8)), 0.22, 'ball', seg=10, rings=5, scale=(1, 1, 0.35))
        for b in range(7):
            a = b * 2.2
            p.sphere(M @ Vector((0.12 * math.cos(a), 0.12 * math.sin(a), 0.86)), 0.034, 'ball', seg=6, rings=4)
        p.to_object(f'padel-{i}_decor', coll, smooth_angle=40)

    # --- Around the club (Blender coordinates: x right, y away from the drone) ---------------------
    p = Props()
    # Row 80: placed against the footpath network (footpaths.py) — flanking doors and gates, never on the paving.
    for x, y, plant in ((6.6, 50.4, 'palm'), (12.4, 50.4, 'palm'), (-11.2, 50.9, 'agave'), (-7.8, 50.9, 'agave'),
                        (45.6, 50.9, 'agave'), (49.4, 50.9, 'agave'), (70.9, -3.3, 'agave'), (70.9, 3.3, 'agave'),
                        (18.1, -53.2, 'palm'), (23.9, -53.2, 'palm'), (64.4, -40.6, 'agave'), (69.6, -40.6, 'agave')):
        planter(p, Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rnd.uniform(-0.05, 0.05), 4, 'Z'), plant)
    rocks(((-29.0, 47.5, 5), (64.2, 49.8, 4), (70.4, -9.0, 3), (25.2, -46.0, 3), (53.5, -46.5, 3), (-30.8, -44.5, 4)), coll)
    for x, y in ((14.4, 50.9), (-7.0, 41.5), (16.9, -53.4), (70.6, -4.0), (50.6, 46.9), (25.2, 50.6)):
        bin_(p, Matrix.Translation((x, y, 0)))
    p.to_object('club_decor', coll, smooth_angle=40)

    bpy.ops.wm.save_mainfile()
    print('decor done', sum(len(pp.vertices) - 2 for o in coll.objects for pp in o.data.polygons), 'tris')


if __name__ == '__main__':
    main()
