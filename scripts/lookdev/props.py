# Row 53: realistic court furniture, modelled here (no suitable free CC0 assets exist).
#   Blender -b --factory-startup blender/clay_courts.blend --python scripts/lookdev/props.py
# - Umpire chairs: green steel frame, ladder, footrest, seat and a canvas canopy (2.9 m), one
#   shared mesh, each chair at its court's net post facing the court.
# - Floodlight poles: 9 m galvanised poles with a cross-arm and two tilted LED luminaires,
#   aimed at their court; the lens is a separate shared mesh (emissive on the page).
# - Storage shed: stucco walls to match the clubhouse.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(bpy.data.filepath), '..'))


def material(name, colour, rough, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*colour, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


class Builder:
    """Tiny bmesh helper: boxes and round tubes with a material index."""

    def __init__(self, name, mats):
        self.bm = bmesh.new()
        self.name = name
        self.mats = mats

    def _tag(self, faces, mat):
        for f in faces:
            f.material_index = mat

    def box(self, lo, hi, mat=0, matrix=None):
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = r['verts']
        size = Vector(hi) - Vector(lo)
        centre = (Vector(hi) + Vector(lo)) / 2
        bmesh.ops.scale(self.bm, vec=size, verts=verts)
        bmesh.ops.translate(self.bm, vec=centre, verts=verts)
        if matrix:
            bmesh.ops.transform(self.bm, matrix=matrix, verts=verts)
        self._tag({f for v in verts for f in v.link_faces}, mat)

    def tube(self, a, b, r, mat=0, seg=8):
        a, b = Vector(a), Vector(b)
        d = b - a
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)
        verts = res['verts']
        rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=verts)
        self._tag({f for v in verts for f in v.link_faces}, mat)

    def mesh(self):
        me = bpy.data.meshes.get(self.name) or bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.clear()
        for m in self.mats:
            me.materials.append(m)
        for p in me.polygons:
            p.use_smooth = False
        return me


# --- Materials --------------------------------------------------------------------
frame = material('mat_umpire_frame', (0.025, 0.07, 0.045), 0.45, 0.3)
seat = material('mat_umpire_seat', (0.03, 0.08, 0.05), 0.5)
canvas = material('mat_umpire_canopy', (0.72, 0.69, 0.6), 0.85)
pole_mat = material('mat_flood_pole', (0.55, 0.56, 0.57), 0.35, 0.85)
housing = material('mat_flood_housing', (0.06, 0.065, 0.07), 0.4, 0.6)
lens = bpy.data.materials['mat_stadium_light']

# --- Umpire chair (front = +Y, origin at the floor centre) ---------------------------
u = Builder('umpire_chair_mesh', [frame, seat, canvas])
legs = [(-0.42, -0.45), (0.42, -0.45), (-0.36, 0.38), (0.36, 0.38)]
top = [(-0.32, -0.3), (0.32, -0.3), (-0.32, 0.25), (0.32, 0.25)]
for (x0, y0), (x1, y1) in zip(legs, top):
    u.tube((x0, y0, 0), (x1, y1, 1.95), 0.03)
for z in (0.55, 1.15):  # side braces
    u.tube((-0.39, -0.42 + z * 0.06, z), (0.39, -0.42 + z * 0.06, z), 0.018)
for k in range(1, 6):  # ladder at the back
    z = k * 0.34
    u.tube((-0.4 + z * 0.04, -0.43 + z * 0.065, z), (0.4 - z * 0.04, -0.43 + z * 0.065, z), 0.02)
u.box((-0.36, -0.34, 1.93), (0.36, 0.32, 1.98), 0)          # platform
u.box((-0.27, -0.24, 1.98), (0.27, 0.22, 2.08), 1)          # seat
u.box((-0.27, -0.3, 2.08), (0.27, -0.24, 2.62), 1)          # backrest
for x in (-0.33, 0.33):
    u.box((x - 0.025, -0.28, 2.25), (x + 0.025, 0.24, 2.29), 0)  # armrests
    u.tube((x, 0.22, 1.98), (x, 0.22, 2.27), 0.015)
u.box((-0.3, 0.32, 1.2), (0.3, 0.62, 1.24), 0)              # footrest
u.tube((-0.25, 0.36, 1.22), (-0.3, 0.3, 1.9), 0.018)
u.tube((0.25, 0.36, 1.22), (0.3, 0.3, 1.9), 0.018)
u.tube((0, -0.29, 2.62), (0, -0.29, 2.95), 0.022)            # canopy post
u.box((-0.55, -0.62, 2.94), (0.55, 0.42, 2.98), 2)           # canopy
umpire_mesh = u.mesh()

# --- Floodlight (front = +Y towards the court) ------------------------------------
H = 9.0
f = Builder('flood_pole_mesh', [pole_mat, housing])
f.tube((0, 0, 0), (0, 0, H), 0.09, 0, seg=10)
f.tube((0, 0, H - 0.6), (0, 0, H - 0.2), 0.12, 0, seg=10)   # sleeve
f.box((-0.9, -0.05, H - 0.28), (0.9, 0.05, H - 0.18), 0)    # cross-arm
tilt = Matrix.Rotation(math.radians(-28), 4, 'X')
heads = []
for x in (-0.6, 0.6):
    m = Matrix.Translation((x, 0.18, H - 0.32)) @ tilt
    f.box((-0.3, -0.06, -0.2), (0.3, 0.06, 0.2), 1, matrix=m)
    heads.append(m)
pole_mesh = f.mesh()

g = Builder('flood_lens_mesh', [lens])
for m in heads:  # lens face just in front of each housing, facing the court and down
    g.box((-0.27, 0.06, -0.17), (0.27, 0.075, 0.17), 0, matrix=m)
lens_mesh = g.mesh()

# --- Place them ------------------------------------------------------------------------
def court_centre(court):
    o = bpy.data.objects[court]
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(((min(c.x for c in cs) + max(c.x for c in cs)) / 2, (min(c.y for c in cs) + max(c.y for c in cs)) / 2, 0))


def face(obj, target):
    d = target - obj.location
    obj.rotation_euler = (0, 0, math.atan2(-d.x, d.y))


for o in [o for o in bpy.data.objects if o.name.endswith('_umpire')]:
    court = o.name[:-len('_umpire')]
    c = court_centre(court)
    o.data = umpire_mesh
    o.scale = (1, 1, 1)
    o.location = (c.x + 6.15, c.y, 0)  # at the net post on the benches' side
    face(o, c)

for o in [o for o in bpy.data.objects if o.name.endswith('_pole') and '_lamp' in o.name]:
    court = o.name.split('_lamp')[0]
    o.data = pole_mesh
    face(o, court_centre(court))
    bulb = bpy.data.objects.get(o.name.replace('_pole', '_bulb'))
    if bulb:
        bulb.data = lens_mesh
        bulb.location = (o.location.x, o.location.y, 0)
        bulb.rotation_euler = o.rotation_euler

# Storage shed: same stucco as the clubhouse (box-projected metre UVs on UV0).
shed = bpy.data.objects['storage_shed']
me = shed.data
uv0 = me.uv_layers['UVMap']
for p in me.polygons:
    ax = max(range(3), key=lambda i: abs(p.normal[i]))
    for li in p.loop_indices:
        co = shed.matrix_world @ me.vertices[me.loops[li].vertex_index].co
        uv0.data[li].uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
slots = me.materials
for i, m in enumerate(slots):
    if m and m.name == 'mat_shed_wall':
        slots[i] = bpy.data.materials['mat_clubhouse_wall']

bpy.ops.wm.save_mainfile()
print('props done')
