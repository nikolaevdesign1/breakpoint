# Row 62: parked cars as real 3D meshes (they used to be camera-facing sprites and did not parallax).
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/cars.py
# Three generic, unbranded body types — sedan, compact SUV, hatchback — modelled here: a lofted
# body with a rounded nose and tail, plan-view taper, shoulder line and wheel arches; a greenhouse
# with tumblehome, tinted glass, painted roof and pillars; tyres with sidewalls, five-spoke rims,
# head/tail lights, grille, plates, mirrors, door handles and panel seams. ~4–5k triangles each.
# All parts use the palette material `mat_props` (paint = a palette swatch), so the whole car park is
# one draw call. Cars stand where the old `parked_car_N` placeholders stood (same bays and headings).
import bpy, math, os, sys
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection, tris

props_material()
coll = collection('gen_cars')

SHAPES = {
    #            L     W     zb    nose  belt  tail  roof  ws    rf    rr    rb    axles          R
    'sedan': dict(L=4.72, W=1.83, zb=0.17, nose=0.70, belt=0.93, tail=0.99, roof=1.44, ws=0.30, rf=0.47, rr=0.71, rb=0.85, axles=(0.195, 0.78), R=0.32),
    'suv': dict(L=4.58, W=1.87, zb=0.24, nose=0.88, belt=1.05, tail=1.08, roof=1.69, ws=0.255, rf=0.39, rr=0.93, rb=0.985, axles=(0.19, 0.80), R=0.36),
    'hatch': dict(L=4.18, W=1.78, zb=0.16, nose=0.68, belt=0.94, tail=0.97, roof=1.48, ws=0.26, rf=0.43, rr=0.80, rb=0.955, axles=(0.185, 0.815), R=0.31),
}


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def build(kind, paint):
    c = SHAPES[kind]
    L, W, R = c['L'], c['W'], c['R']
    p = Props()
    y_of = lambda s: -L / 2 + s * L

    def z_top(s):
        if s < 0.045:
            return lerp(c['nose'] - 0.13, c['nose'], smooth(s / 0.045))
        if s < c['ws']:
            t = (s - 0.045) / (c['ws'] - 0.045)
            return lerp(c['nose'], c['belt'], 1 - (1 - t) ** 1.6)
        if s < c['rb']:
            return c['belt'] + 0.02 * (s - c['ws']) / (c['rb'] - c['ws'])
        if s < 0.965:
            return lerp(c['belt'] + 0.02, c['tail'], smooth((s - c['rb']) / max(0.965 - c['rb'], 1e-3)))
        return lerp(c['tail'], c['tail'] - 0.15, smooth((s - 0.965) / 0.035))

    def z_bot(s):
        e = min(s, 1 - s)
        return c['zb'] + 0.17 * (1 - smooth(e / 0.06))

    def half_w(s):
        e = min(s, 1 - s)
        k = 1 - 0.10 * max(0.0, 1 - e / 0.16) ** 2
        k *= 1 - 0.16 * max(0.0, 1 - e / 0.035) ** 2
        return W / 2 * k

    def arch(y):
        za = 0.0
        for a in c['axles']:
            dy = y - y_of(a)
            ra = R + 0.075
            if abs(dy) < ra:
                za = max(za, R + math.sqrt(ra * ra - dy * dy))
        return za

    # Stations: dense at both ends and around the arches.
    ss = sorted(set([i / 60 for i in range(61)] + [0.005, 0.012, 0.02, 0.03, 0.97, 0.98, 0.988, 0.995]
                    + [a + d for a in c['axles'] for d in (-0.09, -0.06, -0.03, 0.03, 0.06, 0.09)]))
    sections = []
    for s in ss:
        w, zb, zt = half_w(s), z_bot(s), z_top(s)
        h = zt - zb
        half = [(0.0, zb), (0.80 * w, zb), (0.955 * w, zb + 0.05), (0.99 * w, zb + 0.25 * h), (w, zb + 0.55 * h),
                (0.975 * w, zt - 0.12), (0.925 * w, zt - 0.035), (0.80 * w, zt - 0.004), (0.42 * w, zt + 0.014), (0.0, zt + 0.018)]
        za = arch(y_of(s))
        if za > 0:
            cap = zt - 0.075
            for i in range(1, 5):
                x, z = half[i]
                half[i] = (x, max(z, min(za, cap) - 0.004 * (4 - i)))
            for i in range(1, 6):  # keep the profile climbing
                if half[i][1] < half[i - 1][1] + 0.004:
                    half[i] = (half[i][0], half[i - 1][1] + 0.004)
        ring = half + [(-x, z) for x, z in half[8:0:-1]]
        sections.append([(x, y_of(s), z) for x, z in ring])
    p.loft(sections, lambda i, j: paint, close_ends=True, closed=True)

    # Greenhouse.
    def roof_z(s):
        if s <= c['rf']:
            t = (s - c['ws']) / (c['rf'] - c['ws'])
            return lerp(z_top(s), c['roof'], 1 - (1 - t) ** 1.35)
        if s <= c['rr']:
            t = (s - c['rf']) / (c['rr'] - c['rf'])
            return c['roof'] + 0.025 * math.sin(math.pi * t)
        t = (s - c['rr']) / (c['rb'] - c['rr'])
        return lerp(c['roof'], z_top(s), t ** 1.2)

    gs = [lerp(c['ws'], c['rb'], i / 34) for i in range(35)]
    b_pillar = lerp(c['rf'], c['rr'], 0.42 if kind != 'suv' else 0.36)
    gsec = []
    for s in gs:
        zt = z_top(s) - 0.004
        h = max(0.0, roof_z(s) - zt)
        wb = half_w(s) * 0.84
        wt = wb - 0.23 * min(1.0, h / 0.5)
        pts = [(wb, zt), (wb - 0.05 * min(1, h / 0.5), zt + 0.5 * h), (wt, zt + h - min(0.05, h * 0.3)), (wt - 0.08, zt + h), (0.0, zt + h + 0.02 * min(1, h / 0.4))]
        ring = [(-x, z) for x, z in pts[:4]] + [pts[4]] + [(x, z) for x, z in reversed(pts[:4])]
        gsec.append([(x, y_of(s), z) for x, z in ring])

    def gsw(i, j):
        if i < 0:
            return paint
        s = (gs[i] + gs[i + 1]) / 2
        top = 2 <= j <= 5
        if top:
            if s < c['rf'] - 0.01:
                return 'car_glass'
            if s > c['rr'] + 0.01:
                return 'car_glass' if kind != 'sedan' or s < c['rb'] - 0.01 else paint
            return paint
        if j in (1, 6):  # upper side band: pillars and roof rail in paint
            if s < c['rf'] - 0.015 or s > c['rr'] + 0.02:
                return paint
        if abs(s - b_pillar) < 0.016:
            return 'car_trim'
        if s < c['ws'] + 0.35 * (c['rf'] - c['ws']):
            return paint
        if kind == 'sedan' and s > c['rr'] + 0.04:
            return paint
        if kind == 'suv' and s > c['rr'] + 0.02:
            return paint
        return 'car_glass'
    p.loft(gsec, gsw, close_ends=False, closed=False)

    # Wheels: tyre (sidewalls + tread), five-spoke rim with a dark barrel and hub.
    tw = 0.23 if kind != 'suv' else 0.25
    to_axle = lambda side: Matrix.Rotation(math.radians(90 * side), 4, 'Y')
    for a in c['axles']:
        for side in (-1, 1):
            x = side * (W / 2 - tw / 2 - 0.035)
            M = Matrix.Translation((x, y_of(a), R)) @ to_axle(side)
            prof = [(R * 0.70, -tw / 2), (R * 0.93, -tw / 2), (R * 0.99, -tw / 2 + 0.03), (R, 0.0), (R * 0.99, tw / 2 - 0.03), (R * 0.93, tw / 2), (R * 0.70, tw / 2)]
            p.lathe(prof, 'tyre', seg=20, matrix=M)
            p.lathe([(R * 0.70, tw / 2 - 0.004), (R * 0.66, tw / 2 - 0.01)], 'rim', seg=20, matrix=M)
            p.lathe([(R * 0.66, tw / 2 - 0.01), (R * 0.12, tw / 2 - 0.06)], 'rim_dark', seg=20, matrix=M, cap_top=True)
            p.cyl(M @ Vector((0, 0, tw / 2 - 0.06)), M @ Vector((0, 0, tw / 2 - 0.005)), R * 0.14, 'rim', seg=10)
            for k in range(5):
                ang = 2 * math.pi * k / 5
                rot = Matrix.Rotation(ang, 4, 'Z')
                p.box((R * 0.10, -0.028, tw / 2 - 0.035), (R * 0.67, 0.028, tw / 2 - 0.012), 'rim', matrix=M @ rot)

    f, r = -L / 2, L / 2
    wf = half_w(0.03)
    # Front: lamps, grille, lower intake, plate.
    for sd in (-1, 1):
        p.box((sd * 0.42 * wf if sd > 0 else -0.93 * wf, f + 0.035, c['nose'] - 0.17), (0.93 * wf if sd > 0 else -0.42 * wf, f + 0.19, c['nose'] - 0.06), 'lamp_front', bevel=0.02)
        p.box((sd * 0.80 * wf - 0.08, f + 0.06, c['zb'] + 0.20), (sd * 0.80 * wf + 0.08, f + 0.12, c['zb'] + 0.25), 'lamp_amber' if kind == 'suv' else 'car_trim', bevel=0.01)
    p.box((-0.36 * wf, f + 0.01, c['nose'] - 0.29), (0.36 * wf, f + 0.1, c['nose'] - 0.11), 'car_trim', bevel=0.02)
    p.box((-0.55 * wf, f + 0.03, c['zb'] + 0.17), (0.55 * wf, f + 0.1, c['zb'] + 0.29), 'car_trim', bevel=0.015)
    p.box((-0.26, f - 0.003, c['zb'] + 0.31), (0.26, f + 0.05, c['zb'] + 0.42), 'plate')
    # Rear: lamps (wrapping into the sides), light bar, plate, diffuser.
    wr = half_w(0.97)
    tz = c['tail'] - (0.24 if kind != 'suv' else 0.42)
    for sd in (-1, 1):
        x0, x1 = sorted((sd * 0.55 * wr, sd * 0.97 * wr))
        p.box((x0, r - 0.17, tz), (x1, r - 0.035, tz + (0.13 if kind != 'suv' else 0.3)), 'lamp_rear', bevel=0.015)
    if kind == 'sedan':
        p.box((-0.55 * wr, r - 0.06, tz + 0.06), (0.55 * wr, r - 0.02, tz + 0.1), 'lamp_rear')
    p.box((-0.26, r - 0.05, c['zb'] + 0.33), (0.26, r + 0.003, c['zb'] + 0.44), 'plate')
    p.box((-0.6 * wr, r - 0.12, c['zb'] + 0.13), (0.6 * wr, r - 0.02, c['zb'] + 0.2), 'car_trim')
    # Mirrors, handles, seams, side skirts.
    ym = y_of(c['ws'] + 0.03)
    for sd in (-1, 1):
        x = sd * (half_w(c['ws']) * 0.86)
        p.box((min(x, x + sd * 0.2), ym - 0.03, z_top(c['ws']) + 0.04), (max(x, x + sd * 0.2), ym + 0.07, z_top(c['ws']) + 0.16), paint, bevel=0.025)
        p.box((min(x, x + sd * 0.06), ym, z_top(c['ws']) + 0.0), (max(x, x + sd * 0.06), ym + 0.04, z_top(c['ws']) + 0.06), 'car_trim')
        seams = [c['ws'] + 0.01, b_pillar, (c['rr'] + 0.02) if kind != 'sedan' else c['rr'] + 0.01]
        for s in seams:
            w = half_w(s)
            y = y_of(s)
            zb, zt = z_bot(s), z_top(s)
            p.box((sd * (w + 0.002) - 0.003, y - 0.004, zb + 0.09), (sd * (w + 0.002) + 0.003, y + 0.004, zt - 0.07), 'seam')
        for s in (lerp(c['ws'], b_pillar, 0.72), lerp(b_pillar, seams[2], 0.7)):
            w = half_w(s)
            y = y_of(s)
            zt = z_top(s)
            p.box((sd * (w * 0.985) - 0.012, y - 0.07, zt - 0.14), (sd * (w * 0.985) + 0.012, y + 0.07, zt - 0.115), 'car_trim', bevel=0.006)
        sk = half_w(0.5)
        p.box((sd * sk - 0.03, y_of(c['axles'][0] + 0.09), c['zb'] - 0.01), (sd * sk + 0.012, y_of(c['axles'][1] - 0.09), c['zb'] + 0.07), 'car_trim')
    # Cowl (wiper strip) at the base of the windscreen, hood and boot shut lines: read from above.
    yc = y_of(c['ws'] + 0.004)
    p.box((-half_w(c['ws']) * 0.8, yc - 0.03, z_top(c['ws']) - 0.01), (half_w(c['ws']) * 0.8, yc + 0.03, z_top(c['ws']) + 0.015), 'car_trim')
    for s, k in ((0.07, 0.86), (c['rb'] + 0.01, 0.84)):
        if kind != 'sedan' and s > 0.5:
            continue
        p.box((-half_w(s) * k, y_of(s) - 0.004, z_top(s) + 0.012), (half_w(s) * k, y_of(s) + 0.004, z_top(s) + 0.022), 'seam')
    if kind == 'suv':  # roof rails
        for sd in (-1, 1):
            x = sd * (half_w(0.6) * 0.84 - 0.23 - 0.08)
            p.box((x - 0.025, y_of(c['rf'] + 0.03), c['roof'] + 0.02), (x + 0.025, y_of(c['rr'] - 0.02), c['roof'] + 0.07), 'car_trim', bevel=0.01)
    return p


# Paints from the site palette; types and colours spread so the rows don't look stamped.
PLAN = [('sedan', 'paint_white'), ('suv', 'paint_silver'), ('hatch', 'paint_terracotta'), ('sedan', 'paint_black'),
        ('suv', 'paint_sand'), ('hatch', 'paint_white'), ('sedan', 'paint_silver'), ('suv', 'paint_olive'),
        ('hatch', 'paint_black'), ('sedan', 'paint_sand'), ('suv', 'paint_white')]

spots = []
for o in [o for o in bpy.data.objects if o.name.startswith('parked_car_') and '_wheel' not in o.name]:
    spots.append((int(o.name.split('_')[-1]), o.matrix_world.translation.copy(), o.matrix_world.to_euler().z))
scene = bpy.context.scene
if spots:  # remember the bays on the scene: the placeholders are deleted below
    scene['car_spots'] = [[n, v.x, v.y, z] for n, v, z in spots]
else:
    spots = [(int(n), Vector((x, y, 0)), z) for n, x, y, z in scene['car_spots']]
for o in [o for o in bpy.data.objects if o.name.startswith('parked_car_')]:
    me = o.data
    bpy.data.objects.remove(o)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)

import random
rnd = random.Random(62)
total = 0
for k, (n, loc, rz) in enumerate(sorted(spots)):
    kind, paint = PLAN[k % len(PLAN)]
    car = build(kind, paint)
    # a little jitter in the bay
    jitter = Vector(((rnd.random() - 0.5) * 0.35, (rnd.random() - 0.5) * 0.4, 0))
    o = car.to_object(f'car_{n}', coll, smooth_angle=38, location=loc + jitter, rot_z=rz + (rnd.random() - 0.5) * 0.04)
    total += tris(o)
    print('car', n, kind, paint, tris(o))
print('cars total tris', total)
bpy.ops.wm.save_mainfile()
