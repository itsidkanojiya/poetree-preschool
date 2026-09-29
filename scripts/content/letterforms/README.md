# The school's handwriting

`source.pdf` is the school's own sheet of dotted letters: A–Z, a–z and 0–9, the
Hindi and Gujarati alphabets and numerals, and the pre-writing patterns. Every
letter a child is shown or asked to trace follows it.

```
pip install pymupdf pillow
python build.py            # then, from ..:
python emit_glyphs.ts.py
```

`build.py` writes:

- **`apps/mobile/assets/letterforms/letterforms.json`** — every character's
  shape as the sheet draws it. The app draws letters and numbers with these
  wherever they appear (questions, answer tiles, games, tracing), falling back
  to the typeface only for things not on the sheet, like an emoji.
- **`strokes.json`** — tracing paths for the Hindi and Gujarati characters and
  the patterns, which `../emit_glyphs.ts.py` adds to the API's table. English
  letters and 0–9 keep their hand-built paths in `../letters.py` and
  `../numerals.py`, drawn to match this sheet (the school's G, t, y, 1, 4 and 9
  differ from a typeface's).
- **`review_hindi.png`, `review_gujarati.png`, `review_patterns.png`** — every
  path with its strokes numbered and arrowed.

## Stroke order

The PDF draws each letter as loose dots and keeps no order worth using, so the
paths are rebuilt from the dots' positions. The patterns are simple enough to
order (left to right, top to bottom, each line in its natural direction).

The Hindi and Gujarati letters are **traced in free order** — any part first,
either way round — because their writing order has not been checked by a
teacher. The shapes are right; the order in the review sheets is a guess. To
teach one in order, check it on the review sheet, correct it if needed, and
take it out of the `free` list.

## Patterns

A tracing question asks for a pattern by its key, which the web portal offers
in the glyph box:

| Key | Pattern |
| --- | --- |
| `pattern-standing` | Standing lines |
| `pattern-sleeping` | Sleeping lines |
| `pattern-slant-r` | Slanting line / |
| `pattern-slant-l` | Slanting line \ |
| `pattern-curve`, `pattern-curve-s` | Big and small curve |
| `pattern-arch`, `pattern-arch-s` | Big and small bridge |
| `pattern-cup`, `pattern-cup-s` | Big and small cup |
| `pattern-zigzag`, `pattern-zigzag-s` | Big and small zigzag |
