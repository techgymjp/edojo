#!/usr/bin/env python3
"""江戸の地図 (data/map.png・data/world.json・data/bld.json) を作る。
  - 外堀の内側 (神田川・隅田川・日本橋川・外堀で囲まれた所) は江戸時代: 埋め立てられた外堀・道三堀などを戻し、
    町人地・武家地・内郭・本丸の高さを分ける
  - 外堀の外は今の東京: 国土地理院の水面と PLATEAU の建物
map.png の値: 0 水 / 3 内郭 (今の皇居ゾーン) / 4 本丸・二の丸・三の丸 / 5 今の東京 (1 町人地・2 武家地は今は使わない)
使い方: python3 tools/build_map.py   (先に fetch_water.py と fetch_plateau_mvt.py を実行)
"""
import json, math, os
from collections import deque
from PIL import Image, ImageDraw
from region import S, N, W, E, LAT0

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, '..', 'data')
RES = 3.0  # m / 画素
KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574
w = int((E - W) * KX / RES); h = int((N - S) * KZ / RES)


def xz(lat, lon):  # 世界座標 (m)。原点は範囲の北西の角、x 東、z 南
    return ((lon - W) * KX, (N - lat) * KZ)


def px(lat, lon):
    x, z = xz(lat, lon)
    return (x / RES, z / RES)


# ---- 外堀の輪 (この内側が江戸時代) ----
RING = [
    # 神田川 (飯田橋 → 浅草橋)
    (35.7027, 139.7449), (35.7029, 139.7480), (35.7028, 139.7500), (35.7024, 139.7550), (35.7019, 139.7600),
    (35.7008, 139.7650), (35.6990, 139.7690), (35.6972, 139.7712), (35.6970, 139.7800), (35.6962, 139.7850),
    (35.6951, 139.7887),
    # 隅田川 (浅草橋 → 日本橋川の河口)
    (35.6937, 139.7896), (35.6900, 139.7903), (35.6850, 139.7906), (35.6815, 139.7900), (35.6790, 139.7895),
    (35.6770, 139.7887),
    # 日本橋川 (河口 → 江戸橋 → 日本橋 → 常盤橋)
    (35.6774, 139.7870), (35.6784, 139.7847), (35.6802, 139.7820), (35.6821, 139.7803), (35.6835, 139.7795),
    (35.6846, 139.7780), (35.6842, 139.7747), (35.6848, 139.7719), (35.6867, 139.7709),
    # 外堀 (常盤橋 → 呉服橋 → 鍛冶橋 → 数寄屋橋 → 山下 → 幸橋)
    (35.6830, 139.7722), (35.6800, 139.7703), (35.6768, 139.7682), (35.6750, 139.7660), (35.6728, 139.7631),
    (35.6700, 139.7597), (35.6683, 139.7553),
    # 虎ノ門 → 溜池 → 赤坂
    (35.6693, 139.7520), (35.6697, 139.7495), (35.6703, 139.7468), (35.6712, 139.7445), (35.6728, 139.7418),
    (35.6748, 139.7395), (35.6765, 139.7378), (35.6778, 139.7366),
    # 弁慶濠 → 喰違 → 四谷 → 市ヶ谷 → 牛込
    (35.6793, 139.7350), (35.6800, 139.7330), (35.6820, 139.7330), (35.6838, 139.7320), (35.6862, 139.7305),
    (35.6885, 139.7310), (35.6902, 139.7323), (35.6935, 139.7360), (35.6964, 139.7399), (35.7000, 139.7428),
]

# ---- 埋め立てられた堀を戻す (緯度経度の線, 幅 m) ----
CHANNELS = [
    # 外堀 東 (常盤橋 → 幸橋)
    ([(35.6868, 139.7711), (35.6830, 139.7722), (35.6800, 139.7703), (35.6768, 139.7682), (35.6750, 139.7660),
      (35.6728, 139.7631), (35.6700, 139.7597), (35.6683, 139.7553)], 48),
    # 幸橋 → 虎ノ門 → 溜池の口
    ([(35.6683, 139.7553), (35.6693, 139.7520), (35.6697, 139.7495), (35.6703, 139.7468), (35.6712, 139.7445)], 40),
    # 溜池 (広い)
    ([(35.6712, 139.7445), (35.6728, 139.7418), (35.6748, 139.7395), (35.6765, 139.7378), (35.6778, 139.7366)], 75),
    ([(35.6778, 139.7366), (35.6793, 139.7352)], 35),
    # 真田濠 (弁慶濠の西の端 → 喰違 → 四谷 → 市ヶ谷濠)
    ([(35.6800, 139.7330), (35.6820, 139.7330), (35.6838, 139.7320), (35.6862, 139.7305), (35.6885, 139.7310),
      (35.6903, 139.7324)], 45),
    # 道三堀 (和田倉濠 → 外堀)
    ([(35.6836, 139.7624), (35.6845, 139.7655), (35.6855, 139.7690), (35.6860, 139.7710)], 24),
    # 日比谷濠 → 山下門
    ([(35.6758, 139.7597), (35.6735, 139.7600), (35.6703, 139.7598)], 30),
]

# ---- 武家地 (外堀の輪と重なる所だけ使う) ----
BUKE = [(35.72, 139.70), (35.72, 139.762), (35.7010, 139.7625), (35.6935, 139.7625), (35.6900, 139.7640),
        (35.6878, 139.7690), (35.6867, 139.7709), (35.6845, 139.7716), (35.6800, 139.7760), (35.64, 139.78), (35.64, 139.70)]

# ---- 内郭・本丸 (皇居のお濠の画像の画素から。左上 35.697, 139.742、経度 0.001 度 = 36.2px、緯度 0.001 度 = 44.2px) ----
def cp(pts): return [(35.697 - y / 44200, 139.742 + x / 36200) for x, y in pts]
NAIKAKU = cp([(280, 92), (330, 140), (400, 170), (480, 200), (505, 280), (540, 315), (660, 315), (690, 330),
              (685, 480), (668, 525), (712, 560), (742, 600), (712, 700), (692, 800), (662, 832), (650, 932),
              (530, 880), (430, 830), (400, 815), (300, 830), (170, 740), (110, 620), (125, 500), (130, 380),
              (200, 335), (235, 300), (212, 230), (208, 150)])
HONMARU = cp([(430, 325), (648, 318), (680, 332), (672, 500), (652, 560), (600, 598), (512, 598), (470, 540),
              (420, 462), (405, 380)])


def obb(pts, hgt):
    """建物の輪郭 → いちばん小さい向き付きの箱 [高さ, 中心x, 中心z, 幅, 奥行き, 向き]"""
    best = None
    n = len(pts)
    for i in range(n):
        x0, z0 = pts[i - 1]; x1, z1 = pts[i]
        L = math.hypot(x1 - x0, z1 - z0)
        if L < 0.5: continue
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        us = [p[0] * ux + p[1] * uz for p in pts]; vs = [-p[0] * uz + p[1] * ux for p in pts]
        a = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or a < best[0]:
            cu = (max(us) + min(us)) / 2; cv = (max(vs) + min(vs)) / 2
            best = (a, cu * ux - cv * uz, cu * uz + cv * ux, max(us) - min(us), max(vs) - min(vs), math.atan2(uz, ux))
    a, cx, cz, bw, bd, ang = best
    return [round(hgt, 1), round(cx, 1), round(cz, 1), round(bw, 1), round(bd, 1), round(ang, 3)]


def main():
    img = Image.new('L', (w, h), 5)
    d = ImageDraw.Draw(img)
    ring = Image.new('L', (w, h), 0)
    ImageDraw.Draw(ring).polygon([px(*p) for p in RING], fill=1)
    buke = Image.new('L', (w, h), 0)
    ImageDraw.Draw(buke).polygon([px(*p) for p in BUKE], fill=1)
    # 輪の中は町人地 → 武家地 → 内郭 → 本丸
    inner = Image.new('L', (w, h), 0); di = ImageDraw.Draw(inner)
    di.rectangle([0, 0, w, h], fill=1)
    di.polygon([px(*p) for p in BUKE], fill=2)
    di.polygon([px(*p) for p in NAIKAKU], fill=3)
    di.polygon([px(*p) for p in HONMARU], fill=4)
    import numpy as np
    A = np.array(img); R = np.array(ring); I = np.array(inner)
    # 江戸時代なのは今の皇居ゾーン (内堀の内側) だけ。外は外堀の内側も今の東京
    A[I >= 3] = I[I >= 3]
    img = Image.fromarray(A); d = ImageDraw.Draw(img)
    # 今の水面
    for poly in json.load(open(os.path.join(D, 'src', 'water.json'))):
        d.polygon([px(*p) for p in poly[0]], fill=0)
    holes = Image.new('L', (w, h), 0); dh = ImageDraw.Draw(holes)
    for poly in json.load(open(os.path.join(D, 'src', 'water.json'))):
        for hole in poly[1:]:
            dh.polygon([px(*p) for p in hole], fill=1)
    # 穴 (川の中州など) は元の値に戻す
    A = np.array(img); Hh = np.array(holes); base = np.where(R == 1, I, 5)
    A[Hh == 1] = np.where(I >= 3, I, 5)[Hh == 1]
    img = Image.fromarray(A); d = ImageDraw.Draw(img)
    # 江戸の堀
    for line, width in CHANNELS:
        pts = [px(*p) for p in line]; r = width / RES / 2
        d.line(pts, fill=0, width=int(round(width / RES)), joint='curve')
        for x, y in pts:
            d.ellipse([x - r, y - r, x + r, y + r], fill=0)
    A = np.array(img)
    # 川の中の小さな陸 (橋脚・中州のかけら) を水にする: 水を 2 画素ふくらませてから縮める (お城の陸はそのまま)
    from PIL import ImageFilter
    wm = Image.fromarray(np.where(A == 0, 255, 0).astype(np.uint8))
    closed = np.array(wm.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)))
    fill = (closed == 255) & (A == 5)
    print('filled specks', int(fill.sum()))
    A[fill] = 0
    # ---- 水のかたまりに番号を付け、離れたお濠どうしをワープでつなぐ ----
    lab = np.zeros(A.shape, np.int32)
    water = A == 0
    comps = []
    ys, xs = np.nonzero(water)
    order = np.lexsort((xs, ys))
    n = 0
    for k in order[::97]:  # 種を間引いて探す (取りこぼしは下で拾う)
        pass
    def flood(sy, sx, idv):
        q = deque([(sy, sx)]); lab[sy, sx] = idv; cells = [(sy, sx)]
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and water[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = idv; q.append((yy, xx)); cells.append((yy, xx))
        return cells
    for y, x in zip(ys, xs):
        if not lab[y, x]:
            n += 1
            cells = flood(y, x, n)
            inring = sum(1 for cy, cx in cells[::7] if R[cy, cx] or I[cy, cx] >= 3) * 7
            comps.append({'id': n, 'n': len(cells), 'in': inring, 'cells': cells})
    # 江戸のお濠: 輪の中に 600m² 以上あるもの
    moats = [c for c in comps if c['in'] * RES * RES >= 4000]
    moats.sort(key=lambda c: -c['n'])
    print('water comps', len(comps), 'moats', len(moats), [(c['id'], c['n']) for c in moats[:30]])
    joined = {moats[0]['id']}
    warps = []
    mids = {c['id'] for c in moats}
    changed = True
    while changed:
        changed = False
        for c in moats:
            if c['id'] in joined:
                continue
            # このお濠から陸を通って一番近い、つながり済みのお濠を探す (幅優先, 最大 250m)
            src = c['cells']
            dist = {}
            q = deque()
            for cy, cx in src:
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = cy + dy, cx + dx
                    if 0 <= yy < h and 0 <= xx < w and not water[yy, xx] and (yy, xx) not in dist:
                        dist[(yy, xx)] = (0, (cy, cx)); q.append((yy, xx))
            hit = None
            while q:
                y, x = q.popleft(); dd, orig = dist[(y, x)]
                if dd > 250 / RES: break
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if not (0 <= yy < h and 0 <= xx < w): continue
                    if water[yy, xx]:
                        # 内堀どうしだけをワープでつなぐ (内堀と外の川・外堀は日比谷濠〜山下の堀でしかつながらない)
                        if lab[yy, xx] in joined and I[yy, xx] >= 3:
                            hit = (orig, (yy, xx)); break
                        continue
                    if (yy, xx) not in dist:
                        dist[(yy, xx)] = (dd + 1, orig); q.append((yy, xx))
                if hit: break
            if hit:
                (ay, ax), (by, bx) = hit
                warps.append([round(ax * RES + RES / 2, 1), round(ay * RES + RES / 2, 1), round(bx * RES + RES / 2, 1), round(by * RES + RES / 2, 1)])
                joined.add(c['id']); changed = True
    print('warps', len(warps), 'unjoined', [(c['id'], c['n']) for c in moats if c['id'] not in joined])
    Image.fromarray(A).save(os.path.join(D, 'map.png'), optimize=True)
    world = {'W': W, 'E': E, 'S': S, 'N': N, 'KX': KX, 'KZ': KZ, 'res': RES, 'w': w, 'h': h,
             'ring': [[round(v, 1) for v in xz(*p)] for p in RING], 'warps': warps}
    json.dump(world, open(os.path.join(D, 'world.json'), 'w'))
    # ---- 今の建物 (輪の外だけ。0.5m 単位の整数、[高さ, x0, z0, x1, z1 ...]) ----
    out = []
    for b in json.load(open(os.path.join(D, 'src', 'plateau.json'))):
        pts = [xz(*p) for p in b['r']]
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        gx, gz = int(cx / RES), int(cz / RES)
        if not (0 <= gx < w and 0 <= gz < h) or A[gz, gx] != 5:
            continue
        ar = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2
        if ar < 40 or b['h'] < 5:
            continue
        out.append(obb(pts, b['h']))
    json.dump(out, open(os.path.join(D, 'bld.json'), 'w'), separators=(',', ':'))
    print('buildings', len(out), w, h)


if __name__ == '__main__':
    main()
