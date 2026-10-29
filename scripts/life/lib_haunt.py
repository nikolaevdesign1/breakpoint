# Shared pieces of the Halloween sprites (render_death.py, render_ghosts.py): materials, rest-pose
# points, hand-built meshes, rigid and weighted binding to the MPFB rig, the aim helper.
import bpy, bmesh, math, random
from mathutils import Matrix, Vector, Quaternion

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


def rigid(obj, rig, bone):
    """Follows one bone exactly (weight 1): the hood, the skull, the eyes ride on the head."""
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    mod = obj.modifiers.new('arm', 'ARMATURE')
    mod.object = rig


