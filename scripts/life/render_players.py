# Tennis players for the booking map (row 95.4), rendered as flipbook sprites.
#   Blender -b --factory-startup --python scripts/life/render_players.py [-- preview] [variant ...]
# Realistic people from MakeHuman (CC0 skins, hair, clothes) through MPFB 2, animated with CMU motion
# capture: ready stance, side shuffles, and a racket swing and an overhead throw standing in for the
# forehand / backhand (the same swing mirrored, both hands on the racket) and the serve. Each clip is
# rendered for both facings (far player towards the camera, near player with their back to it), plus a
# straight-down shadow pass over a shadow catcher. Output: blender/characters/frames/players/… PNGs and
# players.json; scripts/life/pack-sprites.mjs packs them into the WebP atlases the page loads.
import bpy, json, math, os, sys
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, os.path.dirname(__file__))
import player_kit as kit
from player_kit import srgb
from lib_life import (OUT, ROOT, clear_scene, enable_mpfb, setup_world, setup_render, drone_camera, top_camera,
                      shadow_catcher, import_bvh, import_fbx, hips_facing, ground_velocity, retarget, ground_feet, set_frame)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS

SIDE = 'side' in ARGS  # debug: also render each previewed frame from the side, at eye level
FPS = 24  # sprite frame rate (row 132: was 15); slow idles override it per clip, the page cross-fades frames
PPM = 150 if PREVIEW else 120  # sprite pixels per metre (image plane; row 149: oversampled for the zoomed-in atlas, was 68)
SHADOW_PPM = 20
SHADOW_EVERY = 2  # a shadow for every other frame: a soft shape on the ground needs no 24 fps
# Body window in the image plane (metres): wide enough for a full swing, tall enough for the serve.
BODY = dict(x0=-1.45, x1=1.45, y0=-0.42, y1=1.78)
# Shadow window on the ground (Blender x, y): the sun is low in the south-east, shadows fall north-west.
SHADOW = dict(x0=-3.9, x1=1.3, y0=-1.3, y1=3.4)

# Row 149: proper tennis kit. Colours from the site palette (navy and white, clay red, finch olive);
# gear: cap / headband / visor, socks (top height, m), wristbands; c wears a pleated skirt over
# under-shorts. The racket frame comes in black with a coloured throat.
NAVY, WHITE, CLAY, FINCH, OFF = srgb('#1C2433'), srgb('#EDEBE6'), srgb('#9C441F'), srgb('#646544'), srgb('#D9D6CE')
VARIANTS = {
    'a': dict(gender=1.0, race='caucasian', skin='young_caucasian_male/young_caucasian_male.mhmat', hair='short02/short02.mhclo',
              clothes=[('namuhekam_male_polo_shirt/namuhekam_male_polo_shirt.mhclo', WHITE),
                       ('shoes06/shoes06.mhclo', None)],
              shorts=NAVY, cap=NAVY, socks=0.2, racket=CLAY,
              height=0.6, muscle=0.65, weight=0.45),
    'b': dict(gender=1.0, race='african', skin='young_african_male/young_african_male.mhmat', hair='short04/short04.mhclo',
              clothes=[('namuhekam_male_polo_shirt/namuhekam_male_polo_shirt.mhclo', CLAY),
                       ('shoes06/shoes06.mhclo', None)],
              shorts=WHITE, headband=WHITE, wristbands=WHITE, socks=0.17, racket=srgb('#D7C93A'),
              height=0.7, muscle=0.7, weight=0.4),
    'c': dict(gender=0.0, race='caucasian', skin='young_caucasian_female/young_caucasian_female.mhmat', hair='ponytail01/ponytail01.mhclo',
              clothes=[('toigo_keyhole_tank_top/toigo_keyhole_tank_top.mhclo', WHITE),
                       ('cortu_jeans_shorts/cortu_jeans_shorts.mhclo', FINCH),
                       ('shoes06/shoes06.mhclo', None)],
              visor=WHITE, skirt=FINCH, socks=0.11, wristbands=WHITE, wrist_sides=('Right',), racket=WHITE,
              height=0.45, muscle=0.55, weight=0.4),
}

# Footwork: Mixamo locomotion (downloaded by the user with their own account into the gitignored
# blender/assets/_downloads/mixamo/; only rendered sprites ship, as the Mixamo licence allows):
# an athletic ready stance, a split step made from it, goalkeeper side-steps for short adjustments,
# a jogging strafe for wide balls, a walk and a walk backwards for between points.
# Strokes: CMU motion capture (subject_trial, window at 120 fps): a racket swing and an overhead throw
# stand in for the forehand / backhand (mirrored) and the serve; there is no tennis in either library.
# `net`: the clip's own direction towards the net: 'hips' = the way the chest faces; for travelling
# clips it comes from the ground speed: 'lateral' square to it (chest side), 'travel' along it,
# 'reverse' against it (walking backwards).
MIXAMO = os.path.join(ROOT, 'blender', 'assets', '_downloads', 'mixamo')
CLIPS = {
    'ready': dict(fbx='ready_idle', loop=True, net='hips', window=(1.0, 1.5), fps=12),
    'split': dict(fbx='ready_idle', net='hips', window=(1.0, 1.5), take=0.4, hop=0.07),
    'sidestep_l': dict(fbx='sidestep_left', loop=True, net='lateral', soften=0.8),
    'sidestep_r': dict(fbx='sidestep_right', loop=True, net='lateral', soften=0.8),
    'strafe_l': dict(fbx='strafe_left', loop=True, net='lateral'),
    'strafe_r': dict(fbx='strafe_right', loop=True, net='lateral'),
    'walk': dict(fbx='walk', loop=True, net='travel', facings=('away', 'toward', 'left', 'right')),
    'walk_back': dict(fbx='walk_back', loop=True, net='reverse'),
    # Row 181 (motion): strokes at 40 fps (the racket is the fastest thing on the map: at 24 fps its
    # frames were too far apart for the page's cross-fade, which showed two rackets).
    'forehand': dict(bvh='124_07', f0=283, f1=409, net=(0, -1), contact=343, layer='forehand', fps=40),
    'backhand': dict(bvh='124_07', f0=283, f1=409, net=(0, -1), contact=343, mirror=True, fps=40),
    # The serve now starts from the set stance (frame 250: side-on, ball and racket together at the
    # waist, as a server stands after bouncing the ball) and eases into the wind-up over `pre` s,
    # instead of popping straight into a pitcher's leg kick.
    'serve': dict(bvh='124_01', f0=384, f1=500, net=(0, -1), contact=445, soften=0.5, travel=0.45, layer='serve', fps=40,
                  pre=dict(frame=250, seconds=0.4), hand=True,
                  body=dict(BODY, y1=2.12)),  # row 149: the racket at full reach stays in the frame
    # Row 181: bouncing the ball before the serve, in that same set stance (a held frame of the take)
    # with the ball hand pushing down and waiting for the ball; the page draws the ball from `hand`.
    'bounce': dict(bvh='124_01', hold=250, seconds=0.6, loop=True, net=(0, -1), soften=0.5, layer='bounce', hand=True),
}
# Blender +y = three −z = away from the camera; Blender x = three x.
FACINGS = {'away': Vector((0, 1, 0)), 'toward': Vector((0, -1, 0)), 'left': Vector((-1, 0, 0)), 'right': Vector((1, 0, 0))}

ONLY = [a for a in ARGS if a in VARIANTS]
ONLY_CLIPS = [a for a in ARGS if a in CLIPS]


def fcurves_of(obj):
    """F-curves of an object's action (Blender 4.4+ keeps them in the slot's channel bag)."""
    ad = obj.animation_data
    try:
        return ad.action.fcurves
    except AttributeError:
        from bpy_extras.anim_utils import action_get_channelbag_for_slot
        return action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves


def best_loop(src, names, f0, f1, lo, hi, fps):
    """Window of an idle take (lo..hi seconds) whose last pose matches its first: a seamless loop."""
    keys = [names[n] for n in ('LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'Head') if n in names]
    hips = names['Hips']
    sig = {}
    for f in range(int(f0), int(f1) + 1):
        set_frame(f)
        h = src.matrix_world @ src.pose.bones[hips].head
        sig[f] = [h.z] + [c for k in keys for c in (src.matrix_world @ src.pose.bones[k].head) - h]
    best = None
    for a in range(int(f0), int(f1)):
        for L in range(int(lo * fps), int(hi * fps) + 1):
            b = a + L
            if b > f1:
                break
            d = sum((x - y) ** 2 for x, y in zip(sig[a], sig[b]))
            if best is None or d < best[0]:
                best = (d, a, b)
    return best[1], best[2]


def clip_fps(c):
    return c.get('fps', FPS)


def load_clip(c):
    """Source armature, bone map, sample frames (source frame numbers), source fps, standing hips height."""
    FPS = clip_fps(c)
    if 'bvh' in c and c.get('hold'):
        src = import_bvh(c['bvh'])
        return src, None, [c['hold']] * max(2, round(c['seconds'] * FPS)), 120, None
    if 'bvh' in c:
        src = import_bvh(c['bvh'])
        step = 120 / FPS * c.get('speed', 1.0)
        n = max(2, int(round((c['f1'] - c['f0']) / step)) + (0 if c.get('loop') else 1))
        return src, None, [c['f0'] + i * step for i in range(n)], 120 / c.get('speed', 1.0), None
    src, names = import_fbx(os.path.join(MIXAMO, c['fbx'] + '.fbx'))
    act = src.animation_data.action
    f0, f1 = act.frame_range
    fps = 30
    stand = (src.matrix_world @ src.data.bones[names['Hips']].head_local).z
    if c.get('window'):
        f0, f1 = best_loop(src, names, f0, f1, *c['window'], fps)
    if c.get('take'):
        n = max(2, round(c['take'] * FPS))
        return src, names, [f0 + i * (fps / FPS) for i in range(n)], fps, stand
    # A cycle: its last frame repeats the first, so n samples cover it exactly.
    span = f1 - f0
    n = max(2, round(span / (fps / FPS)))
    return src, names, [f0 + i * span / n for i in range(n)], fps, stand


def make_player(spec):
    from mpfb.services.humanservice import HumanService
    info = HumanService._create_default_human_info_dict()
    info['name'] = 'player'
    info['phenotype'].update(gender=spec['gender'], age=0.5, muscle=spec['muscle'], weight=spec['weight'], height=spec['height'], proportions=0.75)
    info['phenotype']['race'] = {k: (1.0 if k == spec['race'] else 0.0) for k in ('asian', 'caucasian', 'african')}
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
                    kit.recloth(o, rgb)
    parts += kit_gear(body, rig, spec)
    return rig, parts


def kit_gear(body, rig, spec):
    gear = [kit.socks(body, rig, spec['socks'])]
    if spec.get('cap'):
        gear += kit.cap(body, rig, spec['cap'])
    if spec.get('visor'):
        gear += kit.cap(body, rig, spec['visor'], crown=False)
    if spec.get('headband'):
        gear.append(kit.headband(body, rig, spec['headband']))
    if spec.get('wristbands'):
        gear.append(kit.wristbands(body, rig, spec['wristbands'], spec.get('wrist_sides', ('Left', 'Right'))))
    if spec.get('shorts'):
        gear.append(kit.shorts(body, rig, spec['shorts']))
    if spec.get('skirt'):
        gear.append(kit.skirt(body, rig, spec['skirt']))
    return gear


def racket(rig, spec):
    return kit.racket(rig, accent=spec.get('racket'))


# --- Stroke corrections (row 132) ---------------------------------------------------------------
# There is no tennis in the free libraries: the forehand is a baseball swing (side-on, swinging from
# the right shoulder across to a finish over the left one, which matches a closed-stance forehand),
# the serve an overhand pitch. What gives them away is the free arm: the batter's left hand stays on
# the bat, the pitcher's glove arm points at the target. These layers re-aim the free arm the way a
# tennis player uses it, over the mocap frame by frame: on the forehand it stretches out towards the
# ball during the unit turn, then folds in across the body as the racket comes through, as in the
# footage of a modern forehand; on the serve it lifts the ball high (the trophy position) and drops
# in to the chest, and the hitting arm reaches up straight at contact.

def body_frame(rig, net):
    """World axes of the player's chest this frame: forward (chest), right, up, and the net."""
    mw = rig.matrix_world
    pb = rig.pose.bones
    up = ((mw @ pb['Neck'].head) - (mw @ pb['Spine'].head)).normalized()
    right = (mw @ pb['RightArm'].head) - (mw @ pb['LeftArm'].head)
    right = (right - up * right.dot(up)).normalized()
    fwd = up.cross(right).normalized()
    return fwd, right, up, net


def aim(rig, name, direction, w):
    """Turn bone `name` (about its head) so it points along `direction` (world), by weight w."""
    if w <= 1e-3:
        return
    pb = rig.pose.bones[name]
    mw = rig.matrix_world
    cur = ((mw @ pb.tail) - (mw @ pb.head)).normalized()
    q = Quaternion().slerp(cur.rotation_difference(direction.normalized()), min(1.0, w))
    A = mw.to_3x3().normalized()
    R = A.inverted() @ q.to_matrix() @ A
    m = pb.matrix.copy()
    pb.matrix = Matrix.Translation(m.to_translation()) @ (R @ m.to_3x3()).to_4x4()
    bpy.context.view_layer.update()


def ramp(u, a, b):
    """0 before a, 1 after b, smooth between."""
    if b <= a:
        return 1.0 if u >= a else 0.0
    x = max(0.0, min(1.0, (u - a) / (b - a)))
    return x * x * (3 - 2 * x)


def lerp_dir(a, b, t):
    return (a * (1 - t) + b * t).normalized()


def relayer(rig, keyed, fn, bones):
    """Runs fn(u, frame axes) on every keyed frame and re-keys the bones it moved."""
    scene = bpy.context.scene
    n = len(keyed)
    for k, f in enumerate(keyed):
        scene.frame_set(f)
        fn(k / max(1, n - 1))
        for b in bones:
            rig.pose.bones[b].keyframe_insert('rotation_quaternion', frame=f)


def forehand_layer(rig, keyed, to, c):
    contact = (c['contact'] - c['f0']) / (c['f1'] - c['f0'])
    net = Vector((to.x, to.y, 0)).normalized()
    down = Vector((0, 0, -1))

    def fn(u):
        fwd, right, up, _ = body_frame(rig, net)
        reach = (net * 0.85 + fwd * 0.25 + down * 0.3).normalized()  # pointing at the ball
        tuck_upper = (-right * 0.55 + down * 0.75 + fwd * 0.25).normalized()  # elbow in by the ribs
        tuck_fore = (right * 0.7 + fwd * 0.55 + up * 0.15).normalized()  # forearm across the belly
        ready = (fwd * 0.55 + down * 0.8 + right * 0.1).normalized()
        t1 = ramp(u, contact - 0.18, contact + 0.06)  # reach → tuck as the racket comes through
        t2 = ramp(u, 0.82, 1.0)  # back towards the ready stance
        upper = lerp_dir(lerp_dir(reach, tuck_upper, t1), ready, t2)
        fore = lerp_dir(lerp_dir(reach, tuck_fore, t1), ready, t2)
        w = ramp(u, 0.0, 0.12)
        aim(rig, 'LeftArm', upper, w)
        aim(rig, 'LeftForeArm', fore, w)
    relayer(rig, keyed, fn, ('LeftArm', 'LeftForeArm'))


def serve_layer(rig, keyed, to, c):
    contact = (c['contact'] - c['f0']) / (c['f1'] - c['f0'])
    net = Vector((to.x, to.y, 0)).normalized()
    down = Vector((0, 0, -1))
    upw = Vector((0, 0, 1))

    def fn(u):
        fwd, right, up, _ = body_frame(rig, net)
        toss = (upw * 0.95 + net * 0.3).normalized()
        tuck_upper = (down * 0.8 + fwd * 0.35 - right * 0.2).normalized()
        tuck_fore = (right * 0.75 + fwd * 0.5 + upw * 0.2).normalized()
        t_up = ramp(u, 0.08, contact - 0.14)
        t_in = ramp(u, contact - 0.06, contact + 0.1)
        rest = (fwd * 0.4 + down * 0.9).normalized()
        upper = lerp_dir(lerp_dir(rest, toss, t_up), tuck_upper, t_in)
        fore = lerp_dir(lerp_dir(rest, toss, t_up), tuck_fore, t_in)
        aim(rig, 'LeftArm', upper, ramp(u, 0.0, 0.08))
        aim(rig, 'LeftForeArm', fore, ramp(u, 0.0, 0.08))
        # The hitting arm straight up at contact, reaching for the ball.
        reach = (upw * 0.92 + net * 0.3 + right * 0.08).normalized()
        w = math.exp(-((u - contact) / 0.07) ** 2) * 0.8
        aim(rig, 'RightArm', reach, w)
        aim(rig, 'RightForeArm', reach, w)
    relayer(rig, keyed, fn, ('LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'))


def bounce_layer(rig, keyed, to, c):
    """Row 181: the ball hand pushes the ball down (u ≈ 0.18), comes back up and waits palm down in
    front of the hip, and takes the ball back into the set stance at the end of the cycle."""
    net = Vector((to.x, to.y, 0)).normalized()
    down = Vector((0, 0, -1))

    def fn(u):
        fwd, right, up, _ = body_frame(rig, net)
        push = math.exp(-((u - 0.18) / 0.1) ** 2)
        wait_u = (fwd * 0.75 + net * 0.3 + down * 0.65).normalized()  # elbow forward of the hip
        wait_f = (fwd * 0.85 + net * 0.35 + down * 0.25).normalized()  # forearm level, palm over the ball
        push_f = (fwd * 0.3 + net * 0.15 + down * 0.95).normalized()  # snapped down: the push
        w = ramp(u, 0.0, 0.1) * (1 - ramp(u, 0.8, 1.0))
        aim(rig, 'LeftArm', wait_u, w * 0.8)
        aim(rig, 'LeftForeArm', lerp_dir(wait_f, push_f, push), w)
    relayer(rig, keyed, fn, ('LeftArm', 'LeftForeArm'))


LAYERS = {'forehand': forehand_layer, 'serve': serve_layer, 'bounce': bounce_layer}


def main():
    enable_mpfb()
    scene = bpy.context.scene
    meta_path = os.path.join(OUT, 'players', 'players.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) and not PREVIEW else {}
    meta.update({'fps': FPS, 'ppm': PPM, 'body': BODY, 'shadow': SHADOW, 'shadowPpm': SHADOW_PPM})
    meta.setdefault('variants', {})
    meta.setdefault('clips', {})
    for gone in [k for k in meta['clips'] if k not in CLIPS]:
        del meta['clips'][gone]
    for vid, spec in VARIANTS.items():
        if ONLY and vid not in ONLY:
            continue
        clear_scene()
        setup_render(scene, samples=24 if PREVIEW else 48)
        scene.cycles.filter_width = 1.1  # frames are downsampled when packed (row 149): a near-box filter stays crisp
        scene.render.use_motion_blur = True  # the racket smears a little, like on video
        scene.render.motion_blur_shutter = 0.35  # at 24 fps a shorter shutter keeps the body sharp
        setup_world(scene)
        rig, parts = make_player(spec)
        rkt = racket(rig, spec)
        catcher = shadow_catcher(scene)
        cams = {}

        def body_cam(win):
            key = tuple(sorted(win.items()))
            if key not in cams:
                cams[key] = drone_camera(scene, f'cam_body{len(cams)}', win['x1'] - win['x0'], win['y1'] - win['y0'], PPM,
                                         ((win['x0'] + win['x1']) / 2, (win['y0'] + win['y1']) / 2))
            return cams[key]
        cam_shadow, res_shadow = top_camera(scene, 'cam_shadow', SHADOW['x0'], SHADOW['x1'], SHADOW['y0'], SHADOW['y1'], SHADOW_PPM)
        visible = parts + [rkt]
        cam_side = None
        if SIDE:
            cd = bpy.data.cameras.new('side'); cd.type = 'ORTHO'; cd.ortho_scale = 3.2
            cam_side = bpy.data.objects.new('side', cd); scene.collection.objects.link(cam_side)
            cam_side.location = (6, 0, 1.0); cam_side.rotation_euler = (math.radians(90), 0, math.radians(90))
        frame_no = 1
        for cid, c in CLIPS.items():
            if ONLY_CLIPS and cid not in ONLY_CLIPS:
                continue
            src, names, frames, src_fps, stand = load_clip(c)
            if c['net'] == 'hips':
                net = hips_facing(src, frames[len(frames) // 2], names)
            elif c['net'] in ('lateral', 'travel', 'reverse'):
                v = ground_velocity(src, names, frames, (frames[1] - frames[0]) / src_fps).normalized()
                chest = hips_facing(src, frames[len(frames) // 2], names)
                if c['net'] == 'lateral':
                    net = Vector((-v.y, v.x, 0))
                    net = net if net.dot(chest) > 0 else -net
                else:
                    net = v if c['net'] == 'travel' else -v
            else:
                net = Vector((*c['net'], 0))
            facings = c.get('facings', ('away', 'toward'))
            for fid in facings:
                to = FACINGS[fid]
                rig.animation_data_clear()
                start = frame_no
                kw = dict(face_from=net, face_to=to, mirror=c.get('mirror', False), soften_legs=c.get('soften', 1.0),
                          travel_scale=c.get('travel', 1.0), names=names, stand=stand)
                pre = round(c['pre']['seconds'] * clip_fps(c)) if c.get('pre') else 0
                if pre:
                    # Row 181: the set stance keyed `pre` frames ahead of the take; the keys between
                    # are left to Blender's (eased) interpolation, so the stance flows into the wind-up.
                    retarget(src, rig, [c['pre']['frame']], out_start=start, **kw)
                res = retarget(src, rig, frames, out_start=start + pre, inplace='linear' if c.get('loop') else 'none',
                               seconds_per_sample=(frames[1] - frames[0]) / src_fps, **kw)
                if pre:
                    # Interpolate the short way round: a stance key on the far hemisphere from the
                    # take's first key would spin the bone through the long arc.
                    for fc_bone in rig.pose.bones:
                        path = f'pose.bones["{fc_bone.name}"].rotation_quaternion'
                        fcs = [fcurves_of(rig).find(path, index=i) for i in range(4)]
                        if None in fcs:
                            continue
                        a = [fc.evaluate(start) for fc in fcs]
                        b = [fc.evaluate(start + pre) for fc in fcs]
                        if sum(x * y for x, y in zip(a, b)) < 0:
                            for fc in fcs:
                                for kp in fc.keyframe_points:
                                    if abs(kp.co.x - start) < 0.5:
                                        kp.co.y = -kp.co.y
                                        kp.handle_left.y = -kp.handle_left.y
                                        kp.handle_right.y = -kp.handle_right.y
                                fc.update()
                main = list(range(start + pre, start + pre + len(frames)))
                if c.get('layer'):
                    LAYERS[c['layer']](rig, main, to, c)
                keyed = list(range(start, start + pre + len(frames)))
                ground_feet(rig, visible, keyed)
                if c.get('hop'):
                    # Split step: a small two-footed hop, landing back in the stance.
                    for k, f in enumerate(keyed):
                        scene.frame_set(f)
                        pb = rig.pose.bones['Hips']
                        m = pb.matrix.copy()
                        m.translation.z += c['hop'] * math.sin(math.pi * k / (len(keyed) - 1))
                        pb.matrix = m
                        bpy.context.view_layer.update()
                        pb.keyframe_insert('location', frame=f)
                frame_no += len(keyed)
                # Row 181: strokes play at 40 fps; the blur keeps the 24 fps exposure time in seconds.
                scene.render.motion_blur_shutter = 0.35 * clip_fps(c) / 24
                hand = []
                if c.get('hand'):
                    # The ball hand per frame in the player's own frame: [to their right, towards the net, up] (m).
                    rgt = Vector((to.y, -to.x, 0))
                    for f in keyed:
                        scene.frame_set(f)
                        hp = rig.matrix_world @ rig.pose.bones['LeftHand'].tail
                        hand.append([round(hp.dot(rgt), 3), round(hp.dot(to), 3), round(hp.z, 3)])
                out_dir = os.path.join(OUT, 'players', vid, f'{cid}_{fid}')
                if os.path.isdir(out_dir):
                    for old in os.listdir(out_dir):
                        os.remove(os.path.join(out_dir, old))
                os.makedirs(out_dir, exist_ok=True)
                todo = keyed if not PREVIEW else keyed[:: max(1, len(keyed) // 6)]
                for i, f in enumerate(keyed):
                    if f not in todo:
                        continue
                    scene.frame_set(f)
                    # body from the drone, without the catcher
                    catcher.hide_render = True
                    for o in visible:
                        o.visible_camera = True
                    scene.camera, (scene.render.resolution_x, scene.render.resolution_y) = body_cam(c.get('body', BODY))
                    scene.render.filepath = os.path.join(out_dir, f'{i:02d}.png')
                    bpy.ops.render.render(write_still=True)
                    if cam_side:
                        scene.camera = cam_side
                        scene.render.resolution_x, scene.render.resolution_y = 320, 320
                        scene.render.filepath = os.path.join(out_dir, f'side{i:02d}.png')
                        bpy.ops.render.render(write_still=True)
                    if PREVIEW or i % SHADOW_EVERY:
                        continue
                    # shadow straight down: the player casts but isn't seen
                    catcher.hide_render = False
                    for o in visible:
                        o.visible_camera = False
                    scene.camera = cam_shadow
                    scene.render.resolution_x, scene.render.resolution_y = res_shadow
                    scene.render.filepath = os.path.join(out_dir, f's{i:02d}.png')
                    bpy.ops.render.render(write_still=True)
                    for o in visible:
                        o.visible_camera = True
                contact = None
                if c.get('contact'):
                    contact = pre + round((c['contact'] - c['f0']) / (120 / clip_fps(c) * c.get('speed', 1.0)))
                # In the player's own frame: [to their right, towards the net] (m, m/s).
                right = Vector((to.y, -to.x, 0))
                travel, v = res['travel'], res['velocity']
                meta['clips'][cid] = dict(frames=len(keyed), fps=clip_fps(c), loop=bool(c.get('loop')), contact=contact, facings=list(facings),
                                          **({'body': c['body']} if c.get('body') else {}),
                                          **({'hand': hand} if hand else {}),
                                          travel=[round(travel.dot(right), 3), round(travel.dot(to), 3)],
                                          pace=round(v.dot(right), 3), speed=round(v.dot(to), 3))
                print('clip', vid, cid, fid, len(frames), 'travel', travel, 'velocity', v)
            bpy.data.objects.remove(src, do_unlink=True)
        meta['variants'][vid] = dict(spec=spec['skin'].split('/')[0])
        if PREVIEW:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'player_{vid}_preview.blend'))
    if not PREVIEW:
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=1)


if __name__ == '__main__':
    main()
