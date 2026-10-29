# Death for the Halloween map (round 10, row 65): a Grim Reaper rendered as flipbook sprites, the
# keeper's walk in his place (same clip, same eight headings, same frame count as render_keeper.py).
#   Blender -b --factory-startup --python scripts/life/render_death.py [-- preview]
# A thin MakeHuman man (CC0 through MPFB 2) in bone: only his skull and hands show. Over him a heavy
# black robe built here (a lofted tube with fold ridges, a torn zigzag hem and wide hanging sleeves,
# skinned to the rig with automatic weights so it follows the stride), a pointed hood with darkness
# inside, a skull deep in it with two pale eyes, and a real scythe (ash handle, curved steel blade)
# carried over the shoulder by the right hand. Eight headings (5..7 mirror 3..1 on the page), a
# straight-down shadow pass every other frame. Output: blender/characters/frames/death/… and
# death.json; pack with node scripts/life/pack-sprites.mjs death
import bpy, bmesh, json, math, os, random, shutil, sys
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, os.path.dirname(__file__))
import player_kit as kit
from player_kit import srgb
from lib_life import (OUT, ROOT, clear_scene, enable_mpfb, setup_world, setup_render, drone_camera, top_camera,
                      shadow_catcher, import_fbx, ground_velocity, retarget, ground_feet)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS
FPS = 24
PPM = 120 if PREVIEW else 100
SHADOW_PPM = 20
SHADOW_EVERY = 2
HEADINGS = 8
BODY = dict(x0=-1.0, x1=1.0, y0=-0.4, y1=2.3)
SHADOW = dict(x0=-3.6, x1=1.0, y0=-1.0, y1=3.2)
MIXAMO = os.path.join(ROOT, 'blender', 'assets', '_downloads', 'mixamo')
DIR = os.path.join(OUT, 'death')
BONE = (0.80, 0.77, 0.69)


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



def mat(name, rgb, rough=0.6, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def make_body():
    from mpfb.services.humanservice import HumanService
    info = HumanService._create_default_human_info_dict()
    info['name'] = 'death'
    info['phenotype'].update(gender=1.0, age=0.55, muscle=0.0, weight=0.05, height=0.8, proportions=0.5)
    info['rig'] = 'cmu_mb'
    info['eyes'] = ''
    info['eyebrows'] = ''
    info['eyelashes'] = ''
    info['hair'] = ''
    info['skin_material_type'] = 'ENHANCED'
    info['clothes'] = []
    s = HumanService.get_default_deserialization_settings()
    s['subdiv_levels'] = 0
    s['scale'] = 0.1
    before = set(bpy.data.objects)
    body = HumanService.deserialize_from_dict(info, s)
    rig = body.parent
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bone = mat('bone', BONE, 0.55)
    black = mat('under', (0.004, 0.004, 0.005), 0.9)
    HAND = ('Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky', 'Finger')
    for o in parts:
        o.data.materials.clear()
        o.data.materials.append(black)
        o.data.materials.append(bone)
        names = {g.index: g.name for g in o.vertex_groups}
        for p in o.data.polygons:
            hand = 0
            for vi in p.vertices:
                gs = o.data.vertices[vi].groups
                if gs and any(k in names[max(gs, key=lambda g: g.weight).group] for k in HAND):
                    hand += 1
            p.material_index = 1 if hand >= 2 else 0
    return rig, body, parts


def pt(rig, name, end='head'):
    b = rig.data.bones[name]
    return rig.matrix_world @ (b.head_local if end == 'head' else b.tail_local)


def make_mesh(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    return o


def robe(rig, material):
    """The robe: a tube from the neck to a torn hem, heavy fold ridges, plus two wide sleeves."""
    rnd = random.Random(7)
    z_neck = pt(rig, 'Neck').z
    z_sh = pt(rig, 'LeftArm').z
    z_hips = pt(rig, 'Hips').z
    shoulder = abs(pt(rig, 'LeftArm').x)
    N, R = 64, 34
    verts, faces = [], []
    top, hem = z_neck + 0.05, 0.0
    for k in range(R + 1):
        t = k / R
        z = top - (top - hem) * t
        # half-widths: neck, shoulders, waist, then a long flare to the ground
        if z > z_sh:
            w = 0.12 + (shoulder + 0.07 - 0.12) * ramp(z, top, z_sh)
        elif z > z_hips:
            w = (shoulder + 0.07) + (0.25 - shoulder - 0.07) * ramp(z, z_sh, z_hips)
        else:
            w = 0.25 + 0.34 * ramp(z, z_hips, 0.0)
        d = 0.92 * w + 0.04  # depth: a little less than the width
        for i in range(N):
            a = i / N * 2 * math.pi
            fold = (0.07 * math.sin(7 * a + 2.6 * t) + 0.045 * math.sin(13 * a - 5 * t + 1.1) + 0.03 * math.sin(3 * a + 6 * t)) * ramp(t, 0.15, 0.9)
            zz = z
            if k == R:  # torn hem: zigzag with ragged teeth
                tooth = abs(((i * 3) % 8) - 4) / 4
                zz = 0.035 + 0.13 * tooth ** 1.2 + rnd.random() * 0.05
            verts.append((math.cos(a) * w * (1 + fold), math.sin(a) * d * (1 + fold) - 0.02, zz))
    for k in range(R):
        for i in range(N):
            a, b = k * N + i, k * N + (i + 1) % N
            faces.append((a, b, b + N, a + N))
    parts = [make_mesh('robe', verts, faces, material)]
    parts[0]['weights'] = [z_neck, z_sh, z_hips, N]
    # Sleeves: wide, hanging, open at the cuff (the bony hand comes out of it).
    for side in ('Left', 'Right'):
        p0, p1, p2 = pt(rig, f'{side}Arm'), pt(rig, f'{side}ForeArm'), pt(rig, f'{side}Hand')
        axis = [p0 - Vector((0, 0, 0)), p1, p2]
        sv, sf = [], []
        M, S = 10, 18
        path = [p0.lerp(p1, i / 4) for i in range(4)] + [p1.lerp(p2, i / 5) for i in range(6)]
        for k, c in enumerate(path):
            t = k / (len(path) - 1)
            r = 0.085 + 0.1 * t ** 1.4  # the sleeve widens towards the cuff
            u = (path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]).normalized()
            e1 = u.cross(Vector((0, 1, 0))).normalized()
            e2 = u.cross(e1).normalized()
            for i in range(S):
                a = i / S * 2 * math.pi
                bump = 1 + 0.12 * math.sin(5 * a + 3 * t) * t
                v = c + (e1 * math.cos(a) + e2 * math.sin(a)) * r * bump
                if k == len(path) - 1:
                    v -= u * (0.05 + 0.07 * abs(math.sin(a * 3)))  # ragged cuff
                sv.append(v)
        for k in range(len(path) - 1):
            for i in range(S):
                a, b = k * S + i, k * S + (i + 1) % S
                sf.append((a, b, b + S, a + S))
        parts.append(make_mesh(f'sleeve_{side}', sv, sf, material))
    return parts


def rigid(obj, rig, bone):
    """Follows one bone exactly (weight 1): the hood, the skull, the eyes ride on the head."""
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    mod = obj.modifiers.new('arm', 'ARMATURE')
    mod.object = rig


def head_kit(rig, cloth_mat):
    """A pointed hood open at the front, a skull and two pale eyes deep inside it."""
    h = pt(rig, 'Head')
    top = pt(rig, 'Head', 'tail')
    c = Vector((h.x, h.y, (h.z + top.z) / 2 + 0.01))
    parts = []
    # Hood: a squashed sphere shell, the front cut away, its tip drawn up and back.
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=24, radius=0.5)
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.40, v.co.y * 0.46, v.co.z * 0.44))
        if v.co.z > 0.08:
            k = (v.co.z - 0.08) / 0.14
            v.co.y += 0.09 * k ** 2
            v.co.z += 0.1 * k ** 2
        v.co += c
    front = [f for f in bm.faces if f.calc_center_median().y < c.y - 0.04 and abs(f.calc_center_median().x - c.x) < 0.1 and f.calc_center_median().z < c.z + 0.1 and f.calc_center_median().z > c.z - 0.13]
    bmesh.ops.delete(bm, geom=front, context='FACES')
    me = bpy.data.meshes.new('hood')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    hood = bpy.data.objects.new('hood', me)
    bpy.context.scene.collection.objects.link(hood)
    me.materials.append(cloth_mat)
    sol = hood.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.02
    parts.append(hood)
    # Skull: cranium, cheekbones, jaw, dark sockets and nose, and two pale eyes.
    bone = mat('skull', tuple(c * 0.42 for c in BONE), 0.6)
    dark = mat('socket', (0.003, 0.003, 0.004), 0.9)
    glow = mat('eye', (0.6, 0.8, 1.0), 0.3, emit=(0.55, 0.78, 1.0), strength=14.0)
    def blob(name, loc, scale, m, seg=14):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2 + 2, radius=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(loc)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        me.materials.append(m)
        return o
    fy = c.y - 0.085  # the face plane (forward = −y)
    parts += [
        blob('cranium', (c.x, c.y - 0.01, c.z + 0.02), (0.088, 0.105, 0.098), bone),
        blob('jaw', (c.x, fy - 0.01, c.z - 0.085), (0.056, 0.05, 0.04), bone),
        blob('cheek_l', (c.x - 0.055, fy + 0.012, c.z - 0.045), (0.028, 0.03, 0.026), bone),
        blob('cheek_r', (c.x + 0.055, fy + 0.012, c.z - 0.045), (0.028, 0.03, 0.026), bone),
        blob('socket_l', (c.x - 0.036, fy - 0.004, c.z - 0.008), (0.03, 0.02, 0.034), dark),
        blob('socket_r', (c.x + 0.036, fy - 0.004, c.z - 0.008), (0.03, 0.02, 0.034), dark),
        blob('nose', (c.x, fy - 0.004, c.z - 0.05), (0.012, 0.012, 0.02), dark),
        blob('eye_l', (c.x - 0.036, fy + 0.006, c.z - 0.008), (0.011, 0.008, 0.011), glow, 8),
        blob('eye_r', (c.x + 0.036, fy + 0.006, c.z - 0.008), (0.011, 0.008, 0.011), glow, 8),
    ]
    for o in parts:
        rigid(o, rig, 'Head')
    return parts


def scythe():
    """A real scythe in its own frame: base at the origin, the ash handle up +z, a curved steel blade
    at the top sweeping towards +y."""
    wood = mat('ash', srgb('#6a5239'), 0.6)
    steel = mat('steel', srgb('#b9c1c9'), 0.22, metal=1.0)
    verts, faces = [], []
    # Handle: a long, slightly bent tube.
    S = 10
    for k in range(25):
        z = k / 24 * 1.95
        for i in range(S):
            a = i / S * 2 * math.pi
            r = 0.019 - 0.002 * (k / 24)
            verts.append((math.cos(a) * r, math.sin(a) * r + 0.03 * math.sin(k / 24 * math.pi) ** 2 * 0.0, z))
    for k in range(24):
        for i in range(S):
            a, b = k * S + i, k * S + (i + 1) % S
            faces.append((a, b, b + S, a + S))
    handle = make_mesh('scythe_handle', verts, faces, wood)
    # Blade: a thin crescent, wide at the heel, tapering to a point; an arc in the y–z plane.
    bv, bf = [], []
    n = 22
    for k in range(n + 1):
        t = k / n
        ang = math.radians(-18 + 128 * t)
        r_out = 0.62
        w = 0.105 * (1 - t) ** 0.8 + 0.004  # width of the blade at t
        cy, cz = -0.62 * 0.95, 1.95
        for side, rr in ((0, r_out), (1, r_out - w)):
            y = cy + math.sin(ang) * rr * 1.0 + 0.62 * 0.95
            z = cz + math.cos(ang) * rr - 0.62 + 0.0
            for dx in (-0.004, 0.004):
                bv.append((dx, y, z))
    for k in range(n):
        o = k * 4
        for a, b, c2, d in ((0, 4, 6, 2), (1, 3, 7, 5), (0, 1, 5, 4), (2, 6, 7, 3), (0, 2, 3, 1)):
            bf.append((o + a, o + b, o + c2, o + d))
    blade = make_mesh('scythe_blade', bv, bf, steel)
    # A short socket and a second grip on the handle.
    grip = make_mesh('scythe_grip', [(x * 0.026, y * 0.026, z) for z in (0.82, 0.93) for x, y in ((1, 0), (0, 1), (-1, 0), (0, -1))],
                     [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], wood)
    for o in (blade, grip):
        o.select_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    for o in (handle, blade, grip):
        o.select_set(True)
    bpy.context.view_layer.objects.active = handle
    bpy.ops.object.join()
    return handle


def skin_to(rig, objs):
    """Weights by hand. The robe: neck and chest high up, then the spine, and below the hips the hips
    only (with a little of the thighs), so the skirt glides and sways with the hips instead of
    following each leg. Sleeves: the upper arm, then the forearm."""
    z_neck, z_sh, z_hips, N = objs[0]['weights']
    def bone_w(z, x):
        if z > z_sh + 0.05:
            return {'Neck': 0.5, 'Spine2': 0.5}
        if z > z_sh - 0.12:
            return {'Spine2': 1.0}
        if z > z_hips + 0.25:
            return {'Spine1': 0.5, 'Spine2': 0.5}
        if z > z_hips:
            return {'Spine': 0.5, 'Hips': 0.5}
        leg = 'Left' if x > 0 else 'Right'
        k = 0.18 * min(1.0, (z_hips - z) / z_hips)
        return {'Hips': 1.0 - k, f'{leg}UpLeg': k}
    for o in objs:
        o.parent = rig
        mod = o.modifiers.new('arm', 'ARMATURE')
        mod.object = rig
        groups = {}
        for v in o.data.vertices:
            if o.name == 'robe':
                w = bone_w(v.co.z, v.co.x)
            else:
                side = 'Left' if 'Left' in o.name else 'Right'
                p0, p1, p2 = pt(rig, f'{side}Arm'), pt(rig, f'{side}ForeArm'), pt(rig, f'{side}Hand')
                d0, d1 = (v.co - p0.lerp(p1, 0.5)).length, (v.co - p1.lerp(p2, 0.5)).length
                t = d0 / (d0 + d1 + 1e-6)
                w = {f'{side}Arm': 1 - t, f'{side}ForeArm': t}
            for bn, wt in w.items():
                groups.setdefault(bn, []).append((v.index, wt))
        for bn, items in groups.items():
            vg = o.vertex_groups.new(name=bn)
            for i, wt in items:
                vg.add([i], wt, 'REPLACE')


def arm_pose(rig, keyed, to):
    """Left arm swings low with the stride; the right arm holds the scythe up over the shoulder."""
    fwd = Vector((to.x, to.y, 0)).normalized()
    rig['fwd_vec'] = tuple(fwd)
    right = Vector((fwd.y, -fwd.x, 0))
    down = Vector((0, 0, -1))
    up = Vector((0, 0, 1))
    for f in keyed:
        bpy.context.scene.frame_set(f)
        s = stride(rig)
        aim(rig, 'LeftArm', (down + fwd * 0.22 * s - right * 0.12).normalized(), 0.85)
        aim(rig, 'LeftForeArm', (down * 0.85 + fwd * 0.3 * s + fwd * 0.3).normalized(), 0.85)
        aim(rig, 'RightArm', (down * 0.35 + fwd * 0.55 + right * 0.45).normalized(), 1.0)
        aim(rig, 'RightForeArm', (up * 0.25 + fwd * 0.75 + right * 0.1).normalized(), 1.0)
        for b in ('LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'):
            rig.pose.bones[b].keyframe_insert('rotation_quaternion', frame=f)


def place_scythe(obj, rig, to):
    """Carried over the right shoulder: the handle through the hand, sloping up and back, the blade
    curving forward over his head."""
    fwd = Vector((to.x, to.y, 0)).normalized()
    right = Vector((fwd.y, -fwd.x, 0))
    hand = rig.matrix_world @ rig.pose.bones['RightHand'].head
    d = (Vector((0, 0, 1)) * 0.9 - fwd * 0.28 + right * 0.2).normalized()
    y = (fwd - d * fwd.dot(d)).normalized()
    x = y.cross(d).normalized()
    m = Matrix((x, y, d)).transposed().to_4x4()
    m.translation = hand - d * 0.78
    obj.matrix_world = m


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
    rig, body, parts = make_body()
    cloth_black = kit.cloth('death_cloth', srgb('#030304'), rough=0.95, sheen=0.1, bump=0.35)
    rb = robe(rig, cloth_black)
    skin_to(rig, rb)
    parts += rb + head_kit(rig, cloth_black)
    sc = scythe()
    parts.append(sc)
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
    n = max(2, round(span / (30 / FPS) / 0.9))  # a slow, gliding walk
    frames = [f0 + i * span / n for i in range(n)]
    sps = (frames[1] - frames[0]) / 30 / 0.9
    v = ground_velocity(src, names, frames, sps)
    net = Vector((v.x, v.y, 0)).normalized()
    for h in (range(HEADINGS) if not PREVIEW else (4, 2)):
        a = h * 2 * math.pi / HEADINGS
        to = Vector((math.sin(a), math.cos(a), 0))
        rig.animation_data_clear()
        start = frame_no
        res = retarget(src, rig, frames, out_start=start, face_from=net, face_to=to, inplace='linear',
                       names=names, stand=stand, seconds_per_sample=sps)
        keyed = list(range(start, start + len(frames)))
        arm_pose(rig, keyed, to)
        ground_feet(rig, parts, keyed)
        frame_no += len(frames)
        if h == 0:
            meta['speed']['walk'] = round(res['velocity'].length, 3)
        out_dir = os.path.join(DIR, f'walk_{h}')
        os.makedirs(out_dir, exist_ok=True)
        for old in os.listdir(out_dir):
            os.remove(os.path.join(out_dir, old))
        twin = os.path.join(DIR, f'walk_{HEADINGS - h}') if (h > HEADINGS // 2 and not PREVIEW) else None
        for i, f in enumerate(keyed):
            if PREVIEW and i % 4:
                continue
            scene.frame_set(f)
            place_scythe(sc, rig, to)
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
        print('heading', h, len(keyed), 'frames', flush=True)
    meta['clips']['walk'] = dict(frames=len(frames), loop=True, fps=FPS)
    meta['hand'] = [0.0, 0.0, 1.0]
    if PREVIEW:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DIR, 'death_preview.blend'))
    else:
        with open(os.path.join(DIR, 'death.json'), 'w') as f:
            json.dump(meta, f, indent=1)
    print('done', meta['speed'], flush=True)


main()
