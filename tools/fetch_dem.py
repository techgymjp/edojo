#!/usr/bin/env python3
"""国土地理院の標高タイル (DEM5A: 航空レーザー測量の 5m メッシュ、なければ DEM5B → DEM10B) を data/src/dem/ に集める。
出典: 国土地理院 標高タイル https://maps.gsi.go.jp/development/demtile.html
PNG 形式: x = R*65536 + G*256 + B, x < 2^23 なら標高 x*0.01m、x > 2^23 なら (x-2^24)*0.01m、x = 2^23 は値なし
"""
import math, os, sys, urllib.request
from region import S, N, W, E
Z = 15
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'src', 'dem')
tx = lambda lon: (lon + 180) / 360 * 2 ** Z
def ty(lat):
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
for kind in ('dem5a_png', 'dem5b_png', 'dem_png'):
    os.makedirs(os.path.join(D, kind), exist_ok=True)
    for X in range(int(tx(W)), int(tx(E)) + 1):
        for Y in range(int(ty(N)), int(ty(S)) + 1):
            out = os.path.join(D, kind, f'{X}_{Y}.png')
            if os.path.exists(out): continue
            url = f'https://cyberjapandata.gsi.go.jp/xyz/{kind}/{Z if kind != "dem_png" else 14}/{X if kind != "dem_png" else X // 2}/{Y if kind != "dem_png" else Y // 2}.png'
            for a in range(4):
                try:
                    with urllib.request.urlopen(url, timeout=30) as r: open(out, 'wb').write(r.read())
                    break
                except Exception as e:
                    if '404' in str(e): open(out, 'wb').close(); break
                    sys.stderr.write(f'{url} {e}\n')
    print(kind, 'done')
