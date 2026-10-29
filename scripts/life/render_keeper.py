# The clay groundskeeper for the booking map (round 7), rendered as flipbook sprites like the players.
#   Blender -b --factory-startup --python scripts/life/render_keeper.py [-- preview]
# A MakeHuman man (CC0 assets through MPFB 2) in plain work overalls (the MakeHuman worksuit, its blue
# turned to a faded olive, no prints), a cap and work shoes. One clip: a slow walk (Mixamo locomotion,
# resampled slower) with the right arm held back and down on the rope of the drag brush and the
# body leaning a little into the pull. Eight headings like the cat (5..7 are mirrors of 3..1 on the
# page), plus a straight-down shadow pass every other frame. The brush, its rope and the fresh drag
# lines are real geometry on the page (life/keeper.js), so they can trail and turn freely.
# A second clip, 'walk', is the same man at an ordinary pace with free arms (to the court and away).
# Output: blender/characters/frames/keeper/… and keeper.json; pack with
#   node scripts/life/pack-sprites.mjs keeper
import bpy, json, math, os, shutil, sys
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, os.path.dirname(__file__))
import player_kit as kit
from player_kit import srgb
from lib_life import (OUT, ROOT, clear_scene, enable_mpfb, setup_world, setup_render, drone_camera, top_camera,
                      shadow_catcher, import_fbx, hips_facing, ground_velocity, retarget, ground_feet, set_frame)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS
FPS = 24
PPM = 120 if PREVIEW else 100
SHADOW_PPM = 20
SHADOW_EVERY = 2
HEADINGS = 8
PULL = 0.78  # the walk resampled slower: a man leaning into a drag mat
BODY = dict(x0=-0.8, x1=0.8, y0=-0.4, y1=1.72)
SHADOW = dict(x0=-3.6, x1=1.0, y0=-1.0, y1=3.2)
MIXAMO = os.path.join(ROOT, 'blender', 'assets', '_downloads', 'mixamo')
DIR = os.path.join(OUT, 'keeper')


def make_keeper():
    from mpfb.services.humanservice import HumanService
    info = HumanService._create_default_human_info_dict()
    info['name'] = 'keeper'
    info['phenotype'].update(gender=1.0, age=0.62, muscle=0.6, weight=0.62, height=0.55, proportions=0.6)
    info['phenotype']['race'] = {'asian': 0.0, 'caucasian': 0.45, 'african': 0.55}
    info['rig'] = 'cmu_mb'
    info['eyes'] = 'high-poly/high-poly.mhclo'
    info['eyebrows'] = 'eyebrow001/eyebrow001.mhclo'
    info['eyelashes'] = 'eyelashes01/eyelashes01.mhclo'
    info['hair'] = 'short02/short02.mhclo'
    info['skin_mhmat'] = 'middleage_african_male/middleage_african_male.mhmat'
    info['skin_material_type'] = 'ENHANCED'
    info['clothes'] = ['male_worksuit01/male_worksuit01.mhclo', 'shoes06/shoes06.mhclo']
    s = HumanService.get_default_deserialization_settings()
    s['subdiv_levels'] = 0
    s['scale'] = 0.1
    before = set(bpy.data.objects)
    body = HumanService.deserialize_from_dict(info, s)
    rig = body.parent
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in parts:
        n = o.name.lower()
        if 'shoes' in n:
            kit.shoes(o, rig, upper=srgb('#3A342C'), sole=srgb('#22201C'))
        elif 'worksuit' in n:
            fade(o)
    parts += kit.cap(body, rig, srgb('#B5AB92'))
    return rig, parts


def fade(obj):
    """Worksuit: its blue bib overalls turned to a faded olive drab, the white tee kept (no prints)."""
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf or not bsdf.inputs['Base Color'].is_linked:
            continue
        src = bsdf.inputs['Base Color'].links[0].from_socket
        hsv = nt.nodes.new('ShaderNodeHueSaturation')
        hsv.inputs['Hue'].default_value = 0.5 - 0.38  # blue (≈0.6) → olive (≈0.22)
        hsv.inputs['Saturation'].default_value = 0.62
        hsv.inputs['Value'].default_value = 0.26
        nt.links.new(src, hsv.inputs['Color'])
        nt.links.new(hsv.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.88
        if 'Sheen Weight' in bsdf.inputs:
            bsdf.inputs['Sheen Weight'].default_value = 0.4


def ramp(u, a, b):
    x = max(0.0, min(1.0, (u - a) / (b - a)))
    return x * x * (3 - 2 * x)


def aim(rig, name, direction, w):
    pb = rig.pose.bones[name]
    mw = rig.matrix_world
    cur = ((mw @ pb.tail) - (mw @ pb.head)).normalized()
    q = Quaternion().slerp(cur.rotation_difference(direction.normalized()), min(1.0, w))
    A = mw.to_3x3().normalized()
    R = A.inverted() @ q.to_matrix() @ A
    m = pb.matrix.copy()
    pb.matrix = Matrix.Translation(m.to_translation()) @ (R @ m.to_3x3()).to_4x4()
    bpy.context.view_layer.update()


def stride(rig):
    """−1..1: which leg is ahead (right ahead = +1), for an arm swing in step with the feet."""
    mw = rig.matrix_world
    pb = rig.pose.bones
    hips = mw @ pb['Hips'].head
    fwd = rig.get('fwd_vec')
    d = (mw @ pb['RightFoot'].head) - (mw @ pb['LeftFoot'].head)
    return max(-1.0, min(1.0, d.dot(Vector(fwd)) / 0.55))


def arm_layer(rig, keyed, to, pull):
    """
    pull: right hand back and down on the rope, the chest leaning in a little, the free left arm
    swinging low with the steps. walk: both arms hanging and swinging a little (the source walk holds
    them high and across the body, which reads as waving from the drone).
    """
    fwd = Vector((to.x, to.y, 0)).normalized()
    rig['fwd_vec'] = tuple(fwd)
    right = Vector((fwd.y, -fwd.x, 0))
    down = Vector((0, 0, -1))
    for f in keyed:
        bpy.context.scene.frame_set(f)
        s = stride(rig)
        bones = ['LeftArm', 'LeftForeArm']
        if pull:
            aim(rig, 'Spine1', (Vector((0, 0, 1)) + fwd * 0.16).normalized(), 0.7)
            aim(rig, 'RightArm', (down * 0.9 - fwd * 0.42 + right * 0.16).normalized(), 1.0)
            aim(rig, 'RightForeArm', (down * 0.62 - fwd * 0.72 + right * 0.06).normalized(), 1.0)
            bones += ['Spine1', 'RightArm', 'RightForeArm']
        else:
            aim(rig, 'RightArm', (down - fwd * 0.3 * s + right * 0.1).normalized(), 0.85)
            aim(rig, 'RightForeArm', (down * 0.85 - fwd * 0.3 * s + fwd * 0.35).normalized(), 0.85)
            bones += ['RightArm', 'RightForeArm']
        aim(rig, 'LeftArm', (down + fwd * (0.3 if not pull else 0.22) * s - right * 0.1).normalized(), 0.85)
        aim(rig, 'LeftForeArm', (down * 0.85 + fwd * (0.3 if not pull else 0.22) * s + fwd * 0.35).normalized(), 0.85)
        for b in bones:
            rig.pose.bones[b].keyframe_insert('rotation_quaternion', frame=f)


def main():
    enable_mpfb()
    scene = bpy.context.scene
    clear_scene()
    setup_render(scene, samples=24 if PREVIEW else 40)
    scene.cycles.filter_width = 1.1
    scene.render.use_motion_blur = True
    scene.render.motion_blur_shutter = 0.35
    scene.render.fps = FPS
    setup_world(scene)
    rig, parts = make_keeper()
    catcher = shadow_catcher(scene)
    cam_body, res_body = drone_camera(scene, 'cam_body', BODY['x1'] - BODY['x0'], BODY['y1'] - BODY['y0'], PPM,
                                      ((BODY['x0'] + BODY['x1']) / 2, (BODY['y0'] + BODY['y1']) / 2))
    cam_shadow, res_shadow = top_camera(scene, 'cam_shadow', SHADOW['x0'], SHADOW['x1'], SHADOW['y0'], SHADOW['y1'], SHADOW_PPM)

    src, names = import_fbx(os.path.join(MIXAMO, 'walk.fbx'))
    f0, f1 = src.animation_data.action.frame_range
    span = f1 - f0
    stand = (src.matrix_world @ src.data.bones[names['Hips']].head_local).z
    meta = {'fps': FPS, 'ppm': PPM, 'body': BODY, 'shadow': SHADOW, 'shadowPpm': SHADOW_PPM, 'shadowEvery': SHADOW_EVERY,
            'headings': HEADINGS, 'clips': {}, 'speed': {}}
    os.makedirs(DIR, exist_ok=True)
    frame_no = 1
    hand = Vector((0, 0, 0))
    for cid, pace in (('pull', PULL), ('walk', 1.0)):
        n = max(2, round(span / (30 / FPS) / pace))
        frames = [f0 + i * span / n for i in range(n)]
        sps = (frames[1] - frames[0]) / 30 / pace  # seconds per sprite frame, in the source's own time
        v = ground_velocity(src, names, frames, sps)
        net = Vector((v.x, v.y, 0)).normalized()
        for h in range(HEADINGS if not PREVIEW else 1):
            a = h * 2 * math.pi / HEADINGS
            to = Vector((math.sin(a), math.cos(a), 0))  # clockwise from "away from the camera" (Blender +y)
            rig.animation_data_clear()
            start = frame_no
            res = retarget(src, rig, frames, out_start=start, face_from=net, face_to=to, inplace='linear',
                           names=names, stand=stand, seconds_per_sample=sps)
            keyed = list(range(start, start + len(frames)))
            arm_layer(rig, keyed, to, cid == 'pull')
            ground_feet(rig, parts, keyed)
            frame_no += len(frames)
            if h == 0:
                meta['speed'][cid] = round(res['velocity'].length, 3)
                if cid == 'pull':
                    for f in keyed:
                        scene.frame_set(f)
                        hand += rig.matrix_world @ rig.pose.bones['RightHand'].head
                    hand /= len(keyed)
            out_dir = os.path.join(DIR, f'{cid}_{h}')
            os.makedirs(out_dir, exist_ok=True)
            for old in os.listdir(out_dir):
                os.remove(os.path.join(out_dir, old))
            # Headings 5..7 show the mirror images of 3..1 on the page: only their shadows (the sun is
            # off to one side) are rendered; the body files are copies the packer skips.
            twin = os.path.join(DIR, f'{cid}_{HEADINGS - h}') if h > HEADINGS // 2 else None
            for i, f in enumerate(keyed):
                if PREVIEW and i % 4:
                    continue
                scene.frame_set(f)
                body_file = os.path.join(out_dir, f'{i:02d}.png')
                if twin:
                    shutil.copy(os.path.join(twin, f'{i:02d}.png'), body_file)
                else:
                    catcher.hide_render = True
                    for o in parts:
                        o.visible_camera = True
                    scene.camera = cam_body
                    scene.render.resolution_x, scene.render.resolution_y = res_body
                    scene.render.filepath = body_file
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
            print('clip', cid, 'heading', h, len(keyed), 'frames', flush=True)
        meta['clips'][cid] = dict(frames=len(frames), loop=True, fps=FPS)
    # Where the rope leaves the hand, in the keeper's own frame (heading 0: forward = +y): metres
    # [to his right, forward, up]; the page ties the brush rope there.
    meta['hand'] = [round(hand.x, 3), round(hand.y, 3), round(hand.z, 3)]
    if PREVIEW:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DIR, 'keeper_preview.blend'))
    else:
        with open(os.path.join(DIR, 'keeper.json'), 'w') as f:
            json.dump(meta, f, indent=1)
    print('done', meta['speed'], meta['hand'], flush=True)


main()
