"""Tracing guides for A-Z and a-z, in the stroke order a child is taught.

The shipped letters were straight-line skeletons: a B was a stem and two
diagonals, with no bumps anywhere, so it drew on screen as something closer to a
K. Children copy what they are shown.

Strokes are separate where a child lifts the pencil, and each stroke runs in the
direction it should be written — top to bottom, left to right — because the app
checks every stroke was covered, and because the order is half of what is being
taught.
"""

import json

from strokes_lib import arc, curve, join, line, stroke

# The box every letter is drawn in.
T, B = 0.13, 0.87          # top and bottom
L, R = 0.24, 0.76          # left and right
MID = (T + B) / 2
CX = (L + R) / 2


def upper():
    """A-Z, uppercase print."""
    out = {}

    out["A"] = [
        line((CX, T), (L - 0.02, B), 14),
        line((CX, T), (R + 0.02, B), 14),
        line((L + 0.06, MID + 0.13), (R - 0.06, MID + 0.13), 8),
    ]
    out["B"] = [
        line((L, T), (L, B), 16),
        # Two bumps, each starting and ending on the stem.
        join(line((L, T), (CX, T), 4), arc(CX, (T + MID) / 2, 0.2, (MID - T) / 2, 270, 450), line((CX, MID), (L, MID), 4)),
        join(line((L, MID), (CX, MID), 4), arc(CX, (MID + B) / 2, 0.22, (B - MID) / 2, 270, 450), line((CX, B), (L, B), 4)),
    ]
    out["C"] = [arc(CX, MID, (R - L) / 2, (B - T) / 2, 310, 50)]
    out["D"] = [
        line((L, T), (L, B), 16),
        join(line((L, T), (CX - 0.04, T), 3), arc(CX - 0.04, MID, 0.24, (B - T) / 2, 270, 450), line((CX - 0.04, B), (L, B), 3)),
    ]
    out["E"] = [
        line((L, T), (L, B), 16),
        line((L, T), (R, T), 10),
        line((L, MID), (R - 0.06, MID), 8),
        line((L, B), (R, B), 10),
    ]
    out["F"] = [
        line((L, T), (L, B), 16),
        line((L, T), (R, T), 10),
        line((L, MID), (R - 0.06, MID), 8),
    ]
    # The arc stops on the right, then one shelf goes back in. Two lines from
    # the same point made a path that doubled back on itself.
    out["G"] = [
        arc(CX, MID, (R - L) / 2, (B - T) / 2, 310, 20),
        line((CX + (R - L) / 2 * 0.94, MID + (B - T) / 2 * 0.34), (CX, MID + (B - T) / 2 * 0.34), 6),
    ]
    out["H"] = [
        line((L, T), (L, B), 16),
        line((R, T), (R, B), 16),
        line((L, MID), (R, MID), 10),
    ]
    out["I"] = [
        line((L + 0.06, T), (R - 0.06, T), 8),
        line((CX, T), (CX, B), 16),
        line((L + 0.06, B), (R - 0.06, B), 8),
    ]
    out["J"] = [
        line((L + 0.08, T), (R, T), 8),
        join(line((CX + 0.12, T), (CX + 0.12, B - 0.1), 12), arc(CX - 0.02, B - 0.1, 0.14, 0.1, 0, 160)),
    ]
    out["K"] = [
        line((L, T), (L, B), 16),
        line((R, T), (L + 0.02, MID + 0.02), 12),
        line((L + 0.02, MID + 0.02), (R, B), 12),
    ]
    out["L"] = [line((L, T), (L, B), 16), line((L, B), (R, B), 10)]
    out["M"] = [
        line((L, B), (L, T), 14),
        line((L, T), (CX, MID + 0.08), 10),
        line((CX, MID + 0.08), (R, T), 10),
        line((R, T), (R, B), 14),
    ]
    out["N"] = [
        line((L, B), (L, T), 14),
        line((L, T), (R, B), 14),
        line((R, B), (R, T), 14),
    ]
    out["O"] = [arc(CX, MID, (R - L) / 2, (B - T) / 2, 270, 630)]
    out["P"] = [
        line((L, T), (L, B), 16),
        join(line((L, T), (CX, T), 4), arc(CX, (T + MID) / 2, 0.21, (MID - T) / 2, 270, 450), line((CX, MID), (L, MID), 4)),
    ]
    out["Q"] = [
        arc(CX, MID, (R - L) / 2, (B - T) / 2, 270, 630),
        line((CX + 0.06, MID + 0.16), (R + 0.02, B), 6),
    ]
    out["R"] = [
        line((L, T), (L, B), 16),
        join(line((L, T), (CX, T), 4), arc(CX, (T + MID) / 2, 0.21, (MID - T) / 2, 270, 450), line((CX, MID), (L, MID), 4)),
        line((L + 0.04, MID), (R, B), 12),
    ]
    out["S"] = [
        join(
            curve((R - 0.02, T + 0.08), (CX + 0.02, T - 0.03), (L + 0.01, T + 0.12)),
            curve((L + 0.01, T + 0.12), (L - 0.02, MID - 0.04), (CX, MID)),
            curve((CX, MID), (R + 0.02, MID + 0.05), (R - 0.01, B - 0.13)),
            curve((R - 0.01, B - 0.13), (CX - 0.02, B + 0.03), (L, B - 0.09)),
        )
    ]
    out["T"] = [line((L - 0.02, T), (R + 0.02, T), 10), line((CX, T), (CX, B), 16)]
    # 180 to 0, not 180 to 360: with y downward, increasing past 270 goes over
    # the top, which drew every U as an arch.
    out["U"] = [
        join(
            line((L, T), (L, MID + 0.12), 10),
            arc(CX, MID + 0.12, (R - L) / 2, B - (MID + 0.12), 180, 0),
            line((R, MID + 0.12), (R, T), 10),
        )
    ]
    out["V"] = [line((L - 0.02, T), (CX, B), 14), line((CX, B), (R + 0.02, T), 14)]
    out["W"] = [
        line((L - 0.04, T), (L + 0.08, B), 12),
        line((L + 0.08, B), (CX, MID + 0.06), 10),
        line((CX, MID + 0.06), (R - 0.08, B), 10),
        line((R - 0.08, B), (R + 0.04, T), 12),
    ]
    out["X"] = [line((L, T), (R, B), 14), line((R, T), (L, B), 14)]
    out["Y"] = [
        line((L, T), (CX, MID + 0.04), 10),
        line((R, T), (CX, MID + 0.04), 10),
        line((CX, MID + 0.04), (CX, B), 10),
    ]
    out["Z"] = [
        line((L, T), (R, T), 10),
        line((R, T), (L, B), 14),
        line((L, B), (R, B), 10),
    ]
    return out


def lower():
    """a-z, lowercase print.

    Its own metrics rather than the capitals' box. Lowercase has four lines, not
    two: ascenders reach higher than x-height and descenders drop below the
    baseline. Squeezed into the capitals' box the baseline sat at the very
    bottom edge, so a g had nowhere to put its tail and curled it into itself.
    """
    AT = 0.10                  # top of an ascender: b d f h k l t
    XT = 0.42                  # top of a small letter
    BL = 0.78                  # the line it all sits on
    DB = 0.95                  # bottom of a descender: g j p q y

    out = {}
    r = (R - L) / 2
    ry = (BL - XT) / 2
    cy = (XT + BL) / 2

    def bowl():
        return arc(CX, cy, r, ry, 270, 630)

    out["a"] = [bowl(), line((R, XT), (R, BL), 8)]
    out["b"] = [line((L, AT), (L, BL), 16), arc(CX + 0.02, cy, r - 0.02, ry, 180, 540)]
    out["c"] = [arc(CX, cy, r, ry, 310, 50)]
    out["d"] = [arc(CX - 0.02, cy, r - 0.02, ry, 0, 360), line((R, AT), (R, BL), 16)]
    out["e"] = [
        join(line((L, cy), (R, cy), 6), arc(CX, cy, r, ry, 0, -260)),
    ]
    out["f"] = [
        join(
            arc(CX + 0.02, AT + 0.09, 0.12, 0.09, 0, -180),
            line((CX - 0.10, AT + 0.09), (CX - 0.10, BL), 12),
        ),
        line((CX - 0.22, XT), (CX + 0.04, XT), 6),
    ]
    # The tail leaves the stem and swings left below the line, with room to do
    # it. This is the letter the metrics above were fixed for.
    out["g"] = [
        bowl(),
        join(
            line((R, XT), (R, BL + 0.05), 8),
            curve((R, BL + 0.05), (R, DB), (CX - 0.04, DB - 0.01)),
        ),
    ]
    out["h"] = [
        line((L, AT), (L, BL), 16),
        join(arc(CX, cy, r, ry, 180, 360), line((R, cy), (R, BL), 6)),
    ]
    out["i"] = [line((CX, XT), (CX, BL), 10), line((CX, XT - 0.12), (CX, XT - 0.10), 2)]
    out["j"] = [
        join(
            line((CX + 0.06, XT), (CX + 0.06, BL + 0.05), 10),
            curve((CX + 0.06, BL + 0.05), (CX + 0.06, DB), (CX - 0.10, DB - 0.01)),
        ),
        line((CX + 0.06, XT - 0.12), (CX + 0.06, XT - 0.10), 2),
    ]
    out["k"] = [
        line((L, AT), (L, BL), 16),
        line((R, XT), (L + 0.02, cy + 0.04), 8),
        line((L + 0.02, cy + 0.04), (R, BL), 8),
    ]
    out["l"] = [line((CX, AT), (CX, BL), 16)]
    out["m"] = [
        line((L, XT), (L, BL), 8),
        join(arc(L + 0.13, cy, 0.13, ry, 180, 360), line((L + 0.26, cy), (L + 0.26, BL), 5)),
        join(arc(R - 0.13, cy, 0.13, ry, 180, 360), line((R, cy), (R, BL), 5)),
    ]
    out["n"] = [
        line((L, XT), (L, BL), 8),
        join(arc(CX, cy, r, ry, 180, 360), line((R, cy), (R, BL), 6)),
    ]
    out["o"] = [bowl()]
    out["p"] = [line((L, XT), (L, DB), 12), arc(CX + 0.02, cy, r - 0.02, ry, 180, 540)]
    out["q"] = [bowl(), line((R, XT), (R, DB), 12)]
    out["r"] = [line((L, XT), (L, BL), 8), arc(CX, cy, r, ry, 200, 330)]
    out["s"] = [
        join(
            curve((R - 0.02, XT + 0.04), (CX + 0.02, XT - 0.02), (L + 0.02, XT + 0.07)),
            curve((L + 0.02, XT + 0.07), (L, cy - 0.02), (CX, cy)),
            curve((CX, cy), (R, cy + 0.03), (R - 0.02, BL - 0.07)),
            curve((R - 0.02, BL - 0.07), (CX - 0.02, BL + 0.02), (L, BL - 0.05)),
        )
    ]
    out["t"] = [line((CX, AT + 0.06), (CX, BL), 14), line((CX - 0.12, XT), (CX + 0.12, XT), 6)]
    out["u"] = [
        join(
            line((L, XT), (L, cy + 0.02), 5),
            arc(CX, cy + 0.02, r, BL - (cy + 0.02), 180, 0),
            line((R, cy + 0.02), (R, XT), 5),
        ),
        line((R, XT), (R, BL), 6),
    ]
    out["v"] = [line((L, XT), (CX, BL), 8), line((CX, BL), (R, XT), 8)]
    out["w"] = [
        line((L, XT), (L + 0.09, BL), 7),
        line((L + 0.09, BL), (CX, cy + 0.04), 6),
        line((CX, cy + 0.04), (R - 0.09, BL), 6),
        line((R - 0.09, BL), (R, XT), 7),
    ]
    out["x"] = [line((L, XT), (R, BL), 8), line((R, XT), (L, BL), 8)]
    out["y"] = [
        line((L, XT), (CX + 0.04, BL), 8),
        join(
            line((R, XT), (CX - 0.02, DB - 0.06), 10),
            curve((CX - 0.02, DB - 0.06), (CX - 0.08, DB), (L + 0.02, DB - 0.02)),
        ),
    ]
    out["z"] = [
        line((L, XT), (R, XT), 6),
        line((R, XT), (L, BL), 8),
        line((L, BL), (R, BL), 6),
    ]
    return out


# How each letter is written, for the sentence read aloud.
SAY = {
    "A": "Two slides down, then a line across the middle.",
    "B": "Straight down, then two bumps.",
    "C": "One big curve, like an open mouth.",
    "D": "Straight down, then a big round tummy.",
    "E": "Straight down, then three lines across.",
    "F": "Straight down, then two lines across.",
    "G": "A big curve, then a little shelf inside.",
    "H": "Down, down, then a line across the middle.",
    "I": "A line on top, straight down, a line underneath.",
    "J": "A line on top, down, then a little hook.",
    "K": "Straight down, then in and out again.",
    "L": "Straight down, then a line along the bottom.",
    "M": "Down, up, down, and up again.",
    "N": "Down, a slide across, then up.",
    "O": "All the way round.",
    "P": "Straight down, then one bump at the top.",
    "Q": "All the way round, then a little tail.",
    "R": "Straight down, one bump, then a leg.",
    "S": "A curve one way, then a curve back.",
    "T": "A line on top, then straight down the middle.",
    "U": "Down, around the bottom, and back up.",
    "V": "Down and up again.",
    "W": "Down, up, down, and up.",
    "X": "One slide down, then the other way.",
    "Y": "Two slides in, then straight down.",
    "Z": "Across, slide down, and across again.",
}


def build():
    items = []
    for glyph, strokes in upper().items():
        items.append(
            {
                "glyph": glyph,
                "say": "Trace the letter %s. %s" % (glyph, SAY[glyph]),
                "strokes": [stroke(s) for s in strokes],
            }
        )
    for glyph, strokes in lower().items():
        items.append(
            {
                "glyph": glyph,
                "say": "Trace the small letter %s. %s" % (glyph, SAY[glyph.upper()]),
                "strokes": [stroke(s) for s in strokes],
            }
        )
    return items


if __name__ == "__main__":
    items = build()
    with open("letters.json", "w", encoding="utf-8") as f:
        json.dump({"items": items}, f, separators=(",", ":"))
    print("letters:", len(items))
    for it in items[:3]:
        print(" ", it["glyph"], len(it["strokes"]), "strokes")
