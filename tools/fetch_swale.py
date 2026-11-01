#!/usr/bin/env python3
"""国土地理院「明治期の低湿地」(明治前期の迅速測図などから作った、当時の水部・湿地) のタイルを集めて、
範囲全体の 1 枚の画像 data/src/swale.png にする。埋め立てられた江戸の堀や運河を、古地図どおりに戻すのに使う。
出典: 国土地理院 明治期の低湿地 https://maps.gsi.go.jp/development/ichiran.html#swale
"""
import io, math, os, sys, urllib.request
from PIL import Image
from region import S, N, W, E
Z = 16
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'src')
tx = lambda lon: (lon + 180) / 360 * 2 ** Z
def ty(lat):
    r = math.radians(lat); return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2 ** Z
x0, x1, y0, y1 = int(tx(W)), int(tx(E)), int(ty(N)), int(ty(S))
im = Image.new('RGBA', ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256), (255, 255, 255, 0))
for X in range(x0, x1 + 1):
    for Y in range(y0, y1 + 1):
        for a in range(4):
            try:
                d = urllib.request.urlopen(f'https://cyberjapandata.gsi.go.jp/xyz/swale/{Z}/{X}/{Y}.png', timeout=30).read()
                t = Image.open(io.BytesIO(d)).convert('RGBA'); im.paste(t, ((X - x0) * 256, (Y - y0) * 256), t)
                break
            except Exception as e:
                if '404' in str(e): break
                sys.stderr.write(f'{X},{Y} {e}\n')
im.save(os.path.join(D, 'swale.png'))
open(os.path.join(D, 'swale.txt'), 'w').write(f'{Z} {x0} {y0}\n')
print(im.size, x0, y0)
