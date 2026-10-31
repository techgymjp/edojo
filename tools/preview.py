import json, math, sys
from PIL import Image, ImageDraw, ImageFont
from region import S, N, W, E, LAT0
KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574
M = float(sys.argv[1]) if len(sys.argv) > 1 else 4  # m/px
w = int((E - W) * KX / M); h = int((N - S) * KZ / M)
def px(lat, lon): return ((lon - W) * KX / M, (N - lat) * KZ / M)
img = Image.new('RGB', (w, h), (235, 228, 210)); d = ImageDraw.Draw(img)
for b in json.load(open('../data/src/plateau.json')):
    d.polygon([px(*p) for p in b['r']], fill=(190, 180, 170))
for poly in json.load(open('../data/src/water.json')):
    d.polygon([px(*p) for p in poly[0]], fill=(80, 140, 200))
    for hole in poly[1:]: d.polygon([px(*p) for p in hole], fill=(235, 228, 210))
extra = sys.argv[2] if len(sys.argv) > 2 else None
if extra:
    exec(open(extra).read())
f = ImageFont.load_default()
for i in range(0, 100):
    lat = round(S + i * 0.005, 3)
    if lat > N: break
    y = px(lat, W)[1]; d.line([(0, y), (w, y)], fill=(255, 0, 0)); d.text((2, y + 1), f'{lat}', fill=(200, 0, 0), font=f)
for i in range(0, 100):
    lon = round(W + i * 0.005, 3)
    if lon > E: break
    x = px(N, lon)[0]; d.line([(x, 0), (x, h)], fill=(255, 0, 0)); d.text((x + 2, 2), f'{lon}', fill=(200, 0, 0), font=f)
img.save(sys.argv[3] if len(sys.argv) > 3 else '/tmp/claude-0/-home-user/80c8fc31-cd12-59a6-9bfd-b8b06bb7f4b5/scratchpad/prev.png')
print(w, h)
