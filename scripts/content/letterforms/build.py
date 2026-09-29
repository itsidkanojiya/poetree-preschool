"""Letterforms and tracing paths from the school's handwriting sheet.

    pip install pymupdf pillow
    python build.py

Reads source.pdf — the school's own sheet of dotted letters: A-Z, a-z and 0-9,
the Hindi and Gujarati alphabets and numerals, and pre-writing patterns — and
writes:

  apps/mobile/assets/letterforms/letterforms.json
      Every character's shape, as the sheet draws it, for the app to show
      letters in the school's handwriting wherever a letter appears: tracing,
      questions, games.

  strokes.json (beside this file)
      Tracing paths for the Hindi and Gujarati letters and numerals and the
      patterns, which emit_glyphs.ts.py adds to the API's table. English
      letters and 0-9 keep their hand-built paths in ../letters.py and
      ../numerals.py, which follow this sheet's shapes.

  review_hindi.png, review_gujarati.png, review_patterns.png
      Every path drawn with its strokes numbered and arrowed. Look at them.

The sheet keeps no stroke order: its dots come out of the PDF interleaved. The
paths are rebuilt from the dots' positions, so the Hindi and Gujarati ones are
traced in free order (any part, either way round) until a teacher has checked
their order on the review sheets; the patterns are simple enough to order.
"""
import json
import math
import os

import pymupdf
from PIL import Image, ImageDraw, ImageFont

import geometry as g

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
PDF = os.path.join(HERE, 'source.pdf')
APP_ASSET = os.path.join(ROOT, 'apps', 'mobile', 'assets', 'letterforms', 'letterforms.json')

LATIN = [chr(c) for c in range(ord('A'), ord('Z') + 1)] + \
    [chr(c) for c in range(ord('a'), ord('z') + 1)] + [str(d) for d in range(10)]

HINDI = list('अआइईउऊऋएऐओऔ') + ['अं', 'अः'] + list('कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह') + \
    ['क्ष', 'त्र', 'ज्ञ', 'श्र', 'ड़', 'ढ़'] + list('१२३४५६७८९') + ['१०']

GUJARATI = list('અઆઇઈઉઊઋએઐઓઔ') + ['અં', 'અઃ'] + list('કખગઘચછજઝટઠડઢણતથદધનપફબભમયરલવશષસહળ') + \
    ['ક્ષ', 'જ્ઞ'] + list('૧૨૩૪૫૬૭૮૯') + ['૧૦']

# Keys, not letters: a tracing question names one of these as its glyph.
PATTERNS = [
    ('pattern-standing', 'Standing lines'),
    ('pattern-sleeping', 'Sleeping lines'),
    ('pattern-slant-r', 'Slanting line /'),
    ('pattern-slant-l', 'Slanting line \\'),
    ('pattern-curve', 'Big curve'),
    ('pattern-curve-s', 'Small curve'),
    ('pattern-arch', 'Big bridge'),
    ('pattern-arch-s', 'Small bridge'),
    ('pattern-cup', 'Big cup'),
    ('pattern-cup-s', 'Small cup'),
    ('pattern-zigzag', 'Big zigzag'),
    ('pattern-zigzag-s', 'Small zigzag'),
]

# page, gap between a character's pieces, pieces the reading order split off
# (source index -> index it belongs with), labels
PAGES = [
    (0, 20, [], LATIN, 'latin'),
    (1, 30, [(12, 11), (19, 13)], HINDI, 'devanagari'),
    (2, 30, [], GUJARATI, 'gujarati'),
    (3, 12, [(0, 3), (2, 1)], [k for k, _ in PATTERNS], 'pattern'),
]


def page_dots(doc, number):
    page = doc[number]
    width, height = page.rect.width, page.rect.height
    dots = []
    for d in page.get_drawings():
        r = d['rect']
        # stroke dots are filled-and-outlined; the dots of an i and a j are
        # plain filled circles, a little larger
        if d['type'] in ('fs', 'f') and len(d['items']) == 4 and r.width < 3:
            x, y = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
            # the sheet carries drawings off the edge of the page; only what a
            # printed copy shows counts
            if 0 <= x <= width and 0 <= y <= height:
                dots.append((x, y))
    return dots


def characters(doc, number, gap, merges):
    chars = g.characters(page_dots(doc, number), gap)
    for src, dst in merges:
        chars[dst]['dots'] = chars[dst]['dots'] + chars[src]['dots']
    drop = {src for src, _ in merges}
    return [c for k, c in enumerate(chars) if k not in drop]


def smooth(line, step):
    """A round curve through the sheet's dots, sampled every [step]."""
    if len(line) < 3:
        return line
    closed = g.dist(line[0], line[-1]) < 1e-6
    pts = line[:-1] if closed else line
    n = len(pts)
    out = []
    for i in range(n if closed else n - 1):
        p0 = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        p1, p2 = pts[i % n], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed else pts[min(i + 2, n - 1)]
        k = max(1, int(math.ceil(g.dist(p1, p2) / step)))
        for t_i in range(k):
            t = t_i / k
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t
                       + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
                       + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)
                for c in (0, 1)))
    out.append(pts[0] if closed else pts[-1])
    return out


def zigzag(dots):
    """A zigzag is one line, left to right, and x alone orders it.

    The sheet's zigzags run nine peaks wide; fitted into the tracing box at
    that width they would be a sliver. Three peaks is the exercise."""
    points = g.dedupe(sorted(dots), g.spacing(list(dots)))
    x0, _, x1, _ = g.bbox(points)
    keep = [p for p in sorted(points) if p[0] <= x0 + (x1 - x0) * 0.35]
    return [keep], g.spacing(keep)


def to_box(lines):
    """Into the 0-1 box the tracing screen draws in: the longer side spans
    0.13-0.87, centred, like every other path in the table."""
    x0, y0, x1, y1 = g.bbox([p for l in lines for p in l])
    size = max(x1 - x0, y1 - y0, 1e-6)
    scale = 0.74 / size
    ox = 0.5 - (x1 - x0) * scale / 2
    oy = 0.5 - (y1 - y0) * scale / 2
    out = []
    for line in lines:
        pts = [(round(ox + (p[0] - x0) * scale, 4), round(oy + (p[1] - y0) * scale, 4)) for p in line]
        if len(pts) == 1:
            # a dot to tap: a stroke too short to do anything but touch
            x, y = pts[0]
            pts = [(x, round(y - 0.01, 4)), (x, round(y + 0.01, 4))]
        out.append([list(p) for p in pts])
    return out


def main():
    doc = pymupdf.open(PDF)
    letterforms = {'scripts': {}, 'glyphs': {}}
    paths = {'free': [], 'strokes': {}}

    for number, gap, merges, labels, script in PAGES:
        chars = characters(doc, number, gap, merges)
        assert len(chars) == len(labels), (script, len(chars), len(labels))

        heights = sorted(g.bbox(c['dots'])[3] - g.bbox(c['dots'])[1] for c in chars)
        unit = heights[len(heights) // 2]

        ascent = descent = 0.0
        for label, char in zip(labels, chars):
            x0, y0, x1, y1 = g.bbox(char['dots'])
            base = char['baseline']
            dots = []
            for x, y in char['dots']:
                dots += [round((x - x0) / unit, 3), round((y - base) / unit, 3)]
            ascent = max(ascent, (base - y0) / unit)
            descent = max(descent, (y1 - base) / unit)
            letterforms['glyphs'][label] = {
                's': script,
                'w': round((x1 - x0) / unit, 3),
                'd': dots,
            }

            if script == 'latin':
                continue
            is_pattern = script == 'pattern'
            if label.startswith('pattern-zigzag'):
                lines, s = zigzag(char['dots'])
            else:
                lines, s = g.strokes(char['dots'], corner=None if is_pattern else 62)
                lines = [g.orient(l, unit) for l in lines]
                if is_pattern:
                    # a pattern is practised left to right, top to bottom
                    lines.sort(key=lambda l: (round(min(p[0] for p in l)), min(p[1] for p in l)))
                else:
                    lines = g.order(lines, unit, has_header=script == 'devanagari')
                lines = [smooth(l, s / 3) for l in lines]
            paths['strokes'][label] = to_box(lines)
            if not is_pattern:
                paths['free'].append(label)

        letterforms['scripts'][script] = {
            'ascent': round(ascent, 3),
            'descent': round(descent, 3),
        }

    letterforms['patterns'] = {key: name for key, name in PATTERNS}

    os.makedirs(os.path.dirname(APP_ASSET), exist_ok=True)
    with open(APP_ASSET, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(letterforms, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(HERE, 'strokes.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(paths, f, ensure_ascii=False, separators=(',', ':'))

    for name, labels in [('hindi', HINDI), ('gujarati', GUJARATI),
                         ('patterns', [k for k, _ in PATTERNS])]:
        review(name, labels, paths['strokes'])

    print('letterforms:', len(letterforms['glyphs']), '->', os.path.relpath(APP_ASSET, ROOT))
    print('paths:', len(paths['strokes']), '(free order:', len(paths['free']), ')')


SHADES = ['#d7263d', '#1b998b', '#2e86de', '#f46036', '#8e44ad', '#16a085',
          '#c0392b', '#2c3e50', '#d35400', '#7f8c8d', '#27ae60', '#e84393']


def review(name, labels, strokes):
    """The paths as the app draws them: each stroke numbered at its start,
    with an arrow the way it goes."""
    cols, cell, pad = 8, 170, 18
    rows = math.ceil(len(labels) / cols)
    img = Image.new('RGB', (cols * cell, rows * cell), 'white')
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('Nirmala.ttc', 22)
    except OSError:
        font = ImageFont.load_default()
    for n, label in enumerate(labels):
        ox, oy = (n % cols) * cell, (n // cols) * cell
        draw.rectangle([ox, oy, ox + cell - 1, oy + cell - 1], outline='#dddddd')
        draw.text((ox + 6, oy + 2), label, fill='#999999', font=font)
        inner = cell - 2 * pad
        for k, line in enumerate(strokes[label]):
            colour = SHADES[k % len(SHADES)]
            pts = [(ox + pad + x * inner, oy + pad + y * inner) for x, y in line]
            draw.line(pts, fill=colour, width=5, joint='curve')
            sx, sy = pts[0]
            draw.ellipse([sx - 9, sy - 9, sx + 9, sy + 9], fill=colour)
            draw.text((sx - 4, sy - 7), str(k + 1), fill='white')
            if len(pts) > 3:
                mid = len(pts) // 2
                (ax, ay), (bx, by) = pts[mid - 1], pts[mid + 1]
                ang = math.atan2(by - ay, bx - ax)
                tip = pts[mid]
                for side in (2.5, -2.5):
                    draw.line([tip, (tip[0] - 11 * math.cos(ang + side * 0.25 * 1.6),
                                     tip[1] - 11 * math.sin(ang + side * 0.25 * 1.6))],
                              fill=colour, width=3)
    img.save(os.path.join(HERE, 'review_%s.png' % name))


if __name__ == '__main__':
    main()
