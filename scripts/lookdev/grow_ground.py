# Row 54: the lawn reaches far past anything the camera can see.
# The ground plane grows to ~1.9 km around the club; its lightmap UVs keep mapping the original
# 300 × 300 m baked area (outside it they run past 0..1 and the page clamps to the open-sky edge).
import bpy
g = bpy.data.objects['ground']
me = g.data
OLD = (-80.0, 220.0, -160.0, 140.0)  # baked lightmap extent (x0, x1, y0, y1)
xs = [v.co.x for v in me.vertices]
if max(xs) - min(xs) < 1000:
    for v in me.vertices:
        v.co.x = -900.0 if v.co.x < 70 else 980.0
        v.co.y = -940.0 if v.co.y < -10 else 940.0
mw = g.matrix_world
uv0 = me.uv_layers['UVMap']; lm = me.uv_layers['Lightmap']
for loop in me.loops:
    co = mw @ me.vertices[loop.vertex_index].co
    uv0.data[loop.index].uv = (co.x, co.y)
    lm.data[loop.index].uv = ((co.x - OLD[0]) / (OLD[1] - OLD[0]), (co.y - OLD[2]) / (OLD[3] - OLD[2]))
me.update()
print('ground', [tuple(round(c, 1) for c in v.co) for v in me.vertices])
bpy.ops.wm.save_mainfile()
