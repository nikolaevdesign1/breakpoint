# Coaches and kids for the booking map (round 8, "lessons"), rendered as flipbook sprites like the
# players (render_players.py) and the groundskeeper (render_keeper.py).
#   Blender -b --factory-startup --python scripts/life/render_lessons.py [-- preview] [coach_m kid_a …] [clip …]
# then: node scripts/life/pack-sprites.mjs lessons
#
# Coaches (MakeHuman through MPFB 2, CC0 assets) wear the club polo in black, no logos, light shorts or
# a skirt, cap or visor. Clips:
#   feed|away    a racket feed: the ball held out in the left hand, dropped, met by a short low-to-high
#                swing (CMU 124_12 underhand toss, the racket in the throwing hand). Rendered facing
#                away from the drone only: on the map the coach stands on the near half, feeding over
#                the net to a student or a line of kids on the far half.
#   stand|away   standing and watching (CMU 77_02 standing), a seamless loop at 12 fps.
#   carry|h0..7  walking with the ball hopper hanging from the right hand (Mixamo walk, slowed), eight
#                headings, 5..7 the mirror images of 3..1 on the page (only their shadows are rendered).
# Kids (MakeHuman age ~10, junior rackets): run|h0..7 (CMU 16_35 jog), ready|toward (Mixamo ready
# stance), forehand|toward (CMU 124_07 swing with the players' forehand layer; the backhand is the
# page's mirror image), shuffle|toward (Mixamo side-steps, for the agility ladder; mirrored for the
# other way). The ball hopper on its stand, the cones and the ladder are geometry on the page.
# Output: blender/characters/frames/lessons/<variant>/<clip>_<facing>/NN.png (+ sNN.png shadows) and
# lessons.json.
import bpy, bmesh, json, math, os, random, shutil, sys
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(__file__))
import player_kit as kit
from player_kit import srgb
from lib_life import (OUT, ROOT, clear_scene, enable_mpfb, setup_world, setup_render, drone_camera, top_camera,
                      shadow_catcher, import_bvh, import_fbx, hips_facing, ground_velocity, retarget, ground_feet, set_frame)
from render_players import best_loop, forehand_layer, aim, ramp, relayer, body_frame, FACINGS, MIXAMO

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS
FPS = 24
PPM = 96  # packed at half size: 48 px/m like the players' shared atlas
SHADOW_PPM = 20
SHADOW_EVERY = 2
HEADINGS = 8
DIR = os.path.join(OUT, 'lessons')

ADULT = dict(x0=-1.1, x1=1.1, y0=-0.45, y1=1.86)
KID = dict(x0=-1.0, x1=1.0, y0=-0.4, y1=1.62)
SHADOW = dict(x0=-3.9, x1=1.3, y0=-1.3, y1=3.4)

BLACK, OFF, NAVY, CLAY, FINCH, WHITE = srgb('#1B1B1A'), srgb('#DAD6CC'), srgb('#1C2433'), srgb('#9C441F'), srgb('#646544'), srgb('#EDEBE6')
POLO = 'namuhekam_male_polo_shirt/namuhekam_male_polo_shirt.mhclo'
SHOES = 'shoes06/shoes06.mhclo'
VARIANTS = {
    'coach_m': dict(kind='coach', gender=1.0, age=0.62, race={'caucasian': 0.8, 'african': 0.05, 'asian': 0.15},
                    skin='middleage_caucasian_male/middleage_caucasian_male.mhmat', hair='short02/short02.mhclo',
                    clothes=[(POLO, BLACK), (SHOES, None)], shorts=OFF, cap=WHITE, socks=0.16,
                    height=0.6, muscle=0.6, weight=0.55),
    'coach_b': dict(kind='coach', gender=1.0, age=0.52, race={'caucasian': 0.1, 'african': 0.9, 'asian': 0.0},
                    skin='young_african_male/young_african_male.mhmat', hair='short04/short04.mhclo',
                    clothes=[(POLO, BLACK), (SHOES, None)], shorts=OFF, socks=0.14,
                    height=0.68, muscle=0.66, weight=0.5),
    'coach_f': dict(kind='coach', gender=0.0, age=0.5, race={'caucasian': 0.7, 'african': 0.1, 'asian': 0.2},
                    skin='young_caucasian_female/young_caucasian_female.mhmat', hair='ponytail01/ponytail01.mhclo',
                    clothes=[(POLO, BLACK), (SHOES, None)], skirt=OFF, visor=WHITE, socks=0.1,
                    height=0.5, muscle=0.55, weight=0.42),
    'kid_a': dict(kind='kid', gender=1.0, age=0.17, race={'caucasian': 1.0, 'african': 0.0, 'asian': 0.0},
                  skin='young_caucasian_male/young_caucasian_male.mhmat', hair='short02/short02.mhclo',
                  clothes=[('elvs_crude_t-shirt_male/elvs_crude_t-shirt_male.mhclo', WHITE), (SHOES, None)],
                  shorts=NAVY, socks=0.1, height=0.5, muscle=0.5, weight=0.45),
    'kid_b': dict(kind='kid', gender=0.0, age=0.18, race={'caucasian': 0.0, 'african': 1.0, 'asian': 0.0},
                  skin='young_african_female/young_african_female.mhmat', hair='braid01/braid01.mhclo',
                  clothes=[('toigo_basic_tucked_t-shirt/toigo_basic_tucked_t-shirt.mhclo', CLAY), (SHOES, None)],
                  skirt=WHITE, socks=0.08, height=0.5, muscle=0.5, weight=0.42),
    'kid_c': dict(kind='kid', gender=1.0, age=0.15, race={'caucasian': 0.0, 'african': 0.0, 'asian': 1.0},
                  skin='young_asian_male/young_asian_male.mhmat', hair='short03/short03.mhclo',
                  clothes=[('elvs_crude_t-shirt_male/elvs_crude_t-shirt_male.mhclo', FINCH), (SHOES, None)],
                  shorts=WHITE, cap=WHITE, socks=0.09, height=0.45, muscle=0.5, weight=0.45),
}

H8 = tuple(f'h{h}' for h in range(HEADINGS))
CLIPS = {
    'coach': {
        'feed': dict(bvh='124_12', f0=67, f1=253, net=(0, -1), inplace='all', facings=('away',), layer='feed', window=ADULT),
        'stand': dict(bvh='77_02', loop=True, net='hips', window_s=(1.6, 2.6), fps=12, facings=('away',), window=ADULT),
        'carry': dict(fbx='walk', loop=True, net='travel', pace=0.82, facings=H8, layer='carry', window=ADULT),
    },
    'kid': {
        'run': dict(bvh='16_35', loop=True, net='travel', window_s=(0.55, 0.85), facings=H8, window=KID),
        'ready': dict(fbx='ready_idle', loop=True, net='hips', window_s=(1.0, 1.5), fps=12, facings=('toward',), window=KID),
        'forehand': dict(bvh='124_07', f0=283, f1=409, net=(0, -1), contact=343, inplace='all', layer='forehand', facings=('toward',), window=KID),
        'shuffle': dict(fbx='sidestep_right', loop=True, net='lateral', soften=0.8, facings=('toward',), window=KID),
        # round 10: a drink at the fountain (life/kids.js): the bottle posed to the mouth, as the players' drink clip
        'drink': dict(bvh='77_02', hold=300, seconds=3.2, fps=15, net='hips', layer='drink', facings=('toward',), window=KID),
    },
}

ONLY = [a for a in ARGS if a in VARIANTS]
ONLY_CLIPS = [a for a in ARGS if any(a in c for c in CLIPS.values())]


def facing_vec(fid):
    if fid in FACINGS:
        return FACINGS[fid]
    a = int(fid[1:]) * 2 * math.pi / HEADINGS
    return Vector((math.sin(a), math.cos(a), 0))  # clockwise from "away from the camera" (Blender +y)


# --- Characters ------------------------------------------------------------------------------------

def make_person(vid, spec):
    from mpfb.services.humanservice import HumanService
    info = HumanService._create_default_human_info_dict()
    info['name'] = vid
    info['phenotype'].update(gender=spec['gender'], age=spec['age'], muscle=spec['muscle'], weight=spec['weight'],
                             height=spec['height'], proportions=0.7)
    info['phenotype']['race'] = dict(spec['race'])
    info['rig'] = 'cmu_mb'
    info['eyes'] = 'high-poly/high-poly.mhclo'
    info['eyebrows'] = 'eyebrow001/eyebrow001.mhclo'
    info['eyelashes'] = 'eyelashes01/eyelashes01.mhclo'
    info['hair'] = spec['hair']
    info['skin_mhmat'] = spec['skin']
    info['skin_material_type'] = 'ENHANCED'
    info['clothes'] = [c for c, _ in spec['clothes']]
    s = HumanService.get_default_deserialization_settings()
    s['subdiv_levels'] = 0
    s['scale'] = 0.1
    before = set(bpy.data.objects)
    body = HumanService.deserialize_from_dict(info, s)
    rig = body.parent
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for path, rgb in spec['clothes']:
        key = os.path.basename(path).split('.')[0].lower()
        for o in parts:
            if key in o.name.lower():
                if key.startswith('shoes'):
                    kit.shoes(o, rig)
                elif rgb is not None:
                    kit.recloth(o, rgb)  # plain cloth: no prints, no logos
    gear = [kit.socks(body, rig, spec['socks'])]
    if spec.get('cap'):
        gear += kit.cap(body, rig, spec['cap'])
    if spec.get('visor'):
        gear += kit.cap(body, rig, spec['visor'], crown=False)
    if spec.get('shorts'):
        gear.append(kit.shorts(body, rig, spec['shorts']))
    if spec.get('skirt'):
        gear.append(kit.skirt(body, rig, spec['skirt']))
    return rig, parts + gear


def junior_racket(rig, scale, tilt=0.0):
    """
    kit.racket, scaled (juniors), and for coaches tilted `tilt` rad from the thumb towards the
    fingers: with the arm hanging the head points forward and down instead of straight up, as a
    coach holds it between feeds, and the feed swing leads with the head low.
    """
    rk = kit.racket(rig, accent=CLAY)
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    if tilt:
        hand = rig.data.bones['RightHand']
        mw = rig.matrix_world
        h0 = mw @ hand.head_local
        along = (mw.to_3x3() @ (hand.tail_local - hand.head_local)).normalized()
        thumb = rig.data.bones.get('RThumb') or rig.data.bones.get('RightHandThumb1')
        tdir = ((mw @ thumb.head_local) - h0) if thumb else Vector((0, 0, 1))
        shaft0 = (tdir - along * tdir.dot(along)).normalized()
        face = along.cross(shaft0).normalized()
        shaft = (shaft0 * math.cos(tilt) + along * math.sin(tilt)).normalized()
        side = shaft.cross(face).normalized()
        grip = h0 + along * 0.075 - shaft * 0.075
        rk.matrix_world = Matrix.Translation(grip) @ Matrix((side, shaft, face)).transposed().to_4x4()
    if scale != 1:
        rk.matrix_world = rk.matrix_world @ Matrix.Scale(scale, 4)
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return rk


def material(name, rgb, rough, metal=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
    return m


BALL_RGB = srgb('#C9D93A')


def hopper():
    """
    A ball hopper as carried: a wire basket (32 cm square, 34 cm deep) three quarters full of balls, the
    two handles folded up over it into a grip. Origin at the middle of the grip; the handles run
    along local x (the way he walks).
    """
    W, D, GRIP = 0.32, 0.34, 0.6  # basket width, depth; grip height above the basket's floor
    objs = []
    me = bpy.data.meshes.new('hopper_wire')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.5], context='FACES')  # open top
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=5, use_grid_fill=True)
    bmesh.ops.scale(bm, vec=(W, W, D), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, D / 2 - GRIP), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    wire = bpy.data.objects.new('hopper_wire', me)
    bpy.context.scene.collection.objects.link(wire)
    wf = wire.modifiers.new('wire', 'WIREFRAME')
    wf.thickness = 0.004
    me.materials.append(material('hopper_metal', srgb('#2A2B2C'), 0.45, metal=0.7))
    objs.append(wire)
    # handles: two bent rods, side by side, up from the basket's rim to the grip
    cu = bpy.data.curves.new('hopper_handles', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0055
    cu.bevel_resolution = 2
    for y in (-0.018, 0.018):
        sp = cu.splines.new('POLY')
        pts = [(-W / 2, y, D - GRIP - 0.02), (-W / 2, y, -0.17), (-0.07, y, -0.01), (0.07, y, -0.01), (W / 2, y, -0.17), (W / 2, y, D - GRIP - 0.02)]
        sp.points.add(len(pts) - 1)
        for p, c in zip(sp.points, pts):
            p.co = (*c, 1)
    handles = bpy.data.objects.new('hopper_handles', cu)
    bpy.context.scene.collection.objects.link(handles)
    cu.materials.append(material('hopper_grip', srgb('#1E1F20'), 0.5, metal=0.5))
    objs.append(handles)
    # balls
    bm = bmesh.new()
    rnd = random.Random(7)
    r = 0.033
    n = 0
    for layer in range(4):
        for i in range(4):
            for j in range(4):
                if layer == 3 and rnd.random() < 0.45:
                    continue
                x = -W / 2 + r + 0.006 + i * (W - 2 * r - 0.012) / 3 + rnd.uniform(-0.008, 0.008)
                y = -W / 2 + r + 0.006 + j * (W - 2 * r - 0.012) / 3 + rnd.uniform(-0.008, 0.008)
                z = r + 0.004 + layer * r * 1.75 + rnd.uniform(-0.006, 0.006) - GRIP
                bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r, matrix=Matrix.Translation((x, y, z)))
                n += 1
    me = bpy.data.meshes.new('hopper_balls')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    balls = bpy.data.objects.new('hopper_balls', me)
    bpy.context.scene.collection.objects.link(balls)
    me.materials.append(material('ball', BALL_RGB, 0.9, sheen=0.9))
    objs.append(balls)
    root = bpy.data.objects.new('hopper', None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        o.parent = root
    return root, objs


def hand_ball(rig):
    """The ball the coach holds out before a feed: on the left palm."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.034)
    ball = bpy.context.object
    ball.name = 'hand_ball'
    for p in ball.data.polygons:
        p.use_smooth = True
    ball.data.materials.append(material('ball_hand', BALL_RGB, 0.9, sheen=0.9))
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    b = rig.data.bones['LeftHand']
    mw = rig.matrix_world
    h0 = mw @ b.head_local
    along = (mw.to_3x3() @ (b.tail_local - b.head_local)).normalized()
    ball.parent = rig
    ball.parent_type = 'BONE'
    ball.parent_bone = 'LeftHand'
    ball.matrix_world = Matrix.Translation(h0 + along * 0.07 + Vector((0, -0.03, -0.02)))
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return ball


# --- Motion layers ---------------------------------------------------------------------------------

FEED_CONTACT = 0.5  # of the feed clip: the racket meets the ball
FEED_DROP = 0.32  # the left hand lets the ball go


def swing_dir(fwd, right, theta, out=0.14):
    """Arm direction in the body's sagittal plane: theta 0 = hanging, > 0 forward (rad)."""
    down = Vector((0, 0, -1))
    return (down * math.cos(theta) + fwd * math.sin(theta) + right * out).normalized()


def feed_layer(rig, keyed, to):
    """
    The source arms sit too high on this body (as in render_keeper.py), so the feed is posed here
    over the mocap body: the right arm (the racket along the fingers) hangs, takes the racket back,
    swings it low to high through the contact and settles; the left hand holds the ball out in front
    until it drops it.
    """
    net = Vector((to.x, to.y, 0)).normalized()
    keys = [(0.0, -0.1), (0.14, -0.15), (0.38, -0.75), (FEED_CONTACT, 0.15), (0.6, 0.85), (0.72, 0.9), (1.0, -0.1)]

    def theta(u):
        for (u0, a0), (u1, a1) in zip(keys, keys[1:]):
            if u <= u1:
                t = ramp(u, u0, u1)
                return a0 + (a1 - a0) * t
        return keys[-1][1]

    def fn(u):
        fwd, right, up, _ = body_frame(rig, net)
        th = theta(u)
        aim(rig, 'RightArm', swing_dir(net, right, th, 0.16), 1.0)
        aim(rig, 'RightForeArm', swing_dir(net, right, th + 0.3, 0.12), 1.0)
        held = 1 - ramp(u, FEED_DROP, FEED_DROP + 0.14)
        rest_u = swing_dir(net, -right, 0.08, 0.12)
        rest_f = swing_dir(net, -right, 0.35, 0.05)
        hold_u = (net * 0.62 + Vector((0, 0, -0.72)) + right * 0.3).normalized()
        hold_f = (net * 0.9 + right * 0.38 + Vector((0, 0, -0.1))).normalized()
        aim(rig, 'LeftArm', (rest_u * (1 - held) + hold_u * held).normalized(), 1.0)
        aim(rig, 'LeftForeArm', (rest_f * (1 - held) + hold_f * held).normalized(), 1.0)
    relayer(rig, keyed, fn, ('RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'))


def stand_layer(rig, keyed, to):
    """Arms down, the racket hand a little forward (its head points down to the court)."""
    net = Vector((to.x, to.y, 0)).normalized()

    def fn(u):
        fwd, right, up, _ = body_frame(rig, net)
        aim(rig, 'RightArm', swing_dir(net, right, 0.1, 0.14), 1.0)
        aim(rig, 'RightForeArm', swing_dir(net, right, 0.75, 0.1), 1.0)
        aim(rig, 'LeftArm', swing_dir(net, -right, 0.06, 0.12), 1.0)
        aim(rig, 'LeftForeArm', swing_dir(net, -right, 0.3, 0.05), 1.0)
    relayer(rig, keyed, fn, ('RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'))


def stride(rig, fwd):
    mw = rig.matrix_world
    pb = rig.pose.bones
    d = (mw @ pb['RightFoot'].head) - (mw @ pb['LeftFoot'].head)
    return max(-1.0, min(1.0, d.dot(fwd) / 0.55))


def carry_layer(rig, keyed, to):
    """Right arm hanging a little out from the side (the hopper's weight), left arm swinging low."""
    fwd = Vector((to.x, to.y, 0)).normalized()
    right = Vector((fwd.y, -fwd.x, 0))
    down = Vector((0, 0, -1))
    for f in keyed:
        bpy.context.scene.frame_set(f)
        s = stride(rig, fwd)
        aim(rig, 'RightArm', (down * 0.92 + right * 0.36 + fwd * 0.03 * s).normalized(), 1.0)
        aim(rig, 'RightForeArm', (down * 0.97 + right * 0.2).normalized(), 1.0)
        aim(rig, 'LeftArm', (down + fwd * 0.28 * s - right * 0.12).normalized(), 0.85)
        aim(rig, 'LeftForeArm', (down * 0.85 + fwd * 0.28 * s + fwd * 0.3).normalized(), 0.85)
        for b in ('RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'):
            rig.pose.bones[b].keyframe_insert('rotation_quaternion', frame=f)


def hang_hopper(rig, hop, keyed, to):
    """Keys the hopper under the right hand, the grip along the walk."""
    yaw = math.atan2(to.y, to.x)
    hop.animation_data_clear()
    for f in keyed:
        bpy.context.scene.frame_set(f)
        pb = rig.pose.bones['RightHand']
        h = rig.matrix_world @ pb.head
        hop.location = h + Vector((0, 0, -0.065))
        hop.rotation_euler = (0, 0, yaw)
        hop.keyframe_insert('location', frame=f)
        hop.keyframe_insert('rotation_euler', frame=f)


# --- Clips -----------------------------------------------------------------------------------------

def load(c):
    """Source armature, bone map, sample frames (source frame numbers), seconds per sample, standing hips height."""
    fps = c.get('fps', FPS)
    pace = c.get('pace', 1.0)
    if c.get('hold'):
        src = import_bvh(c['bvh'])
        return src, {b.name: b.name for b in src.pose.bones}, [c['hold']] * max(2, round(c['seconds'] * fps)), 1 / fps, None
    if 'bvh' in c:
        src = import_bvh(c['bvh'])
        names = {b.name: b.name for b in src.pose.bones}
        sfps = 120
        stand = None
        f0, f1 = (c['f0'], c['f1']) if 'f0' in c else src.animation_data.action.frame_range
    else:
        src, names = import_fbx(os.path.join(MIXAMO, c['fbx'] + '.fbx'))
        sfps = 30
        stand = (src.matrix_world @ src.data.bones[names['Hips']].head_local).z
        f0, f1 = src.animation_data.action.frame_range
    if c.get('window_s'):
        f0, f1 = best_loop(src, names, f0, f1, *c['window_s'], sfps)
    span = f1 - f0
    if c.get('loop'):
        n = max(2, round(span / (sfps / fps) / pace))
        frames = [f0 + i * span / n for i in range(n)]
    else:
        step = sfps / fps
        n = max(2, int(round(span / step)) + 1)
        frames = [f0 + i * step for i in range(n)]
    sps = (frames[1] - frames[0]) / sfps / pace
    return src, names, frames, sps, stand


def clip_net(c, src, names, frames, sps):
    if c['net'] == 'hips':
        return hips_facing(src, frames[len(frames) // 2], names)
    if c['net'] in ('lateral', 'travel'):
        v = ground_velocity(src, names, frames, sps).normalized()
        if c['net'] == 'travel':
            return v
        chest = hips_facing(src, frames[len(frames) // 2], names)
        net = Vector((-v.y, v.x, 0))
        return net if net.dot(chest) > 0 else -net
    return Vector((*c['net'], 0))


def racket_head(rk):
    return rk.matrix_world @ Vector((0, 0.505, 0))


def to_three(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]  # Blender (x, y, z) → three (x, y up, z)


def main():
    enable_mpfb()
    scene = bpy.context.scene
    os.makedirs(DIR, exist_ok=True)
    meta_path = os.path.join(DIR, 'lessons.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) and not PREVIEW else {}
    meta.update({'fps': FPS, 'ppm': PPM, 'body': ADULT, 'shadow': SHADOW, 'shadowPpm': SHADOW_PPM,
                 'shadowEvery': SHADOW_EVERY, 'headings': HEADINGS})
    meta.setdefault('variants', {})
    meta.setdefault('clips', {})
    for vid, spec in VARIANTS.items():
        if ONLY and vid not in ONLY:
            continue
        clear_scene()
        setup_render(scene, samples=20 if PREVIEW else 32)
        scene.cycles.filter_width = 1.1
        scene.render.use_motion_blur = True
        scene.render.motion_blur_shutter = 0.35
        scene.render.fps = FPS
        setup_world(scene)
        rig, parts = make_person(vid, spec)
        kid = spec['kind'] == 'kid'
        rk = junior_racket(rig, 0.82 if kid else 1.0, 0.0 if kid else 1.65)
        hop, hop_parts = (None, []) if kid else hopper()
        ball = None if kid else hand_ball(rig)
        bt = None
        if kid and (not ONLY_CLIPS or 'drink' in ONLY_CLIPS):
            import render_player_moves as rpm  # the players' drink pose and bottle
            bt = rpm.bottle(rig)
            bt.scale = (0.85, 0.85, 0.85)
        catcher = shadow_catcher(scene)
        cams = {}

        def body_cam(win):
            key = tuple(sorted(win.items()))
            if key not in cams:
                cams[key] = drone_camera(scene, f'cam_body{len(cams)}', win['x1'] - win['x0'], win['y1'] - win['y0'], PPM,
                                         ((win['x0'] + win['x1']) / 2, (win['y0'] + win['y1']) / 2))
            return cams[key]
        cam_shadow, res_shadow = top_camera(scene, 'cam_shadow', SHADOW['x0'], SHADOW['x1'], SHADOW['y0'], SHADOW['y1'], SHADOW_PPM)
        # Standing hips height of this body: kids' strides are shorter, so is their ground speed.
        scale = rig.data.bones['Hips'].head_local.z / 0.95
        vmeta = meta['variants'].setdefault(vid, {})
        vmeta.update(kind=spec['kind'], gender='f' if spec['gender'] < 0.5 else 'm', contact={})
        frame_no = 1
        for cid, c in CLIPS[spec['kind']].items():
            if ONLY_CLIPS and cid not in ONLY_CLIPS:
                continue
            for o in parts:
                o.hide_viewport = True  # finding loops and posing step through frames: no skinned meshes meanwhile
            src, names, frames, sps, stand = load(c)
            net = clip_net(c, src, names, frames, sps)
            carry = c.get('layer') == 'carry'
            drinking = cid == 'drink'
            visible = parts + ([] if carry or drinking else [rk]) + (hop_parts if carry else []) + ([ball] if cid == 'feed' else []) + ([bt] if drinking else [])
            hidden = [o for o in [rk, ball, bt, *hop_parts] if o and o not in visible]
            for o in hidden:
                o.hide_render = True
            for o in visible:
                o.hide_render = False
            facings = c['facings']
            for fid in facings:
                to = facing_vec(fid)
                h = int(fid[1:]) if fid.startswith('h') else None
                out_dir = os.path.join(DIR, vid, f'{cid}_{fid}')
                twin = os.path.join(DIR, vid, f'{cid}_h{HEADINGS - h}') if h is not None and h > HEADINGS // 2 else None
                if PREVIEW and h not in (None, 0, 3):
                    continue
                rig.animation_data_clear()
                for o in parts:
                    o.hide_viewport = True  # posing re-evaluates the scene per bone: no skinned meshes while it does
                start = frame_no
                res = retarget(src, rig, frames, out_start=start, face_from=net, face_to=to,
                               inplace=c.get('inplace', 'linear' if c.get('loop') else 'none'), soften_legs=c.get('soften', 1.0),
                               names=None if 'bvh' in c else names, stand=stand, seconds_per_sample=sps)
                keyed = list(range(start, start + len(frames)))
                n = len(keyed)
                contact_i = None
                if cid == 'feed':
                    feed_layer(rig, keyed, to)
                    contact_i = round(FEED_CONTACT * (n - 1))
                    drop_i = round(FEED_DROP * (n - 1))
                elif cid == 'stand':
                    stand_layer(rig, keyed, to)
                elif c.get('layer') == 'forehand':
                    forehand_layer(rig, keyed, to, dict(c, contact=c['contact']))
                    contact_i = round((c['contact'] - c['f0']) / (120 / FPS))
                elif carry:
                    carry_layer(rig, keyed, to)
                if drinking:
                    ground_feet(rig, parts, keyed[:1])
                    rpm.drink_layer(rig, keyed, to)
                else:
                    ground_feet(rig, parts, keyed)
                if carry:
                    hang_hopper(rig, hop, keyed, to)
                if contact_i is not None and fid in ('away', 'toward'):
                    scene.frame_set(keyed[contact_i])
                    vmeta['contact'][cid] = dict(frame=contact_i, at=to_three(racket_head(rk)))
                if carry and fid == 'h0':
                    # Where the hopper hangs, in his own frame: [to his right, forward] (m).
                    acc = Vector((0, 0, 0))
                    for f in keyed:
                        scene.frame_set(f)
                        acc += hop.matrix_world.translation
                    acc /= n
                    vmeta['hopper'] = [round(acc.x, 3), round(acc.y, 3)]
                frame_no += n
                for o in parts:
                    o.hide_viewport = False
                os.makedirs(out_dir, exist_ok=True)
                for old in os.listdir(out_dir):
                    os.remove(os.path.join(out_dir, old))
                for i, f in enumerate(keyed):
                    if PREVIEW and i % 5:
                        continue
                    scene.frame_set(f)
                    if ball:
                        ball.hide_render = not (cid == 'feed' and i < drop_i)
                    body_file = os.path.join(out_dir, f'{i:02d}.png')
                    if twin:
                        shutil.copy(os.path.join(twin, f'{i:02d}.png'), body_file)
                    else:
                        catcher.hide_render = True
                        for o in visible:
                            o.visible_camera = True
                        scene.camera, (scene.render.resolution_x, scene.render.resolution_y) = body_cam(c['window'])
                        scene.render.filepath = body_file
                        bpy.ops.render.render(write_still=True)
                    if PREVIEW or i % SHADOW_EVERY:
                        continue
                    catcher.hide_render = False
                    for o in visible:
                        o.visible_camera = False
                    scene.camera = cam_shadow
                    scene.render.resolution_x, scene.render.resolution_y = res_shadow
                    scene.render.filepath = os.path.join(out_dir, f's{i:02d}.png')
                    bpy.ops.render.render(write_still=True)
                    for o in visible:
                        o.visible_camera = True
                v = res['velocity'] * (scale if kid else 1.0)
                right = Vector((to.y, -to.x, 0))
                meta['clips'][cid] = dict(frames=n, fps=c.get('fps', FPS), loop=bool(c.get('loop')), facings=list(facings),
                                          body=c['window'], pace=round(v.dot(right), 3), speed=round(v.dot(to), 3))
                print('clip', vid, cid, fid, n, 'v', v, flush=True)
            bpy.data.objects.remove(src, do_unlink=True)
        if PREVIEW:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DIR, f'{vid}_preview.blend'))
        else:
            # Several renders may run side by side (one per variant): merge into the latest file.
            disk = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
            disk.update({k: v for k, v in meta.items() if k not in ('variants', 'clips')})
            disk.setdefault('variants', {})[vid] = meta['variants'][vid]
            disk.setdefault('clips', {}).update({k: v for k, v in meta['clips'].items() if k in CLIPS[spec['kind']]})
            with open(meta_path, 'w') as f:
                json.dump(disk, f, indent=1)
    print('done', flush=True)


if __name__ == '__main__':
    main()
