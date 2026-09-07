"""Draw the generated numerals the way the app's painter does, so they can be
looked at before they reach a child."""

import json
from PIL import Image, ImageDraw

CELL = 200
COLS = 5
PAD = 10

content = json.load(open("numerals.json", encoding="utf-8"))
items = content["items"]

rows = (len(items) + COLS - 1) // COLS
img = Image.new("RGB", (COLS * CELL, rows * CELL), "white")
draw = ImageDraw.Draw(img)

for i, item in enumerate(items):
    ox = (i % COLS) * CELL
    oy = (i // COLS) * CELL
    draw.rectangle([ox, oy, ox + CELL - 1, oy + CELL - 1], outline=(220, 220, 220))
    draw.text((ox + 6, oy + 4), item["glyph"], fill=(150, 150, 150))

    inner = CELL - 2 * PAD
    for stroke in item["strokes"]:
        pts = [
            (ox + PAD + p["x"] * inner, oy + PAD + p["y"] * inner) for p in stroke
        ]
        # Same weight as the guide in the app, scaled to this cell.
        draw.line(pts, fill=(45, 50, 65), width=9, joint="curve")

img.save("numerals.png")
print("wrote numerals.png", img.size)
