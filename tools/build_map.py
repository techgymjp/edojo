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
import numpy as np

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
    # 隅田川 (浅草橋 → 河口。日本橋・京橋・銀座は内側)
    (35.6937, 139.7896), (35.6900, 139.7903), (35.6850, 139.7906), (35.6815, 139.7900), (35.6790, 139.7895),
    (35.6765, 139.7880), (35.6735, 139.7858), (35.6700, 139.7830), (35.6668, 139.7800), (35.6640, 139.7768),
    (35.6612, 139.7728),
    # 汐留川 (浜御殿の北 → 汐留 → 新橋 → 幸橋)
    (35.6620, 139.7662), (35.6632, 139.7640), (35.6652, 139.7618), (35.6668, 139.7592), (35.6683, 139.7553),
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
    # 真田濠 (弁慶濠の西の端 → 喰違 → 四谷 → 市ヶ谷濠)
    ([(35.6830, 139.7323), (35.6838, 139.7320), (35.6862, 139.7305), (35.6885, 139.7310),
      (35.6903, 139.7324)], 45),
    # 道三堀 (和田倉濠 → 外堀)
    ([(35.6836, 139.7624), (35.6845, 139.7655), (35.6855, 139.7690), (35.6860, 139.7710)], 24),
    # 日比谷濠 → 山下門
    ([(35.6758, 139.7597), (35.6735, 139.7600), (35.6703, 139.7598)], 30),
    # ---- ほかのステージ用に、江戸の堀と水運をすべて戻す ----
    # 汐留川 (幸橋 → 新橋 → 汐留 → 浜御殿の北)
    ([(35.6683, 139.7553), (35.6668, 139.7592), (35.6652, 139.7618), (35.6632, 139.7640), (35.6620, 139.7662)], 34),
    # 京橋川 → 白魚橋 → 桜川 (八丁堀) → 亀島川
    ([(35.6772, 139.7686), (35.6768, 139.7710), (35.6762, 139.7735), (35.6758, 139.7752), (35.6750, 139.7785),
      (35.6744, 139.7815), (35.6740, 139.7838), (35.6737, 139.7858)], 25),
    # 楓川 (日本橋川 → 白魚橋)
    ([(35.6842, 139.7768), (35.6815, 139.7766), (35.6788, 139.7760), (35.6760, 139.7752)], 25),
    # 三十間堀 (京橋川 → 汐留川)
    ([(35.6764, 139.7722), (35.6735, 139.7700), (35.6707, 139.7680), (35.6680, 139.7655), (35.6658, 139.7625)], 32),
    # 築地川 (汐留川 → 築地 → 明石町 → 隅田川)
    ([(35.6645, 139.7640), (35.6672, 139.7695), (35.6700, 139.7735), (35.6710, 139.7760), (35.6692, 139.7790), (35.6675, 139.7805)], 24),
    # 龍閑川 (鎌倉河岸 → 浜町川)
    ([(35.6893, 139.7665), (35.6905, 139.7720), (35.6912, 139.7775)], 16),
    # 浜町川 (龍閑川 → 隅田川)
    ([(35.6912, 139.7775), (35.6890, 139.7810), (35.6862, 139.7845), (35.6840, 139.7872)], 18),
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


def meiji_water(nat):
    """明治期の低湿地の水部 (data/src/swale.png) を 3m 格子へ。古地図のずれを 600m の区画ごとに今の川・お濠に合わせて直す"""
    sw = np.array(Image.open(os.path.join(D, 'src', 'swale.png')).convert('RGB')).astype(np.int16)
    Z, X0, Y0 = map(int, open(os.path.join(D, 'src', 'swale.txt')).read().split())
    jj, ii = np.mgrid[0:h, 0:w]
    lon = W + (ii + 0.5) * RES / KX; lat = N - (jj + 0.5) * RES / KZ
    fx = ((lon + 180) / 360 * 2 ** Z - X0) * 256; r = np.radians(lat)
    fy = ((1 - np.log(np.tan(r) + 1 / np.cos(r)) / math.pi) / 2 * 2 ** Z - Y0) * 256
    def sample(dyc, dxc):
        # dyc, dxc: 3m 格子でのずれ (セル)
        py = np.clip((fy + dyc * RES / 1.94).astype(int), 0, sw.shape[0] - 1); px_ = np.clip((fx + dxc * RES / 1.94).astype(int), 0, sw.shape[1] - 1)
        c = sw[py, px_]
        return (abs(c[..., 0] - 147) < 14) & (abs(c[..., 1] - 200) < 14) & (abs(c[..., 2] - 254) < 6)
    base = sample(0, 0)
    bp = np.pad(base, 16)
    # 区画ごとのずれ
    B = 200
    nby, nbx = (h + B - 1) // B, (w + B - 1) // B
    sy = np.zeros((nby, nbx)); sx = np.zeros((nby, nbx)); ok = np.zeros((nby, nbx), bool)
    for by in range(nby):
        for bx in range(nbx):
            j0, j1, i0, i1 = by * B, min(h, by * B + B), bx * B, min(w, bx * B + B)
            a = nat[j0:j1, i0:i1]
            if a.sum() < 400: continue
            best = None
            for dy in range(-16, 17):
                for dx in range(-16, 17):
                    bb = bp[j0 + dy + 16:j1 + dy + 16, i0 + dx + 16:i1 + dx + 16]
                    sc = (a & bb).sum() / max(1, (a | bb).sum())
                    if best is None or sc > best[0]: best = (sc, dy, dx)
            if best[0] > 0.25 and abs(best[1]) < 16 and abs(best[2]) < 16: sy[by, bx], sx[by, bx], ok[by, bx] = best[1], best[2], True
    # ない区画はまわりの平均で埋める
    for _ in range(20):
        if ok.all(): break
        ny, nx_ = sy.copy(), sx.copy(); nok = ok.copy()
        for by in range(nby):
            for bx in range(nbx):
                if ok[by, bx]: continue
                vs = [(sy[y, x], sx[y, x]) for y, x in ((by - 1, bx), (by + 1, bx), (by, bx - 1), (by, bx + 1)) if 0 <= y < nby and 0 <= x < nbx and ok[y, x]]
                if vs: ny[by, bx] = np.mean([v[0] for v in vs]); nx_[by, bx] = np.mean([v[1] for v in vs]); nok[by, bx] = True
        sy, sx, ok = ny, nx_, nok
    print('meiji shift (cells)\n', sy.astype(int), '\n', sx.astype(int))
    # 区画の中心のあいだを補間したずれで、セルごとに古地図を引く
    cy = (jj + 0.5) / B - 0.5; cx = (ii + 0.5) / B - 0.5
    y0 = np.clip(np.floor(cy).astype(int), 0, nby - 1); x0 = np.clip(np.floor(cx).astype(int), 0, nbx - 1)
    y1 = np.clip(y0 + 1, 0, nby - 1); x1 = np.clip(x0 + 1, 0, nbx - 1)
    u = np.clip(cx - x0, 0, 1); v = np.clip(cy - y0, 0, 1)
    DY = sy[y0, x0] * (1 - u) * (1 - v) + sy[y0, x1] * u * (1 - v) + sy[y1, x0] * (1 - u) * v + sy[y1, x1] * u * v
    DX = sx[y0, x0] * (1 - u) * (1 - v) + sx[y0, x1] * u * (1 - v) + sx[y1, x0] * (1 - u) * v + sx[y1, x1] * u * v
    py = np.clip((fy + DY * RES / 1.94).astype(int), 0, sw.shape[0] - 1); px_ = np.clip((fx + DX * RES / 1.94).astype(int), 0, sw.shape[1] - 1)
    c = sw[py, px_]
    return (abs(c[..., 0] - 147) < 14) & (abs(c[..., 1] - 200) < 14) & (abs(c[..., 2] - 254) < 6)


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
    # 今の水面 (戻した江戸の堀と区別する。地形の水面の高さを決めるのに使う)
    Image.fromarray(np.where(A == 0, 255, 0).astype(np.uint8)).save(os.path.join(D, 'src', 'natural.png'))
    A = np.array(img)
    # 埋め立てられた江戸の堀・運河: 国土地理院「明治期の低湿地」の水部 (明治前期の古地図) から戻す
    mj = meiji_water(A == 0)
    # 今の陸だけを水にする (お城の中・湾の埋立地 (明治にはまだ海) はそのまま)
    jj, ii = np.mgrid[0:h, 0:w]
    lat = N - (jj + 0.5) * RES / KZ; lon = W + (ii + 0.5) * RES / KX
    bay = (lat < 35.6625) | ((lon > 139.7835) & (lat < 35.6765)) | ((lon > 139.7935) & (lat < 35.690))
    add = mj & (A == 5) & ~bay
    print('meiji canals added', int(add.sum()))
    A[add] = 0
    # 明治の地図にうまく出ない外堀 (真田濠・溜池まわり) は手で引いた線で補う
    img2 = Image.fromarray(A); d2 = ImageDraw.Draw(img2)
    for line, width in CHANNELS:
        if not any(abs(la - 35.684) < 0.006 and lo < 139.7340 for la, lo in line) and not any(abs(lo - 139.741) < 0.006 and la < 35.6785 for la, lo in line):
            continue
        pts = [px(*p) for p in line]; r = width / RES / 2
        d2.line(pts, fill=0, width=int(round(width / RES)), joint='curve')
        for x, y in pts: d2.ellipse([x - r, y - r, x + r, y + r], fill=0)
    B2 = np.array(img2); keep = (A == 3) | (A == 4); B2[keep] = A[keep]; A = B2
    # 今の水面のデータで細くとぎれている所を広げる (半蔵濠の北の端)
    img3 = Image.fromarray(A); d3 = ImageDraw.Draw(img3)
    for line, width in [([(35.6829, 139.7448), (35.6838, 139.7450), (35.6846, 139.7452)], 24)]:
        pts = [px(*p) for p in line]; r = width / RES / 2
        d3.line(pts, fill=0, width=int(round(width / RES)), joint='curve')
        for x, y in pts: d3.ellipse([x - r, y - r, x + r, y + r], fill=0)
    A = np.array(img3)
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
            inner = sum(1 for cy, cx in cells[::5] if I[cy, cx] >= 3) * 2 > len(cells[::5])
            comps.append({'id': n, 'n': len(cells), 'in': inring, 'cells': cells, 'inner': inner})
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
                        if lab[yy, xx] in joined and (I[yy, xx] >= 3) == c['inner']:
                            hit = (orig, (yy, xx)); break
                        continue
                    if (yy, xx) not in dist:
                        dist[(yy, xx)] = (dd + 1, orig); q.append((yy, xx))
                if hit: break
            if hit:
                (ay, ax), (by, bx) = hit
                warps.append([round(ax * RES + RES / 2, 1), round(ay * RES + RES / 2, 1), round(bx * RES + RES / 2, 1), round(by * RES + RES / 2, 1)])
                joined.add(c['id']); changed = True
    # 外堀を順に回れるよう、外堀の土橋 (見附) で切れている所にもワープを置く
    ROUTE = [(35.7027, 139.7450), (35.7000, 139.7428), (35.6964, 139.7399), (35.6935, 139.7360), (35.6902, 139.7323),
             (35.6862, 139.7305), (35.6820, 139.7330), (35.6765, 139.7378), (35.6728, 139.7418), (35.6703, 139.7468),
             (35.6697, 139.7495), (35.6683, 139.7553), (35.6700, 139.7597), (35.6735, 139.7600)]
    def snapc(la, lo):
        x0, y0 = px(la, lo); x0, y0 = int(x0), int(y0)
        for r in range(0, 40):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    yy, xx = y0 + dy, x0 + dx
                    if 0 <= yy < h and 0 <= xx < w and water[yy, xx]: return (yy, xx)
        return None
    def field(src, limit):
        dist = {src: 0}; q = deque([src])
        while q:
            y, x = q.popleft(); d = dist[(y, x)]
            if d >= limit: continue
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and water[yy, xx] and (yy, xx) not in dist:
                    dist[(yy, xx)] = d + 1; q.append((yy, xx))
        return dist
    for (la0, lo0), (la1, lo1) in zip(ROUTE, ROUTE[1:]):
        a, b = snapc(la0, lo0), snapc(la1, lo1)
        if not a or not b: continue
        eu = math.hypot(a[0] - b[0], a[1] - b[1])
        fa = field(a, int(eu * 2.5 + 60))
        if b in fa: continue  # 水でつながっている
        fb = field(b, int(eu * 2.5 + 60))
        A_ = list(fa.keys())[::3]; B_ = list(fb.keys())[::3]
        best = None
        for (ya, xa) in A_:
            for (yb, xb) in B_:
                d = (ya - yb) ** 2 + (xa - xb) ** 2
                if best is None or d < best[0]: best = (d, ya, xa, yb, xb)
        if best and best[0] ** 0.5 * RES < 260:
            _, ya, xa, yb, xb = best
            warps.append([round(xa * RES + RES / 2, 1), round(ya * RES + RES / 2, 1), round(xb * RES + RES / 2, 1), round(yb * RES + RES / 2, 1)])
            print('outer warp', (la0, lo0), '->', (la1, lo1), round(best[0] ** 0.5 * RES), 'm')
    # 実際はつながっていない外堀どうし (真田濠 ↔ 弁慶濠・赤坂見附) には必ずワープを置く
    for (la0, lo0), (la1, lo1) in [((35.6822, 139.7310), (35.6806, 139.7323)), ((35.6790, 139.7353), (35.6768, 139.7378)), ((35.6860, 139.7456), (35.6845, 139.7456)), ((35.6798, 139.7612), (35.6779, 139.7612)), ((35.6932, 139.7558), (35.6921, 139.7545))]:
        a, b = snapc(la0, lo0), snapc(la1, lo1)
        if a and b and a != b:
            warps.append([round(a[1] * RES + RES / 2, 1), round(a[0] * RES + RES / 2, 1), round(b[1] * RES + RES / 2, 1), round(b[0] * RES + RES / 2, 1)])
            print('forced warp', (la0, lo0), (la1, lo1), 'labs', lab[a], lab[b], round(math.hypot(a[0]-b[0], a[1]-b[1]) * RES), 'm')
    print('warps', len(warps), 'unjoined', [(c['id'], c['n']) for c in moats if c['id'] not in joined])
    Image.fromarray(A).save(os.path.join(D, 'map.png'), optimize=True)
    world = {'W': W, 'E': E, 'S': S, 'N': N, 'KX': KX, 'KZ': KZ, 'res': RES, 'w': w, 'h': h,
             'ring': [[round(v, 1) for v in xz(*p)] for p in RING], 'warps': warps}
    # ワープの整理: 25m 未満のすき間は水でつなぐ (ワープにしない)。ほぼ同じ所の重なったワープは短い方だけ残す
    # (水でつなぐのはお城の区域の中のすき間だけ。外堀の土橋・見附はワープのまま)
    inI = lambda x, z: I[min(h - 1, int(z / RES)), min(w - 1, int(x / RES))] >= 3
    short = [wp for wp in warps if math.hypot(wp[2] - wp[0], wp[3] - wp[1]) < 25 and inI(wp[0], wp[1]) and inI(wp[2], wp[3])]
    if short:
        img4 = Image.fromarray(A); d4 = ImageDraw.Draw(img4)
        for x1, z1, x2, z2 in short:
            d4.line([(x1 / RES, z1 / RES), (x2 / RES, z2 / RES)], fill=0, width=int(14 / RES))
        A = np.array(img4)
        Image.fromarray(A).save(os.path.join(D, 'map.png'), optimize=True)
    keep = []
    for wp in sorted([wp for wp in warps if wp not in short], key=lambda w: math.hypot(w[2] - w[0], w[3] - w[1])):
        mx, mz = (wp[0] + wp[2]) / 2, (wp[1] + wp[3]) / 2
        if any(math.hypot(mx - (k[0] + k[2]) / 2, mz - (k[1] + k[3]) / 2) < 80 for k in keep): continue
        keep.append(wp)
    print('warps kept', len(keep), 'joined by water', len(short))
    world['warps'] = [k for k in keep if math.hypot(k[2] - k[0], k[3] - k[1]) > 5]
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
