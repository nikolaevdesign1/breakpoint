# Row 15 + row 16 of docs/edits-booking-2026-11-06.md.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/court_furniture_fix.py
# 1. Benches of the clay, hard and grass courts are turned 180° about their own centre so the seat faces
#    the court (before, the backrest stood on the court side). Padel benches, the free-standing benches
#    and the terrace bench are not touched.
# 2. Ball baskets of the clay and hard courts get a new model: a wire cage with rim, two handles, loose
#    balls heaped above the rim and seen between the wires, and either a four-legged stand or a small
#    two-wheel cart. The old box, handle and five lump-balls objects are removed. Two variants share one
#    mesh each, so the optimizer instances them (a few KB in the GLB).
# Re-runnable: it only acts on objects it finds in the old state, and rebuilds its two meshes by name.
import bpy, math, random, re, sys, os
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material

props_material()
rnd = random.Random(1506)


def wbox(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (Vector((min(c.x for c in cs), min(c.y for c in cs), 0)), Vector((max(c.x for c in cs), max(c.y for c in cs), 0)))


# --- 1. Benches -----------------------------------------------------------------------------------
turned = []
for o in sorted(bpy.data.objects, key=lambda o: o.name):
    if o.type != 'MESH' or not re.fullmatch(r'(clay|hard|grass)-\d+_bench\d', o.name):
        continue
    lo, hi = wbox(o)
    c = (lo + hi) / 2
    if abs(o.get('turned', 0)) == 1:
        continue
    o.matrix_world = Matrix.Translation(c) @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation(-c) @ o.matrix_world
    o['turned'] = 1
    turned.append(o.name)
print('benches turned', len(turned))

# --- 2. Baskets -----------------------------------------------------------------------------------
R_BOT, R_TOP, Z_BOT, Z_TOP = 0.2, 0.26, 0.56, 0.92  # cage: a basket 36 cm deep, 52 cm across the top
BALL = 0.0345  # a 6.9 cm ball


def ball(p, c, sw='ball', sub=1):
    p.ico(c, BALL, sw, sub=sub, scale=(1, 1, 1), jitter=0.03, rnd=rnd, matrix=Matrix.Rotation(rnd.uniform(0, 6.28), 4, rnd.choice('XYZ')))


def ring(p, z, r, rad, sw='plastic_black', seg=16):
    for k in range(seg):
        a0, a1 = 2 * math.pi * k / seg, 2 * math.pi * (k + 1) / seg
        p.cyl((r * math.cos(a0), r * math.sin(a0), z), (r * math.cos(a1), r * math.sin(a1), z), rad, sw, seg=4, caps=False)


def cage(p, rim_sw):
    # rods
    for k in range(16):
        a = 2 * math.pi * k / 16
        p.cyl((R_BOT * math.cos(a), R_BOT * math.sin(a), Z_BOT), (R_TOP * math.cos(a), R_TOP * math.sin(a), Z_TOP), 0.0045, 'wire', seg=4, caps=False)
    for t in (0.0, 0.33, 0.66):  # horizontal wires
        z = Z_BOT + (Z_TOP - Z_BOT) * t
        ring(p, z + 0.004, R_BOT + (R_TOP - R_BOT) * t, 0.0045, 'wire')
    ring(p, Z_TOP, R_TOP, 0.011, rim_sw, seg=20)  # rim, a stout tube
    p.lathe([(0.0, Z_BOT), (R_BOT, Z_BOT)], 'wire', seg=16, cap_bottom=True)  # floor of the cage
    for a in (0.0, math.pi / 2):  # floor wires
        p.cyl((-R_BOT * math.cos(a), -R_BOT * math.sin(a), Z_BOT + 0.004), (R_BOT * math.cos(a), R_BOT * math.sin(a), Z_BOT + 0.004), 0.005, 'wire', seg=4, caps=False)
    # two arched handles, opposite sides (x axis), up from the rim
    for sx in (-1, 1):
        pts = [(sx * R_TOP, 0.0, Z_TOP), (sx * (R_TOP + 0.045), 0.0, Z_TOP + 0.07), (sx * (R_TOP + 0.05), 0.0, Z_TOP + 0.15), (sx * (R_TOP - 0.02), 0.0, Z_TOP + 0.2)]
        for a, b in zip(pts, pts[1:]):
            p.cyl(a, b, 0.009, 'plastic_black', seg=6)


def balls(p, extra_ground):
    # inside, seen between the wires
    for lvl, z in enumerate((Z_BOT + BALL, Z_BOT + 2.4 * BALL, Z_BOT + 3.9 * BALL)):
        n, r = 9, 0.15 + 0.012 * lvl
        for k in range(n):
            a = 2 * math.pi * (k + 0.4 * lvl) / n + rnd.uniform(-0.1, 0.1)
            ball(p, (r * math.cos(a), r * math.sin(a), z), rnd.choice(('ball', 'ball', 'leaf_lime')), sub=0)
    # the heap above the rim: three layers, balls pushing out over the edge
    layers = [(Z_TOP - 0.01, 12, 0.19), (Z_TOP - 0.01, 6, 0.09), (Z_TOP + 0.052, 7, 0.115), (Z_TOP + 0.052, 1, 0.0), (Z_TOP + 0.108, 3, 0.05)]
    for z, n, r in layers:
        for k in range(n):
            a = 2 * math.pi * k / max(n, 1) + rnd.uniform(-0.15, 0.15)
            rr = r + rnd.uniform(-0.01, 0.012)
            ball(p, (rr * math.cos(a), rr * math.sin(a), z + rnd.uniform(-0.006, 0.008)), rnd.choice(('ball', 'ball', 'ball', 'leaf_lime')))
    # 1-3 on the ground by the foot
    for (x, y) in extra_ground:
        ball(p, (x, y, BALL), 'ball')


def stand_variant():
    p = Props()
    cage(p, 'plastic_black')
    for sx in (-1, 1):  # four legs with a square brace
        for sy in (-1, 1):
            p.cyl((sx * 0.25, sy * 0.25, 0.0), (sx * 0.17, sy * 0.17, Z_BOT), 0.0115, 'steel_dark', seg=6)
    for z, h in ((0.22, 0.222),):
        for sx in (-1, 1):
            p.cyl((sx * 0.215, -0.215, z), (sx * 0.215, 0.215, z), 0.0065, 'steel_dark', seg=4, caps=False)
            p.cyl((-0.215, sx * 0.215, z), (0.215, sx * 0.215, z), 0.0065, 'steel_dark', seg=4, caps=False)
    ring(p, Z_BOT - 0.012, R_BOT + 0.012, 0.009, 'steel_dark', seg=16)
    balls(p, [(0.42, -0.1), (0.37, 0.17)])
    return p


def cart_variant():
    p = Props()
    cage(p, 'steel_dark')
    # a low frame: base plate, two wheels and a push bar behind (+y side)
    p.box((-0.24, -0.24, 0.17), (0.24, 0.24, 0.2), 'steel_dark')
    for sx in (-1, 1):
        p.cyl((sx * 0.27, 0.0, 0.1), (sx * 0.31, 0.0, 0.1), 0.1, 'tyre', seg=14)
        p.cyl((sx * 0.265, 0.0, 0.1), (sx * 0.28, 0.0, 0.1), 0.05, 'rim_dark', seg=8)
        p.cyl((sx * 0.24, 0.0, 0.1), (sx * 0.24, 0.0, 0.2), 0.012, 'steel_dark', seg=5)
    p.cyl((-0.27, 0.0, 0.1), (0.27, 0.0, 0.1), 0.01, 'steel_galv', seg=5)  # axle
    for sx in (-1, 1):
        p.cyl((sx * 0.2, 0.2, 0.19), (sx * 0.2, 0.22, Z_BOT), 0.011, 'steel_dark', seg=6)  # posts from the plate up to the cage
        p.cyl((sx * 0.19, 0.3, 0.42), (sx * 0.2, 0.3, 0.98), 0.011, 'steel_dark', seg=6)  # push bar uprights
        p.cyl((sx * 0.2, 0.2, 0.3), (sx * 0.19, 0.3, 0.42), 0.01, 'steel_dark', seg=5)
    p.cyl((-0.19, 0.3, 0.98), (0.19, 0.3, 0.98), 0.015, 'plastic_black', seg=8)  # grip
    p.cyl((0.0, -0.22, 0.0), (0.0, -0.22, 0.17), 0.012, 'steel_dark', seg=5)  # front foot
    p.sphere((0.0, -0.22, 0.02), 0.025, 'tyre', seg=8, rings=4)
    ring(p, Z_BOT - 0.012, R_BOT + 0.012, 0.008, 'steel_dark', seg=16)
    balls(p, [(0.44, -0.2), (0.4, -0.04), (-0.38, 0.12)])
    return p


meshes = {}
for name, fn in (('ball_basket_stand_mesh', stand_variant), ('ball_basket_cart_mesh', cart_variant)):
    old = bpy.data.meshes.get(name)
    if old:
        bpy.data.meshes.remove(old)
    p = fn()
    holder = p.to_object(name[:-5], bpy.data.collections.new('_tmp_' + name), smooth_angle=40)
    me = holder.data
    me.name = name
    bpy.data.objects.remove(holder)
    meshes[name] = me
    print(name, 'tris', sum(len(q.vertices) - 2 for q in me.polygons))

coll_new = 0
courts = [f'clay-{i}' for i in range(1, 7)] + [f'hard-{i}' for i in range(1, 5)]
for n, cid in enumerate(courts):
    o = bpy.data.objects.get(f'{cid}_basket')
    if o is None:
        continue
    lo, hi = wbox(o)
    c = (lo + hi) / 2
    for extra in [f'{cid}_basket_handle'] + [f'{cid}_basket_ball_{i}' for i in range(1, 6)]:
        e = bpy.data.objects.get(extra)
        if e:
            m = e.data
            bpy.data.objects.remove(e)
            if m.users == 0:
                bpy.data.meshes.remove(m)
    old = o.data
    o.data = meshes['ball_basket_cart_mesh' if n % 2 else 'ball_basket_stand_mesh']
    if old.users == 0:
        bpy.data.meshes.remove(old)
    o.scale = (1, 1, 1)
    o.location = (c.x, c.y, 0)
    # the cart's push bar (+y) points away from the court, the stand is turned a little by court
    o.rotation_euler = (0, 0, 0 if n % 2 else rnd.choice((0.0, math.pi / 4)))
    coll_new += 1
print('baskets replaced', coll_new)
bpy.ops.wm.save_mainfile()
print('done')
