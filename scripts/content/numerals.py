"""Proper preschool numerals 1-10 as normalised stroke polylines.

The stored shapes were straight-line skeletons: a two was a diagonal and a bar,
so it drew as a Z, and a three was three zigzags. Children copy what they are
shown, so the guide has to be the numeral as it is actually written.

Everything is expressed in a 0-1 box and sampled densely enough that the
painter's straight segments read as curves.
"""

import json
import math

STEP = 6.0  # degrees between points on an arc


def arc(cx, cy, rx, ry, a0, a1):
    """Points along an ellipse from a0 to a1 degrees.

    Screen coordinates, so y grows downward: 180 deg is the left of the shape,
    270 deg the top, 0/360 the right, 90 deg the bottom.
    """
    out = []
    steps = max(2, int(abs(a1 - a0) / STEP))
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        out.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    return out


def line(p0, p1, n=10):
    """A straight run, sampled so no segment is long enough to shortcut."""
    return [
        (p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n)
        for i in range(n + 1)
    ]


def curve(p0, c, p1, n=16):
    """A quadratic bend from p0 to p1 pulled toward c."""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(
            (
                u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
                u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
            )
        )
    return out


def join(*parts):
    """Concatenate runs, dropping the duplicated joint points."""
    out = []
    for part in parts:
        if out and abs(out[-1][0] - part[0][0]) < 1e-9 and abs(out[-1][1] - part[0][1]) < 1e-9:
            out.extend(part[1:])
        else:
            out.extend(part)
    return out


def stroke(points):
    return [{"x": round(x, 4), "y": round(y, 4)} for x, y in points]


# --- the numerals ------------------------------------------------------------

def one():
    # The flag, then straight down. One stroke, as it is taught.
    return [stroke(join(line((0.37, 0.25), (0.5, 0.12), 6), line((0.5, 0.12), (0.5, 0.88), 20)))]


def two():
    # Around the top, down the diagonal, then across the foot.
    top = arc(0.5, 0.31, 0.19, 0.17, 172, 368)
    down = curve(top[-1], (0.62, 0.55), (0.30, 0.84))
    foot = line((0.30, 0.84), (0.74, 0.84), 12)
    return [stroke(join(top, down, foot))]


def three():
    # Two bumps, both opening to the left.
    upper = arc(0.47, 0.30, 0.18, 0.17, 175, 430)
    lower = arc(0.47, 0.63, 0.19, 0.19, 290, 545)
    return [stroke(join(upper, lower))]


def four():
    # Down the slope and across, then the stem beside it.
    slope = join(line((0.63, 0.12), (0.26, 0.62), 14), line((0.26, 0.62), (0.80, 0.62), 14))
    stem = line((0.63, 0.12), (0.63, 0.9), 20)
    return [stroke(slope), stroke(stem)]


def five():
    # Down the back, round the belly, then the hat across the top.
    back = line((0.34, 0.14), (0.33, 0.47), 10)
    belly = arc(0.52, 0.65, 0.21, 0.20, 268, 520)
    hat = line((0.34, 0.14), (0.71, 0.14), 10)
    return [stroke(join(back, belly)), stroke(hat)]


def six():
    # A long curve down into a closed loop.
    tail = curve((0.66, 0.15), (0.36, 0.28), (0.31, 0.60))
    loop = arc(0.50, 0.68, 0.19, 0.20, 180, 545)
    return [stroke(join(tail, loop))]


def seven():
    # Across the top, then a long slope down.
    return [stroke(join(line((0.30, 0.15), (0.73, 0.15), 12), line((0.73, 0.15), (0.42, 0.88), 18)))]


def eight():
    # Small loop above, larger below.
    upper = arc(0.50, 0.31, 0.16, 0.17, 90, 450)
    lower = arc(0.50, 0.67, 0.19, 0.20, 270, 630)
    return [stroke(join(upper, lower))]


def nine():
    # A loop at the top, then straight down the side.
    loop = arc(0.50, 0.32, 0.18, 0.18, 0, 360)
    stem = curve((0.68, 0.32), (0.68, 0.68), (0.55, 0.88))
    return [stroke(join(loop, stem))]


def ten():
    # A one and an oh, side by side — two separate strokes, as it is written.
    stem = join(line((0.14, 0.24), (0.24, 0.14), 5), line((0.24, 0.14), (0.24, 0.86), 18))
    oh = arc(0.62, 0.50, 0.17, 0.36, 0, 360)
    return [stroke(stem), stroke(oh)]


ITEMS = [
    ("1", "Trace the number one. Start at the flag, then straight down.", one()),
    ("2", "Trace the number two. Around the top, down, and across the bottom.", two()),
    ("3", "Trace the number three. Two bumps, one under the other.", three()),
    ("4", "Trace the number four. Down and across, then a line beside it.", four()),
    ("5", "Trace the number five. Down the back, round the tummy, then the hat.", five()),
    ("6", "Trace the number six. A big curve down, then loop around.", six()),
    ("7", "Trace the number seven. Across the top, then slide down.", seven()),
    ("8", "Trace the number eight. A small loop, then a bigger one.", eight()),
    ("9", "Trace the number nine. A loop at the top, then down the side.", nine()),
    ("10", "Trace the number ten. A one, then a round oh.", ten()),
]

content = {
    "kind": "TRACING",
    "items": [{"say": say, "glyph": glyph, "strokes": strokes} for glyph, say, strokes in ITEMS],
}

out = json.dumps(content, separators=(",", ":"))
with open("numerals.json", "w", encoding="utf-8") as f:
    f.write(out)

print("items:", len(content["items"]))
for glyph, _, strokes in ITEMS:
    print(f"  {glyph}: {len(strokes)} stroke(s), {sum(len(s) for s in strokes)} points")
print("bytes:", len(out))
