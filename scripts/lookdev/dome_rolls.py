# Row 71: winter air domes ("дутики"), rolled up and stored for the summer at the edge of the club.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/dome_rolls.py
# Three rolls of white / light-grey PVC membrane (1.7–2.2 m across, 9–12.5 m long) lying on timber
# skids or pallets, held by ratchet straps; the biggest one is half under a tarp. Next to them: the
# dome's inflation blower in its steel housing with a flexible duct, and a stack of ballast blocks.
# West of padel 1, south of the storage shed, on the lawn (no walkway). All in `mat_props`.
import bpy, math, os, sys, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection

props_material()
coll = collection('gen_domes')
rnd = random.Random(71)


def roll(p, cx, cy, length, dia, base_z, sw_body='pvc_white', straps=4, strap_sw='strap_orange'):
    """Roll lying along x, centred on (cx, cy); its underside rests at base_z."""
    r0 = dia / 2
    zc = base_z + r0 * 0.93
    seg_a, seg_l = 28, 24
    theta0 = rnd.uniform(0.6, 1.4)  # where the outer layer ends (a lap line along the roll)
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]
    folds = [rnd.uniform(0, 6.28) for _ in range(4)]

    def radius(theta, t):
        lap = 0.03 * (((theta - theta0) % (2 * math.pi)) / (2 * math.pi))
        wr = 0.03 * math.sin(theta * 4 + ph[0] + t * 7) + 0.018 * math.sin(theta * 9 + ph[1] - t * 13) + 0.014 * math.sin(t * 29 + ph[2])
        for f in folds:  # creases along the roll
            d = (theta - f + math.pi) % (2 * math.pi) - math.pi
            wr += 0.035 * math.exp(-(d / 0.1) ** 2) * (0.6 + 0.4 * math.sin(t * 11 + f))
        end = 1 - 0.04 * max(0.0, 1 - min(t, 1 - t) / 0.04)  # slightly rounded ends
        return (r0 + lap + wr) * end

    sections = []
    for i in range(seg_l + 1):
        t = i / seg_l
        x = cx - length / 2 + length * t
        ring = []
        for k in range(seg_a):
            th = theta0 + 2 * math.pi * k / seg_a - 1e-4
            r = radius(th, t)
            y, z = r * math.cos(th), r * math.sin(th)
            if z < -r0 * 0.8:  # sags flat under its own weight
                z = -r0 * 0.8 - (z + r0 * 0.8) * 0.25
            ring.append((x, cy + y * 1.03, zc + z))
        sections.append(ring)
    p.loft(sections, lambda i, j: sw_body, close_ends=False, closed=True)
    # Ends: concentric layers (spiral read as rings), a cardboard core.
    for sx in (-1, 1):
        x = cx + sx * length / 2 * 0.96
        rings = 6
        for k in range(rings):
            ra, rb = r0 * 0.96 * (1 - k / rings), r0 * 0.96 * (1 - (k + 1) / rings)
            ra, rb = max(ra, 0.13), max(rb, 0.13)
            depth = 0.01 + 0.012 * k
            M = Matrix.Translation((x - sx * depth, cy, zc)) @ Matrix.Rotation(math.radians(90 * sx), 4, 'Y')
            p.lathe([(ra, 0.0), (rb, 0.0)], 'pvc_white' if k % 2 == 0 else 'pvc_shade', seg=seg_a, matrix=M)
        M = Matrix.Translation((x - sx * 0.09, cy, zc)) @ Matrix.Rotation(math.radians(90 * sx), 4, 'Y')
        p.lathe([(0.13, 0.0), (0.13, -0.3)], 'timber_dark', seg=10, matrix=M)
        p.lathe([(0.13, 0.0), (0.09, 0.0)], 'grille_dark', seg=10, matrix=M)
    # Ratchet straps.
    for k in range(straps):
        t = (k + 0.5) / straps
        x = cx - length / 2 + length * t
        prof = []
        for j in range(seg_a + 1):
            th = 2 * math.pi * j / seg_a
            prof.append(th)
        R = radius(theta0 + 0.3, t) + 0.022
        M = Matrix.Translation((x, cy, zc)) @ Matrix.Rotation(math.radians(90), 4, 'Y')
        p.lathe([(R, -0.035), (R + 0.005, 0.0), (R, 0.035)], strap_sw, seg=seg_a, matrix=M)
        p.box((x - 0.06, cy - 0.04 - R * 0.35, zc + R * 0.92), (x + 0.06, cy + 0.08 - R * 0.35, zc + R * 0.92 + 0.07), 'steel_galv')
    return zc, r0


def skids(p, cx, cy, length, width, n):
    for k in range(n):
        x = cx - length / 2 + 0.6 + (length - 1.2) * k / (n - 1)
        p.box((x - 0.08, cy - width / 2, 0), (x + 0.08, cy + width / 2, 0.15), 'timber', bevel=0.01)
        for sy in (-1, 1):
            p.box((x - 0.09, cy + sy * width * 0.36 - 0.1, 0.15), (x + 0.09, cy + sy * width * 0.36 + 0.1, 0.27), 'timber_dark')


def pallet(p, cx, cy, w=1.2, d=1.0):
    for k in range(3):
        y = cy - d / 2 + 0.05 + (d - 0.1) * k / 2
        p.box((cx - w / 2, y - 0.05, 0), (cx + w / 2, y + 0.05, 0.1), 'timber_dark')
    for k in range(5):
        x = cx - w / 2 + 0.07 + (w - 0.14) * k / 4
        p.box((x - 0.07, cy - d / 2, 0.1), (x + 0.07, cy + d / 2, 0.125), 'timber')


def tarp(p, x0, x1, cy, zc, r):
    """Tarp thrown over a roll: over the top, hanging to the ground both sides, lying a little on the grass."""
    n = 16
    secs = []
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        droop = 0.12 * max(0.0, (t - 0.85) / 0.15)  # the free edge sags
        wob = 0.06 * math.sin(t * 23 + 1.3) + 0.03 * math.sin(t * 57)
        R = r + 0.14 + wob * 0.5
        pts = [(cy - r - 0.5 - wob, 0.02), (cy - R - 0.05, 0.06)]
        for k in range(9):
            ang = math.radians(205 - 115 * k / 8)  # front, low → top
            pts.append((cy + R * math.cos(ang), zc + R * math.sin(ang) - droop))
        prof = pts + [(2 * cy - y, z) for y, z in reversed(pts[:-1])]
        secs.append([(x, y, max(0.02, z)) for y, z in prof])
    p.loft(secs, lambda i, j: 'tarp', close_ends=False, closed=False)


p = Props()
# Roll 1 on skids.
skids(p, -22.0, -61.6, 11.0, 2.5, 4)
roll(p, -22.0, -61.6, 11.0, 2.0, 0.27, straps=5, strap_sw='strap_orange')
# Roll 2, the biggest, half under a tarp.
skids(p, -21.4, -65.1, 12.5, 2.7, 5)
zc, r = roll(p, -21.4, -65.1, 12.5, 2.2, 0.27, sw_body='pvc_grey', straps=5, strap_sw='strap_yellow')
tarp(p, -21.4 - 6.45, -21.4 + 0.4, -65.1, zc, r)
# Roll 3 on two pallets.
pallet(p, -23.2, -68.5); pallet(p, -17.8, -68.5)
roll(p, -20.5, -68.5, 9.0, 1.7, 0.125, straps=4, strap_sw='strap_orange')

# Inflation blower: steel housing, intake grille, side door, flexible duct, on a timber frame.
bx, by = -13.2, -63.4
p.box((bx - 0.85, by - 0.6, 0), (bx + 0.85, by + 0.6, 0.12), 'timber_dark')
p.box((bx - 0.75, by - 0.5, 0.12), (bx + 0.75, by + 0.5, 1.22), 'blower', bevel=0.03)
p.box((bx - 0.76, by - 0.51, 1.18), (bx + 0.76, by + 0.51, 1.26), 'steel_dark')
for k in range(7):
    y = by - 0.4 + 0.8 * k / 6
    p.box((bx - 0.55, y - 0.03, 1.26), (bx + 0.55, y + 0.03, 1.29), 'grille_dark')
p.box((bx - 0.5, by - 0.515, 0.3), (bx + 0.3, by - 0.5, 1.0), 'steel_galv')
p.cyl((bx - 0.75, by + 0.1, 0.7), (bx - 0.77, by + 0.1, 0.7), 0.32, 'grille_dark', seg=16)
pts = [Vector((bx - 0.75, by + 0.1, 0.7)), Vector((bx - 1.6, by + 0.3, 0.45)), Vector((bx - 2.6, by + 0.9, 0.36)), Vector((bx - 3.6, by + 1.6, 0.36))]
for a, b in zip(pts, pts[1:]):
    p.cyl(a, b, 0.3, 'pvc_shade', seg=12)
p.cyl(pts[-1], pts[-1] + Vector((-0.05, 0.03, 0)), 0.32, 'grille_dark', seg=12)
# Ballast blocks (they hold the dome down in winter), stacked.
for k in range(8):
    lay, j = divmod(k, 3)
    x = -13.6 + j * 0.62 + (0.3 if lay % 2 else 0)
    z = lay * 0.4
    p.box((x - 0.29, -67.6, z), (x + 0.29, -67.6 + 0.58, z + 0.39), 'concrete', bevel=0.02)

o = p.to_object('dome_rolls', coll, smooth_angle=50)
bpy.ops.wm.save_mainfile()
print('dome rolls done', sum(len(pp.vertices) - 2 for pp in o.data.polygons), 'tris')
