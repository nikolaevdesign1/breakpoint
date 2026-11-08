# Row 19: a contact sheet of one stroke of one player, cut from a packed atlas (for before / after shots).
#   python3 scripts/life/stroke-sheet.py <players.json> <players.webp> <out.png> [clip|facing=forehand|away] [variant=a] [n=14]
import json, sys
from PIL import Image
js, atlas, out = sys.argv[1:4]
key = sys.argv[4] if len(sys.argv) > 4 else 'forehand|away'
v = sys.argv[5] if len(sys.argv) > 5 else 'a'
n = int(sys.argv[6]) if len(sys.argv) > 6 else 14
d = json.load(open(js))
im = Image.open(atlas).convert('RGBA')
W, H = im.size
frames = d['frames'][v][key]
clip = key.split('|')[0]
contact = d['clips'][clip]['contact']
idx = sorted(set([round(i * (len(frames) - 1) / (n - 1)) for i in range(n)] + ([contact] if contact is not None else [])))
cells = []
for i in idx:
    r = d['body'][frames[i][0]]
    u0, v0, w0, h0 = r[:4]; u1, v1 = u0 + w0, v0 + h0
    cells.append((i, im.crop((round(u0 * W), round(v0 * H), round(u1 * W), round(v1 * H)))))
cw = max(c.width for _, c in cells); ch = max(c.height for _, c in cells)
sheet = Image.new('RGBA', (cw * len(cells), ch + 14), (236, 232, 222, 255))
from PIL import ImageDraw
dr = ImageDraw.Draw(sheet)
for k, (i, c) in enumerate(cells):
    sheet.paste(c, (k * cw + (cw - c.width) // 2, 14 + ch - c.height), c)
    dr.text((k * cw + 4, 1), ('C' if i == contact else '') + str(i), fill=(0, 0, 0, 255))
sheet.convert('RGB').save(out)
print(len(frames), 'frames, contact', contact, '->', out)
