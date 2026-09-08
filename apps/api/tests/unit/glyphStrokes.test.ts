import { describe, expect, it } from 'vitest';
import { GLYPH_STROKES, strokesForGlyph } from '../../src/content/glyphStrokes.js';

/**
 * The built-in tracing paths.
 *
 * These are generated, so this does not check the artwork — a picture is the
 * only way to tell a six from a lazy circle, and `scripts/content` renders one.
 * What it checks is everything a generator can get wrong without anybody
 * noticing on a small screen.
 */
describe('the paths a child traces', () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  it('has every letter, in both cases, and every number', () => {
    for (const glyph of letters) {
      expect(strokesForGlyph(glyph), `capital ${glyph}`).not.toBeNull();
      expect(strokesForGlyph(glyph.toLowerCase()), `small ${glyph}`).not.toBeNull();
    }
    for (const glyph of numbers) {
      expect(strokesForGlyph(glyph), `number ${glyph}`).not.toBeNull();
    }
  });

  it('keeps every point inside the box it is drawn in', () => {
    // The box is the whole sheet a child sees. A point outside it is a stroke
    // running off the edge — which is what a g's tail did when lowercase was
    // squeezed into the capitals' metrics, leaving it nowhere to curl.
    for (const [glyph, strokes] of Object.entries(GLYPH_STROKES)) {
      for (const stroke of strokes) {
        for (const [x, y] of stroke) {
          expect(x, `${glyph} x`).toBeGreaterThanOrEqual(0);
          expect(x, `${glyph} x`).toBeLessThanOrEqual(1);
          expect(y, `${glyph} y`).toBeGreaterThanOrEqual(0);
          expect(y, `${glyph} y`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives every stroke enough points to be a line', () => {
    // One point is not a stroke, and two far-apart points are a shortcut the
    // tracing check would score as a straight line.
    for (const [glyph, strokes] of Object.entries(GLYPH_STROKES)) {
      expect(strokes.length, `${glyph} strokes`).toBeGreaterThan(0);
      for (const stroke of strokes) {
        expect(stroke.length, `${glyph} stroke length`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('fills the sheet rather than sitting in a corner of it', () => {
    // A shape drawn tiny is traceable by a scribble anywhere near it.
    //
    // The bar is 0.3 rather than something higher because a small letter with
    // no ascender or descender — an a, an o — spans only the x-height, which
    // is about a third of the sheet and is exactly how it should be written.
    for (const [glyph, strokes] of Object.entries(GLYPH_STROKES)) {
      const points = strokes.flat();
      const height =
        Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y));

      expect(height, `${glyph} height`).toBeGreaterThan(0.3);
    }
  });

  it('does not invent a path for a script it does not know', () => {
    // A school writing a Hindi or Gujarati letter keeps the path they drew.
    expect(strokesForGlyph('अ')).toBeNull();
    expect(strokesForGlyph('🍎')).toBeNull();
    expect(strokesForGlyph('')).toBeNull();
    expect(strokesForGlyph(null)).toBeNull();
  });

  it('ignores the spaces around a glyph somebody typed', () => {
    expect(strokesForGlyph(' B ')).not.toBeNull();
  });
});
