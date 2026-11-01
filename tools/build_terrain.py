#!/usr/bin/env python3
"""国土地理院の標高 (DEM5A → 5B → 10B) から、地図と同じ 3m 格子の地形 data/terrain.png と水面の高さ data/water.png を作る。
  - 地形: 陸は標高。水の所は一番近い岸の高さ (地面のメッシュは水の所を描かないので、岸の高さでつなぐ)
  - 水面: 今の水面は標高データの水面の高さ (ならして、岸より低く)。戻した江戸の堀は、まわりの道より 3.2m 低い所
  PNG: 高さ h(m) → v = round((h + 20) * 200)、R = v >> 8、G = v & 255
使い方: python3 tools/fetch_dem.py → python3 tools/build_map.py → python3 tools/build_terrain.py
"""
import json, math, os
import numpy as np
from PIL import Image
from demlib import tile, Z
from region import S, N, W, E

HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, '..', 'data')
A = np.array(Image.open(os.path.join(D, 'map.png')))
NAT = np.array(Image.open(os.path.join(D, 'src', 'natural.png'))) > 0
info = json.load(open(os.path.join(D, 'world.json')))
h, w = A.shape; RES = info['res']; KX, KZ = info['KX'], info['KZ']

# ---- 標高のモザイク (z15、5A → 5B → 10B) ----
tx = lambda lon: (lon + 180) / 360 * 2 ** Z
def ty(lat):
    r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
X0, X1, Y0, Y1 = int(tx(W)), int(tx(E)), int(ty(N)), int(ty(S))
M = np.full(((Y1 - Y0 + 1) * 256, (X1 - X0 + 1) * 256), np.nan, np.float32)
for X in range(X0, X1 + 1):
    for Y in range(Y0, Y1 + 1):
        blk = np.full((256, 256), np.nan, np.float32)
        for kind in ('dem5a_png', 'dem5b_png'):
            t = tile(kind, X, Y)
            if t is not None: blk = np.where(np.isnan(blk), t, blk)
        t = tile('dem_png', X, Y)  # 10B (z14 のタイル。z15 の番号で保存)
        if t is not None:
            ox, oy = (X % 2) * 128, (Y % 2) * 128
            up = np.repeat(np.repeat(t[oy:oy + 128, ox:ox + 128], 2, 0), 2, 1)
            blk = np.where(np.isnan(blk), up, blk)
        M[(Y - Y0) * 256:(Y - Y0 + 1) * 256, (X - X0) * 256:(X - X0 + 1) * 256] = blk
print('nan in mosaic', int(np.isnan(M).sum()))
def fill_nan(a, iters=200):
    a = a.copy()
    for _ in range(iters):
        m = np.isnan(a)
        if not m.any(): break
        p = np.pad(a, 1, constant_values=np.nan)
        nb = np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
        cnt = (~np.isnan(nb)).sum(0); sm = np.nansum(nb, 0)
        a = np.where(m & (cnt > 0), sm / np.maximum(cnt, 1), a)
    return a
M = fill_nan(M)

# ---- 3m 格子のセルの中心で双一次補間 ----
jj, ii = np.mgrid[0:h, 0:w]
lon = W + (ii + 0.5) * RES / KX; lat = N - (jj + 0.5) * RES / KZ
fx = (tx(lon) - X0) * 256 - 0.5
r = np.radians(lat); fy = ((1 - np.log(np.tan(r) + 1 / np.cos(r)) / math.pi) / 2 * 2 ** Z - Y0) * 256 - 0.5
x0 = np.clip(np.floor(fx).astype(int), 0, M.shape[1] - 2); y0 = np.clip(np.floor(fy).astype(int), 0, M.shape[0] - 2)
u = np.clip(fx - x0, 0, 1); v = np.clip(fy - y0, 0, 1)
Ev = (M[y0, x0] * (1 - u) * (1 - v) + M[y0, x0 + 1] * u * (1 - v) + M[y0 + 1, x0] * (1 - u) * v + M[y0 + 1, x0 + 1] * u * v).astype(np.float32)

water = A == 0; land = ~water
# 一番近い岸の高さ (水の所)
bank = np.where(land, Ev, np.nan).astype(np.float32)
bank = fill_nan(bank, 400)

def box(a, r, mask):
    """mask の所だけの平均 (半径 r セル)"""
    a = np.where(mask, a, 0).astype(np.float64); m = mask.astype(np.float64)
    def cs(x):
        c = np.cumsum(np.cumsum(np.pad(x, ((1, 0), (1, 0))), 0), 1)
        y0 = np.clip(np.arange(h) - r, 0, h); y1 = np.clip(np.arange(h) + r + 1, 0, h)
        x0_ = np.clip(np.arange(w) - r, 0, w); x1_ = np.clip(np.arange(w) + r + 1, 0, w)
        return c[y1][:, x1_] - c[y0][:, x1_] - c[y1][:, x0_] + c[y0][:, x0_]
    s = cs(a); n = cs(m)
    return np.where(n > 0, s / np.maximum(n, 1e-9), np.nan)

# ---- 水面の高さ: つながった水 (今の川・お濠) ごとに水平。戻した堀は一番近い今の水の高さ ----
def components(mask):
    lab = np.zeros(mask.shape, np.int32); n = 0
    from collections import deque
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        if lab[y, x]: continue
        n += 1; q = deque([(y, x)]); lab[y, x] = n
        while q:
            a, b = q.popleft()
            for yy, xx in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n; q.append((yy, xx))
    return lab, n
# ---- 水面の高さ ----
nat = water & NAT; rest = water & ~NAT
WL = np.where(nat, Ev, np.where(rest, bank - 3.2, np.nan)).astype(np.float32)
# 低めにならす: 近くの水の値の小さい方 (レーザーが岸や橋を拾った所を除く) → 平均
p = 4
pad = np.pad(np.where(water, WL, np.inf), p, constant_values=np.inf)
mn = np.full(WL.shape, np.inf, np.float32)
for dy in range(-p, p + 1, 2):
    for dx in range(-p, p + 1, 2):
        mn = np.minimum(mn, pad[p + dy:p + dy + h, p + dx:p + dx + w])
WL = np.where(water, np.minimum(WL, mn + 0.8), np.nan)
for r in (6, 6, 10):
    WL = np.where(water, box(np.nan_to_num(WL), r, water), np.nan)
WL = np.where(water, np.minimum(WL, bank - 0.8), np.nan)
WL = np.maximum(WL, -1.0)
natl = water & NAT
lab, nl = components(natl)
flat = np.full((h, w), np.nan, np.float32)
for k in range(1, nl + 1):
    m = lab == k
    v = Ev[m]; v = v[~np.isnan(v)]
    lv = float(np.percentile(v, 30)) if len(v) else 0.0
    lv = min(lv, float(np.nanpercentile(bank[m], 10)) - 0.8)
    flat[m] = max(lv, -1.0)
# 戻した堀: 一番近い今の水の高さ (水の中だけで広げる)
from collections import deque
q = deque(zip(*np.nonzero(natl)))
while q:
    a, b = q.popleft()
    for yy, xx in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
        if 0 <= yy < h and 0 <= xx < w and water[yy, xx] and np.isnan(flat[yy, xx]):
            flat[yy, xx] = flat[a, b]; q.append((yy, xx))
# 今の水につながっていない戻した堀 (溜池など): かたまりごとに 1 つの高さ (まわりの道より 3.2m 低い所の低めの値)
rest_m = water & np.isnan(flat)
labr, nr = components(rest_m)
for k in range(1, nr + 1):
    m = labr == k
    flat[m] = float(np.nanpercentile((bank - 3.2)[m], 20))
WL = np.where(water, np.where(np.isnan(flat), WL, flat), np.nan)
WL = np.where(water, np.minimum(WL, bank - 0.5), np.nan)
print('flat water bodies', nl)
WL = fill_nan(WL.astype(np.float32), 30)  # 岸の近く (陸) にも少しのばす
WL = np.where(np.isnan(WL), bank - 3, WL)

# ---- 地形: 陸は標高を少しならす (お城の中はそのまま)。水の所は岸の高さ ----
castle = (A == 3) | (A == 4)
Es = box(Ev, 1, land)
T = np.where(land, np.where(castle, Ev, Es), bank).astype(np.float32)

def save(a, name):
    v = np.clip(np.round((a + 20) * 200), 0, 65535).astype(np.uint32)
    rgb = np.stack([(v >> 8).astype(np.uint8), (v & 255).astype(np.uint8), np.zeros_like(v, np.uint8)], -1)
    Image.fromarray(rgb, 'RGB').save(os.path.join(D, name), optimize=True)
save(T, 'terrain.png'); save(WL, 'water.png')
for nm, la, lo in [('本丸', 35.6870, 139.7570), ('桜田濠', 35.6795, 139.7480), ('日比谷濠', 35.6770, 139.7605), ('神田川お茶の水', 35.7006, 139.7640), ('隅田川', 35.6880, 139.7905), ('市ヶ谷濠', 35.6930, 139.7355), ('牛込濠', 35.6990, 139.7420), ('外堀東(戻した)', 35.6768, 139.7682), ('丸の内', 35.6810, 139.7660), ('九段', 35.6950, 139.7470)]:
    j = int((N - la) * KZ / RES); i = int((lo - W) * KX / RES)
    print(nm, 'water' if water[j, i] else 'land', 'T', round(float(T[j, i]), 1), 'WL', round(float(WL[j, i]), 1))
