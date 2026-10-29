# Row 147: the club's rest area east of the clubhouse door, replacing the first scene's placeholder
# pad (light sand, a round table and three grey "people"). Re-runnable.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/rest_zone.py
# A timber deck on the old pad's footprint (`chill_sand` stays underneath: footpaths.py reads its
# bounds), three bistro tables with chairs, two market umbrellas, a cushioned lounge bench along the
# north edge and planters with palms and an agave at the corners. All in `mat_props` (one draw call
# with the other props after the optimizer merges them); sun shadows on the page like every prop.
import bpy, math, os, sys, random
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(__file__))
from lib_build import Props, props_material, collection
from decor import planter

X0, X1, Y0, Y1 = 51.4, 58.6, 44.2, 49.8  # the old pad (Blender x, y; y grows away from the drone)
TOP = 0.12  # deck height


def deck(p):
    """Boards along x (14 cm, 6 mm gaps) in three timber tones, a fascia round the edge, joists under."""
    p.box((X0 + 0.03, Y0 + 0.03, 0.0), (X1 - 0.03, Y1 - 0.03, TOP - 0.03), 'deck_dark')  # substructure / shadow gap
    y, k = Y0, 0
    rnd = random.Random(147)
    while y < Y1 - 0.01:
        y1 = min(Y1, y + 0.14)
        # boards are 2.4 m long: butt joints staggered from row to row
        x, cut = X0, X0 + (0.8 * (k % 3))
        for x1 in sorted({X0, X1, *[cut + 2.4 * i for i in range(4) if X0 < cut + 2.4 * i < X1]})[1:]:
            p.box((x + 0.003, y, TOP - 0.03), (x1 - 0.003, y1, TOP), 'deck_light' if rnd.random() < 0.45 else 'deck')
            x = x1
        y = y1 + 0.006
        k += 1
    for lo, hi in (((X0 - 0.03, Y0 - 0.03, 0.0), (X1 + 0.03, Y0, TOP)), ((X0 - 0.03, Y1, 0.0), (X1 + 0.03, Y1 + 0.03, TOP)),
                   ((X0 - 0.03, Y0, 0.0), (X0, Y1, TOP)), ((X1, Y0, 0.0), (X1 + 0.03, Y1, TOP))):
        p.box(lo, hi, 'deck_dark')


def bistro_table(p, M):
    p.lathe([(0.36, 0.72), (0.36, 0.745)], 'white_paint', seg=20, matrix=M, cap_top=True, cap_bottom=True)  # top
    p.cyl(M @ Vector((0, 0, 0.0)), M @ Vector((0, 0, 0.72)), 0.025, 'steel_dark', seg=8)
    for a in (0, math.pi / 2):
        R = M @ Matrix.Rotation(a, 4, 'Z')
        p.box((-0.26, -0.025, 0.0), (0.26, 0.025, 0.03), 'steel_dark', matrix=R)


def bistro_chair(p, M):
    """Teak slatted seat and back on a black steel frame; faces −y in its own frame."""
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cyl(M @ Vector((sx * 0.19, sy * 0.19, 0)), M @ Vector((sx * 0.18, sy * 0.18, 0.44)), 0.012, 'steel_dark', seg=6)
        p.cyl(M @ Vector((sx * 0.18, 0.19, 0.44)), M @ Vector((sx * 0.19, 0.24, 0.86)), 0.012, 'steel_dark', seg=6)
    for i in range(5):
        y = -0.2 + i * 0.085
        p.box((-0.21, y, 0.44), (0.21, y + 0.07, 0.465), 'timber', matrix=M)
    for z in (0.62, 0.74):
        p.box((-0.2, 0.2, z), (0.2, 0.235, z + 0.08), 'timber', matrix=M @ Matrix.Translation((0, (z - 0.44) * 0.12, 0)))


def umbrella(p, M, sw='canvas'):
    """Market umbrella, 2.7 m across: octagonal canopy with eight ribs, pole and a weighted base."""
    p.lathe([(0.25, 0.0), (0.25, 0.05), (0.08, 0.09)], 'concrete_dark', seg=12, matrix=M, cap_top=True)
    p.cyl(M @ Vector((0, 0, 0.05)), M @ Vector((0, 0, 2.55)), 0.022, 'timber_dark', seg=8)
    n, R, h0, h1 = 8, 1.35, 2.18, 2.5
    ring = [M @ Vector((R * math.cos(2 * math.pi * i / n + math.pi / 8), R * math.sin(2 * math.pi * i / n + math.pi / 8), h0)) for i in range(n)]
    apex = M @ Vector((0, 0, h1))
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        mid = (a + b) / 2 + Vector((0, 0, 0.03))  # the canvas sags a little between ribs
        p.quad([apex, a, mid], sw)
        p.quad([apex, mid, b], sw)
        p.quad([a, apex, mid], sw)  # underside
        p.quad([mid, apex, b], sw)
        p.quad([a, b, b + Vector((0, 0, -0.12)), a + Vector((0, 0, -0.12))], sw)  # valance
        p.cyl(apex + Vector((0, 0, -0.03)), a + Vector((0, 0, -0.02)), 0.008, 'timber_dark', seg=4)
    p.lathe([(0.05, h1), (0.0, h1 + 0.12)], 'timber_dark', seg=8, matrix=M)


def lounge_bench(p, M, length=3.0):
    """Low timber bench with seat and back cushions, its back to +y."""
    L = length / 2
    p.box((-L, -0.35, 0.0), (L, 0.35, 0.36), 'deck_dark', matrix=M, bevel=0.02)
    p.box((-L, 0.25, 0.36), (L, 0.35, 0.78), 'deck_dark', matrix=M, bevel=0.02)
    for k in range(3):
        x = -L + 0.05 + k * (length - 0.1) / 3
        w = (length - 0.1) / 3 - 0.03
        p.box((x, -0.33, 0.36), (x + w, 0.24, 0.5), 'cushion', matrix=M, bevel=0.04, seg=2)
        p.box((x + 0.04, 0.12, 0.48), (x + w - 0.04, 0.24, 0.8), 'cushion', matrix=M @ Matrix.Translation((0, 0, 0)), bevel=0.04, seg=2)
    p.box((-0.3, -0.25, 0.5), (0.0, -0.05, 0.6), 'towel_red', matrix=M @ Matrix.Translation((-L + 0.6, 0, 0)) @ Matrix.Rotation(0.3, 4, 'Z'), bevel=0.03)  # throw pillow


def main():
    props_material()
    coll = collection('gen_rest')
    for name in [o.name for o in bpy.data.objects if o.name.startswith(('chill_person', 'chill_table', 'chill_chair'))]:
        o = bpy.data.objects[name]
        me = o.data
        bpy.data.objects.remove(o)
        if me and me.users == 0:
            bpy.data.meshes.remove(me)
    bpy.data.objects['chill_sand'].hide_render = False  # stays under the deck (its bounds feed footpaths.py)
    p = Props()
    deck(p)
    up = Matrix.Translation((0, 0, TOP))
    tables = [(53.0, 45.7, 0.0), (56.5, 45.7, 0.5), (54.6, 48.0, 0.25)]
    for k, (x, y, a) in enumerate(tables):
        M = up @ Matrix.Translation((x, y, 0)) @ Matrix.Rotation(a, 4, 'Z')
        bistro_table(p, M)
        for s in (-1, 1):
            bistro_chair(p, M @ Matrix.Translation((0, s * 0.62, 0)) @ Matrix.Rotation(math.pi if s < 0 else 0, 4, 'Z') @ Matrix.Rotation(0.12 * s, 4, 'Z'))
    umbrella(p, up @ Matrix.Translation((53.0, 45.7, 0)), 'canvas')
    umbrella(p, up @ Matrix.Translation((56.5, 45.7, 0)), 'towel_red')
    lounge_bench(p, up @ Matrix.Translation((54.4, 49.25, 0)))
    for x, y, plant in ((57.85, 49.05, 'palm'), (57.85, 44.95, 'palm'), (51.95, 44.85, 'agave')):
        planter(p, up @ Matrix.Translation((x, y, 0)), plant, size=0.9)
    o = p.to_object('rest_zone', coll, smooth_angle=40)
    bpy.ops.wm.save_mainfile()
    print('rest zone done', sum(len(pp.vertices) - 2 for pp in o.data.polygons), 'tris')


if __name__ == '__main__':
    main()
