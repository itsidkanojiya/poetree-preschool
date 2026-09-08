"""Shared helpers for drawing tracing guides.

A guide is a list of strokes, each a polyline of normalised 0-1 points, in the
order a child is taught to make them. The app draws straight segments between
points, so curves are sampled densely enough to read as curves.

Screen coordinates: y grows downward. On an arc, 0 deg is the right of the
shape, 90 deg the bottom, 180 deg the left, 270 deg the top.
"""

import math

STEP = 6.0  # degrees between points on an arc


def arc(cx, cy, rx, ry, a0, a1):
    """Points along an ellipse from a0 to a1 degrees, either direction."""
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
    """Concatenate runs, dropping duplicated joint points."""
    out = []
    for part in parts:
        if (
            out
            and abs(out[-1][0] - part[0][0]) < 1e-9
            and abs(out[-1][1] - part[0][1]) < 1e-9
        ):
            out.extend(part[1:])
        else:
            out.extend(part)
    return out


def stroke(points):
    return [{"x": round(x, 4), "y": round(y, 4)} for x, y in points]
