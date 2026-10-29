# Round 9 (rows 1, 25, 29, 31, 38): the players' footwork and between-point moves, and the padel set.
#   Blender -b --factory-startup --python scripts/life/render_player_moves.py -- [players|padel] [preview] [a b c] [clip …]
# then: node scripts/life/pack-sprites.mjs players padel
#
# Same people, kit and light as render_players.py (which keeps the strokes: forehand, backhand, serve,
# bounce at 40 fps). Everything here is 30 fps:
#   players (tennis, frames/players/<v>/):
#     ready, split              Mixamo ready stance (a seamless loop, breathing), split step from it
#     shuffle_l / shuffle_r     CMU 78_26 defensive slide (low, quick, feet never cross), a loop; _l is its mirror
#     run|h0..h7                CMU 16_35 jog/run, eight headings (no mirrors: the racket stays in the right hand)
#     walk|h0..h7, walk_back    Mixamo walk, eight headings; walking backwards facing the net
#     pickup                    bends down and takes a ball off the court with the left hand (posed over CMU 77_02)
#     feed                      drops the ball and sends it over with a soft low-to-high swing (CMU 124_12)
#     bench|h6                  sits down on the bench (it stands on the +x side of every court), towels the face
#                               and the neck, gets up (posed over CMU 77_02)
#   padel (frames/padel/<v>/): ready, split, shuffle_l/r, walk, walk_back, forehand, backhand, serve
#     (the smash), feed (the underhand serve), side-on: 'right' rendered, 'left' its mirror on the page
#     (only the shadows are rendered for it). The racket is a padel bat: solid, perforated, no strings.
import bpy, bmesh, json, math, os, shutil, sys
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(__file__))
import player_kit as kit
from lib_life import (OUT, clear_scene, enable_mpfb, setup_world, setup_render, drone_camera, top_camera,
                      shadow_catcher, retarget, ground_feet, set_frame)
import render_players as rp
from render_players import VARIANTS, BODY, SHADOW, SHADOW_PPM, PPM, make_player, kit_gear, aim, ramp, relayer, body_frame, forehand_layer, serve_layer, FACINGS
from render_lessons import load, clip_net, feed_layer, FEED_CONTACT, FEED_DROP

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS
SET = 'padel' if 'padel' in ARGS else 'players'
FPS = 30
SHADOW_EVERY = 2
HEADINGS = 8
H8 = tuple(f'h{h}' for h in range(HEADINGS))
SIDE = ('right', 'left')
DOWN = Vector((0, 0, -1))
UP = Vector((0, 0, 1))

TENNIS = {
    'ready': dict(fbx='ready_idle', loop=True, net='hips', window_s=(1.0, 1.5)),
    'split': dict(fbx='ready_idle', net='hips', take=0.4, hop=0.07),
    'shuffle_r': dict(bvh='78_26', f0=90, f1=200, loop=True, net='hips', window_s=(0.42, 0.62), soften=0.75),
    'shuffle_l': dict(bvh='78_26', f0=90, f1=200, loop=True, net='hips', window_s=(0.42, 0.62), soften=0.75, mirror=True),
    'run': dict(bvh='16_35', loop=True, net='travel', window_s=(0.55, 0.85), facings=H8),
    'walk': dict(fbx='walk', loop=True, net='travel', facings=H8),
    'walk_back': dict(fbx='walk_back', loop=True, net='reverse'),
    'pickup': dict(bvh='77_02', hold=300, seconds=1.5, net='hips', layer='pickup', hand=True),
    'feed': dict(bvh='124_12', f0=67, f1=253, net=(0, -1), inplace='all', layer='feed', hand=True),
    'bench': dict(bvh='77_02', hold=300, seconds=4.4, net='hips', layer='bench', facings=('h6',), towel=True, body=dict(BODY, y1=1.6)),
    # round 10 (row 1): a relaxed stance for talking and waiting (CMU 141_20, a seamless loop at 12 fps),
    # and a drink from a bottle, side-on, by the bench (posed over CMU 77_02, 15 fps)
    'idle': dict(bvh='141_20', loop=True, net='hips', window_s=(2.4, 3.6), fps=12),
    'stretch': dict(bvh='77_02', hold=300, seconds=3.6, fps=10, net='hips', layer='stretch', bare=True),
    'drink': dict(bvh='77_02', hold=300, seconds=3.2, fps=15, net='hips', layer='drink', facings=('h6',), bottle=True),
}
PADEL = {
    'ready': TENNIS['ready'], 'split': TENNIS['split'], 'shuffle_r': TENNIS['shuffle_r'], 'shuffle_l': TENNIS['shuffle_l'],
    'walk': dict(TENNIS['walk'], facings=SIDE), 'walk_back': TENNIS['walk_back'],
    'forehand': dict(bvh='124_07', f0=283, f1=409, net=(0, -1), contact=343, layer='forehand', fps=40),
    'backhand': dict(bvh='124_07', f0=283, f1=409, net=(0, -1), contact=343, mirror=True, fps=40),
    'serve': dict(bvh='124_01', f0=384, f1=500, net=(0, -1), contact=445, soften=0.5, travel=0.45, layer='serve', fps=40, body=dict(BODY, y1=2.12)),
    'feed': TENNIS['feed'],
}
CLIPS = PADEL if SET == 'padel' else TENNIS
DIR = os.path.join(OUT, SET)
ONLY = [a for a in ARGS if a in VARIANTS]
ONLY_CLIPS = [a for a in ARGS if a in CLIPS]


def facing_vec(fid):
    if fid in FACINGS:
        return FACINGS[fid]
    a = int(fid[1:]) * 2 * math.pi / HEADINGS
    return Vector((math.sin(a), math.cos(a), 0))  # clockwise from "away from the camera" (Blender +y)


def twin_of(fid):
    """Facings drawn on the page as the mirror image of another (only their shadows are rendered)."""
    return 'right' if SET == 'padel' and fid == 'left' else None


# --- Kit ---------------------------------------------------------------------------------------------

def padel_racket(rig, face_rgb, accent):
    """A padel bat (no brand): 45.5 cm, a solid teardrop face 26 cm wide and 38 mm thick, perforated,
    with a short wrapped handle and a wrist cord. Held like the tennis racket (kit.racket)."""
    me = bpy.data.meshes.new('padel')
    bm = bmesh.new()
    seg = 36
    cy, a, b, t = 0.31, 0.13, 0.145, 0.019
    ring = []
    for i in range(seg):
        ang = 2 * math.pi * i / seg
        x, y = a * math.cos(ang), b * math.sin(ang)
        if y < 0:
            x *= 1 - 0.28 * (-y / b) ** 1.5  # a teardrop: narrower towards the throat
        ring.append((x, cy + y))
    top = [bm.verts.new((x, y, t)) for x, y in ring]
    bot = [bm.verts.new((x, y, -t)) for x, y in ring]
    bm.faces.new(top)
    bm.faces.new(bot[::-1])
    for i in range(seg):
        j = (i + 1) % seg
        f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
        f.material_index = 1
    # throat and handle
    r = bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(0.034, 0.2, 0.03), verts=r['verts'])
    bmesh.ops.translate(bm, vec=(0, 0.09, 0), verts=r['verts'])
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = 2
    uv = bm.loops.layers.uv.new('UVMap')
    for ff in bm.faces:
        for l in ff.loops:
            l[uv].uv = ((l.vert.co.x + a) / (2 * a), (l.vert.co.y - (cy - b)) / (2 * b))
    bm.to_mesh(me)
    bm.free()

    def plain(name, rgb, rough, coat=0.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Coat Weight'].default_value = coat
        return m
    face = plain('padel_face', face_rgb, 0.35, coat=0.5)
    # perforations: a grid of round holes through the face (alpha), clear of the rim
    nt = face.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = 9.0
    vor.inputs['Randomness'].default_value = 0.0
    nt.links.new(tc.outputs['UV'], vor.inputs['Vector'])
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'GREATER_THAN'; lt.inputs[1].default_value = 0.16
    nt.links.new(vor.outputs['Distance'], lt.inputs[0])
    nt.links.new(lt.outputs[0], bsdf.inputs['Alpha'])
    me.materials.append(face)
    me.materials.append(plain('padel_rim', accent, 0.3, coat=0.6))
    me.materials.append(plain('padel_grip', (0.03, 0.03, 0.03), 0.8))
    obj = bpy.data.objects.new('padel_racket', me)
    bpy.context.scene.collection.objects.link(obj)
    # in the right hand, as kit.racket
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    hand = rig.data.bones['RightHand']
    mw = rig.matrix_world
    h0 = mw @ hand.head_local
    along = (mw.to_3x3() @ (hand.tail_local - hand.head_local)).normalized()
    thumb = rig.data.bones.get('RThumb') or rig.data.bones.get('RightHandThumb1')
    tdir = ((mw @ thumb.head_local) - h0) if thumb else Vector((0, 0, 1))
    shaft = (tdir - along * tdir.dot(along)).normalized()
    fc = along.cross(shaft).normalized()
    side = shaft.cross(fc).normalized()
    grip = h0 + along * 0.075 - shaft * 0.05
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = 'RightHand'
    obj.matrix_world = Matrix.Translation(grip) @ Matrix((side, shaft, fc)).transposed().to_4x4()
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return obj


def towel(rig):
    """A hand towel (white terry), folded, in the right hand."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=6, y_subdivisions=10, size=1)
    o = bpy.context.object
    o.name = 'towel'
    for v in o.data.vertices:
        x, y = v.co.x * 0.24, (v.co.y + 0.5) * 0.34  # 24 × 34 cm (folded), hanging down from the hand
        v.co = Vector((x, 0.03 * math.sin(y * 9) + 0.02 * math.cos(x * 14), -y))
    for p in o.data.polygons:
        p.use_smooth = True
    m = bpy.data.materials.new('towel')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.82, 0.81, 0.78, 1)
    bsdf.inputs['Roughness'].default_value = 0.95
    o.data.materials.append(m)
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    hand = rig.data.bones['RightHand']
    mw = rig.matrix_world
    h0 = mw @ hand.tail_local
    o.parent = rig
    o.parent_type = 'BONE'
    o.parent_bone = 'RightHand'
    o.matrix_world = Matrix.Translation(h0)
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return o


# --- Posing helpers ------------------------------------------------------------------------------------

def wpt(rig, bone, end='head'):
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ (pb.head if end == 'head' else pb.tail)


def two_bone(rig, upper, lower, target, bend):
    """Analytic two-bone IK: aims `upper` and `lower` so the end of `lower` reaches `target` (world),
    the middle joint pushed towards `bend`."""
    H = wpt(rig, upper)
    L1 = (wpt(rig, upper, 'tail') - H).length
    L2 = (wpt(rig, lower, 'tail') - wpt(rig, lower)).length
    d = target - H
    dist = min(max(d.length, 1e-3), L1 + L2 - 1e-3)
    al = d.normalized()
    x = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, L1 * L1 - x * x))
    perp = bend - al * bend.dot(al)
    perp = perp.normalized() if perp.length > 1e-4 else Vector((0, 0, 1))
    K = H + al * x + perp * h
    aim(rig, upper, K - H, 1.0)
    aim(rig, lower, target - wpt(rig, lower), 1.0)


def move_hips(rig, offset):
    pb = rig.pose.bones['Hips']
    m = pb.matrix.copy()
    m.translation = m.translation + rig.matrix_world.inverted().to_3x3() @ offset
    pb.matrix = m
    bpy.context.view_layer.update()


def lean(rig, fwd, angle):
    """Bends the spine forward by `angle` (rad), spread over the spine bones."""
    bones = [b for b in ('Spine', 'Spine1', 'Spine2') if b in rig.pose.bones][:2] or ['Spine']
    for b in bones:
        cur = (wpt(rig, b, 'tail') - wpt(rig, b)).normalized()
        axis = UP.cross(fwd).normalized()  # pitch axis (to the player's left/right)
        d = Matrix.Rotation(-angle / len(bones), 3, axis) @ cur
        aim(rig, b, d, 1.0)


def smooth(u, a, b):
    return ramp(u, a, b)


def pose_layer(rig, keyed, to, fn):
    """Per keyed frame: fn(u, fwd, right) moves bones; then every bone and the hips are re-keyed."""
    scene = bpy.context.scene
    n = len(keyed)
    fwd = Vector((to.x, to.y, 0)).normalized()
    right = Vector((fwd.y, -fwd.x, 0))
    for k, f in enumerate(keyed):
        scene.frame_set(f)
        fn(k / max(1, n - 1), fwd, right)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=f)
        rig.pose.bones['Hips'].keyframe_insert('location', frame=f)


def stance(rig):
    """Ankle positions (world) and foot directions of the current pose."""
    return {s: (wpt(rig, f'{s}Foot'), (wpt(rig, f'{s}Foot', 'tail') - wpt(rig, f'{s}Foot')).normalized()) for s in ('Left', 'Right')}


def legs_to(rig, ankles, fwd):
    for s in ('Left', 'Right'):
        A, fdir = ankles[s]
        two_bone(rig, f'{s}UpLeg', f'{s}Leg', A, fwd + UP * 0.1)
        aim(rig, f'{s}Foot', fdir, 1.0)


def pickup_layer(rig, keyed, to):
    """Bends at the knees and hips, the left hand down to a ball in front of the left foot, and back up."""
    base = {}

    def fn(u, fwd, right):
        if not base:
            base['ank'] = stance(rig)
            base['root'] = wpt(rig, 'Hips')
        b = smooth(u, 0.08, 0.42) * (1 - smooth(u, 0.6, 0.94))
        ank = base['ank']
        move_hips(rig, (DOWN * 0.36 - fwd * 0.12) * b)
        legs_to(rig, ank, fwd)
        lean(rig, fwd, math.radians(48) * b)
        root = base['root']
        ball = Vector((root.x, root.y, 0.07)) + fwd * 0.42 - right * 0.14
        hand = wpt(rig, 'LeftHand', 'tail')
        reach = smooth(u, 0.18, 0.46) * (1 - smooth(u, 0.62, 0.9))
        if reach > 0.01:
            tgt = hand.lerp(ball + UP * 0.05, reach)
            two_bone(rig, 'LeftArm', 'LeftForeArm', tgt, -right + DOWN * 0.3)
    pose_layer(rig, keyed, to, fn)


def bench_layer(rig, keyed, to):
    """Sits down on the bench behind him (seat 0.45 m), towels the face, the back of the neck, gets up."""
    base = {}
    n = len(keyed)
    T = n / FPS

    def fn(u, fwd, right):
        t = u * T
        if not base:
            base['ank'] = stance(rig)
            base['root'] = wpt(rig, 'Hips')
        s = smooth(t, 0.1, 1.0) * (1 - smooth(t, 3.45, 4.3))
        # hips back over the seat and down; the feet step a little forward as he sits
        root = base['root']
        hip_z = root.z
        sit_z = 0.56
        move_hips(rig, -fwd * 0.2 * s + DOWN * (hip_z - sit_z) * s)
        ank = {k: (A + fwd * 0.16 * s, d) for k, (A, d) in base['ank'].items()}
        legs_to(rig, ank, fwd)
        tr = math.exp(-((t - 0.55) / 0.3) ** 2) + math.exp(-((t - 3.85) / 0.3) ** 2)  # lean in to sit / to rise
        lean(rig, fwd, math.radians(12) * s + math.radians(26) * tr)
        head = wpt(rig, 'Head')
        neck = wpt(rig, 'Neck')
        # towel: both hands over the face (rubbing), then round the back of the neck, then down
        face = smooth(t, 1.0, 1.35) * (1 - smooth(t, 2.7, 3.0))
        nape = smooth(t, 2.8, 3.05) * (1 - smooth(t, 3.25, 3.55))
        rub = math.sin(t * 2 * math.pi * 2.2) * 0.06
        for side, sg in (('Right', 1), ('Left', -1)):
            hand = wpt(rig, f'{side}Hand')
            rest = wpt(rig, f'{side}UpLeg', 'tail') + fwd * 0.12 + UP * 0.06 + right * sg * 0.02  # on the knees
            tgt = hand.lerp(rest, s * (1 - face) * (1 - nape) * 0.9)
            if face > 0.01:
                f = head + fwd * 0.16 + right * sg * (0.07 + rub * sg) + UP * (0.02 + rub * 0.4)
                tgt = tgt.lerp(f, face)
            if nape > 0.01:
                f = neck - fwd * 0.08 + right * sg * 0.1 + UP * 0.04
                tgt = tgt.lerp(f, nape)
            if s * (1 - face) * (1 - nape) > 0.01 or face > 0.01 or nape > 0.01:
                two_bone(rig, f'{side}Arm', f'{side}ForeArm', tgt, right * sg * 0.8 + DOWN)
    pose_layer(rig, keyed, to, fn)


def bottle(rig):
    """A plain water bottle (22 cm, white cap) in the right hand, pointing along the hand."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.033, depth=0.22)
    o = bpy.context.object
    o.name = 'bottle'
    m = bpy.data.materials.new('bottle')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.55, 0.62, 0.66, 1)
    bsdf.inputs['Roughness'].default_value = 0.25
    o.data.materials.append(m)
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    hand = rig.data.bones['RightHand']
    mw = rig.matrix_world
    h0 = mw @ hand.head_local
    along = (mw.to_3x3() @ (hand.tail_local - hand.head_local)).normalized()
    o.parent = rig
    o.parent_type = 'BONE'
    o.parent_bone = 'RightHand'
    side = along.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(along).normalized()
    o.matrix_world = Matrix.Translation(h0 + along * 0.1) @ Matrix((side, along, up)).transposed().to_4x4()
    # cylinder axis is z: turn it onto the hand direction
    o.matrix_world = Matrix.Translation(h0 + along * 0.11) @ Matrix((side, up, along)).transposed().to_4x4()
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return o


def drink_layer(rig, keyed, to):
    """Right hand up to the mouth with the bottle, head tipped back a little, and down again."""
    base = {}

    def fn(u, fwd, right):
        if not base:
            base['ank'] = stance(rig)
        up = smooth(u, 0.1, 0.32) * (1 - smooth(u, 0.78, 0.94))
        tilt = smooth(u, 0.3, 0.42) * (1 - smooth(u, 0.66, 0.78))
        legs_to(rig, base['ank'], fwd)
        lean(rig, fwd, -math.radians(9) * tilt)
        head = wpt(rig, 'Head')
        hand = wpt(rig, 'RightHand')
        mouth = head + fwd * (0.12 - 0.02 * tilt) + right * 0.03 + UP * (-0.02 + 0.06 * tilt)
        if up > 0.01:
            two_bone(rig, 'RightArm', 'RightForeArm', hand.lerp(mouth, up), right * 0.8 + DOWN)
    pose_layer(rig, keyed, to, fn)


def side_lean(rig, fwd, angle):
    """Bends the spine sideways by `angle` (rad, + = to the player's left) over the spine bones."""
    bones = [b for b in ('Spine', 'Spine1', 'Spine2') if b in rig.pose.bones][:2] or ['Spine']
    for b in bones:
        cur = (wpt(rig, b, 'tail') - wpt(rig, b)).normalized()
        aim(rig, b, Matrix.Rotation(angle / len(bones), 3, fwd) @ cur, 1.0)


def stretch_layer(rig, keyed, to):
    """A warm-up stretch: the right arm pulled across the chest by the left, then both arms up, clasped,
    leaning to one side and the other."""
    base = {}

    def fn(u, fwd, right):
        if not base:
            base['ank'] = stance(rig)
        legs_to(rig, base['ank'], fwd)
        cross = smooth(u, 0.04, 0.14) * (1 - smooth(u, 0.34, 0.42))
        over = smooth(u, 0.42, 0.52) * (1 - smooth(u, 0.9, 0.98))
        lean_l = smooth(u, 0.52, 0.62) * (1 - smooth(u, 0.66, 0.74))
        lean_r = smooth(u, 0.74, 0.84) * (1 - smooth(u, 0.88, 0.96))
        side_lean(rig, fwd, math.radians(24) * (lean_l - lean_r) * over)
        neck = wpt(rig, 'Neck')
        head = wpt(rig, 'Head')
        for side, sg in (('Right', 1), ('Left', -1)):
            hand = wpt(rig, f'{side}Hand')
            tgt = hand
            if cross > 0.01:
                if sg > 0:
                    across = neck - right * 0.24 + fwd * 0.14 + DOWN * 0.1
                else:
                    across = wpt(rig, 'RightForeArm') + fwd * 0.04 + right * 0.02
                tgt = hand.lerp(across, cross)
            if over > 0.01:
                tgt = tgt.lerp(head + UP * 0.34 + right * sg * 0.04 + fwd * 0.02, over)
            if cross > 0.01 or over > 0.01:
                two_bone(rig, f'{side}Arm', f'{side}ForeArm', tgt, right * sg * 0.8 + DOWN * 0.4)
    pose_layer(rig, keyed, to, fn)


def split_hop(rig, keyed, hop):
    scene = bpy.context.scene
    for k, f in enumerate(keyed):
        scene.frame_set(f)
        pb = rig.pose.bones['Hips']
        m = pb.matrix.copy()
        m.translation.z += hop * math.sin(math.pi * k / (len(keyed) - 1))
        pb.matrix = m
        bpy.context.view_layer.update()
        pb.keyframe_insert('location', frame=f)


def load_clip(c):
    """Lessons' loader (windows, loops at a fps), plus held frames and short takes."""
    c = dict(c, fps=c.get('fps', FPS))
    if c.get('hold'):
        src = rp.import_bvh(c['bvh'])
        n = max(2, round(c['seconds'] * c['fps']))
        return src, {b.name: b.name for b in src.pose.bones}, [c['hold']] * n, 1 / c['fps'], None
    if c.get('take'):
        src, names, frames, sps, stand = load(dict(c, window_s=(1.0, 1.5), loop=True))
        n = max(2, round(c['take'] * c['fps']))
        step = frames[1] - frames[0]
        return src, names, [frames[0] + i * step for i in range(n)], sps, stand
    return load(c)


def net_of(c, src, names, frames, sps):
    if c['net'] == 'reverse':
        return -clip_net(dict(c, net='travel'), src, names, frames, sps)
    return clip_net(c, src, names, frames, sps)


def main():
    enable_mpfb()
    scene = bpy.context.scene
    os.makedirs(DIR, exist_ok=True)
    meta_path = os.path.join(DIR, f'{SET}.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) and not PREVIEW else {}
    meta.update({'fps': 24 if SET == 'players' else FPS, 'ppm': PPM, 'body': BODY, 'shadow': SHADOW, 'shadowPpm': SHADOW_PPM})
    meta.setdefault('variants', {})
    meta.setdefault('clips', {})
    for vid, spec in VARIANTS.items():
        if ONLY and vid not in ONLY:
            continue
        clear_scene()
        setup_render(scene, samples=20 if PREVIEW else 48)
        scene.cycles.filter_width = 1.1
        scene.render.use_motion_blur = True
        setup_world(scene)
        rig, parts = make_player(spec)
        if SET == 'padel':
            rkt = padel_racket(rig, (0.9, 0.89, 0.86) if vid != 'b' else (0.03, 0.03, 0.035), spec.get('racket') or (0.6, 0.27, 0.12))
        else:
            rkt = rp.racket(rig, spec)
        tw = towel(rig) if any(c.get('towel') for c in CLIPS.values()) else None
        bt = bottle(rig) if any(c.get('bottle') for c in CLIPS.values()) else None
        catcher = shadow_catcher(scene)
        cams = {}

        def body_cam(win):
            key = tuple(sorted(win.items()))
            if key not in cams:
                cams[key] = drone_camera(scene, f'cam_body{len(cams)}', win['x1'] - win['x0'], win['y1'] - win['y0'], PPM,
                                         ((win['x0'] + win['x1']) / 2, (win['y0'] + win['y1']) / 2))
            return cams[key]
        cam_shadow, res_shadow = top_camera(scene, 'cam_shadow', SHADOW['x0'], SHADOW['x1'], SHADOW['y0'], SHADOW['y1'], SHADOW_PPM)
        frame_no = 1
        for cid, c in CLIPS.items():
            if ONLY_CLIPS and cid not in ONLY_CLIPS:
                continue
            fps = c.get('fps', FPS)
            for o in parts:
                o.hide_viewport = True
            src, names, frames, sps, stand = load_clip(c)
            net = net_of(c, src, names, frames, sps)
            visible = parts + ([] if c.get('bare') else [tw] if c.get('towel') else [bt] if c.get('bottle') else [rkt])
            for o in [rkt, tw, bt]:
                if o:
                    o.hide_render = o not in visible
            facings = c.get('facings', SIDE if SET == 'padel' else ('away', 'toward'))
            for fid in facings:
                if PREVIEW and fid not in (facings[0],):
                    continue
                to = facing_vec(fid)
                twin = twin_of(fid)
                rig.animation_data_clear()
                for o in parts:
                    o.hide_viewport = True
                start = frame_no
                res = retarget(src, rig, frames, out_start=start, face_from=net, face_to=to, mirror=c.get('mirror', False),
                               inplace=c.get('inplace', 'linear' if c.get('loop') else 'none'), soften_legs=c.get('soften', 1.0),
                               travel_scale=c.get('travel', 1.0), names=None if 'bvh' in c else names, stand=stand,
                               seconds_per_sample=sps)
                keyed = list(range(start, start + len(frames)))
                n = len(keyed)
                frame_no += n
                layer = c.get('layer')
                if layer == 'feed':
                    feed_layer(rig, keyed, to)
                elif layer == 'forehand':
                    forehand_layer(rig, keyed, to, c)
                elif layer == 'serve':
                    serve_layer(rig, keyed, to, c)
                if layer not in ('pickup', 'bench', 'drink', 'stretch'):
                    ground_feet(rig, visible, keyed)
                if layer == 'pickup':
                    ground_feet(rig, visible, keyed[:1])
                    pickup_layer(rig, keyed, to)
                elif layer == 'bench':
                    ground_feet(rig, visible, keyed[:1])
                    bench_layer(rig, keyed, to)
                elif layer == 'stretch':
                    ground_feet(rig, visible, keyed[:1])
                    stretch_layer(rig, keyed, to)
                elif layer == 'drink':
                    ground_feet(rig, visible, keyed[:1])
                    drink_layer(rig, keyed, to)
                if c.get('hop'):
                    split_hop(rig, keyed, c['hop'])
                hand = []
                if c.get('hand'):
                    rgt = Vector((to.y, -to.x, 0))
                    for f in keyed:
                        scene.frame_set(f)
                        hp = rig.matrix_world @ rig.pose.bones['LeftHand'].tail
                        hand.append([round(hp.dot(rgt), 3), round(hp.dot(to), 3), round(hp.z, 3)])
                for o in parts:
                    o.hide_viewport = False
                scene.render.motion_blur_shutter = 0.35 * fps / 24
                out_dir = os.path.join(DIR, vid, f'{cid}_{fid}')
                os.makedirs(out_dir, exist_ok=True)
                for old in os.listdir(out_dir):
                    os.remove(os.path.join(out_dir, old))
                twin_dir = os.path.join(DIR, vid, f'{cid}_{twin}') if twin else None
                for i, f in enumerate(keyed):
                    if PREVIEW and i % 5:
                        continue
                    scene.frame_set(f)
                    body_file = os.path.join(out_dir, f'{i:03d}.png')
                    if twin_dir:
                        shutil.copy(os.path.join(twin_dir, f'{i:03d}.png'), body_file)
                    else:
                        catcher.hide_render = True
                        for o in visible:
                            o.visible_camera = True
                        scene.camera, (scene.render.resolution_x, scene.render.resolution_y) = body_cam(c.get('body', BODY))
                        scene.render.filepath = body_file
                        bpy.ops.render.render(write_still=True)
                    if PREVIEW or i % SHADOW_EVERY:
                        continue
                    catcher.hide_render = False
                    for o in visible:
                        o.visible_camera = False
                    scene.camera = cam_shadow
                    scene.render.resolution_x, scene.render.resolution_y = res_shadow
                    scene.render.filepath = os.path.join(out_dir, f's{i:03d}.png')
                    bpy.ops.render.render(write_still=True)
                    for o in visible:
                        o.visible_camera = True
                contact = None
                if c.get('contact'):
                    contact = round((c['contact'] - c['f0']) / (120 / fps))
                elif layer == 'feed':
                    contact = round(FEED_CONTACT * (n - 1))
                right = Vector((to.y, -to.x, 0))
                travel, v = res['travel'], res['velocity']
                entry = dict(frames=n, fps=fps, loop=bool(c.get('loop')), contact=contact, facings=list(facings),
                             travel=[round(travel.dot(right), 3), round(travel.dot(to), 3)],
                             pace=round(v.dot(right), 3), speed=round(v.dot(to), 3))
                if c.get('body'):
                    entry['body'] = c['body']
                if hand:
                    entry['hand'] = hand
                if layer == 'feed':
                    entry['drop'] = round(FEED_DROP * (n - 1))
                if layer == 'pickup':
                    entry['grab'] = round(0.46 * (n - 1))
                # the eight headings share speed/pace measured in each heading's own frame: keep h0's
                if fid == facings[0]:
                    meta['clips'][cid] = entry
                print('clip', vid, cid, fid, n, 'v', v, 'travel', travel, flush=True)
            bpy.data.objects.remove(src, do_unlink=True)
        meta['variants'][vid] = dict(spec=spec['skin'].split('/')[0])
        if not PREVIEW:
            disk = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
            disk.update({k: v for k, v in meta.items() if k not in ('variants', 'clips')})
            disk.setdefault('variants', {})[vid] = meta['variants'][vid]
            disk.setdefault('clips', {}).update({k: v for k, v in meta['clips'].items() if k in CLIPS})
            with open(meta_path, 'w') as f:
                json.dump(disk, f, indent=1)
    print('done', flush=True)


if __name__ == '__main__':
    main()
