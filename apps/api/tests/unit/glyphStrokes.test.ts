import { describe, expect, it } from 'vitest';
import {
  FREE_ORDER_GLYPHS,
  GLYPH_STROKES,
  isFreeOrderGlyph,
  strokesForGlyph,
} from '../../src/content/glyphStrokes.js';

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
    // Measured on the longer side: a zigzag is wide and low by nature.
    for (const [glyph, strokes] of Object.entries(GLYPH_STROKES)) {
      const points = strokes.flat();
      const height =
        Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y));
      const width =
        Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x));

      expect(Math.max(height, width), `${glyph} size`).toBeGreaterThan(0.3);
    }
  });

  it('has the Hindi and Gujarati alphabets and numbers from the school sheet', () => {
    const hindi = ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ', 'अं', 'अः', 'क', 'ख',
      'ग', 'घ', 'ङ', 'च', 'छ', 'ज', 'झ', 'ञ', 'ट', 'ठ', 'ड', 'ढ', 'ण', 'त', 'थ', 'द', 'ध', 'न',
      'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'श', 'ष', 'स', 'ह', 'क्ष', 'त्र', 'ज्ञ', 'श्र',
      'ड़', 'ढ़', '१', '२', '३', '४', '५', '६', '७', '८', '९', '१०'];
    const gujarati = ['અ', 'આ', 'ઇ', 'ઈ', 'ઉ', 'ઊ', 'ઋ', 'એ', 'ઐ', 'ઓ', 'ઔ', 'અં', 'અઃ', 'ક',
      'ખ', 'ગ', 'ઘ', 'ચ', 'છ', 'જ', 'ઝ', 'ટ', 'ઠ', 'ડ', 'ઢ', 'ણ', 'ત', 'થ', 'દ', 'ધ', 'ન', 'પ',
      'ફ', 'બ', 'ભ', 'મ', 'ય', 'ર', 'લ', 'વ', 'શ', 'ષ', 'સ', 'હ', 'ળ', 'ક્ષ', 'જ્ઞ', '૧', '૨',
      '૩', '૪', '૫', '૬', '૭', '૮', '૯', '૧૦'];

    for (const glyph of [...hindi, ...gujarati]) {
      expect(strokesForGlyph(glyph), glyph).not.toBeNull();
    }
  });

  it('has the pre-writing patterns, under names an author can type', () => {
    for (const key of ['pattern-standing', 'pattern-sleeping', 'pattern-slant-r',
      'pattern-slant-l', 'pattern-curve', 'pattern-arch', 'pattern-cup', 'pattern-zigzag']) {
      expect(strokesForGlyph(key), key).not.toBeNull();
      expect(key.length, key).toBeLessThanOrEqual(16);
    }
  });

  it('teaches an order only where one is known', () => {
    // English letters and numbers have hand-built strokes in the order they
    // are taught, and so do the patterns. The Hindi and Gujarati paths come
    // from dots with no order, so they are traced freely.
    expect(isFreeOrderGlyph('A')).toBe(false);
    expect(isFreeOrderGlyph('7')).toBe(false);
    expect(isFreeOrderGlyph('pattern-zigzag')).toBe(false);
    expect(isFreeOrderGlyph('क')).toBe(true);
    expect(isFreeOrderGlyph(' ક ')).toBe(true);
    for (const glyph of FREE_ORDER_GLYPHS) {
      expect(GLYPH_STROKES[glyph], glyph).toBeDefined();
    }
  });

  it('does not invent a path for a script it does not know', () => {
    // A school writing a Tamil letter keeps the path they drew.
    expect(strokesForGlyph('அ')).toBeNull();
    expect(strokesForGlyph('🍎')).toBeNull();
    expect(strokesForGlyph('')).toBeNull();
    expect(strokesForGlyph(null)).toBeNull();
  });

  it('ignores the spaces around a glyph somebody typed', () => {
    expect(strokesForGlyph(' B ')).not.toBeNull();
  });
});
