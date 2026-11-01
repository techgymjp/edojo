#!/usr/bin/env python3
"""build_map.py のあとに、地図 (data/map.png) とワープ (data/world.json) を手で直す。
  - CARVE: 実際は水でつながっている所 (新川の河口など) を水路でつなぐ (ワープにしない)
  - FILL: 古地図から拾ってしまった、つながらない池 (汐留のまん中の三角の池など) を陸にする
使い方: python3 tools/build_map.py → python3 tools/patch_map.py → python3 tools/build_terrain.py
"""
import json, math, os
from collections import deque
import numpy as np
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
A = np.array(Image.open(os.path.join(D, 'map.png')))
w = json.load(open(os.path.join(D, 'world.json')))
KX, KZ, RES, N0, W0 = w['KX'], w['KZ'], w['res'], w['N'], w['W']
cell = lambda la, lo: (int((N0 - la) * KZ / RES), int((lo - W0) * KX / RES))
CARVE = [  # (緯度, 経度) → (緯度, 経度), 幅 m
    ((35.6738, 139.7834), (35.6718, 139.7834), 12),  # 新川の河口 → 隅田川
]
FILL = [(35.6628, 139.7667), (35.6635, 139.7683), (35.6628, 139.7696)]  # 汐留のまん中の池 (三角・丸)
img = Image.fromarray(A); d = ImageDraw.Draw(img)
for (a, b, wd) in CARVE:
    ya, xa = cell(*a); yb, xb = cell(*b)
    d.line([(xa, ya), (xb, yb)], fill=0, width=max(2, int(wd / RES)))
A = np.array(img)
h, wdt = A.shape
for la, lo in FILL:
    y0, x0 = cell(la, lo)
    hit = None
    for r in range(15):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if hit is None and A[y0 + dy, x0 + dx] == 0: hit = (y0 + dy, x0 + dx)
    if not hit: print('no water near', la, lo); continue
    seen = {hit}; q = deque([hit])
    while q and len(seen) < 20000:
        y, x = q.popleft()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < wdt and A[yy, xx] == 0 and (yy, xx) not in seen: seen.add((yy, xx)); q.append((yy, xx))
    if len(seen) >= 20000: print('too big, skip', la, lo); continue
    for y, x in seen: A[y, x] = 5
    print('filled', la, lo, len(seen))
Image.fromarray(A).save(os.path.join(D, 'map.png'), optimize=True)
# 水でないマスに端があるワープ、両端が同じ水面のワープは消す
lab = np.zeros(A.shape, np.int32); n = 0
def comp(y, x):
    global n
    if A[y, x] != 0: return 0
    if lab[y, x]: return lab[y, x]
    n += 1; q = deque([(y, x)]); lab[y, x] = n
    while q:
        a, b = q.popleft()
        for yy, xx in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
            if 0 <= yy < h and 0 <= xx < wdt and A[yy, xx] == 0 and not lab[yy, xx]: lab[yy, xx] = n; q.append((yy, xx))
    return n
keep = []
KEEP_SAME = [(35.6848, 139.7454)]  # 半蔵門 (細い水路でつながるが、舟では通りにくいので残す)
for k in w['warps']:
    ca = comp(int(k[1] / RES), int(k[0] / RES)); cb = comp(int(k[3] / RES), int(k[2] / RES))
    la, lo = N0 - k[1] / KZ, W0 + k[0] / KX
    if ca == 0 or cb == 0 or (ca == cb and not any(abs(la - a) < 0.0003 and abs(lo - b) < 0.0003 for a, b in KEEP_SAME)):
        print('drop warp', round(la, 4), round(lo, 4)); continue
    keep.append(k)
# 足すワープ: 実際は囲まれていて行けないお濠 (白鳥濠) も、ワープで行けるように
ADD = [((35.68748, 139.75686), (35.68935, 139.75689))]  # 白鳥濠 ↔ 天神濠 (本丸の北)
for a, b in ADD:
    ya, xa = cell(*a); yb, xb = cell(*b)
    k = [xa * RES + RES / 2, ya * RES + RES / 2, xb * RES + RES / 2, yb * RES + RES / 2]
    if A[ya, xa] == 0 and A[yb, xb] == 0 and not any(abs(q[0] - k[0]) < 3 and abs(q[1] - k[1]) < 3 for q in keep): keep.append(k); print('add warp', a, b)
w['warps'] = keep
json.dump(w, open(os.path.join(D, 'world.json'), 'w'))
print('warps', len(keep))
