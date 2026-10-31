import sys, math
from PIL import Image
from region import S, N, W, E, LAT0
KX = 111320 * math.cos(math.radians(LAT0)); KZ = 110574
M=float(sys.argv[1]); s,n,w,e=map(float,sys.argv[2:6]); src=sys.argv[6]; dst=sys.argv[7]
im=Image.open(src)
box=(int((w-W)*KX/M),int((N-n)*KZ/M),int((e-W)*KX/M),int((N-s)*KZ/M))
im.crop(box).save(dst)
