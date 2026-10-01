import { FONT } from './pdf.js';

/**
 * Drawing pieces shared by everything the school prints that is more than a
 * page of text: ID cards, certificates, report cards.
 *
 * Moved here from the ID card layouts unchanged, so a certificate's name fits
 * its box by the same rules a card's does, and the school's colour is lightened
 * and darkened the same way on both.
 */

export const INK = '#1A1D29';
export const MUTED = '#6B7280';
export const WHITE = '#FFFFFF';
const CARD_INK = INK;

export function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(value)) return [22, 48, 124];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `hex` moved `amount` of the way towards `towards`. */
export function mix(hex: string, towards: string, amount: number): string {
  const a = channels(hex);
  const b = channels(towards);
  return `#${a
    .map((c, i) =>
      Math.round(c + (b[i]! - c) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export const tint = (hex: string, amount: number) => mix(hex, WHITE, amount);
export const shade = (hex: string, amount: number) => mix(hex, '#000000', amount);

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * White or ink, whichever contrasts more with the colour. Compared as contrast
 * ratios rather than against a brightness cut-off, because a saffron or a
 * marigold sits just under any cut-off and white on it is barely legible.
 */
export function inkOn(hex: string): string {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / (luminance(CARD_INK) + 0.05);
  return onInk > onWhite ? CARD_INK : WHITE;
}

/**
 * Text that stays inside its box.
 *
 * Always given a height, because PDFKit with a margin of zero will otherwise
 * start a new page for a line that runs past the bottom — and a stray blank
 * page in a class's worth of cards misaligns every card after it in duplex.
 * Returns the height actually used.
 */
export function box(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  style: {
    font: string;
    size: number;
    color: string;
    lines?: number;
    align?: 'left' | 'center' | 'right';
    spacing?: number;
  },
): number {
  doc.font(style.font).fontSize(style.size).fillColor(style.color);
  const options = { width, align: style.align, lineGap: 0, characterSpacing: style.spacing };
  const room = doc.currentLineHeight(true) * (style.lines ?? 1);
  const used = Math.min(doc.heightOfString(value, options), room);
  doc.text(value, x, y, { ...options, height: room + 0.5, ellipsis: true });
  return used;
}

/** The largest size, down to `min`, at which `value` fits on one line. */
export function fitSize(
  doc: PDFKit.PDFDocument,
  value: string,
  font: string,
  max: number,
  min: number,
  width: number,
): number {
  doc.font(font);
  for (let size = max; size > min; size -= 0.25) {
    if (doc.fontSize(size).widthOfString(value) <= width) return size;
  }
  return min;
}

/**
 * The size at which bold text fills a box best, down to `min`, wrapping if it
 * has to. For names, which vary from "Sunshine" to "Shree Swaminarayan
 * International Pre-School and Day Care".
 */
export function fitText(
  doc: PDFKit.PDFDocument,
  value: string,
  width: number,
  height: number,
  max: number,
  min: number,
): { size: number; lines: number; used: number } {
  const measure = { width, lineGap: 0 };
  doc.font(FONT.bold);

  // Every word has to fit on a line of its own too, or PDFKit breaks it
  // mid-word — "INTERNA / TIONAL" is worse than a smaller name. Measured with
  // the trailing space, because that is how PDFKit measures a word.
  const words = value.split(/\s+/).filter(Boolean);
  const fits = (size: number) =>
    doc.fontSize(size).heightOfString(value, measure) <= height &&
    words.every((word) => doc.widthOfString(`${word} `) <= width);

  let size = max;
  while (size > min && !fits(size)) size -= 0.25;

  doc.fontSize(size);
  const lines = Math.max(1, Math.floor(height / doc.currentLineHeight(true)));
  const used = Math.min(doc.heightOfString(value, measure), doc.currentLineHeight(true) * lines);
  return { size, lines, used };
}

/** Bold text as large as a box allows, centred in the box vertically. */
export function fillBox(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: { max: number; min: number; color: string; align: 'left' | 'center' },
): void {
  const { size, lines, used } = fitText(doc, value, width, height, style.max, style.min);
  box(doc, value, x, y + Math.max(0, (height - used) / 2), width, {
    font: FONT.bold,
    size,
    color: style.color,
    align: style.align,
    lines,
  });
}

/** A picture that must never cost the school its cards. */
export function tryImage(draw: () => void): boolean {
  try {
    draw();
    return true;
  } catch {
    return false;
  }
}

export function drawLogo(
  doc: PDFKit.PDFDocument,
  logo: Buffer | null,
  x: number,
  y: number,
  size: number,
  align: 'left' | 'center' = 'left',
): boolean {
  if (!logo) return false;
  // Left is where it lands without asking, and 'left' is not a value the image
  // options accept.
  const options = { fit: [size, size] as [number, number], valign: 'center' as const };
  return tryImage(() =>
    doc.image(logo, x, y, align === 'center' ? { ...options, align: 'center' } : options),
  );
}
