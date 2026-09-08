"""Emits the universal tracing paths as a TypeScript module for the API.

The path for an "a" is the same "a" in every activity, every book and every
school, so nobody should be drawing one by hand in the portal. The API fills it
in from the glyph; this is where that table comes from.

    python emit_glyphs.ts.py

Rewrites apps/api/src/content/glyphStrokes.ts. Regenerate it rather than editing
it — and look at letters.png and numerals.png first, because a shape that is
wrong here is wrong for every child.
"""

import json
import os

import letters
import numerals

OUT = os.path.join(
    os.path.dirname(__file__), "..", "..", "apps", "api", "src", "content", "glyphStrokes.ts"
)

paths = {}
for item in numerals.build():
    paths[item["glyph"]] = item["strokes"]
for item in letters.build():
    paths[item["glyph"]] = item["strokes"]

body = []
for glyph, strokes in paths.items():
    runs = ",".join(
        "[" + ",".join("[%s,%s]" % (p["x"], p["y"]) for p in run) + "]" for run in strokes
    )
    body.append("  %s: [%s]," % (json.dumps(glyph), runs))

ts = '''/**
 * The path a child traces for each letter and number.
 *
 * Generated — do not edit. `scripts/content/emit_glyphs.ts.py` writes this file
 * from the same definitions that render the sheets in that directory. Look at
 * those pictures before regenerating: a shape that is wrong here is wrong for
 * every child in every school.
 *
 * Universal on purpose. An "a" is the same "a" in every activity, every book
 * and every school, so an author writing a tracing question chooses the letter
 * and nothing else — there is no path to draw, and so no path to draw wrongly.
 * The shapes were straight-line skeletons before this: a B was a stem and two
 * diagonals, with no bumps anywhere.
 *
 * Coordinates are normalised 0-1 as [x, y] pairs, so one definition renders at
 * any size, and each run is one stroke in the order it should be written.
 */

/** One stroke: a run of [x, y] points, normalised to a 0-1 box. */
export type GlyphStroke = ReadonlyArray<readonly [number, number]>;

export const GLYPH_STROKES: Readonly<Record<string, ReadonlyArray<GlyphStroke>>> = {
%s
};

/**
 * The path for a glyph, or null when we have no shape for it.
 *
 * Null is a real answer: a school writing a Hindi or Gujarati letter is not a
 * mistake, and those keep whatever path was drawn for them by hand.
 */
export function strokesForGlyph(
  glyph: string | null | undefined,
): Array<Array<{ x: number; y: number }>> | null {
  if (!glyph) return null;

  const found = GLYPH_STROKES[glyph.trim()];
  if (!found) return null;

  return found.map((run) => run.map(([x, y]) => ({ x, y })));
}
''' % "\n".join(body)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(ts)

print("glyphs:", len(paths))
print("bytes:", len(ts))
print("wrote", os.path.normpath(OUT))
