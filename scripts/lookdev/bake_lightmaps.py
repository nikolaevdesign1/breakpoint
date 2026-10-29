# Phase 1 look-dev, step 2 (run headless, takes a few minutes on the GPU):
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/bake_lightmaps.py
# Bakes indirect lighting for static geometry into blender/lightmaps/:
#   sky (sun clamped out) direct + indirect   +   sun bounce (indirect only)
# The realtime sun in three.js adds direct sunlight and shadows on top, so it is not baked.
# Output: atlas.png / ground.png (sRGB, normalised) + lightmaps.json with the scale to undo it.

import bpy, os, json, math
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), '..'))
OUT = os.path.join(ROOT, 'blender', 'lightmaps')
os.makedirs(OUT, exist_ok=True)
SIZE = 2048
SAMPLES = int(os.environ.get('LM_SAMPLES', '128'))

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('METAL', 'OPTIX', 'CUDA', 'HIP'):
    try:
        prefs.compute_device_type = kind
        break
    except TypeError:
        continue
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene.cycles.device = 'GPU' if any(d.use and d.type != 'CPU' for d in prefs.devices) else 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.render.bake.margin = 8
scene.render.bake.margin_type = 'EXTEND'
scene.render.bake.use_clear = True
print('device', scene.cycles.device, [d.name for d in prefs.devices if d.use])

# Templates parked at the origin and invisible overlays must not cast occlusion.
hidden = []
for o in bpy.data.objects:
    if ('template' in o.name or o.name.endswith('_hl')) and not o.hide_render:
        o.hide_render = True
        hidden.append(o)

targets = [o for o in bpy.data.objects if o.type == 'MESH' and 'Lightmap' in o.data.uv_layers]
groups = {'ground': [o for o in targets if o.name == 'ground'], 'atlas': [o for o in targets if o.name != 'ground']}


def make_images(tag):
    return {g: bpy.data.images.new(f'lm_{g}_{tag}', SIZE, SIZE, float_buffer=True, alpha=False) for g in groups}


def point_nodes(images):
    for g, objs in groups.items():
        for o in objs:
            for slot in o.material_slots:
                m = slot.material
                if not m or not m.use_nodes:
                    continue
                n = m.node_tree.nodes.get('LM_BAKE') or m.node_tree.nodes.new('ShaderNodeTexImage')
                n.name = 'LM_BAKE'
                n.image = images[g]
                m.node_tree.nodes.active = n


def bake(images, passes):
    point_nodes(images)
    for o in targets:
        o.data.uv_layers.active = o.data.uv_layers['Lightmap']
    bpy.ops.object.select_all(action='DESELECT')
    for o in targets:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.object.bake(type='DIFFUSE', pass_filter=passes, use_clear=True, margin=8)


def pixels(img):
    return np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)[..., :3]


def blur(a, sigma=1.0):
    r = int(sigma * 3)
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma * sigma)); k /= k.sum()
    for axis in (0, 1):
        a = sum(np.roll(a, i, axis=axis) * w for i, w in zip(range(-r, r + 1), k))
    return a


sun = bpy.data.objects['bake_sun']
sun.hide_render = True
sky = make_images('sky')
bake(sky, {'DIRECT', 'INDIRECT'})
sun.hide_render = False
bounce = make_images('bounce')
bake(bounce, {'INDIRECT'})
sun.hide_render = True

meta = {}
for g in groups:
    lin = blur(pixels(sky[g]) + pixels(bounce[g]))
    scale = float(np.percentile(lin.max(axis=2), 99.9)) or 1.0
    v = np.clip(lin / scale, 0, 1)
    srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(f'lm_{g}', SIZE, SIZE, alpha=False)
    out.colorspace_settings.name = 'sRGB'
    rgba = np.concatenate([srgb, np.ones((SIZE, SIZE, 1))], axis=2).astype(np.float32)
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = os.path.join(OUT, f'{g}.png')
    out.file_format = 'PNG'
    out.save()
    meta[g] = {'file': f'{g}.png', 'scale': scale, 'objects': [o.name for o in groups[g]]}
    print('lightmap', g, 'scale', scale)

with open(os.path.join(OUT, 'lightmaps.json'), 'w') as f:
    json.dump(meta, f, indent=1)

# Leave the file as it was apart from the lightmap UVs: no bake nodes, templates restored.
for o in targets:
    o.data.uv_layers.active = o.data.uv_layers[0]
    for slot in o.material_slots:
        m = slot.material
        if m and m.use_nodes and 'LM_BAKE' in m.node_tree.nodes:
            m.node_tree.nodes.remove(m.node_tree.nodes['LM_BAKE'])
for o in hidden:
    o.hide_render = False
for img in list(sky.values()) + list(bounce.values()):
    bpy.data.images.remove(img)
scene.render.engine = 'BLENDER_EEVEE'
bpy.ops.wm.save_mainfile()
print('done')
