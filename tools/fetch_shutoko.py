#!/usr/bin/env python3
"""首都高 (国土地理院 ベクトルタイル road の rdCtg 3) を地上・高架・トンネルまですべて取り出し、js/shutoko-data.js を作る。
  ftCode 2703 = 橋・高架 (lvOrder = 重なりの段) / 2701 = 地上・掘割 / 2704 = トンネル (描かない)
  高さ: 高架は 3 + 段 × 6.5m (地面から)、地上は 0。高架と地上・トンネルの境目は勾配 6% の坂になるよう高さをならす
  座標はターザン大東京と同じ (原点 35.674, 139.745、x 東・z 南、m)。
出典: 国土地理院 ベクトルタイル (https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/)
使い方: python3 tools/fetch_shutoko.py > js/shutoko-data.js
"""
import json, math, sys, urllib.request
from collections import defaultdict
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from _gsiroad import road_feats
from region import S, N, W, E
Z = 16
URL = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf'
LAT0, LON0 = 35.674, 139.745
KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574
M = 0.008  # 範囲の外も少し
tx = lambda lon: (lon + 180) / 360 * 2 ** Z
def ty(lat):
    r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
def xz(X, Y, px, py, ext):
    x = X + px / ext; y = Y + py / ext
    lon = x / 2 ** Z * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2 ** Z))))
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)

segs = []  # [(kind, lv, [(x, z), ...])]
for X in range(int(tx(W - M)), int(tx(E + M)) + 1):
    for Y in range(int(ty(N + M)), int(ty(S - M)) + 1):
        for a in range(4):
            try:
                d = urllib.request.urlopen(URL.format(z=Z, x=X, y=Y), timeout=30).read(); break
            except Exception as e:
                d = None
                if '404' in str(e): break
        if not d: continue
        for props, ls, ext in road_feats(d):
            if props.get('rdCtg') != 3: continue
            ft = props.get('ftCode'); lv = int(props.get('lvOrder') or 0)
            kind = 2 if ft == 2704 else (1 if ft == 2703 or lv > 0 else 0)
            for l in ls:
                pts = [xz(X, Y, px, py, ext) for px, py in l]
                if len(pts) >= 2: segs.append((kind, lv, pts))
sys.stderr.write(f'segments {len(segs)}\n')

# 点に番号を付ける (0.6m で同じ点とみなす)。同じ点の高さの目標は一番高いもの
key = lambda p: (round(p[0] / 0.6), round(p[1] / 0.6))
target = {}
adj = defaultdict(set)
pos = {}
for kind, lv, pts in segs:
    t = 3 + max(1, lv) * 6.5 if kind == 1 else 0.0
    ks = [key(p) for p in pts]
    for k, p in zip(ks, pts):
        pos[k] = p
        target[k] = max(target.get(k, -1e9), t)
    for a, b in zip(ks, ks[1:]):
        if a != b: adj[a].add(b); adj[b].add(a)
# 坂: h(v) <= h(u) + 0.06 * 距離 (下りも上りも) を満たすまで低い方に寄せる
h = dict(target)
import heapq
pq = [(v, k) for k, v in h.items()]
heapq.heapify(pq)
while pq:
    v, k = heapq.heappop(pq)
    if v > h[k]: continue
    for n in adj[k]:
        d = math.hypot(pos[k][0] - pos[n][0], pos[k][1] - pos[n][1])
        nv = v + 0.06 * d
        if nv < h[n] - 1e-3:
            h[n] = nv; heapq.heappush(pq, (nv, n))

out = []
for kind, lv, pts in segs:
    ks = [key(p) for p in pts]
    out.append({'x': [round(p[0], 1) for p in pts], 'z': [round(p[1], 1) for p in pts],
                'h': [round(h[k], 2) for k in ks], 't': [1 if kind == 2 else 0] * len(pts)})
sys.stdout.write('// 自動生成 (tools/fetch_shutoko.py)。出典: 国土地理院 ベクトルタイル (road, 首都高)\n')
sys.stdout.write('export const SHUTOKO = ' + json.dumps(out, separators=(',', ':')) + ';\n')
sys.stderr.write(f'lines {len(out)} elevated pts {sum(1 for k in h if h[k] >= 3)}\n')
