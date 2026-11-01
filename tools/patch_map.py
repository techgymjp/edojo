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
    ((35.6924, 139.7363), (35.6913, 139.7349), 22),
    ((35.68716, 139.75361), (35.68710, 139.75361), 8),
    ((35.68412, 139.75557), (35.68375, 139.75580), 8),  # 蓮池濠 ↔ 蛤濠 (10m のすき間)  # 乾濠 ↔ 蓮池濠 (6m のすき間を水でつなぐ)  # 市ヶ谷: 新見附濠 ↔ 市ヶ谷濠 (市ヶ谷橋の下)
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
# 隅田川・汐留川など本流から 110m 以内で行き止まりになっている堀・運河 (築地・浜町・深川など) は、隅田川につなぐ (江戸の堀は川へ抜けていた)
def label_all(A):
    lab = np.zeros(A.shape, np.int32); sizes = [0]; n = 0
    for y0, x0 in zip(*np.nonzero(A == 0)):
        if lab[y0, x0]: continue
        n += 1; q = deque([(y0, x0)]); lab[y0, x0] = n; c = 0
        while q:
            y, x = q.popleft(); c += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < wdt and A[yy, xx] == 0 and not lab[yy, xx]: lab[yy, xx] = n; q.append((yy, xx))
        sizes.append(c)
    return lab, sizes
labA, sizes = label_all(A)
my, mx = cell(35.6880, 139.7905); main = labA[my, mx]
xE = int((139.7555 - W0) * KX / RES)
img = Image.fromarray(A); d = ImageDraw.Draw(img); nj = 0
mainpts = np.argwhere(labA == main)
mainpts = mainpts[::3]
for k in range(1, len(sizes)):
    if k == main or sizes[k] < 150: continue
    pts = np.argwhere(labA == k)
    if pts[:, 1].max() < xE: continue
    cy, cx = pts.mean(0).astype(int)
    if ((A[max(0, cy - 50):cy + 50, max(0, cx - 50):cx + 50] == 3) | (A[max(0, cy - 50):cy + 50, max(0, cx - 50):cx + 50] == 4)).any(): continue  # お城の中の池は除く
    pts = pts[::2]
    best = None
    for py, px in pts:
        dd = (mainpts[:, 0] - py) ** 2 + (mainpts[:, 1] - px) ** 2
        i = int(dd.argmin())
        if best is None or dd[i] < best[0]: best = (dd[i], py, px, mainpts[i][0], mainpts[i][1])
    if best and best[0] ** 0.5 * RES < 110:
        _, ya, xa, yb, xb = best
        d.line([(xa, ya), (xb, yb)], fill=0, width=max(3, int(10 / RES))); nj += 1
        print('joined to 隅田川', round(N0 - ya * RES / KZ, 4), round(W0 + xa * RES / KX, 4), round(best[0] ** 0.5 * RES), 'm')
A = np.array(img)
# 半蔵門の土橋 (国土地理院の水面のデータで切れている所): 半蔵濠と桜田濠のあいだを陸に戻す
for y in range(cell(35.68405, 0)[0], cell(35.68365, 0)[0] + 1):
    for x in range(cell(0, 139.7444)[1], cell(0, 139.7463)[1] + 1):
        if A[y, x] == 0: A[y, x] = 3
# 丘の上を通ってしまった想像の堀 (溜池の水路が日枝神社の山王の丘を切っている所) を陸に戻す: 半径の中で岸の高さが高い水のマス
HILL = [((35.6748, 139.7397), 110, 16)]  # (中心, 半径 m, この高さ m より高い岸)
Tp = np.array(Image.open(os.path.join(D, 'terrain.png')).convert('RGB')).astype(float); TH = (Tp[..., 0] * 256 + Tp[..., 1]) / 200 - 20
for (la, lo), rad, thr in HILL:
    y0, x0 = cell(la, lo); r = int(rad / RES); nfill = 0
    for y in range(y0 - r, y0 + r + 1):
        for x in range(x0 - r, x0 + r + 1):
            if (y - y0) ** 2 + (x - x0) ** 2 <= r * r and A[y, x] == 0 and TH[y, x] > thr: A[y, x] = 5; nfill += 1
    print('hill fill', la, lo, nfill)
# 岸の線をなめらかに (3m のマスの段々・ギザギザをならす。まっすぐ・ゆるいカーブの岸に)
def boxmean(m, r):
    c = np.cumsum(np.cumsum(np.pad(m.astype(np.float64), ((1, 0), (1, 0))), 0), 1)
    y0 = np.clip(np.arange(h) - r, 0, h); y1 = np.clip(np.arange(h) + r + 1, 0, h)
    x0 = np.clip(np.arange(wdt) - r, 0, wdt); x1 = np.clip(np.arange(wdt) + r + 1, 0, wdt)
    s_ = c[y1][:, x1] - c[y0][:, x1] - c[y1][:, x0] + c[y0][:, x0]
    return s_ / ((y1 - y0)[:, None] * (x1 - x0)[None, :])
wat = A == 0
f = boxmean(boxmean(wat, 2), 2)
# 細い水路 (幅 15m 未満) は消えないように、もとの水を残す
thin = wat & (boxmean(wat, 3) < 0.45)
neww = (f > 0.5) | thin
# 新しく水にするマスで、別々の水面 (土橋・見附をはさんだお濠) をつないでしまうものは水にしない
labW, _ = label_all(A)
BIG = 1 << 30
mx_ = np.zeros(A.shape, np.int64); mn_ = np.full(A.shape, BIG, np.int64)
pl = np.pad(labW, 3)
for dy in range(-3, 4):
    for dx in range(-3, 4):
        v = pl[3 + dy:3 + dy + h, 3 + dx:3 + dx + wdt].astype(np.int64)
        mx_ = np.maximum(mx_, v); mn_ = np.minimum(mn_, np.where(v == 0, BIG, v))
neww &= wat | (mx_ == mn_)
# 陸になったマスは、まわりの陸のコード (多い方) にする
landcode = A.copy()
for _ in range(3):
    m = landcode == 0
    if not m.any(): break
    p_ = np.pad(landcode, 1)
    nb = np.stack([p_[:-2, 1:-1], p_[2:, 1:-1], p_[1:-1, :-2], p_[1:-1, 2:]])
    landcode = np.where(m, nb.max(0), landcode)
changed = (neww != wat).sum()
A = np.where(neww, 0, np.where(wat, landcode, A)).astype(A.dtype)
print('smoothed bank cells', int(changed))
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
DROPW = [(35.68748, 139.75686)]  # 白鳥濠 (本丸の中) のワープは消す
KEEP_SAME = []  # 半蔵門 (細い水路でつながるが、舟では通りにくいので残す)
def snapw(x, z):
    y0, x0 = int(z / RES), int(x / RES)
    for r in range(8):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if A[y0 + dy, x0 + dx] == 0: return ((x0 + dx) * RES + RES / 2, (y0 + dy) * RES + RES / 2)
    return (x, z)
w['warps'] = [[*snapw(k[0], k[1]), *snapw(k[2], k[3])] for k in w['warps']]
# ワープの端を手で動かす: (今の端の近く, 新しい場所)
MOVE = [((35.6924, 139.7548), (35.69269, 139.75533)),
        ((35.6841, 139.7556), (35.68300, 139.75586)),
        ((35.6823, 139.7553), (35.68262, 139.75600)),
        ((35.6822, 139.7310), (35.68351, 139.73229)), ((35.6806, 139.7323), (35.68096, 139.73239)),  # 喰違見附の両側
        ((35.6848, 139.7454), (35.68428, 139.74515)), ((35.6832, 139.7451), (35.68335, 139.74510))]  # 半蔵門の土橋 (35.6839) の両側  # 坂下門: 蛤濠の南西の端 ↔ 二重橋濠  # 清水濠の側を雉子橋御門のそばへ
for (la0, lo0), (la1, lo1) in MOVE:
    x0, z0 = (lo0 - W0) * KX, (N0 - la0) * KZ; x1, z1 = snapw((lo1 - W0) * KX, (N0 - la1) * KZ)
    for k in w['warps']:
        for e in (0, 2):
            if math.hypot(k[e] - x0, k[e + 1] - z0) < 25: k[e], k[e + 1] = x1, z1; print('moved warp end', la0, lo0, '->', la1, lo1)
for k in w['warps']:
    ca = comp(int(k[1] / RES), int(k[0] / RES)); cb = comp(int(k[3] / RES), int(k[2] / RES))
    la, lo = N0 - k[1] / KZ, W0 + k[0] / KX
    if any(min(math.hypot(k[0] - (lo_ - W0) * KX, k[1] - (N0 - la_) * KZ), math.hypot(k[2] - (lo_ - W0) * KX, k[3] - (N0 - la_) * KZ)) < 15 for la_, lo_ in DROPW): print('drop 白鳥濠 warp'); continue
    if ca == 0 or cb == 0 or (ca == cb and not any(abs(la - a) < 0.0003 and abs(lo - b) < 0.0003 for a, b in KEEP_SAME)):
        print('drop warp', round(la, 4), round(lo, 4)); continue
    keep.append(k)
# 足すワープ: 実際は囲まれていて行けないお濠 (白鳥濠) も、ワープで行けるように
# (白鳥濠は本丸の中 (忍者のゴール) なので、ワープは置かない)
ADD = [
       ((35.68927, 139.75364), (35.68935, 139.75391)),  # 乾濠 ↔ 平川濠 (北桔橋門)
       ]  # 本丸をぐるっと回れるように (蛤濠 ↔ 二重橋濠 ↔ … ↔ 桔梗濠 は今のワープでつながる)
for a, b in ADD:
    ya, xa = cell(*a); yb, xb = cell(*b)
    k = [xa * RES + RES / 2, ya * RES + RES / 2, xb * RES + RES / 2, yb * RES + RES / 2]
    (xa, ya), (xb, yb) = [(int(v[0] / RES), int(v[1] / RES)) for v in (snapw(xa * RES, ya * RES), snapw(xb * RES, yb * RES))]
    if A[ya, xa] == 0 and A[yb, xb] == 0 and not any(abs(q[0] - k[0]) < 3 and abs(q[1] - k[1]) < 3 for q in keep): keep.append(k); print('add warp', a, b)
w['warps'] = keep
json.dump(w, open(os.path.join(D, 'world.json'), 'w'))
print('warps', len(keep))
