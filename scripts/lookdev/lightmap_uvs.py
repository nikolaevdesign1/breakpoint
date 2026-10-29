# Lightmap UVs (second channel "Lightmap") for the shared atlas, re-packed after geometry changes.
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/lightmap_uvs.py
# Same atlas list as setup_materials_uvs.py (grass courts added in round 6). Run bake_lightmaps.py next.
# Row 80: `paths` keeps the per-segment islands footpaths.py gives it; all islands are then scaled alike and packed.
import bpy, bmesh, math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from setup_materials_uvs_atlas import ATLAS

atlas = [bpy.data.objects[n] for n in ATLAS if n in bpy.data.objects]
missing = [n for n in ATLAS if n not in bpy.data.objects]
for o in atlas:
    if o.data.users > 1:
        o.data = o.data.copy()
    me = o.data
    if 'UVMap' not in me.uv_layers:
        me.uv_layers.new(name='UVMap')
    lm = me.uv_layers.get('Lightmap') or me.uv_layers.new(name='Lightmap')
    me.uv_layers.active = lm
    me.uv_layers['UVMap'].active_render = True
bpy.ops.object.select_all(action='DESELECT')
for o in atlas:
    o.hide_set(False); o.hide_viewport = False
    o.select_set(True)
bpy.context.view_layer.objects.active = atlas[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.context.scene.tool_settings.use_uv_select_sync = True  # UV operators act on the mesh selection
bpy.ops.mesh.select_all(action='SELECT')
# Row 80: the footpath plane comes with its own islands (one per path segment, footpaths.py) — a single
# smart-projected island the size of the whole network would waste most of its box in the atlas.
KEEP = {'paths'}
for o in atlas:
    if o.name in KEEP:
        bm = bmesh.from_edit_mesh(o.data)
        for f in bm.faces:
            f.select = False
        bmesh.update_edit_mesh(o.data)
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=1.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.average_islands_scale()  # every island at the same texels per metre
bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
for o in atlas:
    o.data.uv_layers.active = o.data.uv_layers['UVMap']
bpy.ops.wm.save_mainfile()
print('lightmap uvs:', len(atlas), 'objects; missing', missing)
