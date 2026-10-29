# Objects that share the baked lightmap atlas (see setup_materials_uvs.py, lightmap_uvs.py).
ATLAS = (
    [f'clay-{i}' for i in range(1, 7)] + [f'clay-{i}_apron' for i in range(1, 7)]
    + [f'hard-{i}' for i in range(1, 5)] + [f'hard-{i}_apron' for i in range(1, 5)]
    + [f'padel-{i}' for i in range(1, 5)] + [f'padel-{i}_apron' for i in range(1, 5)]
    + ['grass-1', 'grass-2', 'grass-1_apron', 'grass-2_apron']
    + ['paths', 'parking_lot', 'parking_driveway', 'chill_sand', 'clubhouse', 'storage_shed']
)
