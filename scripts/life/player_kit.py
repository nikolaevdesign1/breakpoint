# Tennis kit for the MakeHuman players (row 149): cloth materials, socks, wristbands, cap / headband /
# visor, a pleated skirt, real-looking shoes and a strung racket. Imported by render_players.py.
#
# Fitted gear is cut out of the body's own geometry, so it follows the skin weights exactly: MakeHuman's
# base mesh carries helper shells (tights, skirt, hair) that MPFB hides; a piece of one of them (or of
# the skin) is copied into its own object, pushed out along the normals and given cloth. A cap is the
# top of the hair shell plus a brim on the head bone; socks are the tights below mid-calf; a skirt is
# the skirt helper cut at mid-thigh, flared and pleated.
import bpy, bmesh, math
from mathutils import Vector, Matrix


def srgb(hexs):
    """'#RRGGBB' → linear RGB (Blender colour inputs are linear)."""
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(hexs[i:i + 2], 16)) for i in (1, 3, 5))


# --- Materials -------------------------------------------------------------------------------------

def _bump(nt, scale, strength):
    """Fine weave + soft fold noise as a bump on a cloth BSDF."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    weave = nt.nodes.new('ShaderNodeTexNoise'); weave.inputs['Scale'].default_value = scale; weave.inputs['Detail'].default_value = 2
    folds = nt.nodes.new('ShaderNodeTexWave'); folds.wave_type = 'BANDS'; folds.inputs['Scale'].default_value = 9
    folds.inputs['Distortion'].default_value = 6; folds.inputs['Detail'].default_value = 3
    nt.links.new(tc.outputs['Object'], weave.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], folds.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'; mix.inputs[1].default_value = 0.35
    nt.links.new(weave.outputs['Fac'], mix.inputs[0])
    nt.links.new(folds.outputs['Fac'], mix.inputs[2])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = strength; bump.inputs['Distance'].default_value = 0.004
    nt.links.new(mix.outputs['Value'], bump.inputs['Height'])
    return bump


def cloth_bsdf(nt, rgb, rough=0.82, sheen=0.6, bump=0.25):
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Sheen Roughness'].default_value = 0.45
    b.inputs['Sheen Tint'].default_value = (*[min(1, c * 1.2 + 0.25) for c in rgb], 1)
    if bump:
        nt.links.new(_bump(nt, 260, bump).outputs['Normal'], b.inputs['Normal'])
    return b


def cloth(name, rgb, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(cloth_bsdf(nt, rgb, **kw).outputs['BSDF'], out.inputs['Surface'])
    return m


def recloth(obj, rgb, **kw):
    """MakeHuman garment → plain sports cloth of colour rgb, keeping its own normal map (folds)."""
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        old = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        normal = alpha = None
        if old and old.inputs['Normal'].is_linked:
            normal = old.inputs['Normal'].links[0].from_socket
        if old and old.inputs['Alpha'].is_linked:
            alpha = old.inputs['Alpha'].links[0].from_socket  # cut-outs (hems, keyholes) stay cut
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        b = cloth_bsdf(nt, rgb, bump=0 if normal else kw.get('bump', 0.25), **{k: v for k, v in kw.items() if k != 'bump'})
        if normal:
            nt.links.new(normal, b.inputs['Normal'])
        if alpha:
            nt.links.new(alpha, b.inputs['Alpha'])
        nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])


# --- Rest-pose geometry ----------------------------------------------------------------------------

def rest_coords(obj, rig):
    """World positions of obj's vertices in the rest pose, shape keys applied, before any masking."""
    pose = rig.data.pose_position
    rig.data.pose_position = 'REST'
    shown = [(m, m.show_viewport) for m in obj.modifiers]
    for m, _ in shown:
        m.show_viewport = False
    bpy.context.view_layer.update()
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    co = [obj.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    for m, s in shown:
        m.show_viewport = s
    rig.data.pose_position = pose
    bpy.context.view_layer.update()
    return co


def group_members(obj, name):
    gi = obj.vertex_groups[name].index
    return {v.index for v in obj.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups)}


def shell(body, rig, name, keep, offset, mat, flare=None):
    """
    Copies the faces of `body` whose vertices all pass keep(i, rest_co) into a new skinned object,
    pushed `offset` metres out along the normals (flare(i, co) → extra offset per vertex, optional).
    """
    co = rest_coords(body, rig)
    ok = [keep(i, c) for i, c in enumerate(co)]
    obj = body.copy()
    obj.data = body.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    for m in list(obj.modifiers):
        if m.type != 'ARMATURE':
            obj.modifiers.remove(m)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    gone = [f for f in bm.faces if not all(ok[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    if flare:
        # per-vertex extra push, as a vertex group read by a second displace
        g = obj.vertex_groups.new(name='flare')
        cmap = rest_coords(obj, rig)
        for v in obj.data.vertices:
            g.add([v.index], max(0.0, min(1.0, flare(v.index, cmap[v.index]))), 'REPLACE')
        d2 = obj.modifiers.new('flare', 'DISPLACE'); d2.strength = 0.07; d2.mid_level = 0; d2.vertex_group = 'flare'
        d2.direction = 'NORMAL'
    d = obj.modifiers.new('push', 'DISPLACE')
    d.strength = offset
    d.mid_level = 0
    d.direction = 'NORMAL'
    arm = next(m for m in obj.modifiers if m.type == 'ARMATURE')
    obj.modifiers.move(obj.modifiers.find(arm.name), len(obj.modifiers) - 1)  # push in the rest pose, then skin
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0
        p.use_smooth = True
    return obj


# --- Gear ------------------------------------------------------------------------------------------

def bone_pt(rig, name, end='head'):
    b = rig.data.bones[name]
    return rig.matrix_world @ (b.head_local if end == 'head' else b.tail_local)


def socks(body, rig, top, rgb=(0.86, 0.86, 0.84)):
    return shell(body, rig, 'socks', lambda i, c, T=group_members(body, 'helper-tights'): i in T and c.z < top, 0.003,
                 cloth('socks', rgb, rough=0.9, sheen=0.8, bump=0.35))


def wristbands(body, rig, rgb, sides=('Left', 'Right')):
    pts = [(bone_pt(rig, f'{s}ForeArm'), bone_pt(rig, f'{s}Hand')) for s in sides]
    B = group_members(body, 'body')

    def keep(i, c):
        if i not in B:
            return False
        for a, b in pts:
            ax = b - a
            t = (c - a).dot(ax) / ax.length_squared
            if 0.8 < t < 0.97 and (a + ax * t - c).length < 0.055:
                return True
        return False
    return shell(body, rig, 'wristbands', keep, 0.006, cloth('wristband', rgb, rough=0.95, sheen=0.9, bump=0.4))


def _head_frame(body, rig):
    H = group_members(body, 'helper-hair')
    co = rest_coords(body, rig)
    pts = [co[i] for i in H]
    top = max(p.z for p in pts)
    front = min(p.y for p in pts)  # the face looks along −y
    cy = sum(p.y for p in pts) / len(pts)
    return H, top, front, cy


def cap(body, rig, rgb, brim=True, crown=True):
    """Baseball cap (crown from the hair shell + brim) or, crown=False, a visor (band + brim)."""
    H, top, front, cy = _head_frame(body, rig)
    line = lambda c: top - (0.095 if crown else 0.075) - 0.32 * max(0.0, c.y - cy)  # the cap sits lower at the back
    if crown:
        keep = lambda i, c: i in H and c.z > line(c)
    else:
        keep = lambda i, c: i in H and line(c) < c.z < line(c) + 0.035
    mat = cloth('cap', rgb, rough=0.75, sheen=0.4, bump=0.3)
    parts = [shell(body, rig, 'cap', keep, 0.016 if crown else 0.012, mat)]
    if brim:
        z = top - (0.095 if crown else 0.075) + 0.004
        me = bpy.data.meshes.new('brim')
        bm = bmesh.new()
        n = 12
        ring_in, ring_out = [], []
        for k in range(n + 1):
            a = math.pi * k / n
            x = math.cos(a)
            ring_in.append(bm.verts.new((0.085 * x, front + 0.03 - 0.02 * math.sin(a), z)))
            ring_out.append(bm.verts.new((0.092 * x, front + 0.025 - (0.075 if crown else 0.06) * math.sin(a), z - 0.016 * math.sin(a))))
        for k in range(n):
            bm.faces.new((ring_in[k], ring_out[k], ring_out[k + 1], ring_in[k + 1]))
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new('brim', me)
        bpy.context.scene.collection.objects.link(ob)
        sol = ob.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.006
        me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = True
        rig.data.pose_position = 'REST'
        bpy.context.view_layer.update()
        mw = ob.matrix_world.copy()
        ob.parent = rig
        ob.parent_type = 'BONE'
        ob.parent_bone = 'Head'
        ob.matrix_world = mw
        rig.data.pose_position = 'POSE'
        bpy.context.view_layer.update()
        parts.append(ob)
    return parts


def headband(body, rig, rgb):
    H, top, front, cy = _head_frame(body, rig)
    line = lambda c: top - 0.07 - 0.28 * max(0.0, c.y - cy)
    keep = lambda i, c: i in H and line(c) - 0.03 < c.z < line(c) + 0.012
    return shell(body, rig, 'headband', keep, 0.013, cloth('headband', rgb, rough=0.95, sheen=0.9, bump=0.4))


def skirt(body, rig, rgb):
    """Pleated tennis skirt: the skirt helper cut at mid-thigh, flared towards the hem."""
    S = group_members(body, 'helper-skirt')
    hip = bone_pt(rig, 'LeftUpLeg').z
    hem = hip - 0.22
    waist = max(c.z for i, c in enumerate(rest_coords(body, rig)) if i in S)
    centre = bone_pt(rig, 'Hips')

    def flare(i, c):
        t = max(0.0, min(1.0, (waist - c.z) / (waist - hem)))
        a = math.atan2(c.y - centre.y, c.x - centre.x)
        pleat = 0.5 + 0.5 * math.cos(a * 24)  # 24 knife pleats
        return t * t * (0.55 + 0.45 * pleat)
    return shell(body, rig, 'skirt', lambda i, c: i in S and c.z > hem, 0.008,
                 cloth('skirt', rgb, rough=0.7, sheen=0.5, bump=0.2), flare=flare)


def shorts(body, rig, rgb):
    """Tennis shorts to just above the knee: the tights helper between the waist and the thigh."""
    T = group_members(body, 'helper-tights')
    knee = bone_pt(rig, 'LeftLeg').z
    waist = bone_pt(rig, 'Hips').z + 0.04  # under the shirt hem, never through it
    hem = knee + 0.09
    flare = lambda i, c: 0.18 * max(0.0, 1 - (c.z - hem) / 0.12)  # a loose leg opening
    return shell(body, rig, 'shorts', lambda i, c: i in T and hem < c.z < waist, 0.012,
                 cloth('shorts', rgb, rough=0.7, sheen=0.5, bump=0.3), flare=flare)


def shoes(obj, rig, upper=(0.86, 0.86, 0.85), sole=(0.62, 0.6, 0.56), accent=None):
    """Tennis shoes: the MakeHuman sneaker, re-shaded as leather/mesh upper over a thick sole."""
    co = rest_coords(obj, rig)
    attr = obj.data.attributes.new('sole', 'FLOAT', 'POINT')
    for i, c in enumerate(co):
        attr.data[i].value = 1.0 if c.z < 0.028 else 0.0
    m = bpy.data.materials.new('shoe')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    up = cloth_bsdf(nt, upper, rough=0.45, sheen=0.2, bump=0.15)
    so = nt.nodes.new('ShaderNodeBsdfPrincipled')
    so.inputs['Base Color'].default_value = (*sole, 1)
    so.inputs['Roughness'].default_value = 0.8
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'sole'
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(at.outputs['Fac'], mix.inputs['Fac'])
    nt.links.new(up.outputs['BSDF'], mix.inputs[1])
    nt.links.new(so.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    if accent:
        # a coloured heel/side panel: the upper's back half, low
        acc = nt.nodes.new('ShaderNodeBsdfPrincipled'); acc.inputs['Base Color'].default_value = (*accent, 1); acc.inputs['Roughness'].default_value = 0.5
        a2 = obj.data.attributes.new('accent', 'FLOAT', 'POINT')
        ys = [c.y for c in co]
        for i, c in enumerate(co):
            a2.data[i].value = 1.0 if (0.028 <= c.z < 0.06 and c.y > (min(ys) + max(ys)) / 2 + 0.03) else 0.0
        at2 = nt.nodes.new('ShaderNodeAttribute'); at2.attribute_name = 'accent'
        mix2 = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(at2.outputs['Fac'], mix2.inputs['Fac'])
        nt.links.new(mix.outputs['Shader'], mix2.inputs[1])
        nt.links.new(acc.outputs['BSDF'], mix2.inputs[2])
        nt.links.new(mix2.outputs['Shader'], out.inputs['Surface'])
    obj.data.materials.clear()
    obj.data.materials.append(m)


# --- Racket ----------------------------------------------------------------------------------------

def racket(rig, frame_rgb=(0.012, 0.012, 0.014), accent=None, grip_rgb=(0.85, 0.85, 0.82)):
    """
    Generic modern racket (no brand), 68.5 cm: graphite beam frame with a coloured throat, a strung
    bed (16 × 19 pattern, see-through between the strings), white overgrip and butt cap.
    Held in the right hand: the shaft leaves the hand on the thumb side, string face ≈ palm.
    """
    me = bpy.data.meshes.new('racket')
    bm = bmesh.new()
    mat_idx = bm.faces.layers.int.new('m')
    seg = 40
    a, b = 0.128, 0.162  # outer half-width / half-length of the head
    cy = 0.505  # head centre along the racket (butt at −0.0)
    w, d = 0.0105, 0.0125  # beam: half-width in the face plane, half-depth across it
    ring = [(a * math.cos(2 * math.pi * i / seg), cy + b * math.sin(2 * math.pi * i / seg)) for i in range(seg)]

    def tube(pts, w, d, k, closed=True):
        """Rectangular beam along a polyline in the face plane (z = 0)."""
        vs = []
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            q0 = Vector(pts[(i - 1) % n]) if closed or i else Vector((x, y))
            q1 = Vector(pts[(i + 1) % n]) if closed or i < n - 1 else Vector((x, y))
            t = (q1 - q0).normalized()
            nrm = Vector((-t.y, t.x))
            vs.append([bm.verts.new((x + nrm.x * sx * w, y + nrm.y * sx * w, sz * d)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            j = (i + 1) % n
            for k0 in range(4):
                k1 = (k0 + 1) % 4
                f = bm.faces.new((vs[i][k0], vs[i][k1], vs[j][k1], vs[j][k0]))
                f[mat_idx] = k
        if not closed:
            for row, rev in ((vs[0], True), (vs[-1], False)):
                f = bm.faces.new(row[::-1] if rev else row)
                f[mat_idx] = k
    tube(ring, w, d, 0)
    # throat: two arms from the shaft into the head's lower curve (accent colour), and the shaft
    yb = cy - b * 0.93
    for s in (-1, 1):
        pts = [(0.0, 0.215), (s * 0.03, 0.27), (s * 0.068, 0.315), (s * 0.085, yb + 0.012)]
        tube(pts, 0.0085, 0.011, 3 if accent else 0, closed=False)
    tube([(0.0, 0.0), (0.0, 0.225)], 0.0135, 0.0155, 2, closed=False)  # handle (octagonal enough at this size)
    tube([(0.0, -0.004), (0.0, 0.012)], 0.0148, 0.0168, 0, closed=False)  # butt cap
    # string bed: one face, strings drawn in the material
    sb = [bm.verts.new((x * 0.93, cy + (y - cy) * 0.93, 0)) for x, y in ring]
    f = bm.faces.new(sb)
    f[mat_idx] = 1
    uv = bm.loops.layers.uv.new('UVMap')
    for ff in bm.faces:
        for l in ff.loops:
            l[uv].uv = ((l.vert.co.x + a) / (2 * a), (l.vert.co.y - (cy - b)) / (2 * b))
    bm.to_mesh(me)
    for p in me.polygons:
        p.use_smooth = p.material_index != 1
    bm.free()
    # material indices from the bmesh layer
    lay = me.attributes.get('m')
    if lay:
        for p in me.polygons:
            p.material_index = lay.data[p.index].value
        me.attributes.remove(lay)

    def plain(name, rgb, rough, metal=0.0, coat=0.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        bsdf.inputs['Coat Weight'].default_value = coat
        return m
    me.materials.append(plain('racket_frame', frame_rgb, 0.28, coat=0.6))
    # strings: 16 mains × 19 crosses, ~1.3 mm, off-white poly; open between them
    sm = bpy.data.materials.new('racket_strings')
    sm.use_nodes = True
    nt = sm.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.78, 0.76, 0.66, 1)
    bsdf.inputs['Roughness'].default_value = 0.45
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['UV'], sep.inputs['Vector'])

    def lines(axis, count):
        mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = count
        nt.links.new(sep.outputs[axis], mul.inputs[0])
        fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'PINGPONG'; fr.inputs[1].default_value = 0.5
        nt.links.new(mul.outputs[0], fr.inputs[0])
        st = nt.nodes.new('ShaderNodeMath'); st.operation = 'LESS_THAN'; st.inputs[1].default_value = 0.09
        nt.links.new(fr.outputs[0], st.inputs[0])
        return st
    mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'
    nt.links.new(lines('X', 16).outputs[0], mx.inputs[0])
    nt.links.new(lines('Y', 19).outputs[0], mx.inputs[1])
    nt.links.new(mx.outputs[0], bsdf.inputs['Alpha'])
    me.materials.append(sm)
    me.materials.append(plain('racket_grip', grip_rgb, 0.85))
    if accent:
        me.materials.append(plain('racket_accent', accent, 0.3, coat=0.6))
    obj = bpy.data.objects.new('racket', me)
    bpy.context.scene.collection.objects.link(obj)

    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    hand = rig.data.bones['RightHand']
    mw = rig.matrix_world
    h0 = mw @ hand.head_local
    along = (mw.to_3x3() @ (hand.tail_local - hand.head_local)).normalized()
    thumb = rig.data.bones.get('RThumb') or rig.data.bones.get('RightHandThumb1')
    tdir = ((mw @ thumb.head_local) - h0) if thumb else Vector((0, 0, 1))
    shaft = (tdir - along * tdir.dot(along)).normalized()
    face = along.cross(shaft).normalized()
    side = shaft.cross(face).normalized()
    grip = h0 + along * 0.075 - shaft * 0.075  # the hand holds the handle near the butt
    basis = Matrix((side, shaft, face)).transposed().to_4x4()
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = 'RightHand'
    obj.matrix_world = Matrix.Translation(grip) @ basis
    rig.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    return obj
