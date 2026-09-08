"""Draw the generated letters the way the app's painter does.

Looking at them is the only way to know a B has bumps. Each stroke is drawn in
its own shade so the stroke order and the lifts are visible too — a letter can
be the right shape and still be taught in the wrong order.
"""

import json
from PIL import Image, ImageDraw

CELL = 150
COLS = 13
PAD = 14

# First stroke darkest, later strokes lighter.
SHADES = [(45, 50, 65), (70, 95, 150), (30, 130, 100), (190, 120, 40), (150, 60, 120)]

items = json.load(open("letters.json", encoding="utf-8"))["items"]

rows = (len(items) + COLS - 1) // COLS
img = Image.new("RGB", (COLS * CELL, rows * CELL), "white")
draw = ImageDraw.Draw(img)

for i, item in enumerate(items):
    ox = (i % COLS) * CELL
    oy = (i // COLS) * CELL
    draw.rectangle([ox, oy, ox + CELL - 1, oy + CELL - 1], outline=(225, 225, 225))
    draw.text((ox + 5, oy + 3), item["glyph"], fill=(170, 170, 170))

    inner = CELL - 2 * PAD
    for n, s in enumerate(item["strokes"]):
        pts = [(ox + PAD + p["x"] * inner, oy + PAD + p["y"] * inner) for p in s]
        if len(pts) < 2:
            continue
        draw.line(pts, fill=SHADES[n % len(SHADES)], width=7, joint="curve")

img.save("letters.png")
print("wrote letters.png", img.size)
