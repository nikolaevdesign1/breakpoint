# Phase 1 look-dev, step 1 (run headless):
#   Blender -b blender/clay_courts.blend --python scripts/lookdev/setup_materials_uvs.py
# - PBR ground materials from Poly Haven (tinted diffuse + normal + roughness), tiled in metres
# - UV0 of those surfaces rewritten to world metres (texture scale lives in the Mapping node)
# - second UV channel "Lightmap" for static geometry (shared atlas) and the ground (own map)
# - bake world (Poly Haven sky with the sun clamped out) + a sun lamp matching three.js
# Saves the .blend in place.

import bpy, bmesh, math, os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), '..'))
PH = os.path.join(ROOT, 'blender', 'assets', 'polyhaven')
HDRI = os.path.join(PH, 'qwantani_late_afternoon_puresky', 'qwantani_late_afternoon_puresky_1k.hdr')

# material -> (diffuse, normal, roughness, tile metres, normal strength)
SURFACES = {
    'mat_clay_court': ('red_sand/clay', 'red_sand/red_sand', 2.5, 0.6),
    'mat_hardcourt': ('painted_concrete_02/hard_blue', 'painted_concrete_02/painted_concrete_02', 3.0, 0.4),
    'mat_apron_acrylic': ('painted_concrete_02/apron_green', 'painted_concrete_02/painted_concrete_02', 3.0, 0.4),
    'mat_padelcourt': ('dirty_carpet/padel_turf', 'dirty_carpet/dirty_carpet', 1.0, 0.7),
    'mat_grass_tex': ('sparse_grass/lawn', 'sparse_grass/sparse_grass', 4.0, 0.8),
    'mat_asphalt': ('asphalt_02/asphalt', 'asphalt_02/asphalt_02', 4.0, 0.8),
    'mat_path': ('brushed_concrete/path', 'brushed_concrete/brushed_concrete', 2.5, 0.6),
}

import sys
sys.path.insert(0, os.path.dirname(__file__))
from setup_materials_uvs_atlas import ATLAS  # grass courts: round 6 (Plane.001/.005 → grass-N_apron)
GROUND = 'ground'


def image(rel, colour):
    path = os.path.join(PH, rel + '_1k.jpg')
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    return img


def rebuild(mat, diff, base, tile, strength):
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (500, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (200, 0)
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'; uv.location = (-900, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 0)
    mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])
    tex_d = nt.nodes.new('ShaderNodeTexImage'); tex_d.image = image(diff + '_diff', True); tex_d.location = (-400, 300)
    tex_r = nt.nodes.new('ShaderNodeTexImage'); tex_r.image = image(base + '_rough', False); tex_r.location = (-400, 0)
    tex_n = nt.nodes.new('ShaderNodeTexImage'); tex_n.image = image(base + '_nor_gl', False); tex_n.location = (-400, -300)
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.location = (-100, -300); nmap.inputs['Strength'].default_value = strength
    for t in (tex_d, tex_r, tex_n):
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    nt.links.new(tex_d.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex_r.outputs['Color'], bsdf.inputs['Roughness'])
    nt.links.new(tex_n.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Specular IOR Level'].default_value = 0.4


def world_uvs(obj):
    """UV0 in world metres (x, y): tiling is then set per material."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv0 = me.uv_layers[0]
    uv0.name = 'UVMap'
    mw = obj.matrix_world
    for loop in me.loops:
        co = mw @ me.vertices[loop.vertex_index].co
        uv0.data[loop.index].uv = (co.x, co.y)


def lightmap_layer(obj):
    me = obj.data
    lm = me.uv_layers.get('Lightmap') or me.uv_layers.new(name='Lightmap')
    me.uv_layers.active = lm
    me.uv_layers['UVMap' if 'UVMap' in me.uv_layers else 0].active_render = True
    return lm


# 1) materials + world-metre UVs
users = {}
for o in bpy.data.objects:
    if o.type == 'MESH':
        for s in o.material_slots:
            if s.material and s.material.name in SURFACES:
                users.setdefault(o.name, o)
for name, (diff, base, tile, strength) in SURFACES.items():
    rebuild(bpy.data.materials[name], diff, base, tile, strength)
for o in users.values():
    if o.data.users > 1:
        o.data = o.data.copy()
    world_uvs(o)
print('surfaces:', sorted(users))

# 2) lightmap UVs: one shared atlas for static geometry, a planar map for the ground
atlas = [bpy.data.objects[n] for n in ATLAS if n in bpy.data.objects]
for o in atlas:
    if o.data.users > 1:
        o.data = o.data.copy()
    lightmap_layer(o)
bpy.ops.object.select_all(action='DESELECT')
for o in atlas:
    o.hide_set(False); o.hide_viewport = False
    o.select_set(True)
bpy.context.view_layer.objects.active = atlas[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=1.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')

g = bpy.data.objects[GROUND]
lm = lightmap_layer(g)
xs = [v.co.x for v in g.data.vertices]; ys = [v.co.y for v in g.data.vertices]
for loop in g.data.loops:
    co = g.data.vertices[loop.vertex_index].co
    lm.data[loop.index].uv = ((co.x - min(xs)) / (max(xs) - min(xs)), (co.y - min(ys)) / (max(ys) - min(ys)))

# 3) bake lighting: sky with the sun clamped out + a sun lamp (used for bounce only)
world = bpy.data.worlds.get('Sky_Bake') or bpy.data.worlds.new('Sky_Bake')
world.use_nodes = True
wt = world.node_tree; wt.nodes.clear()
env = wt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI, check_existing=True)
mn = wt.nodes.new('ShaderNodeVectorMath'); mn.operation = 'MINIMUM'; mn.inputs[1].default_value = (8, 8, 8)
bg = wt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 1.0
wo = wt.nodes.new('ShaderNodeOutputWorld')
wt.links.new(env.outputs['Color'], mn.inputs[0]); wt.links.new(mn.outputs['Vector'], bg.inputs['Color'])
wt.links.new(bg.outputs['Background'], wo.inputs['Surface'])
bpy.context.scene.world = world

# Sun: HDRI azimuth (u = 0.6), lifted to 30° for readable shadows; colour/irradiance measured from the HDRI.
theta = (0.5999 - 0.5) * 2 * math.pi
elev = math.radians(30)
d3 = Vector((math.cos(elev) * math.cos(theta), math.sin(elev), math.cos(elev) * math.sin(theta)))  # three.js, y-up
db = Vector((d3.x, -d3.z, d3.y))  # Blender, z-up
sun_data = bpy.data.lights.get('bake_sun') or bpy.data.lights.new('bake_sun', 'SUN')
sun_data.energy = 7.6
sun_data.color = (1.0, 0.807, 0.572)
sun_data.angle = math.radians(0.6)
sun = bpy.data.objects.get('bake_sun') or bpy.data.objects.new('bake_sun', sun_data)
if sun.name not in bpy.context.scene.collection.objects:
    bpy.context.scene.collection.objects.link(sun)
sun.rotation_euler = db.to_track_quat('Z', 'Y').to_euler()
sun.hide_render = True  # switched on only for the bounce pass
print('sun dir three.js', tuple(round(c, 4) for c in d3))

bpy.ops.wm.save_mainfile()
print('saved', bpy.data.filepath)
