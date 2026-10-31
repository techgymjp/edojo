#!/usr/bin/env python3
"""首都高グランプリのコースデータに入っていない所の建物を、PLATEAU のベクトルタイルから取り出す。

使うデータ:
  plateau-tokyo23ku-building-mvt-2020 by indigo-lab
  (国土交通省 Project PLATEAU 東京都23区 2020年度 の建物を加工したベクトルタイル。ズーム16、各建物に measuredHeight)
  https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/

使い方:
  python3 tools/fetch_plateau_mvt.py 緯度南 緯度北 経度西 経度東 [最低の高さm] > extra.json
  → [{"r": [[緯度, 経度], ...], "h": 高さm, "n": 名前}, ...]  (tools/build_city.py が読む)
"""
import json, math, sys, urllib.error, urllib.request

Z = 16
URL = 'https://indigo-lab.github.io/plateau-tokyo23ku-building-mvt-2020/{z}/{x}/{y}.pbf'


# ---------- Mapbox Vector Tile (protobuf) の最小限の読み取り ----------
def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7f) << s
        if c < 0x80:
            return r, i
        s += 7


def fields(b):
    """(番号, 型, 値) を順に返す。型2 (長さつき) は bytes"""
    i = 0
    while i < len(b):
        key, i = varint(b, i)
        f, t = key >> 3, key & 7
        if t == 0:
            v, i = varint(b, i)
        elif t == 1:
            v, i = b[i:i + 8], i + 8
        elif t == 2:
            n, i = varint(b, i)
            v, i = b[i:i + n], i + n
        elif t == 5:
            v, i = b[i:i + 4], i + 4
        else:
            raise ValueError('wire type %d' % t)
        yield f, t, v


def packed(b):
    i, out = 0, []
    while i < len(b):
        v, i = varint(b, i)
        out.append(v)
    return out


def zz(n):
    return (n >> 1) ^ -(n & 1)


def value(b):
    import struct
    for f, t, v in fields(b):
        if f == 1:
            return v.decode('utf-8')
        if f == 2:
            return struct.unpack('<f', v)[0]
        if f == 3:
            return struct.unpack('<d', v)[0]
        if f in (4, 5):
            return v
        if f == 6:
            return zz(v)
        if f == 7:
            return bool(v)
    return None


def rings(cmds):
    """ジオメトリのコマンド列 → 輪 (タイル座標) のリスト"""
    out, cur, x, y, i = [], [], 0, 0, 0
    while i < len(cmds):
        c = cmds[i]
        i += 1
        cid, cnt = c & 7, c >> 3
        if cid in (1, 2):
            for _ in range(cnt):
                x += zz(cmds[i])
                y += zz(cmds[i + 1])
                i += 2
                if cid == 1:
                    if cur:
                        out.append(cur)
                    cur = [(x, y)]
                else:
                    cur.append((x, y))
        elif cid == 7:
            if cur:
                out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def area2(r):
    return sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))


def decode(b):
    feats = []
    for f, t, layer in fields(b):
        if f != 3:
            continue
        keys, vals, raw, extent = [], [], [], 4096
        for lf, lt, lv in fields(layer):
            if lf == 3:
                keys.append(lv.decode('utf-8'))
            elif lf == 4:
                vals.append(value(lv))
            elif lf == 2:
                raw.append(lv)
            elif lf == 5:
                extent = lv
        for fb in raw:
            tags, geom, gtype = [], [], 0
            for ff, ft, fv in fields(fb):
                if ff == 2:
                    tags = packed(fv)
                elif ff == 3:
                    gtype = fv
                elif ff == 4:
                    geom = packed(fv)
            if gtype != 3:
                continue
            props = {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags), 2)}
            feats.append((props, rings(geom), extent))
    return feats


def main():
    s, n, w, e = map(float, sys.argv[1:5])
    min_h = float(sys.argv[5]) if len(sys.argv) > 5 else 0  # これより低い建物は出さない (ファイルを小さく)
    def tx(lon): return (lon + 180) / 360 * 2 ** Z
    def ty(lat):
        r = math.radians(lat)
        return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
    def lonlat(x, y):
        lon = x / 2 ** Z * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** Z))))
        return lat, lon
    out, seen = [], set()
    for X in range(int(tx(w)), int(tx(e)) + 1):
        for Y in range(int(ty(n)), int(ty(s)) + 1):
            try:
                with urllib.request.urlopen(URL.format(z=Z, x=X, y=Y), timeout=30) as res:
                    feats = decode(res.read())
            except urllib.error.HTTPError as err:
                if err.code == 404:  # 建物のないタイル (23区の外など)
                    continue
                raise
            for props, rs, ext in feats:
                h = props.get('measuredHeight')
                if not isinstance(h, (int, float)) or h <= 0 or h < min_h:
                    continue
                # 外側の輪 (MVT では y が下向きの座標で時計回り。area2 は負になる) だけを使う。穴は無視
                for r in rs:
                    if len(r) < 3 or area2(r) >= 0:
                        continue
                    # タイルの外 (重なり部分) にはみ出した所は隣のタイルにもあるので、中心がタイルの中にある輪だけ
                    cx = sum(p[0] for p in r) / len(r)
                    cy = sum(p[1] for p in r) / len(r)
                    if not (0 <= cx < ext and 0 <= cy < ext):
                        continue
                    pts = [lonlat(X + px / ext, Y + py / ext) for px, py in r]
                    lat_c = sum(p[0] for p in pts) / len(pts)
                    lon_c = sum(p[1] for p in pts) / len(pts)
                    if not (s <= lat_c <= n and w <= lon_c <= e):
                        continue
                    key = (round(lat_c, 6), round(lon_c, 6), round(h, 1))
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append({'r': [[round(a, 7), round(b, 7)] for a, b in pts], 'h': round(h, 1), 'n': props.get('name') or ''})
            sys.stderr.write(f'tile {X},{Y}: total {len(out)}\n')
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
