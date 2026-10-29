# Row 65: grime decal atlas for the clubhouse (plain Python 3 + Pillow + numpy, no Blender).
#   python3 scripts/lookdev/grime_atlas.py
# 1024 × 512 RGBA: top half ambientCG Leaking007, bottom half Leaking008 (CC0). Colour pulled towards
# a neutral brown-grey and darkened; alpha = the decal's opacity, boosted so the streaks read from the drone.
import os
import numpy as np
from PIL import Image

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
src = os.path.join(root, 'blender', 'assets', 'ambientcg')
out = np.zeros((512, 1024, 4), np.uint8)
for k, a in enumerate(['Leaking007', 'Leaking008']):
    c = np.asarray(Image.open(f'{src}/{a}/{a}_1K-JPG_Color.jpg').convert('RGB').resize((1024, 256))).astype(np.float32)
    o = np.asarray(Image.open(f'{src}/{a}/{a}_1K-JPG_Opacity.jpg').convert('L').resize((1024, 256))).astype(np.float32)
    g = c * 0.45 + np.array([40, 35, 29]) * 0.55
    out[k * 256:(k + 1) * 256, :, :3] = np.clip(g * 0.6, 0, 255)
    out[k * 256:(k + 1) * 256, :, 3] = np.clip(o * 2.0, 0, 235)
Image.fromarray(out).save(os.path.join(root, 'blender', 'textures', 'grime_atlas.png'))
print('grime_atlas.png written')
