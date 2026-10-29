# Exports the raw GLB the optimizer reads (same settings as the original export).
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/export_glb.py
# The packed park-bench UDIM images can't be exported, so they are pointed at blender/textures/
# for the export only; the .blend is not saved.
import bpy, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), '..'))
for img in bpy.data.images:
    if img.source == 'TILED' and img.packed_file:
        name = img.name
        img.unpack(method='REMOVE')
        img.filepath = '//textures/' + name
        img.reload()
bpy.ops.export_scene.gltf(
    filepath=os.path.join(ROOT, 'blender', 'clay_courts.source.glb'),
    export_format='GLB', use_selection=False, use_visible=False, use_renderable=False, use_active_collection=False,
    export_apply=True, export_yup=True, export_lights=False, export_cameras=False, export_extras=False,
    export_tangents=False, export_normals=True, export_texcoords=True, export_image_format='AUTO',
    export_materials='EXPORT', export_animations=False, export_gpu_instances=False, export_draco_mesh_compression_enable=False)
print('exported')
