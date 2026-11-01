#!/usr/bin/env python3
"""国土地理院ベクトルタイルの railway から、JR・地下鉄の地上区間・私鉄の線路 (地上・高架。トンネルは除く) と駅を取り出し js/rail-data.js を作る。
  railState 0 = 地上、1 = 橋・高架 (lvOrder で段)、2 = トンネル・3 = 地下 (描かない)。
  rtCode の先頭 6 桁 402010 = JR (国土地理院の路線コード)。
  高さ: 高架は 7 + 段 × 6m、地上は 0。境目は勾配 3% でならす。座標はターザン大東京と同じ (原点 35.674, 139.745)
出典: 国土地理院 ベクトルタイル (railway)
使い方: python3 tools/fetch_rail.py > js/rail-data.js
"""
import json, math, sys, urllib.request, heapq
from collections import defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _gsiroad import fields, packed, value, lines
from region import S, N, W, E
Z = 16
URL = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf'
LAT0, LON0 = 35.674, 139.745
KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574
M = 0.01
tx = lambda lon: (lon + 180) / 360 * 2 ** Z
def ty(lat):
    r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
def xz(X, Y, px, py, ext):
    x = X + px / ext; y = Y + py / ext
    lon = x / 2 ** Z * 360 - 180; lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** Z))))
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)
def feats(b):
    out = []
    for f, t, layer in fields(b):
        if f != 3: continue
        name, keys, vals, raw, ext = None, [], [], [], 4096
        for lf, lt, lv in fields(layer):
            if lf == 1: name = lv.decode()
            elif lf == 2: raw.append(lv)
            elif lf == 3: keys.append(lv.decode())
            elif lf == 4: vals.append(value(lv))
            elif lf == 5: ext = lv
        if name != 'railway': continue
        for fb in raw:
            props, gt, geom = {}, 0, []
            for ff, ft, fv in fields(fb):
                if ff == 2:
                    tg = packed(fv)
                    for k in range(0, len(tg) - 1, 2): props[keys[tg[k]]] = vals[tg[k + 1]]
                elif ff == 3: gt = fv
                elif ff == 4: geom = packed(fv)
            if gt == 2: out.append((props, lines(geom), ext))
    return out
segs = []
for X in range(int(tx(W - M)), int(tx(E + M)) + 1):
    for Y in range(int(ty(N + M)), int(ty(S - M)) + 1):
        d = None
        for a in range(4):
            try: d = urllib.request.urlopen(URL.format(z=Z, x=X, y=Y), timeout=30).read(); break
            except Exception as e:
                if '404' in str(e): break
        if not d: continue
        for p, ls, ext in feats(d):
            if p.get('ftCode') != 8201: continue
            jr = str(p.get('rtCode', '')).startswith('402010')  # JR か、それ以外 (地下鉄の地上区間・私鉄)
            sta = 1 if p.get('staCode') else 0
            rc = str(p.get('rtCode', ''))
            # 路線: 187 山手線・126 東北本線 (京浜東北)、121 中央線、104 総武線
            ln = 'y' if ('187' in rc or '126' in rc) else 'c' if '00121' in rc else 's' if '00104' in rc else ''
            st = p.get('railState'); lv = int(p.get('lvOrder') or 0)
            # railState: 0 普通 (地上) / 1 橋・高架 / 2 トンネル / 3 地下 / 4 雪覆い など
            if st in (2, 3) or st == 'トンネル': kind = 2
            elif st == 1 or lv > 0: kind = 1
            else: kind = 0
            n = int(p.get('snglDbl') or 2)
            for l in ls:
                pts = [xz(X, Y, px, py, ext) for px, py in l]
                if len(pts) >= 2: segs.append((kind, lv, pts, n, jr, sta, ln))
sys.stderr.write(f'segments {len(segs)}\n')
key = lambda q: (round(q[0] / 0.8), round(q[1] / 0.8))
target, adj, pos = {}, defaultdict(set), {}
for kind, lv, pts, n, jr, sta, ln in segs:
    t = 7 + max(0, lv - 1) * 6 if kind == 1 else 0.0
    ks = [key(q) for q in pts]
    for k, q in zip(ks, pts): pos[k] = q; target[k] = max(target.get(k, -1e9), t)
    for a, b in zip(ks, ks[1:]):
        if a != b: adj[a].add(b); adj[b].add(a)
h = dict(target); pq = [(v, k) for k, v in h.items()]; heapq.heapify(pq)
while pq:
    v, k = heapq.heappop(pq)
    if v > h[k]: continue
    for nb in adj[k]:
        nv = v + 0.03 * math.hypot(pos[k][0] - pos[nb][0], pos[k][1] - pos[nb][1])
        if nv < h[nb] - 1e-3: h[nb] = nv; heapq.heappush(pq, (nv, nb))
out = [{'x': [round(q[0], 1) for q in pts], 'z': [round(q[1], 1) for q in pts], 'h': [round(h[key(q)], 2) for q in pts], 't': 1 if kind == 2 else 0, 'n': n, 'jr': 1 if jr else 0, 'sta': sta, 'ln': ln} for kind, lv, pts, n, jr, sta, ln in segs]
sys.stdout.write('// 自動生成 (tools/fetch_rail.py)。出典: 国土地理院 ベクトルタイル (railway, JR)\n')
sys.stdout.write('export const RAIL = ' + json.dumps(out, separators=(',', ':')) + ';\n')
sys.stderr.write(f'lines {len(out)} elevated {sum(1 for s in segs if s[0] == 1)} nonJR {sum(1 for s in segs if not s[4])} stations {sum(1 for s in segs if s[5])} lines {dict((k, sum(1 for s in segs if s[6] == k)) for k in "ycs")}\n')
