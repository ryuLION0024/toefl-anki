"""アプリアイコン（紺地に白で『T』と下線の空欄）を生成する。"""
from PIL import Image, ImageDraw, ImageFont
import sys
out = sys.argv[1]
for size in (180, 192, 512):
    im = Image.new("RGB", (size, size), "#1f4e79")
    d = ImageDraw.Draw(im)
    u = size / 100
    try:
        f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", int(46 * u))
    except OSError:
        f = ImageFont.load_default()
    d.text((50 * u, 44 * u), "Tw", font=f, fill="white", anchor="mm")
    for i in range(3):
        x = (28 + i * 16) * u
        d.rectangle([x, 72 * u, x + 11 * u, 76 * u], fill="#9cc3ea")
    im.save(f"{out}/icon-{size}.png")
