# Ghosts for the Halloween map (round 10, row 65): five translucent people of different times,
# rendered as flipbook sprites (a slow drift with a turn of the head and a beckoning hand).
#   Blender -b --factory-startup --python scripts/life/render_ghosts.py [-- preview] [-- only=knight]
# MakeHuman people (CC0 through MPFB 2) from the waist up; where their legs would be a long, wavering
# tail of mist. Their clothes are built here (nothing is downloaded): a wizard's robe, a ruff and
# doublet, a knight's plate, a lady's bodice and bell skirt, a monk's habit. The ghost shader is
# Principled with the alpha made of: a rim (more opaque at the edges, clear in the middle, so the
# body reads and stays see-through), a ramp that thins everything down the tail to nothing, and a
# slow noise. Emission is a cool pearl; the page adds the night glow.
# Eight headings (5..7 mirror 3..1 on the page). Output: blender/characters/frames/ghosts/<kind>/
# drift_<h>/NN.png and ghosts.json; pack with node scripts/life/pack-sprites.mjs ghosts
import bpy, bmesh, json, math, os, random, sys
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(__file__))
from lib_life import OUT, clear_scene, enable_mpfb, setup_world, setup_render, drone_camera
from lib_haunt import ramp, aim, pt, make_mesh, rigid

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = 'preview' in ARGS
ONLY = next((a[5:] for a in ARGS if a.startswith('only=')), None)
FPS = 10
FRAMES = 10
PPM = 110 if PREVIEW else 100
HEADINGS = 8
BODY = dict(x0=-1.1, x1=1.1, y0=-0.3, y1=2.45)
DIR = os.path.join(OUT, 'ghosts')

# kind: MakeHuman look, clothes, hair, a pearl tint
KINDS = {
    'wizard': dict(gender=1.0, age=0.95, weight=0.3, hair='', clothes=[], tint=(0.72, 0.82, 1.0)),
    'ruff': dict(gender=1.0, age=0.5, weight=0.45, hair='short02/short02.mhclo', clothes=['male_elegantsuit01/male_elegantsuit01.mhclo'], tint=(0.9, 0.84, 0.96)),
    'knight': dict(gender=1.0, age=0.5, weight=0.55, hair='', clothes=[], tint=(0.78, 0.88, 0.92)),
    'lady': dict(gender=0.0, age=0.4, weight=0.35, hair='long01/long01.mhclo', clothes=['female_elegantsuit01/female_elegantsuit01.mhclo'], tint=(0.96, 0.86, 0.9)),
    'monk': dict(gender=1.0, age=0.7, weight=0.5, hair='', clothes=[], tint=(0.8, 0.86, 0.8)),
}


# --- The ghost shader ------------------------------------------------------------------------------

def ghost_mat(name, tint, alpha=0.5, rim=0.7, z_clear=0.15, z_full=1.1, glow=0.9, extra=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.surface_render_method = 'BLENDED'
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Base Color'].default_value = (*tint, 1)
    b.inputs['Roughness'].default_value = 0.5
    b.inputs['Emission Color'].default_value = (*tint, 1)
    b.inputs['Emission Strength'].default_value = glow
    fres = nt.nodes.new('ShaderNodeLayerWeight'); fres.inputs['Blend'].default_value = 0.35
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    zr = nt.nodes.new('ShaderNodeMapRange')
    zr.inputs['From Min'].default_value = z_clear; zr.inputs['From Max'].default_value = z_full
    zr.inputs['To Min'].default_value = 0.0; zr.inputs['To Max'].default_value = 1.0
    zr.clamp = True
    nt.links.new(sep.outputs['Z'], zr.inputs['Value'])
    sm = nt.nodes.new('ShaderNodeMath'); sm.operation = 'SMOOTH_MAX'
    sm.inputs[1].default_value = 0.0
    # smoothstep-like: z ramp squared
    sq = nt.nodes.new('ShaderNodeMath'); sq.operation = 'POWER'; sq.inputs[1].default_value = 1.6
    nt.links.new(zr.outputs['Result'], sq.inputs[0])
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 4.0; noise.inputs['Detail'].default_value = 3
    nt.links.new(geo.outputs['Position'], noise.inputs['Vector'])
    # alpha = (base + rim * facing-edge) * ramp * (0.65 + 0.7 * noise)
    a1 = nt.nodes.new('ShaderNodeMath'); a1.operation = 'MULTIPLY_ADD'; a1.inputs[1].default_value = rim; a1.inputs[2].default_value = alpha
    nt.links.new(fres.outputs['Facing'], a1.inputs[0])
    # Facing is 1 at the edges in Layer Weight terms? (Facing: 0 at the edge, 1 face-on) → invert for a rim.
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    nt.links.new(fres.outputs['Facing'], inv.inputs[1])
    nt.links.new(inv.outputs['Value'], a1.inputs[0])
    a2 = nt.nodes.new('ShaderNodeMath'); a2.operation = 'MULTIPLY'
    nt.links.new(a1.outputs['Value'], a2.inputs[0]); nt.links.new(sq.outputs['Value'], a2.inputs[1])
    nz = nt.nodes.new('ShaderNodeMath'); nz.operation = 'MULTIPLY_ADD'; nz.inputs[1].default_value = 0.7; nz.inputs[2].default_value = 0.65
    nt.links.new(noise.outputs['Fac'], nz.inputs[0])
    a3 = nt.nodes.new('ShaderNodeMath'); a3.operation = 'MULTIPLY'
    nt.links.new(a2.outputs['Value'], a3.inputs[0]); nt.links.new(nz.outputs['Value'], a3.inputs[1])
    a4 = nt.nodes.new('ShaderNodeMath'); a4.operation = 'MULTIPLY'; a4.inputs[1].default_value = extra; a4.use_clamp = True
    nt.links.new(a3.outputs['Value'], a4.inputs[0])
    nt.links.new(a4.outputs['Value'], b.inputs['Alpha'])
    return m


def solid_mat(name, rgb, rough=0.4, metal=0.0, alpha=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    b.inputs['Emission Color'].default_value = (*rgb, 1)
    b.inputs['Emission Strength'].default_value = 0.25
    return m


# --- People -----------------------------------------------------------------------------------------

def make_human(kind, look):
    from mpfb.services.humanservice import HumanService
    info = HumanService._create_default_human_info_dict()
    info['name'] = kind
    info['phenotype'].update(gender=look['gender'], age=look['age'], muscle=0.4, weight=look['weight'], height=0.55, proportions=0.5)
    info['rig'] = 'cmu_mb'
    info['eyes'] = 'high-poly/high-poly.mhclo'
    info['eyebrows'] = 'eyebrow001/eyebrow001.mhclo'
    info['eyelashes'] = ''
    info['hair'] = look['hair']
    info['skin_material_type'] = 'ENHANCED'
    info['clothes'] = look['clothes']
    s = HumanService.get_default_deserialization_settings()
    s['subdiv_levels'] = 0
    s['scale'] = 0.1
    before = set(bpy.data.objects)
    body = HumanService.deserialize_from_dict(info, s)
    rig = body.parent
    parts = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    return rig, body, parts


def cut_below(obj, z):
    """Removes every face of `obj` lying below z (rest pose, world): the legs give way to the tail."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    mw = obj.matrix_world
    kill = [f for f in bm.faces if (mw @ f.calc_center_median()).z < z]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()


def loft(name, rings, material, sides=48, closed_top=False):
    """rings: (z, rx, ry, cx, cy, fold) from the top down; folds ride along the circumference."""
    verts, faces = [], []
    for k, (z, rx, ry, cx, cy, fold) in enumerate(rings):
        for i in range(sides):
            a = i / sides * 2 * math.pi
            f = 1 + fold * (math.sin(7 * a + k * 0.35) * 0.6 + math.sin(13 * a - k * 0.5) * 0.4)
            verts.append((cx + math.cos(a) * rx * f, cy + math.sin(a) * ry * f, z))
    for k in range(len(rings) - 1):
        for i in range(sides):
            a, b = k * sides + i, k * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    return make_mesh(name, verts, faces, material)


def tube(name, path, radii, material, sides=14):
    verts, faces = [], []
    for k, c in enumerate(path):
        u = (path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]).normalized()
        e1 = u.cross(Vector((0, 1, 0))).normalized()
        e2 = u.cross(e1).normalized()
        for i in range(sides):
            a = i / sides * 2 * math.pi
            verts.append(c + (e1 * math.cos(a) + e2 * math.sin(a)) * radii[k])
    for k in range(len(path) - 1):
        for i in range(sides):
            a, b = k * sides + i, k * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    return make_mesh(name, verts, faces, material)


def blob(name, loc, scale, material, seg=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2 + 2, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + Vector(loc)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    return o


def weight(obj, rig, fn):
    """fn(vertex co) → {bone: weight}."""
    mod = obj.modifiers.new('arm', 'ARMATURE')
    mod.object = rig
    groups = {}
    for v in obj.data.vertices:
        for bn, w in fn(v.co).items():
            groups.setdefault(bn, []).append((v.index, w))
    for bn, items in groups.items():
        vg = obj.vertex_groups.new(name=bn)
        for i, w in items:
            vg.add([i], w, 'REPLACE')


def torso_weights(z_neck, z_sh, z_hips):
    def fn(co):
        z = co.z
        if z > z_sh + 0.05:
            return {'Neck': 0.5, 'Spine2': 0.5}
        if z > z_sh - 0.12:
            return {'Spine2': 1.0}
        if z > z_hips + 0.2:
            return {'Spine1': 0.5, 'Spine2': 0.5}
        return {'Spine': 0.5, 'Hips': 0.5} if z > z_hips else {'Hips': 1.0}
    return fn


def sleeve(rig, side, material, widen=0.1, r0=0.075):
    p0, p1, p2 = pt(rig, f'{side}Arm'), pt(rig, f'{side}ForeArm'), pt(rig, f'{side}Hand')
    path = [p0.lerp(p1, i / 4) for i in range(4)] + [p1.lerp(p2, i / 5) for i in range(6)]
    radii = [r0 + widen * (k / (len(path) - 1)) ** 1.4 for k in range(len(path))]
    o = tube(f'sleeve_{side}', path, radii, material)
    def fn(co):
        d0, d1 = (co - p0.lerp(p1, 0.5)).length, (co - p1.lerp(p2, 0.5)).length
        t = d0 / (d0 + d1 + 1e-6)
        return {f'{side}Arm': 1 - t, f'{side}ForeArm': t}
    weight(o, rig, fn)
    return o


def build(kind, look):
    """The ghost of one kind: returns (rig, [objects], tail wave modifier)."""
    rig, body, parts = make_human(kind, look)
    z_neck, z_sh, z_hips = pt(rig, 'Neck').z, pt(rig, 'LeftArm').z, pt(rig, 'Hips').z
    shoulder = abs(pt(rig, 'LeftArm').x)
    h_head = pt(rig, 'Head')
    skin = ghost_mat('skin', look['tint'], alpha=0.17, rim=0.55, z_clear=0.25, z_full=1.25, glow=0.3)
    cloth = ghost_mat('cloth', tuple(min(1, c * 0.9) for c in look['tint']), alpha=0.27, rim=0.6, z_clear=0.15, z_full=1.3, glow=0.22)
    plate = ghost_mat('plate', (0.8, 0.88, 0.95), alpha=0.4, rim=0.5, z_clear=0.6, z_full=1.4, glow=0.3)
    dark = solid_mat('dark', (0.02, 0.025, 0.04), rough=0.8, alpha=0.9)
    extra = []
    for o in parts:
        n = o.name.lower()
        o.data.materials.clear()
        if 'eye' in n and 'brow' not in n:
            o.data.materials.append(dark)
        elif 'eyebrow' in n:
            o.data.materials.append(dark)
        else:
            o.data.materials.append(cloth if ('suit' in n or 'hair' in n or 'long' in n or 'short' in n) else skin)
        if 'eyes' not in n and 'brow' not in n:
            cut_below(o, z_hips + 0.04)
    if kind in ('wizard', 'monk'):
        long_top, hem = z_neck + 0.06, 0.12
        rings = []
        for k in range(30):
            t = k / 29
            z = long_top - (long_top - hem) * t
            if z > z_sh:
                w = 0.12 + (shoulder + 0.07 - 0.12) * ramp(z, long_top, z_sh)
            elif z > z_hips:
                w = shoulder + 0.07 + (0.27 - shoulder - 0.07) * ramp(z, z_sh, z_hips)
            else:
                w = 0.27 + 0.17 * ramp(z, z_hips, hem)
            rings.append((z, w, w * 0.9 + 0.04, 0, -0.02, 0.06 * ramp(t, 0.1, 0.8)))
        robe = loft('robe', rings, cloth)
        weight(robe, rig, torso_weights(z_neck, z_sh, z_hips))
        extra += [robe, sleeve(rig, 'Left', cloth, 0.12), sleeve(rig, 'Right', cloth, 0.12)]
        if kind == 'wizard':  # a pointed hat with a soft brim and a long beard
            hat = loft('hat', [(h_head.z + 0.58 - 0.34 * (k / 9), 0.17 * (k / 9) ** 1.1 + 0.004, 0.17 * (k / 9) ** 1.1 + 0.004, 0.0, 0.05 * (1 - k / 9) ** 2, 0.0) for k in range(10)], cloth, 24)
            brim = loft('brim', [(h_head.z + 0.235, 0.3, 0.3, 0, -0.01, 0.0), (h_head.z + 0.23, 0.14, 0.14, 0, -0.01, 0.0)], cloth, 28)
            beard = loft('beard', [(h_head.z + 0.08 - 0.5 * (k / 7), 0.09 * (1 - 0.7 * k / 7) + 0.02, 0.05, 0, -0.1 - 0.02 * k, 0.12) for k in range(8)], cloth, 20)
            for o in (hat, brim, beard):
                rigid(o, rig, 'Head')
            extra += [hat, brim, beard]
        else:  # monk: the hood up, a rope belt
            hood = loft('hood', [(h_head.z + 0.22 - 0.5 * (k / 9) ** 1.0 * 0.42, 0.13 + 0.07 * math.sin(math.pi * min(1, (k + 2) / 9)), 0.16 + 0.04 * math.sin(math.pi * min(1, (k + 2) / 9)), 0, 0.03, 0.05) for k in range(10)], cloth, 28)
            rigid(hood, rig, 'Head')
            belt = loft('belt', [(z_hips + 0.17, 0.285, 0.265, 0, -0.02, 0.02), (z_hips + 0.14, 0.29, 0.27, 0, -0.02, 0.02)], plate, 28)
            weight(belt, rig, torso_weights(z_neck, z_sh, z_hips))
            extra += [hood, belt]
    elif kind == 'ruff':
        # A great frilled ruff, a short cape and a tail dressed as hose-less mist.
        ring = [(z_neck + 0.02 - 0.02 * k, 0.14 + 0.09 * k, 0.15 + 0.09 * k, 0, -0.01, 0.0) for k in range(2)]
        ruffs = loft('ruff', [(z_neck + 0.03, 0.15, 0.16, 0, -0.01, 0.0), (z_neck + 0.01, 0.255, 0.255, 0, -0.01, 0.12), (z_neck - 0.03, 0.14, 0.15, 0, -0.01, 0.0)], plate, 72)
        rigid(ruffs, rig, 'Neck')
        cape = loft('cape', [(z_sh + 0.06 - 0.5 * (k / 9), shoulder + 0.07 + 0.1 * (k / 9), 0.14 + 0.08 * (k / 9), 0, 0.09, 0.07) for k in range(10)], cloth, 40)
        weight(cape, rig, torso_weights(z_neck, z_sh, z_hips))
        extra += [ruffs, cape]
    elif kind == 'knight':
        shell = plate
        helm = blob('helm', (h_head.x, h_head.y - 0.005, h_head.z + 0.1), (0.125, 0.14, 0.15), shell)
        visor = blob('visor', (h_head.x, h_head.y - 0.1, h_head.z + 0.085), (0.1, 0.04, 0.012), dark, 12)
        plume = loft('plume', [(h_head.z + 0.24 + 0.2 * (k / 7), 0.012 + 0.03 * math.sin(math.pi * k / 7), 0.012 + 0.07 * math.sin(math.pi * k / 7), 0, 0.02 + 0.03 * k / 7, 0.1) for k in range(8)], cloth, 14)
        for o in (helm, visor, plume):
            rigid(o, rig, 'Head')
        chest = blob('chest', (0, -0.015, z_sh - 0.17), (0.215, 0.15, 0.24), shell)
        weight(chest, rig, torso_weights(z_neck, z_sh, z_hips))
        tabard = loft('tabard', [(z_sh - 0.28 - 0.4 * (k / 7), 0.2 + 0.03 * (k / 7), 0.15 + 0.03 * (k / 7), 0, -0.02, 0.05) for k in range(8)], cloth, 36)
        weight(tabard, rig, torso_weights(z_neck, z_sh, z_hips))
        extra += [helm, visor, plume, chest, tabard, sleeve(rig, 'Left', plate, 0.01, 0.06), sleeve(rig, 'Right', plate, 0.01, 0.06)]
        for side in ('Left', 'Right'):
            pa = pt(rig, f'{side}Arm')
            pad = blob(f'pauldron_{side}', (pa.x * 1.02, pa.y, pa.z + 0.015), (0.1, 0.09, 0.07), shell)
            weight(pad, rig, lambda co, s=side: {f'{s}Arm': 1.0})
            extra.append(pad)
    elif kind == 'lady':
        # A bell skirt from the waist, a bodice cuff of lace, long sleeves with ruffled cuffs.
        waist = z_hips + 0.18
        rings = []
        for k in range(30):
            t = k / 29
            z = waist - (waist - 0.1) * t
            w = 0.2 + 0.62 * ramp(t, 0, 0.75) ** 0.8
            rings.append((z, w, w * 0.95, 0, -0.02, 0.05 + 0.05 * t))
        skirt = loft('skirt', rings, cloth, 60)
        weight(skirt, rig, lambda co: {'Spine': 0.5, 'Hips': 0.5} if co.z > z_hips else {'Hips': 1.0})
        extra += [skirt, sleeve(rig, 'Left', cloth, 0.05, 0.06), sleeve(rig, 'Right', cloth, 0.05, 0.06)]
        bonnet = loft('bonnet', [(h_head.z + 0.2 - 0.3 * (k / 8), 0.12 + 0.05 * math.sin(math.pi * k / 8), 0.15, 0, 0.0, 0.03) for k in range(9)], cloth, 24)
        rigid(bonnet, rig, 'Head')
        extra.append(bonnet)
    # The tail: from under the waist down to a wisp, swaying.
    top, bot = z_hips + 0.1, 0.0
    width = 0.7 if kind == 'lady' else 0.33
    rings = [(top - (top - bot) * (k / 22), max(0.012, (0.26 if kind != 'lady' else 0.16) * (1 - (k / 22)) ** 0.85 + 0.012), max(0.012, 0.22 * (1 - (k / 22)) ** 0.85 + 0.012), 0.0, -0.02, 0.1) for k in range(23)]
    tail = loft('tail', rings, skin if kind != 'lady' else cloth, 36)
    weight(tail, rig, lambda co: {'Hips': 1.0})
    wave = tail.modifiers.new('wave', 'WAVE')
    wave.height = 0.05
    wave.width = 0.5
    wave.narrowness = 3.0
    wave.speed = 0.0
    extra.append(tail)
    for o in extra:
        pass
    return rig, parts + extra, wave


# --- Motion -------------------------------------------------------------------------------------------

def pose(rig, wave, t, to):
    """One frame of the drift (t in 0..1): a slow bob, a turn of the head, a beckoning hand."""
    fwd = to
    right = Vector((fwd.y, -fwd.x, 0))
    up = Vector((0, 0, 1))
    s = math.sin(2 * math.pi * t)
    for b in rig.pose.bones:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0, 0, 0)
        b.location = Vector()
    bpy.context.view_layer.update()
    gesture = max(0.0, math.sin(2 * math.pi * t - 0.4)) ** 1.5
    aim(rig, 'LeftArm', (-up * 0.9 + fwd * 0.25 - right * 0.2).normalized(), 0.9)
    aim(rig, 'LeftForeArm', (-up * 0.6 + fwd * 0.55).normalized(), 0.9)
    aim(rig, 'RightArm', (-up * (0.9 - 0.7 * gesture) + fwd * (0.25 + 0.4 * gesture) + right * 0.2).normalized(), 0.9)
    aim(rig, 'RightForeArm', (-up * (0.6 - 0.9 * gesture) + fwd * 0.55 + right * 0.1).normalized(), 0.9)
    for bn, a in (('Head', 0.42 * s), ('Neck', 0.2 * s)):
        pb = rig.pose.bones[bn]
        pb.rotation_euler = (0.04 * math.sin(2 * math.pi * t + 1.0), a, 0)
    hips = rig.pose.bones['Hips']
    hips.location = Vector((0, 0, 0.05 * math.sin(2 * math.pi * t + 0.8)))
    hips.rotation_euler = (0.04 * math.sin(2 * math.pi * t), 0, 0.06 * s)
    wave.time_offset = -t * 4.0
    bpy.context.view_layer.update()


def main():
    enable_mpfb()
    scene = bpy.context.scene
    setup_render(scene, samples=24 if PREVIEW else 24)
    scene.cycles.transparent_max_bounces = 28
    scene.cycles.max_bounces = 8
    scene.cycles.filter_width = 1.2
    scene.render.fps = FPS
    meta = {'fps': FPS, 'ppm': PPM, 'body': BODY, 'headings': HEADINGS, 'clips': {'drift': dict(frames=FRAMES, loop=True, fps=FPS)}, 'variants': [], 'shadow': BODY, 'shadowPpm': 1}
    for kind, look in KINDS.items():
        if ONLY and kind != ONLY:
            continue
        clear_scene()
        setup_world(scene, sun_strength=4.0)
        rig, parts, wave = build(kind, look)
        cam, res = drone_camera(scene, 'cam', BODY['x1'] - BODY['x0'], BODY['y1'] - BODY['y0'], PPM,
                                ((BODY['x0'] + BODY['x1']) / 2, (BODY['y0'] + BODY['y1']) / 2))
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = res
        meta['variants'].append(kind)
        for h in (range(HEADINGS) if not PREVIEW else (4, 2)):
            a = h * 2 * math.pi / HEADINGS
            to = Vector((math.sin(a), math.cos(a), 0))
            out_dir = os.path.join(DIR, kind, f'drift_{h}')
            os.makedirs(out_dir, exist_ok=True)
            for old in os.listdir(out_dir):
                os.remove(os.path.join(out_dir, old))
            twin = os.path.join(DIR, kind, f'drift_{HEADINGS - h}') if (h > HEADINGS // 2 and not PREVIEW) else None
            rig.rotation_euler = (0, 0, math.pi - a)
            # the aims are given in the turned frame, so the arm layer stays in the body's own terms
            local = Vector((0, -1, 0)) * -1  # the body faces −y at rest: forward in its own frame
            for i in range(FRAMES):
                if PREVIEW and i % 7:
                    continue
                f = os.path.join(out_dir, f'{i:02d}.png')
                if twin:
                    import shutil
                    shutil.copy(os.path.join(twin, f'{i:02d}.png'), f)
                    continue
                pose(rig, wave, i / FRAMES, to)
                scene.render.filepath = f
                bpy.ops.render.render(write_still=True)
            print(kind, 'heading', h, flush=True)
    if PREVIEW:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DIR, 'ghosts_preview.blend'))
    elif not ONLY:
        with open(os.path.join(DIR, 'ghosts.json'), 'w') as fh:
            json.dump(meta, fh, indent=1)
    print('done', flush=True)


main()
