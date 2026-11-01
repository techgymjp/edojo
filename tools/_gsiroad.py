#!/usr/bin/env python3
"""幹線道路と高速道路の線を、国土地理院のベクトルタイル (地理院地図Vector) の road レイヤーから取り出して
js/road-data.js を作る。座標は街の座標 (tools/build_city.py と同じ原点、0.5m 単位の整数)。

  - 幹線道路: 国道・都道府県道 (rdCtg 0, 1) と、幅 13m 以上の市区町村道 (rdCtg 2, rnkWidth 3以上)
  - 高速道路: rdCtg 3 で、ほかの道路の上を通る高架 (lvOrder 1以上) の所

出典: 国土地理院 ベクトルタイル (https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/)

使い方:
  python3 tools/fetch_roads.py > js/road-data.js
"""
import json, math, sys, urllib.error, urllib.request

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from fetch_plateau_mvt import fields, value, packed

# 街の範囲と原点 (tools/build_city.py とそろえる)
BOXES = [(35.645, 35.712, 139.690, 139.785), (35.693, 35.722, 139.762, 139.804), (35.711, 35.740, 139.695, 139.735),
         (35.615, 35.646, 139.715, 139.760), (35.618, 35.642, 139.758, 139.795)]
LAT0, LON0 = 35.6740, 139.7450
KX = 111320 * math.cos(math.radians(LAT0))
KZ = 110574

Z = 16
URL = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf'
# 幅の区分 → おおよその幅 (m)
WIDTH = {0: 3, 1: 5, 2: 10, 3: 16, 4: 25}


def lines(geom):
    """MVT の LineString のコマンド列 → [[(x, y), ...], ...]"""
    out, cur, x, y, i = [], None, 0, 0, 0
    zz = lambda n: (n >> 1) ^ -(n & 1)
    while i < len(geom):
        cmd, cnt = geom[i] & 7, geom[i] >> 3
        i += 1
        for _ in range(cnt):
            if cmd in (1, 2):
                x += zz(geom[i]); y += zz(geom[i + 1]); i += 2
                if cmd == 1:
                    cur = [(x, y)]
                    out.append(cur)
                else:
                    cur.append((x, y))
    return out


def road_feats(b):
    out = []
    for f, t, layer in fields(b):
        if f != 3:
            continue
        name, keys, vals, feats, extent = None, [], [], [], 4096
        for lf, lt, lv in fields(layer):
            if lf == 1:
                name = lv.decode('utf-8')
            elif lf == 2:
                feats.append(lv)
            elif lf == 3:
                keys.append(lv.decode('utf-8'))
            elif lf == 4:
                vals.append(value(lv))
            elif lf == 5:
                extent = lv
        if name != 'road':
            continue
        for fb in feats:
            props, geom, gtype = {}, [], 0
            for ff, ft, fv in fields(fb):
                if ff == 2:
                    tg = packed(fv)
                    for k in range(0, len(tg) - 1, 2):
                        props[keys[tg[k]]] = vals[tg[k + 1]]
                elif ff == 3:
                    gtype = fv
                elif ff == 4:
                    geom = packed(fv)
            if gtype == 2:
                out.append((props, lines(geom), extent))
    return out


def merge(lines):
    """タイルの境目で切れた線を、端の点が同じものどうしでつなぐ ([種別, x0, z0, ...] の種別も同じもの)"""
    lines = [l[:] for l in lines]
    alive = [True] * len(lines)
    ends = {}
    key = lambda l, i: (l[0], l[i], l[i + 1])
    for n, l in enumerate(lines):
        ends.setdefault(key(l, 1), []).append(n)
        ends.setdefault(key(l, len(l) - 2), []).append(n)
    changed = True
    while changed:
        changed = False
        for n, l in enumerate(lines):
            if not alive[n]:
                continue
            k = key(l, len(l) - 2)
            for m in ends.get(k, []):
                if m == n or not alive[m]:
                    continue
                o = lines[m]
                if key(o, 1) == k:
                    tail = o[3:]
                elif key(o, len(o) - 2) == k:
                    pts = [(o[i], o[i + 1]) for i in range(1, len(o), 2)][::-1]
                    tail = [v for p in pts[1:] for v in p]
                else:
                    continue
                alive[m] = False
                l.extend(tail)
                ends.setdefault(key(l, len(l) - 2), []).append(n)
                changed = True
                break
    return [l for n, l in enumerate(lines) if alive[n]]


def main():
    def tx(lon): return (lon + 180) / 360 * 2 ** Z
    def ty(lat):
        r = math.radians(lat)
        return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
    def city(x, y):
        lon = x / 2 ** Z * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** Z))))
        return (round((lon - LON0) * KX * 2), round(-(lat - LAT0) * KZ * 2))
    tiles = set()
    for a, b, c, d in BOXES:
        for X in range(int(tx(c)), int(tx(d)) + 1):
            for Y in range(int(ty(b)), int(ty(a)) + 1):
                tiles.add((X, Y))
    art, hwy = [], []
    for X, Y in sorted(tiles):
        feats = None
        for attempt in range(4):  # 通信が切れたら何回かやり直す
            try:
                with urllib.request.urlopen(URL.format(z=Z, x=X, y=Y), timeout=30) as res:
                    feats = road_feats(res.read())
                break
            except urllib.error.HTTPError as e:
                sys.stderr.write(f'tile {X},{Y}: {e}\n')
                break
            except Exception as e:
                sys.stderr.write(f'tile {X},{Y}: {e} (retry)\n')
        if feats is None:
            continue
        for props, ls, ext in feats:
            cat, rw, lv = props.get('rdCtg'), props.get('rnkWidth'), props.get('lvOrder', 0) or 0
            if cat in (0, 1) or (cat == 2 and (rw or 0) >= 3):
                target, w = art, WIDTH.get(rw, 10)
            elif cat == 3 and lv >= 1:
                target, w = hwy, lv
            else:
                continue
            for l in ls:
                if len(l) < 2:
                    continue
                pts = []
                for px, py in l:
                    pts += city(X + px / ext, Y + py / ext)
                target.append([w] + pts)
        sys.stderr.write(f'tile {X},{Y}: art {len(art)} hwy {len(hwy)}\n')
    art, hwy = merge(art), merge(hwy)
    print('// 自動生成 (tools/fetch_roads.py)。出典: 国土地理院 ベクトルタイル (road)')
    print('// ROADS: [幅m, x0, z0, x1, z1, ...] (0.5m 単位)。HIGHWAYS: [高架の段, x0, z0, ...]')
    print('export const ROADS = ' + json.dumps(art, separators=(',', ':')) + ';')
    print('export const HIGHWAYS = ' + json.dumps(hwy, separators=(',', ':')) + ';')


if __name__ == '__main__':
    main()
