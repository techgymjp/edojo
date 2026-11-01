import math, os
import numpy as np
from PIL import Image
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'src', 'dem')
Z = 15
_cache = {}
def tile(kind, X, Y):
    k = (kind, X, Y)
    if k in _cache: return _cache[k]
    if kind == 'dem_png':
        p = os.path.join(D, kind, f'{X}_{Y}.png')
    else:
        p = os.path.join(D, kind, f'{X}_{Y}.png')
    a = None
    if os.path.exists(p) and os.path.getsize(p) > 0:
        im = np.array(Image.open(p).convert('RGB')).astype(np.int64)
        x = im[..., 0] * 65536 + im[..., 1] * 256 + im[..., 2]
        h = np.where(x < 2 ** 23, x * 0.01, (x - 2 ** 24) * 0.01).astype(np.float32)
        h[x == 2 ** 23] = np.nan
        a = h
    _cache[k] = a
    return a
def elev(lat, lon):
    """5A → 5B → 10B の順で標高 (m)。値なしは nan"""
    fx = (lon + 180) / 360 * 2 ** Z
    r = math.radians(lat); fy = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
    X, Y = int(fx), int(fy); px, py = int((fx - X) * 256), int((fy - Y) * 256)
    for kind in ('dem5a_png', 'dem5b_png'):
        t = tile(kind, X, Y)
        if t is not None and not np.isnan(t[py, px]): return float(t[py, px])
    # 10B (z14)
    fx2, fy2 = fx / 2, fy / 2; X2, Y2 = int(fx2), int(fy2)
    t = tile('dem_png', X2 * 2 if False else X, Y)  # 保存名は z15 の番号
    if t is not None:
        v = t[int((fy2 - Y2) * 256), int((fx2 - X2) * 256)]
        if not np.isnan(v): return float(v)
    return float('nan')
