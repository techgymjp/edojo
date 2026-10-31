#!/usr/bin/env python3
"""今の水面 (お濠・川・海) を国土地理院ベクトルタイル (waterarea) から取り出す → data/src/water.json
[[外側の輪, 穴, ...], ...] 輪は [[緯度, 経度], ...]
出典: 国土地理院 ベクトルタイル (https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/)
使い方: python3 tools/fetch_water.py > data/src/water.json
"""
import json, math, sys, urllib.request
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from fetch_plateau_mvt import fields, packed, rings, area2
from region import S, N, W, E

Z = 16
URL = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf'


def layer_polys(b, want):
    out = []
    for f, t, layer in fields(b):
        if f != 3:
            continue
        name, raw, extent = None, [], 4096
        for lf, lt, lv in fields(layer):
            if lf == 1: name = lv.decode()
            elif lf == 2: raw.append(lv)
            elif lf == 5: extent = lv
        if name != want:
            continue
        for fb in raw:
            geom, gtype = [], 0
            for ff, ft, fv in fields(fb):
                if ff == 3: gtype = fv
                elif ff == 4: geom = packed(fv)
            if gtype == 3:
                out.append((rings(geom), extent))
    return out


def main():
    tx = lambda lon: (lon + 180) / 360 * 2 ** Z
    def ty(lat):
        r = math.radians(lat)
        return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
    def ll(x, y):
        lon = x / 2 ** Z * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** Z))))
        return [round(lat, 7), round(lon, 7)]
    polys = []
    for X in range(int(tx(W)), int(tx(E)) + 1):
        for Y in range(int(ty(N)), int(ty(S)) + 1):
            for a in range(4):
                try:
                    with urllib.request.urlopen(URL.format(z=Z, x=X, y=Y), timeout=30) as res:
                        feats = layer_polys(res.read(), 'waterarea')
                    break
                except Exception as e:
                    feats = []
                    sys.stderr.write(f'{X},{Y} {e}\n')
                    if '404' in str(e): break
            for rs, ext in feats:
                cur = None
                for r in rs:
                    if len(r) < 3: continue
                    ring = [ll(X + px / ext, Y + py / ext) for px, py in r]
                    if area2(r) < 0:
                        cur = [ring]; polys.append(cur)
                    elif cur is not None:
                        cur.append(ring)
    json.dump(polys, sys.stdout, separators=(',', ':'))


if __name__ == '__main__':
    main()
