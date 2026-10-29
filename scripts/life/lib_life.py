# Shared helpers for the life sprites of the booking map (row 95): players and the cat are rendered
# offline as flipbooks from the exact drone direction (fixed 52° pitch, looking towards −z in
# three.js = +y in Blender), lit by the same sky and sun as the page and the tree impostors.
#
# Characters: MakeHuman assets (CC0) through the MPFB 2 add-on, loaded for this session only from
# blender/assets/_downloads/mpfb/ (nothing is installed into the Blender profile). Motion: CMU
# Graphics Lab motion capture (free for any use), retargeted bone-for-bone onto MPFB's `cmu_mb` rig.
#   Blender -b --factory-startup --python scripts/life/<script>.py
import bpy, math, os, sys
from mathutils import Matrix, Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VENDOR = os.path.join(ROOT, 'blender', 'assets', '_downloads', 'mpfb')
BVH_DIR = os.path.join(VENDOR, 'cmu_bvh')
HDRI = os.path.join(ROOT, 'blender', 'assets', 'polyhaven', 'qwantani_late_afternoon_puresky', 'qwantani_late_afternoon_puresky_1k.hdr')
OUT = os.path.join(ROOT, 'blender', 'characters', 'frames')

PITCH = 52.0
SUN_THREE = Vector((0.7009, 0.5, 0.5086)).normalized()
SUN_BL = Vector((SUN_THREE.x, -SUN_THREE.z, SUN_THREE.y))  # three (x, y, z) → Blender (x, −z, y)


def enable_mpfb():
    """MPFB from the vendor folder, its user data redirected there too (it asks for a bl_ext path)."""
    user = os.path.join(VENDOR, 'userdata')
    bpy.utils.extension_path_user = lambda package, path='', create=False: os.path.join(user, path)
    sys.path.insert(0, os.path.join(VENDOR, 'addons'))
    import addon_utils
    addon_utils.enable('mpfb', default_set=True, handle_error=None)  # this session only: background + factory startup never saves prefs


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


# --- World, light, render ----------------------------------------------------------------------

def setup_world(scene, sun_strength=7.6):
    """The page's sky (Poly Haven, CC0, sun disc clamped out) and sun, as in render_impostors.py."""
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    wt = world.node_tree
    wt.nodes.clear()
    env = wt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(HDRI, check_existing=True)
    mn = wt.nodes.new('ShaderNodeVectorMath'); mn.operation = 'MINIMUM'; mn.inputs[1].default_value = (8, 8, 8)
    bg = wt.nodes.new('ShaderNodeBackground')
    out = wt.nodes.new('ShaderNodeOutputWorld')
    wt.links.new(env.outputs['Color'], mn.inputs[0])
    wt.links.new(mn.outputs['Vector'], bg.inputs['Color'])
    wt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    scene.world = world
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = sun_strength
    sun_data.color = (1.0, 0.807, 0.572)
    sun_data.angle = math.radians(0.6)
    sun = bpy.data.objects.new('sun', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = SUN_BL.to_track_quat('Z', 'Y').to_euler()
    return sun


def setup_render(scene, samples=48):
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
    except TypeError:
        pass
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.resolution_percentage = 100
    scene.render.use_persistent_data = True  # thousands of small renders: keep the scene on the GPU between them


def drone_camera(scene, name, width_m, height_m, ppm, centre):
    """Ortho camera along the map's view direction, framing a width × height window (metres in the
    image plane) whose middle sits over `centre` (a point in the image plane through the origin)."""
    cam_data = bpy.data.cameras.new(name)
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new(name, cam_data)
    scene.collection.objects.link(cam)
    rot = Matrix.Rotation(math.radians(90 - PITCH), 4, 'X')
    right = (rot @ Vector((1, 0, 0, 0))).xyz
    up = (rot @ Vector((0, 1, 0, 0))).xyz
    fwd = (rot @ Vector((0, 0, -1, 0))).xyz
    cam.matrix_world = Matrix.Translation(right * centre[0] + up * centre[1] - fwd * 60) @ rot
    cam_data.ortho_scale = max(width_m, height_m)
    cam_data.sensor_fit = 'HORIZONTAL' if width_m >= height_m else 'VERTICAL'
    cam_data.clip_end = 200
    return cam, (round(width_m * ppm), round(height_m * ppm))


def top_camera(scene, name, x0, x1, y0, y1, ppm):
    """Straight-down ortho camera over a ground rectangle (Blender x/y), for shadow sprites."""
    cam_data = bpy.data.cameras.new(name)
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new(name, cam_data)
    scene.collection.objects.link(cam)
    w, h = x1 - x0, y1 - y0
    cam.location = ((x0 + x1) / 2, (y0 + y1) / 2, 50)
    cam.rotation_euler = (0, 0, 0)
    cam_data.ortho_scale = max(w, h)
    cam_data.sensor_fit = 'HORIZONTAL' if w >= h else 'VERTICAL'
    cam_data.clip_end = 200
    return cam, (round(w * ppm), round(h * ppm))


def shadow_catcher(scene, size=12):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    plane = bpy.context.object
    plane.name = 'shadow_catcher'
    plane.is_shadow_catcher = True
    m = bpy.data.materials.new('catcher')
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.35, 0.3, 0.27, 1)
    plane.data.materials.append(m)
    return plane


# --- Motion capture retarget ---------------------------------------------------------------------

CMU_UNIT = 0.0564  # m per BVH unit (CMU: hips ≈ 16.9 units ≈ 0.95 m)


def import_bvh(name):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=os.path.join(BVH_DIR, name + '.bvh'), axis_forward='-Z', axis_up='Y',
                            global_scale=CMU_UNIT, rotate_mode='NATIVE', update_scene_fps=False, update_scene_duration=False)
    src = next(o for o in bpy.data.objects if o not in before)
    src.hide_render = True  # must stay visible in the view layer, or its animation isn't evaluated
    return src


def set_frame(f):
    """Frame with a sub-frame part, so cycles can be resampled to a whole number of sprite frames."""
    bpy.context.scene.frame_set(int(f), subframe=f - int(f))


# Mixamo → MPFB `cmu_mb` bone names (the CMU-named rig the players are built on).
MIXAMO = {
    'Hips': 'Hips', 'LowerBack': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Neck': 'Neck', 'Head': 'Head',
    **{f'{s}{b}': f'{s}{m}' for s in ('Left', 'Right') for b, m in (
        ('Shoulder', 'Shoulder'), ('Arm', 'Arm'), ('ForeArm', 'ForeArm'), ('Hand', 'Hand'),
        ('UpLeg', 'UpLeg'), ('Leg', 'Leg'), ('Foot', 'Foot'), ('ToeBase', 'ToeBase'))},
}


def import_fbx(path, prefix='mixamorig:'):
    """A Mixamo clip (FBX, no skin). Returns (armature, name map rig bone → source bone)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    src = next(o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE')
    for o in bpy.data.objects:
        if o not in before:
            o.hide_render = True
    return src, {k: prefix + v for k, v in MIXAMO.items() if prefix + v in src.pose.bones}


def hips_facing(src, frame, names=None):
    """Horizontal direction the chest faces at `frame` (Blender, z up)."""
    n = names or {}
    set_frame(frame)
    mw = src.matrix_world
    r = (mw @ src.pose.bones[n.get('RightUpLeg', 'RightUpLeg')].head) - (mw @ src.pose.bones[n.get('LeftUpLeg', 'LeftUpLeg')].head)
    r.z = 0
    r.normalize()
    return Vector((-r.y, r.x, 0)).normalized()  # up × right


def ground_velocity(src, names, frames, seconds_per_sample):
    """How fast and which way a clip travels over the ground (Blender x, y; m/s): the hips' drift
    minus the slide of the planted (lower) foot, so in-place cycles count as well."""
    hips = names['Hips']
    feet = [names[n] for n in ('LeftFoot', 'RightFoot')]
    track = []
    for f in frames:
        set_frame(f)
        mw = src.matrix_world
        track.append((mw @ src.pose.bones[hips].head, [mw @ src.pose.bones[n].head for n in feet]))
    slide = Vector((0, 0, 0))
    for k in range(len(frames) - 1):
        i = min((0, 1), key=lambda j: track[k][1][j].z + track[k + 1][1][j].z)
        slide += track[k + 1][1][i] - track[k][1][i]
    v = (track[-1][0] - track[0][0] - slide) / (seconds_per_sample * (len(frames) - 1))
    v.z = 0
    return v


def mirror_name(name):
    if name.startswith('Left'):
        return 'Right' + name[4:]
    if name.startswith('Right'):
        return 'Left' + name[5:]
    if len(name) > 1 and name[0] in 'LR' and name[1].isupper():
        return ('R' if name[0] == 'L' else 'L') + name[1:]
    return name


LEGS = ('HipJoint', 'UpLeg', 'Leg', 'Foot', 'ToeBase')


def is_leg(name):
    return any(name.endswith(k) for k in LEGS)


def retarget(src, rig, frames, out_start=1, face_from=None, face_to=Vector((0, 1, 0)), inplace='none', mirror=False,
             soften_legs=1.0, travel_scale=1.0, names=None, stand=None, seconds_per_sample=None):
    """
    Copies the source pose at each of `frames` onto `rig`, keyed at out_start, out_start + 1, …
    face_from: the clip's own 'towards the net' direction; the clip is turned so it points at face_to.
    inplace: 'none' keeps the hips' travel (relative to the first frame), 'linear' removes the
    average drift (loops), 'all' removes all horizontal travel.
    mirror: left/right swapped (a backhand from a forehand, a shuffle the other way).
    soften_legs < 1 eases the legs part way back to standing (a pitcher's stride → a server's step);
    travel_scale shrinks the hips' travel to match.
    names: rig bone → source bone (default: the same names, as in the CMU files); rig bones without
    a source keep their rest pose. stand: the source's standing hips height (crouches stay crouches;
    default: the clip's average height).
    Returns {'travel': hips travel first → last frame, 'velocity': ground speed (m/s, turned frame)}.
    The ground speed also counts in-place clips: it is how fast the planted foot slides back.
    """
    scene = bpy.context.scene
    names = names or {b.name: b.name for b in rig.data.bones if b.name in src.pose.bones}
    names = {k: v for k, v in names.items() if k in rig.pose.bones and v in src.pose.bones}
    yaw = 0.0
    if face_from is not None:
        yaw = math.atan2(face_to.y, face_to.x) - math.atan2(face_from.y, face_from.x)
    turn = Matrix.Rotation(yaw, 3, 'Z')
    src_rest = {b.name: b.matrix_local.to_3x3() for b in src.data.bones}
    dst_rest = {b.name: b.matrix_local.to_3x3() for b in rig.data.bones}
    for b in rig.pose.bones:
        b.rotation_mode = 'QUATERNION'
        b.rotation_quaternion = Quaternion()
        b.location = Vector()
    hips_src = names['Hips']
    feet = [names.get(n) for n in ('LeftFoot', 'RightFoot') if names.get(n)]
    hips_track = []
    feet_track = []
    for f in frames:
        set_frame(f)
        hips_track.append(turn @ (src.matrix_world @ src.pose.bones[hips_src].head))
        feet_track.append([turn @ (src.matrix_world @ src.pose.bones[n].head) for n in feet])
    p0, p1 = hips_track[0], hips_track[-1]
    drift = (p1 - p0) * travel_scale
    drift.z = 0
    flip = Matrix.Scale(-1, 3, Vector((1, 0, 0))) if mirror else Matrix.Identity(3)
    if mirror:
        drift.x = -drift.x
    rest_hips = rig.data.bones['Hips'].head_local.copy()
    src_h = stand or sum(h.z for h in hips_track) / len(hips_track)
    for k, f in enumerate(frames):
        set_frame(f)
        for name, sname in names.items():
            if mirror:
                sname = names.get(mirror_name(name), sname)
            sp = src.pose.bones[sname]
            s_world = turn @ src.matrix_world.to_3x3() @ sp.matrix.to_3x3()
            s_rest = turn @ src.matrix_world.to_3x3() @ src_rest[sname]
            s_world.normalize()
            s_rest.normalize()
            delta = s_world @ s_rest.inverted()
            if mirror:
                delta = flip @ delta @ flip
            if soften_legs < 1 and is_leg(name):
                delta = Quaternion().slerp(delta.to_quaternion(), soften_legs).to_matrix()
            # The turn applies to the whole body: the target's rest is turned with it.
            d_world = delta @ turn @ (rig.matrix_world.to_3x3() @ dst_rest[name])
            pb = rig.pose.bones[name]
            loc = pb.matrix.to_translation()
            pb.matrix = Matrix.Translation(loc) @ d_world.to_4x4()
            bpy.context.view_layer.update()
        # Hips: travel relative to the first frame (minus drift for loops), height scaled to the rig.
        h = (hips_track[k] - p0) * travel_scale
        if mirror:
            h.x = -h.x
        if inplace == 'linear':
            h = h - drift * (k / max(1, len(frames) - 1))
        if inplace == 'all':
            h.x = h.y = 0
        world = Vector((h.x, h.y, 0)) + Vector((0, 0, rest_hips.z * (hips_track[k].z / src_h)))
        pb = rig.pose.bones['Hips']
        m = pb.matrix.copy()
        m.translation = rig.matrix_world.inverted() @ world
        pb.matrix = m
        bpy.context.view_layer.update()
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=out_start + k)
        rig.pose.bones['Hips'].keyframe_insert('location', frame=out_start + k)
    travel = Vector((drift.x, drift.y, 0)) if inplace == 'none' else Vector((0, 0, 0))
    velocity = Vector((0, 0, 0))
    if seconds_per_sample and len(frames) > 1 and feet:
        # Ground speed = hips drift − how fast the planted (lower) foot moves.
        slide = Vector((0, 0, 0))
        for k in range(len(frames) - 1):
            i = min(range(len(feet)), key=lambda j: feet_track[k][j].z + feet_track[k + 1][j].z)
            d = feet_track[k + 1][i] - feet_track[k][i]
            slide += Vector((d.x, d.y, 0))
        if mirror:
            slide.x = -slide.x
        secs = seconds_per_sample * (len(frames) - 1)
        velocity = (Vector((drift.x, drift.y, 0)) - slide * travel_scale) / secs
    return {'travel': travel, 'velocity': velocity}


def ground_feet(rig, meshes, frames):
    """Shift each frame vertically so the lowest foot touches the ground (mocap floors differ)."""
    scene = bpy.context.scene
    deps = bpy.context.evaluated_depsgraph_get()
    for f in frames:
        scene.frame_set(f)
        lows = []
        for name in ('LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'):
            if name in rig.pose.bones:
                lows.append((rig.matrix_world @ rig.pose.bones[name].head).z)
        low = min(lows) - 0.035  # joint centre sits above the sole
        pb = rig.pose.bones['Hips']
        m = pb.matrix.copy()
        m.translation.z -= low
        pb.matrix = m
        bpy.context.view_layer.update()
        pb.keyframe_insert('location', frame=f)
