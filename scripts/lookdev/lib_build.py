# Shared helpers for the procedural props of the booking map (round 6: rows 62–71).
# Imported by the other lookdev scripts:  sys.path.insert(0, <this dir>); from lib_build import *
#
# Every small prop (cars, decor, dome rolls, clubhouse trim) is drawn with ONE material, `mat_props`:
# its base colour and roughness/metalness come from a palette texture (nearest-filtered), and each face
# points its UVs at one swatch. After the optimizer joins meshes by material, all of those props cost a
# single draw call in the browser.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEX = os.path.join(ROOT, 'blender', 'textures')

# name: (sRGB hex, roughness, metalness)
SWATCHES = {
    # car paints (calm palette from the site)
    'paint_white': ('#E6E5E0', 0.26, 0.0), 'paint_black': ('#111214', 0.24, 0.25), 'paint_silver': ('#A6A9AD', 0.3, 0.7),
    'paint_sand': ('#C2AD88', 0.3, 0.1), 'paint_terracotta': ('#9A472B', 0.3, 0.1), 'paint_olive': ('#5C5F3C', 0.32, 0.1),
    # car parts
    'car_glass': ('#0A0C0F', 0.04, 0.0), 'car_trim': ('#141516', 0.55, 0.0), 'tyre': ('#1B1B1B', 0.92, 0.0),
    'rim': ('#BDBFC2', 0.28, 0.9), 'rim_dark': ('#232425', 0.45, 0.5), 'lamp_front': ('#DADDE0', 0.06, 0.3),
    'lamp_rear': ('#7E140E', 0.15, 0.0), 'lamp_amber': ('#C26A18', 0.2, 0.0), 'plate': ('#E2E0D8', 0.5, 0.0),
    'chrome': ('#CDCFD2', 0.12, 1.0), 'seam': ('#08090A', 0.7, 0.0),
    # building trim
    'alu_frame': ('#2E3032', 0.4, 0.6), 'white_paint': ('#ECEAE4', 0.5, 0.0), 'concrete': ('#B9B5AC', 0.85, 0.0),
    'concrete_dark': ('#77736C', 0.9, 0.0), 'plinth': ('#5A5650', 0.92, 0.0), 'ridge_tile': ('#8C4127', 0.7, 0.0),
    'gutter': ('#E6E4DE', 0.4, 0.15), 'steel_dark': ('#2A2C2E', 0.45, 0.7), 'steel_galv': ('#9B9FA2', 0.4, 0.8),
    'ac_white': ('#E2E2DC', 0.45, 0.0), 'ac_grille': ('#3E4041', 0.6, 0.3), 'lamp_warm': ('#F1DFB2', 0.2, 0.0),
    'door_dark': ('#1C1E1F', 0.45, 0.3),
    # court decor
    'ball': ('#D1E04A', 0.85, 0.0), 'wire': ('#A7A39A', 0.4, 0.6), 'plastic_black': ('#1E1F20', 0.5, 0.0),
    'plastic_grey': ('#6A6D6F', 0.5, 0.0), 'plastic_white': ('#E7E7E3', 0.45, 0.0), 'bottle_blue': ('#86AACB', 0.15, 0.0),
    'cone_orange': ('#E06428', 0.55, 0.0), 'towel_white': ('#F1EEE6', 0.95, 0.0), 'towel_red': ('#9C441F', 0.95, 0.0),
    'towel_cream': ('#F4E6C8', 0.95, 0.0), 'planter': ('#A8A398', 0.9, 0.0), 'planter_dark': ('#3B3A38', 0.8, 0.0),
    'soil': ('#3A2D21', 1.0, 0.0), 'mulch': ('#5B4632', 1.0, 0.0), 'agave': ('#6F8E80', 0.6, 0.0), 'agave_dark': ('#4D6A5C', 0.65, 0.0),
    'agave_tip': ('#B3A46A', 0.7, 0.0), 'frond': ('#4F6B2D', 0.7, 0.0), 'frond_dark': ('#3A5222', 0.75, 0.0),
    'trunk': ('#7B6B56', 0.9, 0.0), 'rock': ('#8F887C', 0.9, 0.0), 'rock_light': ('#ABA497', 0.88, 0.0),
    'rock_dark': ('#69635A', 0.92, 0.0), 'bin_dark': ('#2D3032', 0.55, 0.2), 'machine': ('#262829', 0.5, 0.2),
    'machine_accent': ('#9C441F', 0.5, 0.0),
    # dome rolls
    'pvc_white': ('#D3D5D0', 0.6, 0.0), 'pvc_grey': ('#B9BCB7', 0.65, 0.0), 'pvc_shade': ('#9B9E99', 0.7, 0.0),
    'strap_orange': ('#DD7A1E', 0.6, 0.0), 'strap_yellow': ('#DDB021', 0.6, 0.0), 'timber': ('#8B6B48', 0.85, 0.0),
    'timber_dark': ('#5F4B36', 0.9, 0.0), 'tarp': ('#3F4B45', 0.8, 0.0), 'tarp_dark': ('#323C37', 0.85, 0.0),
    'blower': ('#A3A7A8', 0.5, 0.5), 'grille_dark': ('#1F2021', 0.6, 0.3),
    # rest-zone deck and garden (rows 147, 150); appended so earlier swatches keep their cells
    'deck': ('#94704E', 0.8, 0.0), 'deck_light': ('#A88560', 0.78, 0.0), 'deck_dark': ('#6E5139', 0.85, 0.0),
    'canvas': ('#EEE6D4', 0.9, 0.0), 'cushion': ('#E4DCC8', 0.95, 0.0), 'poly': ('#CFD8CF', 0.3, 0.0),
    'gravel': ('#B5AA98', 0.95, 0.0), 'lettuce': ('#6F9A3E', 0.7, 0.0), 'lettuce_dark': ('#47702C', 0.75, 0.0),
    # row 179: glass greenhouses (brick base wall, orchids, tomatoes); these four fill the fifth row,
    # one more swatch adds a row and moves every cell: rerun all the mat_props scripts then
    'brick': ('#8E4D36', 0.88, 0.0), 'orchid': ('#C978A6', 0.6, 0.0), 'tomato': ('#B22E1A', 0.32, 0.0),
    'leaf_lime': ('#86A846', 0.65, 0.0),
}
CELL, COLS = 16, 16
NAMES = list(SWATCHES)
ROWS = (len(NAMES) + COLS - 1) // COLS


def _hex(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def swatch_uv(name):
    i = NAMES.index(name)
    c, r = i % COLS, i // COLS
    return ((c + 0.5) / COLS, 1 - (r + 0.5) / ROWS)


def palette_images():
    """Writes the base-colour and metal/rough palettes (PNG, sRGB / linear) and loads them."""
    import numpy as np
    w, h = COLS * CELL, ROWS * CELL
    col = np.zeros((h, w, 4), np.float32); col[..., 3] = 1
    mr = np.zeros((h, w, 4), np.float32); mr[..., 3] = 1
    for i, n in enumerate(NAMES):
        hx, rough, metal = SWATCHES[n]
        c, r = i % COLS, i // COLS
        ys = slice(h - (r + 1) * CELL, h - r * CELL)  # Blender pixels start bottom-left
        xs = slice(c * CELL, (c + 1) * CELL)
        col[ys, xs, :3] = _hex(hx)
        mr[ys, xs, 0] = 1.0; mr[ys, xs, 1] = rough; mr[ys, xs, 2] = metal
    out = []
    for name, arr in (('props_palette', col), ('props_palette_mr', mr)):
        img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=False)
        if tuple(img.size) != (w, h):
            img.scale(w, h)
        img.colorspace_settings.name = 'sRGB' if name == 'props_palette' else 'Non-Color'
        img.pixels.foreach_set(arr.ravel())
        img.filepath_raw = os.path.join(TEX, name + '.png')
        img.file_format = 'PNG'
        img.save()
        img.source = 'FILE'
        img.filepath = '//textures/' + name + '.png'
        img.reload()
        out.append(img)
    return out


def props_material(name='mat_props'):
    col, mr = palette_images()
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = col; tc.interpolation = 'Closest'
    tm = nt.nodes.new('ShaderNodeTexImage'); tm.image = mr; tm.interpolation = 'Closest'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tc.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m


def collection(name, clear=True):
    """A fresh collection under the scene root (previous content removed: scripts are re-runnable)."""
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    elif clear:
        for o in list(c.objects):
            me = o.data if o.type == 'MESH' else None
            bpy.data.objects.remove(o)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
    return c


class Props:
    """bmesh builder whose faces carry a palette swatch (→ UVs) instead of material slots."""

    def __init__(self):
        self.bm = bmesh.new()
        self.sw = self.bm.faces.layers.int.new('sw')

    # -- bookkeeping
    def _tag(self, faces, sw):
        k = NAMES.index(sw)
        for f in faces:
            f[self.sw] = k
        return faces

    def _new(self, verts):
        return {f for v in verts for f in v.link_faces}

    # -- primitives
    def _append(self, tmp, sw, matrix=None):
        vmap = {v: self.bm.verts.new(v.co if matrix is None else matrix @ v.co) for v in tmp.verts}
        faces = [self.bm.faces.new([vmap[v] for v in f.verts]) for f in tmp.faces]
        tmp.free()
        return self._tag(faces, sw)

    def box(self, lo, hi, sw, matrix=None, bevel=0.0, seg=1):
        if bevel <= 0:
            r = bmesh.ops.create_cube(self.bm, size=1.0)
            vs = r['verts']
            bmesh.ops.scale(self.bm, vec=Vector(hi) - Vector(lo), verts=vs)
            bmesh.ops.translate(self.bm, vec=(Vector(hi) + Vector(lo)) / 2, verts=vs)
            if matrix is not None:
                bmesh.ops.transform(self.bm, matrix=matrix, verts=vs)
            return self._tag(self._new(vs), sw)
        tmp = bmesh.new()
        r = bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=Vector(hi) - Vector(lo), verts=r['verts'])
        bmesh.ops.translate(tmp, vec=(Vector(hi) + Vector(lo)) / 2, verts=r['verts'])
        bevel = min(bevel, 0.45 * min(Vector(hi) - Vector(lo)))
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=seg, affect='EDGES', profile=0.5)
        return self._append(tmp, sw, matrix)

    def cyl(self, a, b, r, sw, seg=12, r2=None, caps=True):
        a, b = Vector(a), Vector(b)
        d = b - a
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=d.length)
        vs = res['verts']
        rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=vs)
        return self._tag(self._new(vs), sw)

    def sphere(self, c, r, sw, seg=8, rings=5, scale=(1, 1, 1)):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=r)
        vs = res['verts']
        bmesh.ops.scale(self.bm, vec=scale, verts=vs)
        bmesh.ops.translate(self.bm, vec=Vector(c), verts=vs)
        return self._tag(self._new(vs), sw)

    def ico(self, c, r, sw, sub=1, scale=(1, 1, 1), jitter=0.0, rnd=None, matrix=None):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r)
        vs = res['verts']
        rnd = rnd or random
        for v in vs:
            v.co *= 1 + (rnd.random() - 0.5) * 2 * jitter
        bmesh.ops.scale(self.bm, vec=scale, verts=vs)
        if matrix is not None:
            bmesh.ops.transform(self.bm, matrix=matrix, verts=vs)
        bmesh.ops.translate(self.bm, vec=Vector(c), verts=vs)
        return self._tag(self._new(vs), sw)

    def lathe(self, prof, sw, seg=16, matrix=None, cap_bottom=False, cap_top=False, sws=None):
        """Surface of revolution around local z: prof = [(radius, z), …] bottom → top."""
        rings = []
        for r, z in prof:
            rings.append([self.bm.verts.new((r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)])
        faces = []
        for i in range(len(rings) - 1):
            for k in range(seg):
                f = self.bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
                self._tag([f], sws[i] if sws else sw)
                faces.append(f)
        if cap_bottom:
            f = self.bm.faces.new(list(reversed(rings[0]))); self._tag([f], sw); faces.append(f)
        if cap_top:
            f = self.bm.faces.new(rings[-1]); self._tag([f], sws[-1] if sws else sw); faces.append(f)
        vs = [v for r in rings for v in r]
        if matrix is not None:
            bmesh.ops.transform(self.bm, matrix=matrix, verts=vs)
        return faces

    def loft(self, sections, sw_fn, close_ends=True, closed=False):
        """Sections = list of point lists (same count) → quad strips; sw_fn(i_section, j_point) → swatch."""
        rows = [[self.bm.verts.new(p) for p in sec] for sec in sections]
        n = len(sections[0])
        jr = range(n) if closed else range(n - 1)
        for i in range(len(rows) - 1):
            for j in jr:
                j2 = (j + 1) % n
                try:
                    f = self.bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j2], rows[i][j2]))
                except ValueError:
                    continue
                self._tag([f], sw_fn(i, j))
        if close_ends:
            for row, rev in ((rows[0], False), (rows[-1], True)):
                try:
                    f = self.bm.faces.new(list(reversed(row)) if rev else row)
                    self._tag([f], sw_fn(-1, -1))
                except ValueError:
                    pass
        return rows

    def quad(self, pts, sw):
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        return self._tag([f], sw)

    def merge(self, other, matrix=None):
        """Appends another Props' geometry (optionally transformed)."""
        me = bpy.data.meshes.new('_tmp')
        other.bm.to_mesh(me)
        n0 = len(self.bm.verts)
        before = set(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        new_faces = [f for f in self.bm.faces if f not in before]
        if matrix is not None:
            bmesh.ops.transform(self.bm, matrix=matrix, verts=list({v for f in new_faces for v in f.verts}))
        return new_faces

    def transform(self, matrix):
        bmesh.ops.transform(self.bm, matrix=matrix, verts=self.bm.verts)

    def copy(self):
        p = Props()
        p.bm.free()
        p.bm = self.bm.copy()
        p.sw = p.bm.faces.layers.int.get('sw')
        return p

    # -- output
    def to_object(self, name, coll, mat=None, smooth_angle=35, location=(0, 0, 0), rot_z=0.0):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.normal_update()
        uv = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            u = swatch_uv(NAMES[f[self.sw]])
            for l in f.loops:
                l[uv].uv = u
        me = bpy.data.meshes.new(name + '_mesh')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat or bpy.data.materials['mat_props'])
        for p in me.polygons:
            p.use_smooth = True
        if smooth_angle is not None:
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        o = bpy.data.objects.new(name, me)
        coll.objects.link(o)
        o.location = location
        o.rotation_euler = (0, 0, rot_z)
        return o


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)
