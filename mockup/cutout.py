"""白背景の生成画像から被写体だけを切り出す（外周からのフラッドフィルで背景だけ抜く）。

単純な「白→透過」だとカップの白いフチまで消える。外周と地続きの白だけを辿ることで
内側の白（リム）を残す。
"""
import sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
thresh = int(sys.argv[3]) if len(sys.argv) > 3 else 45

im = Image.open(src).convert("RGBA")
w, h = im.size

# 四隅から背景を抜く
for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    ImageDraw.floodfill(im, pt, (0, 0, 0, 0), thresh=thresh)

# 抜けきらなかった外周の残りも掃く（1pxごとに縁を走査）
for x in range(0, w, 8):
    for y in (0, h - 1):
        if im.getpixel((x, y))[3] != 0:
            ImageDraw.floodfill(im, (x, y), (0, 0, 0, 0), thresh=thresh)
for y in range(0, h, 8):
    for x in (0, w - 1):
        if im.getpixel((x, y))[3] != 0:
            ImageDraw.floodfill(im, (x, y), (0, 0, 0, 0), thresh=thresh)

bbox = im.split()[3].getbbox()
if bbox:
    im = im.crop(bbox)

im.save(dst)
print(f"OK {dst} size={im.size}")
