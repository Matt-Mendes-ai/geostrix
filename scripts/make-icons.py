# TASKS.csv #620 — every GeoStrix icon file from one source image (assets/GeoStrix_Icon_source.png, the owl Matt
# supplied 2026-10-11). Run with the sidecar venv's Python (it has Pillow):
#   python-sidecar/venv/Scripts/python.exe scripts/make-icons.py
# The source is the owl on a near-white background, and the owl itself has a WHITE outline and white lines between
# its shapes (kept, as drawn) — so "white = transparent" would eat them. The outline ends in a thin grey hairline,
# which is the real outer boundary; a plain flood fill from the border leaked through its 1-2 px anti-aliasing gaps
# and ate every white line, and growing the coloured shapes instead left the wider white gaps (around the eyes,
# between the brows and the head) open. So: everything not background-white (hairline, slate, orange) is a wall,
# thickened by SEAL_PX to close the hairline's gaps; the background is the region outside the walls reachable from
# the image border; the owl is the rest, shrunk back by SEAL_PX and blurred 1 px to anti-alias the edge.
# Outputs (same names and sizes as before, owl filling ~90% of the square like the previous icon):
#   build/icon.png 1024, build/icon.ico (16-256), build/icon.icns, public/favicon.png 256,
#   assets/GeoStrix_Logo.png 1024, assets/geostrix-mark-64.png 64,
#   website/favicon.png 48 and website/img/icon-128.png 128 (TASKS.csv #703 — the site's tab icon was still the old owl)
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "GeoStrix_Icon_source.png"
BG_MIN = 235      # darkest channel >= this = background white (the hairline is 170-230, slate ~50, orange ~10)
SEAL_PX = 6       # how far walls are thickened to seal gaps in the hairline (and the mask shrunk back after)
FILL = 0.90       # share of the square the owl's larger side fills

im = Image.open(SRC).convert("RGBA")
W, H = im.size
spx = im.load()
wall = Image.new("L", (W, H), 0)
wpx = wall.load()
for y in range(H):
    for x in range(W):
        if min(spx[x, y][:3]) < BG_MIN:
            wpx[x, y] = 255
wall = wall.filter(ImageFilter.MaxFilter(2 * SEAL_PX + 1))
gpx = wall.load()
outside = bytearray(W * H)
q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
while q:
    x, y = q.popleft()
    i = y * W + x
    if outside[i] or gpx[x, y]:
        continue
    outside[i] = 1
    if x > 0: q.append((x - 1, y))
    if x < W - 1: q.append((x + 1, y))
    if y > 0: q.append((x, y - 1))
    if y < H - 1: q.append((x, y + 1))
mask = Image.frombytes("L", (W, H), bytes(0 if v else 255 for v in outside))
mask = mask.filter(ImageFilter.MinFilter(2 * SEAL_PX + 1)).filter(ImageFilter.GaussianBlur(1))
im.putalpha(mask)

bbox = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
owl = im.crop(bbox)
side = max(owl.size)

def square(size):
    target = round(size * FILL)
    scale = target / side
    o = owl.resize((max(1, round(owl.width * scale)), max(1, round(owl.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(o, ((size - o.width) // 2, (size - o.height) // 2), o)
    return canvas

master = square(1024)
master.save(ROOT / "build" / "icon.png", optimize=True)
master.save(ROOT / "assets" / "GeoStrix_Logo.png", optimize=True)
square(256).save(ROOT / "public" / "favicon.png", optimize=True)
square(64).save(ROOT / "assets" / "geostrix-mark-64.png", optimize=True)
square(256).save(ROOT / "build" / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (72, 72), (96, 96), (128, 128), (256, 256)])
master.save(ROOT / "build" / "icon.icns")
square(48).save(ROOT / "website" / "favicon.png", optimize=True)  # #703
square(128).save(ROOT / "website" / "img" / "icon-128.png", optimize=True)  # #703
print("owl bbox in source", bbox, "-> icons written")
