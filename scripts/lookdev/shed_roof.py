# Row 53: a gabled terracotta roof on the storage shed, so it reads as a garden building, not a box.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/shed_roof.py
import bpy, bmesh
from mathutils import Vector

shed = bpy.data.objects['storage_shed']
cs = [shed.matrix_world @ Vector(c) for c in shed.bound_box]
x0, x1 = min(c.x for c in cs) - 0.3, max(c.x for c in cs) + 0.3
y0, y1 = min(c.y for c in cs) - 0.3, max(c.y for c in cs) + 0.3
z0 = max(c.z for c in cs)
ridge = z0 + 0.95
ym = (y0 + y1) / 2

bm = bmesh.new()
v = [bm.verts.new(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, ym, ridge), (x0, ym, ridge), (x1, y1, z0), (x0, y1, z0)]]
bm.faces.new([v[0], v[1], v[2], v[3]])          # slope
bm.faces.new([v[3], v[2], v[4], v[5]])          # slope
bm.faces.new([v[0], v[3], v[5]])                # gable
bm.faces.new([v[1], v[4], v[2]])                # gable
bm.faces.new([v[0], v[5], v[4], v[1]])          # soffit
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.get('storage_shed_roof_mesh') or bpy.data.meshes.new('storage_shed_roof_mesh')
uv = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    ax = max(range(3), key=lambda i: abs(f.normal[i]))
    for l in f.loops:
        co = l.vert.co
        # slopes: metres along the eave (x) and up the slope
        l[uv].uv = (co.x, (co.z - z0) * 2.1) if ax == 2 or abs(f.normal.z) > 0.3 else ((co.y, co.z) if ax == 0 else (co.x, co.z))
bm.to_mesh(me); bm.free()
me.materials.clear()
me.materials.append(bpy.data.materials['mat_clubhouse_roof'])
roof = bpy.data.objects.get('storage_shed_roof') or bpy.data.objects.new('storage_shed_roof', me)
roof.data = me
if roof.name not in bpy.context.scene.collection.objects:
    bpy.context.scene.collection.objects.link(roof)
bpy.ops.wm.save_mainfile()
print('roof done')
