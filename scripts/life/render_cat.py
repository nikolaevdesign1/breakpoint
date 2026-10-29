# The club cat for the booking map (rows 95.5, 131, 137), rendered as flipbook sprites like the players.
#   Blender -b --factory-startup --python scripts/life/render_cat.py [-- preview|side|portrait] [clip ...]
# No CC0 realistic cat exists without a login, so it is modelled here: a big ginger tabby (the page
# shows it at Maine Coon size) built from a skeleton with the proportions of a cat (long hind legs
# with the hock high, deep narrow chest, round head with full cheeks, upright ears, a long thick
# tail). A skin modifier gives the body, which is then applied: a real mesh, deformed by the skin's
# own armature, so the coat (computed on the rest pose, 'Generated' coordinates) stays on the body
# when it moves; velvety sheen and a fine grain read as short fur (real particle fur only for the
# contest portrait, where the cat is big).
# Coat: mackerel tabby stripes over the back and flanks, barred legs, a ringed tail, a white chin,
# chest, belly and socks, a pink nose and amber eyes. Gaits and poses are keyed procedurally:
# walk, run (bound), sit down / sit / lick a paw / stand up, lie down / lie (sphinx) / get up, a
# standing look-around and a low sneak for slipping under a hedge. Each clip is rendered in eight
# headings, plus a straight-down shadow pass (every other frame). Output: blender/characters/frames/cat/
import bpy, bmesh, json, math, os, sys
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, os.path.dirname(__file__))
from lib_life import OUT, ROOT, clear_scene, setup_world, setup_render, drone_camera, top_camera, shadow_catcher

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS
SIDE = 'side' in ARGS  # debug: render poses from the side, no sprites
PORTRAIT = 'portrait' in ARGS  # the contest card's picture (row 136)
FPS = 24  # row 132: was 15; idles render at their own lower rate, the page cross-fades frames
PPM = 220 if PREVIEW or SIDE else 128  # row 131: sharper (was 100)
SHADOW_PPM = 40
SHADOW_EVERY = 2
BODY = dict(x0=-0.52, x1=0.52, y0=-0.26, y1=0.5)
SHADOW = dict(x0=-1.05, x1=0.6, y0=-0.6, y1=1.0)
HEADINGS = 8
# Particle fur renders ~2 min a frame with motion blur (thousands of frames here) and is sub-pixel on
# the map anyway: the coat's sheen and grain carry the fur. Kept for the portrait.
FUR = 'fur' in ARGS

# --- Skeleton (Blender: x lateral, y forward, z up; standing) ---------------------------------
# name: (position, parent, skin radius [w, h])
P = {
    'pelvis': ((0, -0.15, 0.22), None, (0.055, 0.062)),
    'loin': ((0, -0.055, 0.226), 'pelvis', (0.06, 0.068)),
    'chest': ((0, 0.065, 0.21), 'loin', (0.062, 0.074)),
    'withers': ((0, 0.13, 0.222), 'chest', (0.054, 0.062)),
    'neck': ((0, 0.18, 0.262), 'withers', (0.04, 0.044)),
    'head': ((0, 0.228, 0.285), 'neck', (0.062, 0.05)),
    'muzzle': ((0, 0.272, 0.268), 'head', (0.03, 0.024)),
    'nose': ((0, 0.292, 0.27), 'muzzle', (0.013, 0.012)),
    'tail1': ((0, -0.215, 0.24), 'pelvis', (0.024, 0.024)),
    'tail2': ((0, -0.275, 0.265), 'tail1', (0.022, 0.022)),
    'tail3': ((0, -0.325, 0.31), 'tail2', (0.02, 0.02)),
    'tail4': ((0, -0.355, 0.37), 'tail3', (0.019, 0.019)),
    'tail5': ((0, -0.365, 0.435), 'tail4', (0.017, 0.017)),
    'tail6': ((0, -0.36, 0.49), 'tail5', (0.013, 0.013)),
}
for s, x in (('L', 0.04), ('R', -0.04)):
    P.update({
        f'hip{s}': ((x, -0.135, 0.195), 'pelvis', (0.044, 0.05)),
        f'knee{s}': ((x * 1.12, -0.09, 0.128), f'hip{s}', (0.028, 0.03)),
        f'hock{s}': ((x * 1.12, -0.178, 0.066), f'knee{s}', (0.016, 0.018)),
        f'hpaw{s}': ((x * 1.12, -0.152, 0.014), f'hock{s}', (0.014, 0.014)),
        f'htoe{s}': ((x * 1.12, -0.12, 0.009), f'hpaw{s}', (0.015, 0.011)),
        f'shoulder{s}': ((x * 0.95, 0.112, 0.17), 'chest', (0.034, 0.04)),
        f'elbow{s}': ((x * 0.95, 0.086, 0.106), f'shoulder{s}', (0.022, 0.024)),
        f'wrist{s}': ((x * 0.95, 0.108, 0.032), f'elbow{s}', (0.016, 0.016)),
        f'fpaw{s}': ((x * 0.95, 0.13, 0.011), f'wrist{s}', (0.016, 0.012)),
    })
NAMES = list(P)


def build_cat():
    me = bpy.data.meshes.new('cat')
    me.from_pydata([P[n][0] for n in NAMES], [(NAMES.index(P[n][1]), i) for i, n in enumerate(NAMES) if P[n][1]], [])
    obj = bpy.data.objects.new('cat', me)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    skin = obj.modifiers.new('Skin', 'SKIN')
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.6
    for i, n in enumerate(NAMES):
        sv = me.skin_vertices[0].data[i]
        sv.radius = P[n][2]
        sv.use_root = n == 'pelvis'
    bpy.ops.object.skin_armature_create(modifier='Skin')
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    for b in arm.data.bones:  # bones named after the skeleton point at their tail
        b.name = min(NAMES, key=lambda n: (Vector(P[n][0]) - b.tail_local).length)
    arm_mod = next(m for m in obj.modifiers if m.type == 'ARMATURE')
    bpy.ops.object.modifier_move_to_index(modifier='Skin', index=0)
    # A real mesh from here on: the skin is applied, the armature deforms it (weights come along).
    bpy.ops.object.modifier_apply(modifier='Skin')
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    shape_head(bm)
    bm.to_mesh(obj.data)
    bm.free()
    sub = obj.modifiers.new('Subsurf', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    coat_mat = coat()
    obj.data.materials.append(coat_mat)
    if FUR:
        fur(obj)
    parts = [obj] + face(arm) + ears(arm)
    return arm, obj, parts


def shape_head(bm):
    """Fuller cheeks, a flatter crown and a short muzzle: the round face of a tom cat."""
    hx, hy, hz = P['head'][0]
    for v in bm.verts:
        d = v.co - Vector((hx, hy, hz))
        if d.length > 0.075:
            continue
        w = max(0.0, 1 - d.length / 0.075)
        if d.z < 0.01:  # cheeks and jowls out sideways
            v.co.x += math.copysign(0.012 * w, d.x) if abs(d.x) > 0.01 else 0
        if d.z > 0.025:  # crown a little flatter
            v.co.z -= 0.006 * w


def fur(obj):
    """Short combed fur on the deformed body; children fill it in at render time."""
    mod = obj.modifiers.new('fur', 'PARTICLE_SYSTEM')
    ps = mod.particle_system.settings
    ps.type = 'HAIR'
    ps.use_advanced_hair = True
    ps.count = 5000
    ps.hair_length = 0.016
    ps.emit_from = 'FACE'
    ps.use_emit_random = True
    ps.normal_factor = 1.0
    ps.object_align_factor = (0, -0.6, -0.3)  # combed back and down
    ps.material = 1
    ps.child_type = 'INTERPOLATED'
    ps.rendered_child_count = 14
    ps.child_length = 0.9
    ps.child_length_threshold = 0.4
    ps.clump_factor = 0.25
    ps.roughness_1 = 0.004
    ps.roughness_endpoint = 0.003
    ps.root_radius = 0.0007
    ps.tip_radius = 0.0001
    ps.radius_scale = 1.0
    ps.display_step = 2
    ps.render_step = 3
    ps.use_hair_bspline = True


def coat():
    """Ginger mackerel tabby, computed on the rest pose: stripes stay where they belong."""
    m = bpy.data.materials.new('coat')
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links.new
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.78
    bsdf.inputs['Sheen Weight'].default_value = 0.6
    bsdf.inputs['Sheen Roughness'].default_value = 0.35
    bsdf.inputs['Coat Weight'].default_value = 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    # Generated (0..1 over the rest-pose bounds) back to metres in the rest pose.
    lo = Vector((-0.11, -0.4, 0.0))
    size = Vector((0.22, 0.72, 0.52))
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = size
    mp.inputs['Location'].default_value = lo
    L(tc.outputs['Generated'], mp.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    L(mp.outputs['Vector'], sep.inputs['Vector'])

    def math_node(op, a=None, b=None, va=0.0, vb=0.0, clamp=False):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        if a is not None: L(a, n.inputs[0])
        else: n.inputs[0].default_value = va
        if len(n.inputs) > 1:
            if b is not None: L(b, n.inputs[1])
            else: n.inputs[1].default_value = vb
        return n.outputs[0]

    # Stripes: bands across the body (along y), bent by noise so they wander like real tabby marks;
    # on the tail (behind the pelvis) they become rings, on the legs bars.
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 9.0
    noise.inputs['Detail'].default_value = 3.0
    L(mp.outputs['Vector'], noise.inputs['Vector'])
    warp = math_node('MULTIPLY', noise.outputs['Fac'], None, vb=0.07)
    along = math_node('ADD', sep.outputs['Y'], warp)
    tilt = math_node('MULTIPLY', sep.outputs['Z'], None, vb=0.35)  # bands lean back towards the spine
    along = math_node('ADD', along, tilt)
    wave = math_node('SINE', math_node('MULTIPLY', along, None, vb=2 * math.pi / 0.046))
    band = math_node('MAXIMUM', math_node('SUBTRACT', wave, None, vb=0.25), None, vb=0.0)
    band = math_node('MULTIPLY', band, None, vb=1.8, clamp=True)
    # Darker along the spine: a broad dorsal stripe where the bands meet.
    top = math_node('MULTIPLY', math_node('SUBTRACT', sep.outputs['Z'], None, vb=0.235), None, vb=40, clamp=True)
    spine = math_node('MULTIPLY', math_node('LESS_THAN', math_node('ABSOLUTE', sep.outputs['X']), None, vb=0.018), top)
    dark = math_node('MAXIMUM', band, math_node('MULTIPLY', spine, None, vb=0.75))
    # Pale underside, chin, chest and socks: low on the body, the front of the chest, the paws.
    under = math_node('MULTIPLY', math_node('SUBTRACT', None, sep.outputs['Z'], va=0.175), None, vb=28, clamp=True)
    chest = math_node('MULTIPLY', math_node('SUBTRACT', sep.outputs['Y'], None, vb=0.135), None, vb=30, clamp=True)
    chest = math_node('MULTIPLY', chest, math_node('MULTIPLY', math_node('SUBTRACT', None, sep.outputs['Z'], va=0.255), None, vb=30, clamp=True))
    socks = math_node('MULTIPLY', math_node('SUBTRACT', None, sep.outputs['Z'], va=0.045), None, vb=60, clamp=True)
    chin = math_node('MULTIPLY', math_node('SUBTRACT', sep.outputs['Y'], None, vb=0.255), None, vb=40, clamp=True)
    chin = math_node('MULTIPLY', chin, math_node('MULTIPLY', math_node('SUBTRACT', None, sep.outputs['Z'], va=0.272), None, vb=60, clamp=True))
    white = math_node('MAXIMUM', math_node('MAXIMUM', under, chest), math_node('MAXIMUM', socks, chin))
    # Colour: ginger, darker rust in the stripes, cream-white beneath; a little noise in the tone.
    tone = nt.nodes.new('ShaderNodeTexNoise')
    tone.inputs['Scale'].default_value = 60.0
    L(mp.outputs['Vector'], tone.inputs['Vector'])
    ginger = nt.nodes.new('ShaderNodeMix'); ginger.data_type = 'RGBA'
    L(tone.outputs['Fac'], ginger.inputs['Factor'])
    ginger.inputs[6].default_value = (0.4, 0.15, 0.04, 1)
    ginger.inputs[7].default_value = (0.52, 0.22, 0.07, 1)
    striped = nt.nodes.new('ShaderNodeMix'); striped.data_type = 'RGBA'
    L(dark, striped.inputs['Factor'])
    L(ginger.outputs[2], striped.inputs[6])
    striped.inputs[7].default_value = (0.13, 0.04, 0.012, 1)
    final = nt.nodes.new('ShaderNodeMix'); final.data_type = 'RGBA'
    L(white, final.inputs['Factor'])
    L(striped.outputs[2], final.inputs[6])
    final.inputs[7].default_value = (0.78, 0.72, 0.62, 1)
    L(final.outputs[2], bsdf.inputs['Base Color'])
    L(final.outputs[2], bsdf.inputs['Sheen Tint'])
    # Fine fur grain along the body.
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 700
    gm = nt.nodes.new('ShaderNodeMapping')
    gm.inputs['Scale'].default_value = (1.0, 0.25, 1.0)
    L(tc.outputs['Generated'], gm.inputs['Vector'])
    L(gm.outputs['Vector'], grain.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    L(grain.outputs['Fac'], bump.inputs['Height'])
    L(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def simple(name, rgb, rough=0.5, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def on_bone(arm, obj, bone):
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_world = mw


def face(arm):
    """Amber eyes with dark pupils and a pink nose, riding on the head bone."""
    out = []
    eye = simple('eye', (0.62, 0.42, 0.06), rough=0.08)
    nose = simple('nose', (0.62, 0.3, 0.28), rough=0.6)
    for s in (1, -1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0085, segments=14, ring_count=8, location=(s * 0.022, 0.268, 0.293))
        e = bpy.context.object
        e.name = 'eye'
        e.scale = (1, 0.7, 1)
        e.data.materials.append(eye)
        on_bone(arm, e, 'head')
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0042, segments=10, ring_count=6, location=(s * 0.0225, 0.2745, 0.293))
        p = bpy.context.object
        p.name = 'pupil'
        p.scale = (0.5, 0.6, 1.1)
        p.data.materials.append(simple('pupil', (0.01, 0.01, 0.01), rough=0.05))
        on_bone(arm, p, 'head')
        out += [e, p]
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0075, segments=10, ring_count=6, location=(0, 0.302, 0.272))
    n = bpy.context.object
    n.name = 'nose_tip'
    n.scale = (1.1, 0.7, 0.7)
    n.data.materials.append(nose)
    on_bone(arm, n, 'head')
    return out + [n]


def ears(arm):
    """Upright ears, ginger outside, pink inside, slightly turned out."""
    objs = []
    outer = simple('ear', (0.5, 0.22, 0.07), rough=0.85)
    inner = simple('ear_in', (0.7, 0.42, 0.38), rough=0.7)
    for s in (1, -1):
        bm = bmesh.new()
        base = [Vector((s * 0.014, 0.238, 0.322)), Vector((s * 0.058, 0.23, 0.302)), Vector((s * 0.038, 0.21, 0.314))]
        tip = Vector((s * 0.047, 0.222, 0.372))
        vs = [bm.verts.new(p) for p in base] + [bm.verts.new(tip)]
        f_front = bm.faces.new((vs[0], vs[1], vs[3]))
        bm.faces.new((vs[1], vs[2], vs[3]))
        bm.faces.new((vs[2], vs[0], vs[3]))
        bm.faces.new((vs[0], vs[2], vs[1]))
        me = bpy.data.meshes.new('ear')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(outer)
        me.materials.append(inner)
        me.polygons[0].material_index = 1  # the face towards the front shows the pink inside
        o = bpy.data.objects.new('ear', me)
        bpy.context.scene.collection.objects.link(o)
        on_bone(arm, o, 'head')
        objs.append(o)
    return objs


# --- Posing ------------------------------------------------------------------------------------

X = Vector((1, 0, 0))
Z = Vector((0, 0, 1))
Y = Vector((0, 1, 0))


def rot(arm, name, axis, deg):
    """Rotate bone `name` by `deg` about an armature-space axis (through its head), composed onto
    whatever rotation it already has this frame."""
    b = arm.data.bones[name]
    R = b.matrix_local.to_3x3()
    q = (R.inverted() @ Matrix.Rotation(math.radians(deg), 3, axis) @ R).to_quaternion()
    pb = arm.pose.bones[name]
    pb.rotation_quaternion = pb.rotation_quaternion @ q


def reset(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))


def key(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)
        pb.keyframe_insert('scale', frame=frame)


def ease(x):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, x)))


def move(arm, name, v):
    """Translate bone `name` by an armature-space vector (pose location is bone-local)."""
    b = arm.data.bones[name]
    arm.pose.bones[name].location = b.matrix_local.to_3x3().inverted() @ Vector(v)


TAIL = ('tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6')

# Bones are named after the joint at their tail: 'knee' is the thigh (hip → knee), 'hock' the shin,
# 'hpaw' the hind cannon, 'elbow' the upper arm (shoulder → elbow), 'wrist' the forearm, 'loin' the
# lumbar spine pivoting at the pelvis. The root bone 'pelvis' only carries the body's translation.


def leg_walk(arm, side, front, phase, amp, lift, duty=0.62):
    """One leg through a step: stance sweeps the paw back, swing folds and carries it forward."""
    s = 'L' if side > 0 else 'R'
    if phase < duty:
        k = phase / duty
        swing = amp * (1 - 2 * k)  # front → back
        fold = 0.0
    else:
        k = (phase - duty) / (1 - duty)
        swing = amp * (-1 + 2 * ease(k))
        fold = math.sin(math.pi * k) * lift
    if front:
        rot(arm, f'elbow{s}', X, swing * 0.8)
        rot(arm, f'wrist{s}', X, fold * 0.9)
        rot(arm, f'fpaw{s}', X, -fold * 0.8)
    else:
        rot(arm, f'knee{s}', X, swing * 0.75 + fold * 0.2)
        rot(arm, f'hock{s}', X, -fold * 0.7)
        rot(arm, f'hpaw{s}', X, fold * 1.0 - swing * 0.2)
        rot(arm, f'htoe{s}', X, -fold * 0.4)


def tail(arm, up, sway, curl=0.0, t=0.0):
    """Tail: lifted `up` at the root, swaying side to side, the tip curling (`curl`, deg)."""
    for i, n in enumerate(TAIL):
        rot(arm, n, X, up * (1.0 if i < 2 else 0.3))
        rot(arm, n, Z, sway * (0.35 + 0.25 * i) * math.sin(2 * math.pi * t - i * 0.5))
        if curl:
            rot(arm, n, X, curl * (i / 5) ** 1.5)


def ear_twitch(arm, t, amount=6):
    rot(arm, 'head', Z, amount * math.sin(2 * math.pi * t) * math.exp(-((t - 0.5) * 4) ** 2))


def pose_walk(arm, t):
    ph = t
    for side, front, off in ((1, False, 0.0), (1, True, 0.25), (-1, False, 0.5), (-1, True, 0.75)):
        leg_walk(arm, side, front, (ph + off) % 1.0, amp=21 if front else 23, lift=52)
    rot(arm, 'loin', Y, 2.5 * math.sin(2 * math.pi * ph))
    rot(arm, 'chest', Z, 2.0 * math.sin(2 * math.pi * (ph + 0.25)))
    rot(arm, 'neck', X, 1.5 * math.sin(4 * math.pi * ph) - 4)
    rot(arm, 'head', X, 4)
    move(arm, 'pelvis', (0, 0, 0.004 * math.sin(4 * math.pi * ph)))
    tail(arm, up=-6, sway=7, curl=-30, t=ph)


def pose_sneak(arm, t):
    """Low, slow, belly near the ground: slipping in under a hedge."""
    ph = t
    move(arm, 'pelvis', (0, 0, -0.06))
    rot(arm, 'loin', X, -2)
    for s in 'LR':
        rot(arm, f'knee{s}', X, 22)
        rot(arm, f'hock{s}', X, -30)
        rot(arm, f'hpaw{s}', X, 10)
        rot(arm, f'elbow{s}', X, -28)
        rot(arm, f'wrist{s}', X, 38)
        rot(arm, f'fpaw{s}', X, -12)
    for side, front, off in ((1, False, 0.0), (1, True, 0.25), (-1, False, 0.5), (-1, True, 0.75)):
        leg_walk(arm, side, front, (ph + off) % 1.0, amp=16, lift=34)
    rot(arm, 'neck', X, -18)
    rot(arm, 'head', X, 16)
    tail(arm, up=-28, sway=4, curl=8, t=ph)


def pose_run(arm, t):
    """Bound: hind legs drive together, front legs reach together, the back flexes and extends."""
    ph = t
    for side, front, off in ((1, False, 0.0), (-1, False, 0.07), (1, True, 0.5), (-1, True, 0.57)):
        leg_walk(arm, side, front, (ph + off) % 1.0, amp=42 if front else 46, lift=72, duty=0.4)
    flex = math.sin(2 * math.pi * ph)
    rot(arm, 'loin', X, 9 * flex)
    rot(arm, 'chest', X, -6 * flex)
    rot(arm, 'neck', X, -8 - 5 * flex)
    rot(arm, 'head', X, 8)
    move(arm, 'pelvis', (0, 0, 0.016 * max(0.0, math.sin(2 * math.pi * ph + 1))))
    tail(arm, up=14, sway=2, curl=-12, t=ph)


def pose_stand(arm, t):
    """Standing still, looking round: the head turns one way, back, and the tail sways slowly."""
    look = math.sin(2 * math.pi * t)
    rot(arm, 'neck', Z, 22 * look)
    rot(arm, 'head', Z, 10 * look)
    rot(arm, 'neck', X, -4)
    rot(arm, 'head', X, 4 + 3 * math.sin(4 * math.pi * t))
    move(arm, 'pelvis', (0, 0, 0.002 * math.sin(4 * math.pi * t)))
    tail(arm, up=-4, sway=8, curl=-34, t=t)


def pose_sit(arm, k, t=0.0, lick=False):
    """k 0 → 1: from standing down onto the haunches. Lick: one front paw up, head down to it."""
    move(arm, 'pelvis', (0, -0.035 * k, -0.165 * k))
    rot(arm, 'loin', X, 50 * k)
    rot(arm, 'chest', X, 4 * k)
    for s in 'LR':
        rot(arm, f'knee{s}', X, 62 * k)
        rot(arm, f'hock{s}', X, -104 * k)
        rot(arm, f'hpaw{s}', X, 96 * k)
        rot(arm, f'elbow{s}', X, -56 * k)
        rot(arm, f'wrist{s}', X, 2 * k)
        # A sitting cat stands on straight forelegs, longer than their standing zig-zag: stretch them.
        arm.pose.bones[f'elbow{s}'].scale = (1, 1 + 0.24 * k, 1)
        rot(arm, f'fpaw{s}', X, -2 * k)
    rot(arm, 'neck', X, -30 * k)
    rot(arm, 'head', X, -22 * k)
    breathe = 0.003 * math.sin(2 * math.pi * t)
    move(arm, 'loin', (0, 0, breathe * k))
    twitch = math.sin(2 * math.pi * t) * math.sin(math.pi * t) ** 2
    for i, n in enumerate(TAIL):
        rot(arm, n, X, (64 if i == 0 else 4) * k)
        rot(arm, n, Z, (17 + 9 * i) * k + (10 * twitch if i > 3 else 0))
    if not lick:
        ear_twitch(arm, t)
        rot(arm, 'neck', Z, 8 * math.sin(2 * math.pi * t) * k)
    if lick:
        # Paw up to the mouth, a few licks, then the paw wipes over the ear.
        lk = 0.5 - 0.5 * math.cos(2 * math.pi * t * 4)
        rot(arm, 'elbowL', X, 60)
        rot(arm, 'wristL', X, 92)
        rot(arm, 'fpawL', X, -45)
        rot(arm, 'neck', X, -26 - 7 * lk)
        rot(arm, 'head', X, -24 - 9 * lk)
        rot(arm, 'neck', Z, 12)


def pose_lie(arm, k, t=0.0):
    """k 0 → 1: from sitting down into a sphinx: chest down between the forelegs stretched out,
    hind legs folded under, tail round the side. Breathing and a lazy tail tip."""
    pose_sit(arm, 1 - k, t)  # unwinds the sit as it lies down
    move_extra = Vector((0, 0.01 * k, -0.15 * k))
    pb = arm.pose.bones['pelvis']
    pb.location = pb.location + arm.data.bones['pelvis'].matrix_local.to_3x3().inverted() @ move_extra
    rot(arm, 'loin', X, 6 * k)
    for s in 'LR':
        rot(arm, f'knee{s}', X, 72 * k)
        rot(arm, f'hock{s}', X, -150 * k)
        rot(arm, f'hpaw{s}', X, 88 * k)
        rot(arm, f'elbow{s}', X, -62 * k)
        rot(arm, f'wrist{s}', X, 152 * k)
        rot(arm, f'fpaw{s}', X, -88 * k)
    rot(arm, 'neck', X, -6 * k)
    rot(arm, 'head', X, -4 * k + 3 * math.sin(2 * math.pi * t) * k)
    rot(arm, 'neck', Z, 10 * math.sin(2 * math.pi * t) * k)
    move(arm, 'chest', (0, 0, 0.004 * math.sin(2 * math.pi * t) * k))
    for i, n in enumerate(TAIL):
        rot(arm, n, X, (52 if i == 0 else 3) * k)
        rot(arm, n, Z, (14 + 8 * i) * k + (14 * math.sin(2 * math.pi * t) if i > 3 else 0) * k)


CLIPS = {
    # name: (seconds, loop, fps, pose(arm, t 0..1))
    'walk': (1.0, True, FPS, pose_walk),
    'sneak': (1.3, True, FPS, pose_sneak),
    'run': (0.42, True, FPS, pose_run),
    'stand': (2.4, True, 10, pose_stand),
    'sitdown': (0.7, False, FPS, lambda arm, t: pose_sit(arm, ease(t))),
    'sit': (2.4, True, 10, lambda arm, t: pose_sit(arm, 1.0, t)),
    'lick': (2.0, True, 15, lambda arm, t: pose_sit(arm, 1.0, t, lick=True)),
    'standup': (0.5, False, FPS, lambda arm, t: pose_sit(arm, ease(1 - t))),
    'liedown': (0.9, False, FPS, lambda arm, t: pose_lie(arm, ease(t))),
    'lie': (3.0, True, 10, lambda arm, t: pose_lie(arm, 1.0, t)),
    'getup': (0.7, False, FPS, lambda arm, t: pose_lie(arm, ease(1 - t))),
}
SPEED = {'walk': 0.52, 'sneak': 0.24, 'run': 3.2}  # m/s at real size; the page scales with the cat
ONLY = [a for a in ARGS if a in CLIPS]


def frames_of(secs, loop, fps):
    n = max(2, round(secs * fps))
    return n, [(i / n if loop else i / (n - 1)) for i in range(n)]


def portrait(scene, arm, parts):
    """The contest card's picture: the cat sitting on warm paving, three-quarter view, late sun."""
    reset(arm); pose_sit(arm, 1.0, 0.3); key(arm, 1); scene.frame_set(1)
    for o in parts:
        o.visible_camera = True
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    g = bpy.context.object
    g.data.materials.append(simple('paving', (0.42, 0.38, 0.34), rough=0.9))
    cd = bpy.data.cameras.new('portrait'); cd.lens = 55
    cam = bpy.data.objects.new('portrait', cd); scene.collection.objects.link(cam)
    cam.location = (0.95, 1.55, 0.95)
    target = Vector((0, 0.02, 0.17))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cd.dof.use_dof = True; cd.dof.focus_distance = (target - cam.location).length; cd.dof.aperture_fstop = 2.8
    scene.camera = cam
    scene.render.film_transparent = False
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    scene.cycles.samples = 96
    scene.view_settings.view_transform = 'AgX'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(OUT, 'cat_portrait.png')
    bpy.ops.render.render(write_still=True)


def main():
    clear_scene()
    scene = bpy.context.scene
    setup_render(scene, samples=24 if (PREVIEW or SIDE) else 56)
    scene.cycles.filter_width = 0.9
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.3
    scene.render.hair_type = 'STRIP'
    setup_world(scene)
    arm, body, parts = build_cat()
    if PORTRAIT:
        portrait(scene, arm, parts)
        return
    catcher = shadow_catcher(scene, size=4)
    root = bpy.data.objects.new('turn', None)
    scene.collection.objects.link(root)
    for o in (arm, body):  # the mesh turns with its armature, or the deform tears
        o.parent = root
    if SIDE:
        cam_data = bpy.data.cameras.new('side'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 0.95
        cam = bpy.data.objects.new('side', cam_data); scene.collection.objects.link(cam)
        cam.location = (1.5, 0.0, 0.22); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = 300, 300
        catcher.hide_render = True
        out = os.path.join(OUT, 'cat_side')
        os.makedirs(out, exist_ok=True)
        f = 1
        for cid, (secs, loop, fps, pose) in CLIPS.items():
            if ONLY and cid not in ONLY:
                continue
            for i in range(6):
                reset(arm); pose(arm, i / 6 if loop else i / 5); key(arm, f); scene.frame_set(f)
                scene.render.filepath = os.path.join(out, f'{cid}_{i}.png')
                bpy.ops.render.render(write_still=True)
                f += 1
        return
    cam_body, res_body = drone_camera(scene, 'cam_body', BODY['x1'] - BODY['x0'], BODY['y1'] - BODY['y0'], PPM,
                                      ((BODY['x0'] + BODY['x1']) / 2, (BODY['y0'] + BODY['y1']) / 2))
    cam_shadow, res_shadow = top_camera(scene, 'cam_shadow', SHADOW['x0'], SHADOW['x1'], SHADOW['y0'], SHADOW['y1'], SHADOW_PPM)
    meta_path = os.path.join(OUT, 'cat', 'cat.json')
    meta = {'fps': FPS, 'ppm': PPM, 'body': BODY, 'shadow': SHADOW, 'shadowPpm': SHADOW_PPM, 'shadowEvery': SHADOW_EVERY, 'headings': HEADINGS, 'clips': {}, 'speed': SPEED}
    if ONLY and os.path.exists(meta_path):
        meta['clips'] = json.load(open(meta_path))['clips']
    frame = 1
    for cid, (secs, loop, fps, pose) in CLIPS.items():
        n, ts = frames_of(secs, loop, fps)
        if ONLY and cid not in ONLY:
            continue
        frames = []
        for i, t in enumerate(ts):
            reset(arm)
            pose(arm, t)
            key(arm, frame + i)
            frames.append(frame + i)
        frame += n
        scene.render.fps = fps  # motion blur over one sprite frame of this clip
        meta['clips'][cid] = dict(frames=n, loop=loop, fps=fps)
        for h in range(HEADINGS):
            if PREVIEW and h % 2:
                continue
            # Heading h: the nose points this many 45° steps clockwise from "away from the camera".
            root.rotation_euler = (0, 0, -h * 2 * math.pi / HEADINGS)
            out_dir = os.path.join(OUT, 'cat', f'{cid}_{h}')
            os.makedirs(out_dir, exist_ok=True)
            for old in os.listdir(out_dir):
                os.remove(os.path.join(out_dir, old))
            for i, f in enumerate(frames):
                if PREVIEW and i % 3:
                    continue
                scene.frame_set(f)
                catcher.hide_render = True
                for o in parts:
                    o.visible_camera = True
                scene.camera = cam_body
                scene.render.resolution_x, scene.render.resolution_y = res_body
                scene.render.filepath = os.path.join(out_dir, f'{i:02d}.png')
                bpy.ops.render.render(write_still=True)
                if PREVIEW or i % SHADOW_EVERY:
                    continue
                catcher.hide_render = False
                for o in parts:
                    o.visible_camera = False
                scene.camera = cam_shadow
                scene.render.resolution_x, scene.render.resolution_y = res_shadow
                scene.render.filepath = os.path.join(out_dir, f's{i:02d}.png')
                bpy.ops.render.render(write_still=True)
                for o in parts:
                    o.visible_camera = True
        print('clip', cid, n, 'frames', flush=True)
    if not PREVIEW:
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=1)


main()
