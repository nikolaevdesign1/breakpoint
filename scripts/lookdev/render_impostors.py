# Renders camera-facing impostor sprites for the booking map (row 53).
#   Blender -b --factory-startup --python scripts/lookdev/render_impostors.py [-- only_id ...]
# The map camera never rotates (fixed 52° pitch, looking towards −z in three.js), so a single
# sprite per object, rendered from that exact direction and lit by the same sky + sun as the
# page, reads as a full 3D model at a cost of two triangles. Heavy CC0 models are fine here:
# they never reach the browser.
# Output: blender/impostors/<id>.png (RGBA) + impostors.json (world size and base anchor).

import bpy, json, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'blender', 'assets')
OUT = os.path.join(ROOT, 'blender', 'impostors')
HDRI = os.path.join(ASSETS, 'polyhaven', 'qwantani_late_afternoon_puresky', 'qwantani_late_afternoon_puresky_1k.hdr')
os.makedirs(OUT, exist_ok=True)

PITCH = 52.0
SUN_THREE = Vector((0.7009, 0.5, 0.5086)).normalized()
SUN_BL = Vector((SUN_THREE.x, -SUN_THREE.z, SUN_THREE.y))


def ph(a):
    return ('gltf', os.path.join(ASSETS, 'polyhaven', 'models', a, a + '.gltf'))

def bk(f):
    return ('blend', os.path.join(ASSETS, 'blendkit', f + '.blend'))

# id, source, part filter, target size (height for plants, length for cars), yaw (deg), paint, px per metre
JOBS = []
for yaw, sfx in ((0, 'a'), (140, 'b')):
    JOBS.append(dict(id=f'tree_island1{sfx}', src=ph('island_tree_01'), height=11.5, yaw=yaw, ppm=90))
for yaw, sfx in ((0, 'a'), (200, 'b')):
    JOBS.append(dict(id=f'tree_island2{sfx}', src=ph('island_tree_02'), height=8.5, yaw=yaw, ppm=90))
for yaw, h, sfx in ((0, 1.5, 'a'), (120, 1.9, 'b'), (240, 1.2, 'c')):
    JOBS.append(dict(id=f'bush_{sfx}', src=('blend', os.path.join(ASSETS, 'blendkit', 'shrub', 'shrub_1K_aa4ebf2c-17b0-4267-8872-2c9fd2c43061.blend')), height=h, yaw=yaw, ppm=120))
# Parked cars are real meshes in the model since round 6 (scripts/lookdev/cars.py): no car sprites.
# Row 150: garden variety from the same CC0 shrub. Flowering shrubs (bougainvillea, hibiscus, lantana
# mounds) get blossoms scattered over their leaves; the orchard's citrus trees are the shrub as a
# rounded crown on a short trunk, hung with fruit. blooms: (colour, colour 2, density per m², size m).
SHRUB = ('blend', os.path.join(ASSETS, 'blendkit', 'shrub', 'shrub_1K_aa4ebf2c-17b0-4267-8872-2c9fd2c43061.blend'))
JOBS += [
    dict(id='flower_a', src=SHRUB, height=1.9, yaw=60, ppm=120, squash=(0.75, 0.75, 1.0), blooms=[('#B4236E', '#D23C8C', 45, 0.032)]),   # bougainvillea
    dict(id='flower_b', src=SHRUB, height=1.6, yaw=200, ppm=120, blooms=[('#C21E1A', '#E0482A', 9, 0.055)]),    # hibiscus
    dict(id='flower_c', src=SHRUB, height=0.7, yaw=300, ppm=140, squash=(1.2, 1.2, 1.0),
         blooms=[('#E8B21E', '#E86A1E', 55, 0.022), ('#D9508C', '#F2E2B0', 25, 0.022)]),                       # lantana mound
    dict(id='fruit_a', src=SHRUB, height=2.4, yaw=30, ppm=110, trunk=0.7, squash=(0.8, 0.8, 1.0), blooms=[('#E8861A', '#F0A02C', 3.5, 0.045)]),  # orange
    dict(id='fruit_b', src=SHRUB, height=2.2, yaw=170, ppm=110, trunk=0.6, squash=(0.75, 0.75, 1.0), blooms=[('#E6C928', '#B8C23A', 3.5, 0.04)]),  # lemon / lime
]

only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def setup_world(scene):
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    wt = world.node_tree; wt.nodes.clear()
    env = wt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI, check_existing=True)
    mn = wt.nodes.new('ShaderNodeVectorMath'); mn.operation = 'MINIMUM'; mn.inputs[1].default_value = (8, 8, 8)
    bg = wt.nodes.new('ShaderNodeBackground')
    out = wt.nodes.new('ShaderNodeOutputWorld')
    wt.links.new(env.outputs['Color'], mn.inputs[0]); wt.links.new(mn.outputs['Vector'], bg.inputs['Color'])
    wt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    scene.world = world
    sun_data = bpy.data.lights.new('sun', 'SUN')
    sun_data.energy = 7.6; sun_data.color = (1.0, 0.807, 0.572); sun_data.angle = math.radians(0.6)
    sun = bpy.data.objects.new('sun', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = SUN_BL.to_track_quat('Z', 'Y').to_euler()


def setup_render(scene):
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
    except TypeError:
        pass
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = 'GPU'
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'


def open_scene(job):
    """BlendKit assets are opened as they were saved (rigs, modifiers, hidden helpers intact)."""
    kind, path = job['src']
    if kind == 'blend':
        bpy.ops.wm.open_mainfile(filepath=path)
        for o in list(bpy.data.objects):
            if o.type in ('CAMERA', 'LIGHT'):
                bpy.data.objects.remove(o)
    else:
        bpy.ops.wm.read_homefile(use_empty=True)


def load(job):
    kind, path = job['src']
    before = set(bpy.data.objects)
    if kind == 'proc':
        raise ValueError('procedural jobs were the car sprites (now meshes, scripts/lookdev/cars.py)')
    if kind == 'gltf':
        bpy.ops.import_scene.gltf(filepath=path)
        objs = [o for o in bpy.data.objects if o not in before]
    else:
        objs = [o for o in bpy.context.scene.objects if o.visible_get() or o.type == 'ARMATURE']
    if job.get('part'):
        keep = [o for o in objs if o.name.startswith(job['part'])]
        for o in objs:
            if o not in keep:
                bpy.data.objects.remove(o)
        objs = keep
    return [o for o in objs if (o.type == 'MESH' and not o.hide_render) or o.type == 'ARMATURE']


def world_bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def normalise(job, objs):
    if job['src'][0] == 'proc':
        root = bpy.data.objects.new('root', None)
        bpy.context.scene.collection.objects.link(root)
        for o in objs:
            o.parent = root
        root.rotation_euler = (0, 0, math.radians(job['yaw']))
        bpy.context.view_layer.update()
        return
    return _normalise(job, objs)


def _normalise(job, objs):
    """Base centre to the origin, scaled to size; cars turned so their nose points −y (towards the camera at yaw 0)."""
    root = bpy.data.objects.new('root', None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None or o.parent not in objs:
            mw = o.matrix_world.copy()
            o.parent = root
            o.matrix_world = mw
    mn, mx = world_bbox(objs)
    centre = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    turn = 0.0
    if job.get('car'):
        # Long axis along y; nose = the end away from the red tail lights.
        if (mx.x - mn.x) > (mx.y - mn.y):
            turn += 90.0
        tails = [o.matrix_world @ Vector(c) for o in objs for s in o.material_slots
                 if s.material and any(k in s.material.name.lower() for k in ('tail', 'red_', 'red '))
                 for c in o.bound_box]
        if tails:
            rot = Matrix.Rotation(math.radians(turn), 4, 'Z')
            ty = sum((rot @ (p - centre)).y for p in tails) / len(tails)
            if ty < 0:  # tail lights on −y → nose on +y: turn it round
                turn += 180.0
        length = max(mx.x - mn.x, mx.y - mn.y)
        scale = job['length'] / length if 'length' in job else 1
    else:
        scale = job['height'] / (mx.z - mn.z)
    size = Matrix.Scale(scale, 4)
    if job.get('dims'):  # stylised kit proportions → real ones: length (y), width (x), height (z)
        L, W, H = job['dims']
        size = Matrix.Diagonal(((W / (mx.x - mn.x)), (L / (mx.y - mn.y)), (H / (mx.z - mn.z)), 1))
    root.matrix_world = (Matrix.Rotation(math.radians(turn + job['yaw']), 4, 'Z') @ size
                         @ Matrix.Translation(-centre))
    bpy.context.view_layer.update()


def repaint(job, objs):
    cover = job.get('cover')
    if cover:  # tint the cover fabric, keeping its photoscanned shading
        for o in objs:
            for slot in o.material_slots:
                m = slot.material
                if not m or not m.use_nodes or 'wheel' in m.name.lower():
                    continue
                nt = m.node_tree
                bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                link = bsdf and next((l for l in nt.links if l.to_socket == bsdf.inputs['Base Color']), None)
                if not link:
                    continue
                mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
                mix.inputs['Factor'].default_value = 1.0
                mix.inputs[7].default_value = (*COVERS[cover], 1)
                nt.links.new(link.from_socket, mix.inputs[6])
                nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])


def _hex(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def dress(job, objs):
    """Garden variants (row 150): squash/stretch the crown, lift it on a trunk, scatter blossoms or fruit."""
    root = bpy.data.objects.get('root')
    extra = []
    if job.get('squash'):
        root.matrix_world = Matrix.Diagonal((*job['squash'], 1)) @ root.matrix_world
    if job.get('trunk'):
        t = job['trunk']
        root.matrix_world = Matrix.Translation((0, 0, t)) @ root.matrix_world
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.07, depth=t + 0.5, location=(0, 0, (t + 0.5) / 2))
        trunk = bpy.context.object
        m = bpy.data.materials.new('bark'); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*_hex('#5A4636'), 1); b.inputs['Roughness'].default_value = 0.9
        trunk.data.materials.append(m)
        extra.append(trunk)
    bpy.context.view_layer.update()
    leaves = max((o for o in objs if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
    for k, (c1, c2, density, size) in enumerate(job.get('blooms', [])):
        # Points on the evaluated leaves (world space), each a small rounded blossom / fruit.
        me = bpy.data.meshes.new(f'blooms{k}')
        ob = bpy.data.objects.new(f'blooms{k}', me)
        bpy.context.scene.collection.objects.link(ob)
        gn = ob.modifiers.new('gn', 'NODES')
        tree = bpy.data.node_groups.new(f'blooms{k}', 'GeometryNodeTree')
        tree.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        N = tree.nodes
        info = N.new('GeometryNodeObjectInfo'); info.transform_space = 'RELATIVE'; info.inputs['Object'].default_value = leaves
        dist = N.new('GeometryNodeDistributePointsOnFaces'); dist.inputs['Density'].default_value = density
        dist.inputs['Seed'].default_value = 7 + k
        ico = N.new('GeometryNodeMeshIcoSphere'); ico.inputs['Radius'].default_value = size; ico.inputs['Subdivisions'].default_value = 1
        rnd = N.new('FunctionNodeRandomValue'); rnd.data_type = 'FLOAT'
        fl = lambda socks: [x for x in socks if x.type == 'VALUE' and x.enabled]
        fl(rnd.inputs)[0].default_value = 0.6; fl(rnd.inputs)[1].default_value = 1.4
        inst = N.new('GeometryNodeInstanceOnPoints')
        real = N.new('GeometryNodeRealizeInstances')
        col = N.new('FunctionNodeRandomValue'); col.data_type = 'FLOAT'
        store = N.new('GeometryNodeStoreNamedAttribute'); store.data_type = 'FLOAT'; store.domain = 'POINT'; store.inputs['Name'].default_value = 'mixc'
        out = N.new('NodeGroupOutput')
        L = tree.links
        L.new(info.outputs['Geometry'], dist.inputs['Mesh'])
        L.new(dist.outputs['Points'], inst.inputs['Points'])
        L.new(ico.outputs['Mesh'], inst.inputs['Instance'])
        L.new(fl(rnd.outputs)[0], inst.inputs['Scale'])
        L.new(inst.outputs['Instances'], store.inputs['Geometry'])
        L.new(fl(col.outputs)[0], store.inputs['Value'])
        store.domain = 'INSTANCE'
        setm = N.new('GeometryNodeSetMaterial')
        L.new(store.outputs['Geometry'], real.inputs['Geometry'])
        L.new(real.outputs['Geometry'], setm.inputs['Geometry'])
        L.new(setm.outputs['Geometry'], out.inputs['Geometry'])
        gn.node_group = tree
        m = bpy.data.materials.new(f'bloom{k}'); m.use_nodes = True
        setm.inputs['Material'].default_value = m
        nt = m.node_tree; b = nt.nodes['Principled BSDF']
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'mixc'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs[6].default_value = (*_hex(c1), 1); mix.inputs[7].default_value = (*_hex(c2), 1)
        nt.links.new(at.outputs['Fac'], mix.inputs['Factor'])
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 0.55
        b.inputs['Subsurface Weight'].default_value = 0.2
        me.materials.append(m)
        extra.append(ob)
    bpy.context.view_layer.update()
    return extra


def frame_and_render(job, objs, scene):
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
    scene.camera = cam
    rot = Matrix.Rotation(math.radians(90 - PITCH), 4, 'X')
    right = (rot @ Vector((1, 0, 0, 0))).xyz
    up = (rot @ Vector((0, 1, 0, 0))).xyz
    fwd = (rot @ Vector((0, 0, -1, 0))).xyz
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    us = [p.dot(right) for p in pts]; vs = [p.dot(up) for p in pts]
    pad = 0.04
    u0, u1 = min(us), max(us); v0, v1 = min(vs), max(vs)
    w = (u1 - u0) * (1 + pad); h = (v1 - v0) * (1 + pad)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    cam.matrix_world = Matrix.Translation(right * cu + up * cv - fwd * 200) @ rot
    cam_data.ortho_scale = max(w, h)
    cam_data.clip_end = 1000
    k = min(1.0, 1024 / (max(w, h) * job['ppm']))
    scene.render.resolution_x = max(32, round(w * job['ppm'] * k))
    scene.render.resolution_y = max(32, round(h * job['ppm'] * k))
    scene.render.resolution_percentage = 100
    # Ortho scale spans the larger side; the image keeps the true aspect.
    if w >= h:
        cam_data.sensor_fit = 'HORIZONTAL'
    else:
        cam_data.sensor_fit = 'VERTICAL'
    scene.render.filepath = os.path.join(OUT, job['id'] + '.png')
    bpy.ops.render.render(write_still=True)
    # Where the base (world origin) lands in the image, 0..1 from the bottom-left.
    anchor = ((0 - (cu - w / 2)) / w, (0 - (cv - h / 2)) / h)
    return {'w': w, 'h': h, 'anchor': [round(anchor[0], 4), round(anchor[1], 4)],
            'px': [scene.render.resolution_x, scene.render.resolution_y]}


meta_path = os.path.join(OUT, 'impostors.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
for job in JOBS:
    if only and job['id'] not in only and not any(job['id'].startswith(o) for o in only):
        continue
    open_scene(job)
    scene = bpy.context.scene
    setup_render(scene)
    setup_world(scene)
    objs = load(job)
    normalise(job, objs)
    repaint(job, objs)
    objs = objs + dress(job, objs)
    info = frame_and_render(job, objs, scene)
    meta[job['id']] = info
    print('impostor', job['id'], info)
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=1)
