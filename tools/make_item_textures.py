import sys
from PIL import Image
src, dst, scale = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGBA'); w, h = im.size
px = im.load(); out = im.copy(); o = out.load()
def lerp(a,b,t): return tuple(int(round(a[i]+(b[i]-a[i])*t)) for i in range(3))
for y in range(h):
    for x in range(w):
        r,g,b,a = px[x,y]
        if a == 0: continue
        l = (0.299*r+0.587*g+0.114*b)/255
        sat = max(r,g,b)-min(r,g,b)
        if sat > 70 and l > 0.25:   # coloured details (lights / screen) stay as they are
            continue
        # slightly darker, slightly cooler black
        c = (int(r*0.58), int(g*0.58), int(b*0.66))
        # glossy diagonal highlight
        d = (x + y) / (w + h)
        band = max(0.0, 1 - abs(d - 0.32) / 0.05)
        c = lerp(c, (225,228,240), band * (0.25 + l*0.6))
        o[x,y] = (*c, a)
# a couple of sparkle pixels
for sx, sy in ([(3,3),(12,5)] if scale=='16' else [(5,4),(20,9),(27,22)]):
    if sx < w and sy < h and px[sx,sy][3] > 0:
        o[sx,sy] = (255,250,220,255)
out.save(dst)
