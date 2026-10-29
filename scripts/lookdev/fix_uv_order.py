# Lightmap must be the second UV channel (TEXCOORD_1). Meshes that had no UVs got it as the
# first one: rename that to UVMap and add a proper Lightmap copy after it.
import bpy
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    layers = o.data.uv_layers
    if 'Lightmap' in layers and layers[0].name == 'Lightmap':
        layers[0].name = 'UVMap'
        lm = layers.new(name='Lightmap')
        for i, d in enumerate(layers['UVMap'].data):
            lm.data[i].uv = d.uv
        layers.active = lm
        layers['UVMap'].active_render = True
        print('reordered', o.name)
bpy.ops.wm.save_mainfile()
