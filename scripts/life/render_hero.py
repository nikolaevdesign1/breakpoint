# Hi-res cut-out portraits of the life characters (docs/characters/*.png), 3/4 from the front, neutral pose,
# transparent background, ~2000 px tall. Reuses the builders of the sprite scripts.
#   Blender -b --factory-startup --python scripts/life/render_hero.py -- <kind> <id> [samples]
# kind/id: player a|b|c, lesson coach_b|coach_f|coach_m|kid_a|kid_b|kid_c, keeper, death, ghost knight|lady|monk|ruff|wizard
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import player_kit as kit
from player_kit import srgb
from lib_life import (ROOT, clear_scene, enable_mpfb, setup_world, setup_render, import_fbx, hips_facing, retarget, ground_feet, set_frame)

ARGS = sys.argv[sys.argv.index('--') + 1:]
KIND, ID = ARGS[0], (ARGS[1] if len(ARGS) > 1 else '')
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 160
OUTDIR = os.environ.get('HERO_OUT', os.path.join(ROOT, 'docs', 'characters'))
MIXAMO = os.path.join(ROOT, 'blender', 'assets', '_downloads', 'mixamo')
YAW = math.radians(35)  # turn away from the camera, towards camera-right
TO = Vector((math.sin(YAW), -math.cos(YAW), 0))  # facing the camera (−y) turned 35°


def load_src(name):
    """A sprite script's definitions (everything above its main) without running it."""
    src = open(os.path.join(HERE, name + '.py')).read()
    cut = src.index('\ndef main(')
    ns = {'__name__': name, '__file__': os.path.join(HERE, name + '.py')}
    exec(compile(src[:cut], name, 'exec'), ns)
    return ns


def aim(rig, name, direction, w=1.0):
    from mathutils import Quaternion
    pb = rig.pose.bones[name]
    mw = rig.matrix_world
    cur = ((mw @ pb.tail) - (mw @ pb.head)).normalized()
    q = Quaternion().slerp(cur.rotation_difference(direction.normalized()), w)
    A = mw.to_3x3().normalized()
    R = A.inverted() @ q.to_matrix() @ A
    m = pb.matrix.copy()
    pb.matrix = Matrix.Translation(m.to_translation()) @ (R @ m.to_3x3()).to_4x4()
    bpy.context.view_layer.update()


def ready_pose(rig, parts):
    """Neutral: rest-pose legs, arms hanging relaxed at the sides, body turned 35 deg from the camera."""
    rig.rotation_euler = (0, 0, YAW)
    bpy.context.view_layer.update()
    right = Vector((math.cos(YAW), math.sin(YAW), 0))
    fwd = TO
    for side, sgn in (('Left', 1), ('Right', -1)):
        aim(rig, side + 'Arm', Vector((0, 0, -1)) + right * sgn * 0.2 + fwd * 0.03)
        aim(rig, side + 'ForeArm', Vector((0, 0, -1)) + right * sgn * 0.1 + fwd * 0.12)
    bpy.context.scene.frame_set(1)


def bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        ev = o.evaluated_get(dg)
        for c in ev.bound_box:
            w = ev.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def shoot(objs, name, lens=95, fill=0.86, size=2400):
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    lo, hi = bounds(objs)
    lo.z = max(lo.z, -0.02)
    H = hi.z - lo.z
    cd = bpy.data.cameras.new('hero')
    cd.lens = lens
    cd.sensor_width = cd.sensor_height = 36
    cd.clip_end = 100
    cam = bpy.data.objects.new('hero', cd)
    scene.collection.objects.link(cam)
    D = (H / fill) * lens / 36
    cam.location = ((lo.x + hi.x) / 2, -D, lo.z + H / 2 + 0.02)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.filepath = os.path.join(OUTDIR, name + '.png')
    os.makedirs(OUTDIR, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print('wrote', scene.render.filepath, 'height m', round(H, 2), flush=True)


def stage(samples=SAMPLES, sun=7.6):
    scene = bpy.context.scene
    clear_scene()
    setup_render(scene, samples=samples)
    scene.cycles.filter_width = 1.5
    scene.render.use_persistent_data = False
    setup_world(scene, sun_strength=sun)
    return scene


def human_hero():
    enable_mpfb()
    scene = stage()
    if KIND == 'player':
        rp = load_src('render_players')
        rig, parts = rp['make_player'](rp['VARIANTS'][ID])
        name = 'player-' + ID
    elif KIND == 'lesson':
        rl = load_src('render_lessons')
        spec = rl['VARIANTS'][ID]
        rig, parts = rl['make_person'](ID, spec)
        name = ID.replace('_', '-')
    elif KIND == 'keeper':
        rk = load_src('render_keeper')
        kit.cap = lambda *a, **k: []  # no cap: the keeper wears a sombrero here
        rig, parts = rk['make_keeper']()
        parts += sombrero(rig)
        name = 'keeper-sombrero'
    ready_pose(rig, parts)
    if KIND == 'keeper':
        rk['arm_layer'](rig, [1], TO, False)
    shoot(parts, name)


def sombrero(rig):
    """A wide straw hat sitting on the head (parented to the Head bone)."""
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig and 'body' in o.name.lower()) \
        if any('body' in o.name.lower() for o in bpy.data.objects if o.type == 'MESH') else None
    body = body or max((o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig), key=lambda o: len(o.data.vertices))
    H, top, front, cy = kit._head_frame(body, rig)
    z0 = top - 0.09
    prof = [(0.0, 0.2), (0.07, 0.195), (0.1, 0.17), (0.108, 0.06), (0.15, 0.0), (0.26, -0.02), (0.34, 0.0), (0.38, 0.045), (0.365, 0.047)]
    bm = bmesh.new()
    rings = []
    n = 48
    for r, z in prof:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n), z0 + z)) for k in range(n)])
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    me = bpy.data.meshes.new('sombrero')
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('sombrero', me)
    bpy.context.scene.collection.objects.link(ob)
    sol = ob.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.008
    m = bpy.data.materials.new('straw'); m.use_nodes = True
    bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*srgb('#C9AE74'), 1)
    bs.inputs['Roughness'].default_value = 0.85
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    # hat band
    bm = bmesh.new()
    ring = [[bm.verts.new(((0.106 + dz * 0.2) * math.cos(2 * math.pi * k / n), cy + (0.106 + dz * 0.2) * math.sin(2 * math.pi * k / n), z0 + z)) for k in range(n)] for z, dz in ((0.012, 0.0), (0.05, 0.0))]
    for k in range(n):
        bm.faces.new((ring[0][k], ring[0][(k + 1) % n], ring[1][(k + 1) % n], ring[1][k]))
    me2 = bpy.data.meshes.new('band'); bm.to_mesh(me2); bm.free()
    band = bpy.data.objects.new('band', me2)
    bpy.context.scene.collection.objects.link(band)
    band.modifiers.new('thick', 'SOLIDIFY').thickness = 0.01
    m2 = bpy.data.materials.new('bandm'); m2.use_nodes = True
    m2.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*srgb('#7A2E1A'), 1)
    me2.materials.append(m2)
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    for o in (ob, band):
        mw = o.matrix_world.copy()
        o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = 'Head'
        o.matrix_world = mw
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return [ob, band]


def death_hero():
    enable_mpfb()
    scene = stage()
    rd = load_src('render_death')
    rig, body, parts = rd['make_body']()
    cloth_black = kit.cloth('death_cloth', srgb('#030304'), rough=0.95, sheen=0.1, bump=0.35)
    rb = rd['robe'](rig, cloth_black)
    rd['skin_to'](rig, rb)
    parts += rb + rd['head_kit'](rig, cloth_black)
    sc = rd['scythe']()
    parts.append(sc)
    ready_pose(rig, parts)
    rd['arm_pose'](rig, [1], TO)
    scene.frame_set(1)
    rd['place_scythe'](sc, rig, TO)
    shoot(parts, 'death')


def ghost_hero():
    enable_mpfb()
    scene = stage(sun=4.0)
    scene.cycles.transparent_max_bounces = 28
    scene.cycles.max_bounces = 8
    rg = load_src('render_ghosts')
    rig, parts, wave = rg['build'](ID, rg['KINDS'][ID])
    a = math.radians(180 - 35)  # heading clockwise from "away": 180 is straight at the camera
    to = Vector((math.sin(a), math.cos(a), 0))
    rig.rotation_euler = (0, 0, math.pi - a)
    rg['pose'](rig, wave, 0.3, to)
    shoot(parts, 'ghost-' + ID)


def cat_hero():
    scene = stage(sun=7.6)
    scene.render.hair_type = 'STRIP'
    rc = load_src('render_cat')
    arm, body, parts = rc['build_cat']()
    root = bpy.data.objects.new('turn', None)
    scene.collection.objects.link(root)
    for o in (arm, body):
        o.parent = root
    root.rotation_euler = (0, 0, math.radians(180 - 30))
    rc['reset'](arm)
    rc['CLIPS']['sit'][3](arm, 0.0)
    rc['key'](arm, 1)
    scene.frame_set(1)
    shoot(parts, 'cat', lens=100)


{'cat': cat_hero, 'player': human_hero, 'lesson': human_hero, 'keeper': human_hero, 'death': death_hero, 'ghost': ghost_hero}[KIND]()
