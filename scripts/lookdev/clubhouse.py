# Row 53: clubhouse in Miami stucco under a terracotta roof (Poly Haven, CC0).
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/clubhouse.py
# UV0 is box-projected in metres (the lightmap channel is left alone); also drops the
# procedural car template that sat at the origin.
import bpy, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), '..'))
PH = os.path.join(ROOT, 'blender', 'assets', 'polyhaven')


def img(rel, colour):
    i = bpy.data.images.load(os.path.join(PH, rel + '_1k.jpg'), check_existing=True)
    i.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    return i


def rebuild(mat, diff, base, tile, strength):
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    td = nt.nodes.new('ShaderNodeTexImage'); td.image = img(diff + '_diff', True)
    tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = img(base + '_rough', False)
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img(base + '_nor_gl', False)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = strength
    for t in (td, tr, tn):
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(td.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])


ch = bpy.data.objects['clubhouse']
me = ch.data
uv0 = me.uv_layers['UVMap']
mw = ch.matrix_world
for p in me.polygons:
    n = (mw.to_3x3() @ p.normal)
    ax = max(range(3), key=lambda i: abs(n[i]))
    for li in p.loop_indices:
        co = mw @ me.vertices[me.loops[li].vertex_index].co
        uv0.data[li].uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
rebuild(bpy.data.materials['mat_clubhouse_wall'], 'painted_plaster_wall/stucco', 'painted_plaster_wall/painted_plaster_wall', 3.0, 0.5)
rebuild(bpy.data.materials['mat_clubhouse_roof'], 'clay_roof_tiles_02/clay_roof_tiles_02', 'clay_roof_tiles_02/clay_roof_tiles_02', 2.5, 0.8)

for name in ['car_template', 'car_template_wheel0', 'car_template_wheel1', 'car_template_wheel2', 'car_template_wheel3']:
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o)
bpy.ops.wm.save_mainfile()
print('clubhouse done')
