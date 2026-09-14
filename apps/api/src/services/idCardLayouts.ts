import type { IdCardLayout } from '@poetree/shared';
import { FONT, mm } from '../lib/pdf.js';

/**
 * How an ID card is drawn, one function per side.
 *
 * Kept apart from gathering the data because the data is the same whichever
 * layout a school picks — only the artwork differs — and because the artwork
 * is the part that is changed by looking at it.
 *
 * Every layout is drawn against the page it lands on rather than at fixed
 * positions, so each one works at every size the school can choose.
 */

const CARD_INK = '#1A1D29';
const CARD_MUTED = '#6B7280';
const WHITE = '#FFFFFF';

/**
 * Everything a card can show, with the school's switches already applied: a
 * field the school has turned off arrives as null, so no layout can print it
 * by forgetting to check.
 */
export interface CardData {
  school: {
    name: string;
    addressLine: string | null;
    phone: string | null;
    primaryColor: string;
    logo: Buffer | null;
  };
  student: {
    name: string;
    admissionNo: string;
    classroom: string | null;
    /** The academic year, e.g. "2025-2026". */
    batch: string | null;
    /** Already formatted for print. */
    dateOfBirth: string | null;
    bloodGroup: string | null;
    address: string | null;
    photo: Buffer | null;
    guardianName: string | null;
    guardianPhone: string | null;
  };
}

type Side = (doc: PDFKit.PDFDocument, data: CardData) => void;

/** One entry per printed page. A two-sided card is two pages per child. */
export const SIDES: Readonly<Record<IdCardLayout, readonly Side[]>> = {
  CLASSIC: [drawClassic],
  BANNER: [drawBanner],
  FRONT_BACK: [drawFront, drawBack],
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Two letters, for a child with no photograph on file. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(value)) return [22, 48, 124];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `hex` moved `amount` of the way towards `towards`. */
function mix(hex: string, towards: string, amount: number): string {
  const a = channels(hex);
  const b = channels(towards);
  return `#${a
    .map((c, i) => Math.round(c + (b[i]! - c) * amount).toString(16).padStart(2, '0'))
    .join('')}`;
}

const tint = (hex: string, amount: number) => mix(hex, WHITE, amount);
const shade = (hex: string, amount: number) => mix(hex, '#000000', amount);

function luminance(hex: string): number {
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
function inkOn(hex: string): string {
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
function box(
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
function fitSize(
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
function fitText(
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
function fillBox(
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

/** Scale for type, so a Half A5 card is not set in credit-card-sized letters. */
function unit(doc: PDFKit.PDFDocument): number {
  return Math.min(doc.page.width, doc.page.height) / mm(54);
}

/** A picture that must never cost the school its cards. */
function tryImage(draw: () => void): boolean {
  try {
    draw();
    return true;
  } catch {
    return false;
  }
}

function drawLogo(
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

/** A photograph cropped to a circle, with the school's colour as a ring. */
function roundPhoto(
  doc: PDFKit.PDFDocument,
  data: CardData,
  cx: number,
  cy: number,
  radius: number,
): void {
  const { school, student } = data;
  const ring = Math.max(1.2, radius * 0.09);

  doc.circle(cx, cy, radius + ring).fill(school.primaryColor);
  doc.circle(cx, cy, radius + ring * 0.35).fill(WHITE);

  const inner = radius - ring * 0.2;
  const photo = student.photo;
  const drawn =
    photo !== null &&
    tryImage(() => {
      doc.save();
      doc.circle(cx, cy, inner).clip();
      doc.image(photo, cx - inner, cy - inner, {
        cover: [inner * 2, inner * 2],
        align: 'center',
        valign: 'center',
      });
      doc.restore();
    });

  if (!drawn) {
    doc.circle(cx, cy, inner).fill(tint(school.primaryColor, 0.85));
    box(doc, initials(student.name), cx - inner, cy - inner * 0.42, inner * 2, {
      font: FONT.bold,
      size: inner * 0.75,
      color: school.primaryColor,
      align: 'center',
    });
  }
}

/** A photograph in a frame, as a passport photo is stuck to a form. */
function framedPhoto(
  doc: PDFKit.PDFDocument,
  data: CardData,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const { school, student } = data;
  const border = Math.max(1, width * 0.025);

  doc.rect(x - border, y - border, width + border * 2, height + border * 2).fill(CARD_INK);
  doc.rect(x, y, width, height).fill(WHITE);

  const photo = student.photo;
  const drawn =
    photo !== null &&
    tryImage(() => {
      doc.save();
      doc.rect(x, y, width, height).clip();
      doc.image(photo, x, y, { cover: [width, height], align: 'center', valign: 'center' });
      doc.restore();
    });

  if (!drawn) {
    doc.rect(x, y, width, height).fill(tint(school.primaryColor, 0.85));
    const size = Math.min(width, height) * 0.4;
    box(doc, initials(student.name), x, y + height / 2 - size * 0.62, width, {
      font: FONT.bold,
      size,
      color: school.primaryColor,
      align: 'center',
    });
  }
}

/** A row on a card: label, value, and how many lines the value may take. */
type Row = [label: string, value: string, lines?: number];

/**
 * "Label : value" rows with the colons lined up, as a form sets them.
 *
 * Stops at `bottom` rather than overprinting whatever is below — a card with a
 * row missing can be noticed and reprinted; a card with two rows printed on top
 * of each other already has been. Returns where the next thing may start.
 */
function colonRows(
  doc: PDFKit.PDFDocument,
  rows: Row[],
  x: number,
  y: number,
  width: number,
  bottom: number,
  style: { size: number; labelColor: string; gap: number; uppercase?: boolean },
): number {
  doc.font(FONT.bold).fontSize(style.size);
  const labelWidth =
    Math.max(0, ...rows.map(([label]) => doc.widthOfString(label))) + style.size * 0.5;
  const colonWidth = doc.widthOfString(':  ');
  const valueX = x + labelWidth + colonWidth;
  const valueWidth = width - labelWidth - colonWidth;
  const lineHeight = doc.currentLineHeight(true);

  for (const [label, raw, wanted = 1] of rows) {
    if (y + lineHeight > bottom) break;
    const value = style.uppercase ? raw.toUpperCase() : raw;
    const lines = Math.max(1, Math.min(wanted, Math.floor((bottom - y) / lineHeight)));

    box(doc, label, x, y, labelWidth, { font: FONT.bold, size: style.size, color: style.labelColor });
    box(doc, ':', x + labelWidth, y, colonWidth, {
      font: FONT.bold,
      size: style.size,
      color: style.labelColor,
    });
    const used = box(doc, value, valueX, y, valueWidth, {
      font: FONT.bold,
      size: style.size,
      color: CARD_INK,
      lines,
    });

    y += Math.max(used, lineHeight) + style.gap;
  }

  return y;
}

// ---------------------------------------------------------------------------
// Classic — header with the school's badge, a large photograph, a tidy grid
// ---------------------------------------------------------------------------

/** What goes in the details grid, in the order a stranger needs it. */
interface Field {
  label: string;
  value: string;
  /** Takes the whole row rather than one of two columns. */
  wide?: boolean;
  /** Starts a fresh row, so a pair that belongs together sits together. */
  newRow?: boolean;
  lines?: number;
}

function classicFields(student: CardData['student']): Field[] {
  const facts: Field[] = [{ label: 'Admission no.', value: student.admissionNo }];
  if (student.bloodGroup) facts.push({ label: 'Blood group', value: student.bloodGroup });
  if (student.dateOfBirth) facts.push({ label: 'Date of birth', value: student.dateOfBirth });
  if (student.batch) facts.push({ label: 'Academic year', value: student.batch });

  // The first row of facts, then who to call — the guardian and their number
  // side by side, never split across rows — then the rest.
  const fields = facts.slice(0, 2);
  if (student.guardianPhone) {
    fields.push({ label: 'Guardian', value: student.guardianName ?? '—', newRow: true });
    fields.push({ label: 'Phone', value: student.guardianPhone });
  }
  fields.push(...facts.slice(2).map((field, i) => (i === 0 ? { ...field, newRow: true } : field)));
  if (student.address) {
    fields.push({ label: 'Address', value: student.address, wide: true, lines: 2 });
  }
  return fields;
}

/**
 * Small-caps labels over bold values, two to a row.
 *
 * Stops at `bottom` rather than overprinting the footer. Returns where the
 * next thing may start.
 */
function fieldGrid(
  doc: PDFKit.PDFDocument,
  fields: Field[],
  x: number,
  y: number,
  width: number,
  bottom: number,
  style: { label: number; value: number; gap: number; columnGap: number },
): number {
  const columnWidth = (width - style.columnGap) / 2;
  const labelStep = style.label * 1.45;
  const valueLine = style.value * 1.35;

  let column = 0;
  let rowHeight = 0;

  for (const field of fields) {
    if ((field.wide || field.newRow) && column === 1) {
      y += rowHeight;
      column = 0;
      rowHeight = 0;
    }

    const room = Math.floor((bottom - y - labelStep) / valueLine);
    const lines = Math.min(field.lines ?? 1, room);
    if (lines < 1) break;

    const cellX = x + column * (columnWidth + style.columnGap);
    const cellWidth = field.wide ? width : columnWidth;

    box(doc, field.label.toUpperCase(), cellX, y, cellWidth, {
      font: FONT.regular,
      size: style.label,
      color: CARD_MUTED,
      spacing: style.label * 0.08,
    });
    doc.font(FONT.bold).fontSize(style.value);
    const wrapped = Math.min(
      lines,
      Math.ceil(doc.heightOfString(field.value, { width: cellWidth, lineGap: 0 }) / doc.currentLineHeight(true)),
    );
    box(doc, field.value, cellX, y + labelStep, cellWidth, {
      font: FONT.bold,
      size: style.value,
      color: CARD_INK,
      lines,
    });

    const cellHeight = labelStep + valueLine * wrapped + style.gap;
    if (field.wide || column === 1) {
      y += Math.max(rowHeight, cellHeight);
      column = 0;
      rowHeight = 0;
    } else {
      rowHeight = cellHeight;
      column = 1;
    }
  }

  return column === 1 ? y + rowHeight : y;
}

/** A rounded pill of tinted colour, for the class. Returns its height. */
function pill(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  style: { size: number; brand: string; centre?: boolean },
): number {
  doc.font(FONT.bold).fontSize(style.size);
  const padX = style.size * 0.9;
  const textWidth = Math.min(doc.widthOfString(value) + 1, maxWidth - padX * 2);
  const pillWidth = textWidth + padX * 2;
  const pillHeight = style.size * 2;
  const left = style.centre ? x + (maxWidth - pillWidth) / 2 : x;

  // Dark text on a pale wash of the brand, which reads whatever the colour.
  doc.roundedRect(left, y, pillWidth, pillHeight, pillHeight / 2).fill(tint(style.brand, 0.84));
  box(doc, value, left + padX, y + (pillHeight - doc.currentLineHeight(true)) / 2, textWidth, {
    font: FONT.bold,
    size: style.size,
    color: mix(style.brand, CARD_INK, 0.55),
  });
  return pillHeight;
}

/** A rounded photograph with a tinted border, or initials where there is none. */
function roundedPhoto(
  doc: PDFKit.PDFDocument,
  data: CardData,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const { school, student } = data;
  const radius = Math.min(width, height) * 0.12;
  const border = Math.max(1.5, width * 0.035);

  doc
    .roundedRect(x - border, y - border, width + border * 2, height + border * 2, radius + border)
    .fill(tint(school.primaryColor, 0.72));
  doc.roundedRect(x, y, width, height, radius).fill(tint(school.primaryColor, 0.9));

  const photo = student.photo;
  const drawn =
    photo !== null &&
    tryImage(() => {
      doc.save();
      doc.roundedRect(x, y, width, height, radius).clip();
      doc.image(photo, x, y, { cover: [width, height], align: 'center', valign: 'center' });
      doc.restore();
    });

  if (!drawn) {
    const size = width * 0.34;
    doc.font(FONT.bold).fontSize(size);
    box(doc, initials(student.name), x, y + (height - doc.currentLineHeight(true)) / 2, width, {
      font: FONT.bold,
      size,
      color: mix(school.primaryColor, CARD_INK, 0.25),
      align: 'center',
    });
  }
}

/**
 * The school's band: a white badge holding the logo (or the school's initials),
 * the name, and what the card is. Soft rings in the corner give it depth
 * without competing with the name.
 */
function classicHeader(doc: PDFKit.PDFDocument, data: CardData, height: number): void {
  const { school } = data;
  const width = doc.page.width;
  const u = unit(doc);
  const pad = mm(3.2) * u;
  const brand = school.primaryColor;
  const ink = inkOn(brand);

  doc.rect(0, 0, width, height).fill(brand);
  doc.save();
  doc.rect(0, 0, width, height).clip();
  doc
    .fillOpacity(0.12)
    .circle(width - height * 0.35, -height * 0.15, height * 1.05)
    .fill(ink);
  doc
    .fillOpacity(0.08)
    .circle(width - height * 1.55, height * 1.3, height * 0.85)
    .fill(ink);
  doc.restore();

  const badge = height * 0.7;
  const badgeY = (height - badge) / 2;
  doc.roundedRect(pad, badgeY, badge, badge, badge * 0.24).fill(WHITE);
  const inset = badge * 0.12;
  if (!drawLogo(doc, school.logo, pad + inset, badgeY + inset, badge - inset * 2, 'center')) {
    const size = badge * 0.38;
    doc.font(FONT.bold).fontSize(size);
    box(doc, initials(school.name), pad, badgeY + (badge - doc.currentLineHeight(true)) / 2, badge, {
      font: FONT.bold,
      size,
      color: brand === WHITE ? CARD_INK : mix(brand, CARD_INK, luminance(brand) > 0.4 ? 0.45 : 0),
      align: 'center',
    });
  }

  const textX = pad + badge + mm(2.4) * u;
  const textWidth = width - textX - pad;
  const subtitleSize = 4.2 * u;
  const subtitleStep = subtitleSize * 1.6;

  const name = fitText(doc, school.name, textWidth, badge - subtitleStep, 11 * u, 6 * u);
  const top = (height - (name.used + subtitleStep)) / 2;

  box(doc, school.name, textX, top, textWidth, {
    font: FONT.bold,
    size: name.size,
    color: ink,
    lines: name.lines,
  });
  box(doc, 'STUDENT IDENTITY CARD', textX, top + name.used + subtitleSize * 0.15, textWidth, {
    font: FONT.bold,
    size: subtitleSize,
    color: mix(ink, brand, 0.3),
    spacing: subtitleSize * 0.18,
  });
}

/** The foot: where a lost card should go. */
function classicFooter(doc: PDFKit.PDFDocument, data: CardData, height: number): void {
  const { school } = data;
  const width = doc.page.width;
  const u = unit(doc);
  const pad = mm(3.2) * u;
  const brand = school.primaryColor;
  const top = doc.page.height - height;

  doc.rect(0, top, width, height).fill(brand);
  const contact = schoolContact(school) || `If found, please return to ${school.name}`;
  const size = 4.4 * u;
  doc.font(FONT.bold).fontSize(size);
  box(doc, contact, pad, top + (height - doc.currentLineHeight(true)) / 2, width - pad * 2, {
    font: FONT.bold,
    size,
    color: inkOn(brand),
    align: 'center',
  });
}

function drawClassic(doc: PDFKit.PDFDocument, data: CardData): void {
  const { school, student } = data;
  const width = doc.page.width;
  const height = doc.page.height;
  const u = unit(doc);
  const pad = mm(3.2) * u;
  const brand = school.primaryColor;
  const portrait = height > width;

  const headerHeight = portrait ? height * 0.15 : height * 0.25;
  const footerHeight = mm(4.6) * u;
  const bodyBottom = height - footerHeight;

  doc.rect(0, 0, width, height).fill(WHITE);

  // A faint wash in the corner, so the white is not a blank.
  doc.save();
  doc.rect(0, headerHeight, width, bodyBottom - headerHeight).clip();
  doc.circle(width * 0.98, bodyBottom + height * 0.05, (bodyBottom - headerHeight) * 0.75).fill(tint(brand, 0.94));
  doc.restore();

  classicHeader(doc, data, headerHeight);
  classicFooter(doc, data, footerHeight);

  const grid = { label: 4.1 * u, value: 6.3 * u, gap: mm(1) * u, columnGap: mm(3) * u };

  if (portrait) {
    const photoWidth = width * 0.31;
    const photoHeight = photoWidth * 1.18;
    const photoY = headerHeight + pad * 1.1;
    roundedPhoto(doc, data, (width - photoWidth) / 2, photoY, photoWidth, photoHeight);

    let y = photoY + photoHeight + pad * 0.9;
    const name = fitText(doc, student.name, width - pad * 2, 9.5 * u * 1.5 * 2, 9.5 * u, 6.5 * u);
    box(doc, student.name, pad, y, width - pad * 2, {
      font: FONT.bold,
      size: name.size,
      color: CARD_INK,
      align: 'center',
      lines: Math.min(2, name.lines),
    });
    y += name.used + mm(0.8) * u;

    if (student.classroom) {
      y += pill(doc, student.classroom, pad, y, width - pad * 2, { size: 5.4 * u, brand, centre: true });
      y += pad * 0.8;
    }

    const gridWidth = width - pad * 3;
    fieldGrid(doc, classicFields(student), pad * 1.5, y, gridWidth, bodyBottom - pad * 0.4, grid);
    return;
  }

  // Landscape: the photograph down the left, everything else beside it.
  const photoHeight = bodyBottom - headerHeight - pad * 1.8;
  const photoWidth = photoHeight / 1.2;
  const photoX = pad + mm(0.5) * u;
  const photoY = headerHeight + pad * 0.9;
  roundedPhoto(doc, data, photoX, photoY, photoWidth, photoHeight);

  const textX = photoX + photoWidth + pad * 1.3;
  const textWidth = width - textX - pad;
  let y = photoY - mm(0.6) * u;

  const name = fitText(doc, student.name, textWidth, 10 * u * 1.5 * 2, 10 * u, 6.5 * u);
  box(doc, student.name, textX, y, textWidth, {
    font: FONT.bold,
    size: name.size,
    color: CARD_INK,
    lines: Math.min(2, name.lines),
  });
  y += name.used + mm(0.4) * u;

  if (student.classroom) {
    y += pill(doc, student.classroom, textX, y, textWidth, { size: 5 * u, brand });
    y += pad * 0.7;
  }

  fieldGrid(doc, classicFields(student), textX, y, textWidth, bodyBottom - pad * 0.3, {
    ...grid,
    label: 3.9 * u,
    value: 5.9 * u,
    gap: mm(0.7) * u,
  });
}

// ---------------------------------------------------------------------------
// Banner — bold header, round photograph, the school's address along the foot
// ---------------------------------------------------------------------------

function bannerRows(student: CardData['student']): Row[] {
  const rows: Row[] = [['Name', student.name, 2]];
  if (student.classroom) rows.push(['Grade', student.classroom]);
  rows.push(['Adm. no.', student.admissionNo]);
  if (student.dateOfBirth) rows.push(['Birth date', student.dateOfBirth]);
  if (student.bloodGroup) rows.push(['Blood', student.bloodGroup]);
  if (student.guardianPhone) rows.push(['Mobile', student.guardianPhone]);
  if (student.address) rows.push(['Address', student.address, 2]);
  return rows;
}

/** The school's own address and number, which is who a finder should call. */
function schoolContact(school: CardData['school']): string {
  return [school.addressLine, school.phone && `Ph. ${school.phone}`].filter(Boolean).join('  ·  ');
}

function drawBanner(doc: PDFKit.PDFDocument, data: CardData): void {
  const { school, student } = data;
  const width = doc.page.width;
  const height = doc.page.height;
  const u = unit(doc);
  const pad = mm(3) * u;
  const brand = school.primaryColor;
  const onBrand = inkOn(brand);
  const footColour = shade(brand, 0.25);

  doc.rect(0, 0, width, height).fill(tint(brand, 0.94));

  // The foot: the school's address, which is where a lost card should go.
  const contact = schoolContact(school);
  const footHeight = contact ? mm(6.5) * u : mm(2.5) * u;
  doc.rect(0, height - footHeight, width, footHeight).fill(footColour);
  if (contact) {
    fillBox(
      doc,
      contact,
      pad,
      height - footHeight + mm(0.6) * u,
      width - pad * 2,
      footHeight - mm(1.2) * u,
      { max: 5.2 * u, min: 3.6 * u, color: inkOn(footColour), align: 'center' },
    );
  }

  const name = school.name.toUpperCase();

  if (height > width) {
    // Header across the top, photograph centred beneath it, details below.
    const headerHeight = height * 0.2;
    const cut = mm(3) * u;
    doc.rect(0, 0, width, headerHeight).fill(brand);
    doc
      .polygon([0, headerHeight], [width, headerHeight - cut], [width, headerHeight])
      .fill(tint(brand, 0.94));

    const logoSize = headerHeight * 0.4;
    const logoY = pad * 0.7;
    const hasLogo = drawLogo(doc, school.logo, (width - logoSize) / 2, logoY, logoSize, 'center');
    const nameTop = hasLogo ? logoY + logoSize + mm(0.5) * u : pad;
    fillBox(doc, name, pad, nameTop, width - pad * 2, headerHeight - cut - nameTop - mm(0.5) * u, {
      max: 13 * u,
      min: 6 * u,
      color: onBrand,
      align: 'center',
    });

    const radius = width * 0.17;
    const cy = headerHeight + radius + mm(3) * u;
    roundPhoto(doc, data, width / 2, cy, radius);

    colonRows(
      doc,
      bannerRows(student),
      pad * 1.3,
      cy + radius + mm(4) * u,
      width - pad * 2.6,
      height - footHeight - pad * 0.5,
      { size: 5.6 * u, labelColor: brand, gap: mm(0.9) * u, uppercase: true },
    );
    return;
  }

  // Landscape: a column for the photograph on the left, the school's banner
  // across the rest of the top, and the details beneath it.
  const photoColumn = Math.min(width * 0.32, (height - footHeight) * 0.9);
  const headerHeight = (height - footHeight) * 0.3;
  const headerX = photoColumn;
  const headerY = pad * 0.7;
  const headerWidth = width - headerX - pad * 0.7;

  doc.roundedRect(headerX, headerY, headerWidth, headerHeight, mm(2.5) * u).fill(brand);

  const logoSize = headerHeight * 0.8;
  const logoX = headerX + mm(1.5) * u;
  const hasLogo = drawLogo(doc, school.logo, logoX, headerY + (headerHeight - logoSize) / 2, logoSize);
  const nameX = hasLogo ? logoX + logoSize + mm(1.5) * u : headerX + mm(2) * u;
  fillBox(
    doc,
    name,
    nameX,
    headerY + mm(0.8) * u,
    headerX + headerWidth - mm(2) * u - nameX,
    headerHeight - mm(1.6) * u,
    { max: headerHeight * 0.42, min: 5 * u, color: onBrand, align: hasLogo ? 'left' : 'center' },
  );

  const radius = photoColumn / 2 - pad * 0.9;
  roundPhoto(doc, data, photoColumn / 2, (height - footHeight) / 2, radius);

  colonRows(
    doc,
    bannerRows(student),
    headerX + mm(1) * u,
    headerY + headerHeight + mm(1.8) * u,
    width - headerX - pad,
    height - footHeight - mm(1) * u,
    { size: 5.3 * u, labelColor: brand, gap: mm(0.45) * u, uppercase: true },
  );
}

// ---------------------------------------------------------------------------
// Front & back — the child on one side, where to take them on the other
// ---------------------------------------------------------------------------

/**
 * The angled bands both sides share, so the two faces read as one card.
 * Pale enough that nothing printed over them has to fight for contrast.
 */
function backdrop(doc: PDFKit.PDFDocument, brand: string, footHeight: number): void {
  const width = doc.page.width;
  const height = doc.page.height;
  const bottom = height - footHeight;

  doc.rect(0, 0, width, height).fill(WHITE);
  doc
    .polygon([0, bottom * 0.12], [width, bottom * 0.55], [width, bottom * 0.95], [0, bottom * 0.52])
    .fill(tint(brand, 0.88));
  doc
    .polygon([0, bottom * 0.52], [width, bottom * 0.95], [width, bottom], [0, bottom])
    .fill(tint(brand, 0.94));
  doc
    .polygon([width, bottom * 0.3], [width, bottom * 0.62], [width * 0.86, bottom * 0.46])
    .fill(tint(brand, 0.62));
  doc.polygon([0, bottom * 0.62], [0, bottom], [width * 0.14, bottom]).fill(tint(brand, 0.62));

  doc.rect(0, bottom, width, footHeight).fill(shade(brand, 0.2));
}

function drawFront(doc: PDFKit.PDFDocument, data: CardData): void {
  const { school, student } = data;
  const width = doc.page.width;
  const height = doc.page.height;
  const u = unit(doc);
  const pad = mm(3) * u;
  const brand = school.primaryColor;
  const footHeight = mm(3.5) * u;
  const portrait = height > width;

  backdrop(doc, brand, footHeight);

  // The school's mark across the top.
  const headerHeight = portrait ? height * 0.12 : height * 0.2;
  const logoSize = headerHeight - pad * 0.5;
  const hasLogo = drawLogo(doc, school.logo, pad, pad * 0.35, logoSize);
  const nameX = hasLogo ? pad + logoSize + mm(2) * u : pad;
  fillBox(doc, school.name, nameX, pad * 0.35, width - nameX - pad, logoSize, {
    max: logoSize * 0.5,
    min: 5 * u,
    color: brand,
    align: hasLogo ? 'left' : 'center',
  });

  const rows: Row[] = [['Adm. no.', student.admissionNo]];
  if (student.dateOfBirth) rows.push(['Birth date', student.dateOfBirth]);
  if (student.batch) rows.push(['Batch', student.batch]);
  if (student.bloodGroup) rows.push(['Blood group', student.bloodGroup]);

  const bottom = height - footHeight;
  const tagHeight = mm(6) * u;
  const tagY = bottom - tagHeight - mm(2.5) * u;

  if (portrait) {
    const photoWidth = width * 0.36;
    const photoHeight = photoWidth * 1.15;
    const photoY = headerHeight + mm(3) * u;
    framedPhoto(doc, data, (width - photoWidth) / 2, photoY, photoWidth, photoHeight);

    const nameY = photoY + photoHeight + mm(3.5) * u;
    const used = box(doc, student.name.toUpperCase(), pad, nameY, width - pad * 2, {
      font: FONT.bold,
      size: 7.5 * u,
      color: CARD_INK,
      align: 'center',
      lines: 2,
    });

    colonRows(doc, rows, pad * 2, nameY + used + mm(2.5) * u, width - pad * 4, tagY - mm(1) * u, {
      size: 6.5 * u,
      labelColor: brand,
      gap: mm(1) * u,
    });
  } else {
    const photoHeight = tagY - headerHeight - mm(4) * u;
    const photoWidth = photoHeight / 1.15;
    const photoX = pad + mm(1) * u;
    const photoY = headerHeight + mm(2) * u;
    framedPhoto(doc, data, photoX, photoY, photoWidth, photoHeight);

    const textX = photoX + photoWidth + mm(4) * u;
    const textWidth = width - textX - pad;
    const used = box(doc, student.name.toUpperCase(), textX, photoY, textWidth, {
      font: FONT.bold,
      size: 7.5 * u,
      color: CARD_INK,
      lines: 2,
    });

    colonRows(doc, rows, textX, photoY + used + mm(2) * u, textWidth, tagY, {
      size: 6.5 * u,
      labelColor: brand,
      gap: mm(0.9) * u,
    });
  }

  // Class in a white tag bottom-left, and a line for the office's signature or
  // stamp bottom-right. Left blank rather than printed: a signature that comes
  // out of the same printer as the card vouches for nothing.
  const tagWidth = width * 0.46;
  const classroom = (student.classroom ?? '').toUpperCase();
  doc.rect(0, tagY, tagWidth, tagHeight).fill(WHITE);
  box(doc, classroom, pad, tagY + tagHeight * 0.22, tagWidth - pad * 1.5, {
    font: FONT.bold,
    size: fitSize(doc, classroom, FONT.bold, 8 * u, 5 * u, tagWidth - pad * 1.5),
    color: brand,
  });

  const signX = tagWidth + mm(4) * u;
  const signWidth = width - signX - pad;
  const signY = tagY + tagHeight * 0.55;
  doc
    .save()
    .moveTo(signX, signY)
    .lineTo(signX + signWidth, signY)
    .lineWidth(0.6)
    .strokeColor(CARD_MUTED)
    .stroke()
    .restore();
  box(doc, 'Authorised signature', signX, signY + mm(0.8) * u, signWidth, {
    font: FONT.bold,
    size: 5 * u,
    color: CARD_INK,
    align: 'center',
  });
}

function drawBack(doc: PDFKit.PDFDocument, data: CardData): void {
  const { school, student } = data;
  const width = doc.page.width;
  const height = doc.page.height;
  const u = unit(doc);
  const pad = mm(3) * u;
  const brand = school.primaryColor;
  const footHeight = mm(5) * u;
  const bottom = height - footHeight;
  const portrait = height > width;

  backdrop(doc, brand, footHeight);

  // "The address above" only when a child's address is printed above it; the
  // footer has to be true about what it points at.
  const returnTo = student.address
    ? 'If found, please return to the address above'
    : 'If found, please return to the school';
  box(doc, returnTo, pad, bottom + footHeight * 0.28, width - pad * 2, {
    font: FONT.bold,
    size: 5.5 * u,
    color: '#FFE66D',
    align: 'center',
  });

  const rows: Row[] = [];
  if (student.address) rows.push(['Address', student.address, 4]);
  if (student.guardianPhone) rows.push(['Mobile', student.guardianPhone]);

  const panelX = portrait ? pad * 1.5 : width * 0.4;
  const panelWidth = portrait ? width - pad * 3 : width - panelX - pad;
  const panelY = portrait ? height * 0.36 : pad * 1.2;
  const panelHeight = bottom - panelY - pad * (portrait ? 1.5 : 1.2);

  // The logo large, as the thing a stranger recognises first.
  const markSize = portrait
    ? Math.min(width * 0.62, panelY - pad * 2)
    : Math.min(panelX - pad * 2, bottom - pad * 2);
  const markX = portrait ? (width - markSize) / 2 : pad;
  const markY = portrait ? pad : (bottom - markSize) / 2;
  if (!drawLogo(doc, school.logo, markX, markY, markSize, 'center')) {
    fillBox(doc, school.name, markX, markY, markSize, markSize, {
      max: markSize * 0.2,
      min: 6 * u,
      color: brand,
      align: 'center',
    });
  }

  doc
    .save()
    .fillOpacity(0.92)
    .roundedRect(panelX, panelY, panelWidth, panelHeight, mm(2) * u)
    .fill(WHITE)
    .restore();

  const inset = mm(2.5) * u;
  const size = 5.8 * u;
  const innerBottom = panelY + panelHeight - inset;
  let y = colonRows(doc, rows, panelX + inset, panelY + inset, panelWidth - inset * 2, innerBottom, {
    size,
    labelColor: brand,
    gap: mm(1.2) * u,
  });

  // The school, which is who can always be called — the number before the
  // address, because it is what a finder needs if only one of them fits.
  const contact = [
    school.name,
    school.phone && `Contact: ${school.phone}`,
    school.addressLine,
  ].filter((line): line is string => Boolean(line));
  if (rows.length > 0) y += mm(1.5) * u;

  const lineHeight = doc.font(FONT.bold).fontSize(size).currentLineHeight(true);
  for (const line of contact) {
    const room = Math.floor((innerBottom - y) / lineHeight);
    if (room < 1) break;
    y +=
      box(doc, line, panelX + inset, y, panelWidth - inset * 2, {
        font: FONT.bold,
        size,
        color: CARD_INK,
        lines: Math.min(3, room),
      }) + mm(0.6) * u;
  }
}
