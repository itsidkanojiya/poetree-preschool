import type { CertificateDesign } from '@poetree/shared';
import { FONT, longDate } from '../lib/pdf.js';
import { drawLogo, fitSize, INK, MUTED, mix, shade, tint, tryImage, WHITE } from '../lib/pdfArt.js';
import type { SchoolBranding } from './printAssets.service.js';

/**
 * A certificate, drawn on landscape A4.
 *
 * Four designs, all in the school's own colour: the office picks one when it
 * writes the certificate. Every design shares one layout for the words — logo,
 * title, the child's name as large as it will fit, the line about why, the
 * date and the two signatures — and differs only in what is drawn around it,
 * so a certificate reads the same whichever the school chose.
 */

export const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

const GOLD = '#C9A227';

export interface CertificateArt {
  design: CertificateDesign;
  school: SchoolBranding;
  title: string;
  body: string;
  childName: string;
  classroomLabel: string | null;
  issuedOn: Date;
  number: string | null;
  classTeacher: { name: string; signature: Buffer | null } | null;
}

/** One certificate on the current page. */
export function drawCertificate(doc: PDFKit.PDFDocument, art: CertificateArt): void {
  const brand = art.school.primaryColor;
  DESIGNS[art.design](doc, brand);
  words(doc, art, art.design === 'ELEGANT' ? 58 : 50);
}

const DESIGNS: Record<CertificateDesign, (doc: PDFKit.PDFDocument, brand: string) => void> = {
  CLASSIC: classic,
  STARS: stars,
  PLAYFUL: playful,
  ELEGANT: elegant,
};

// ---------------------------------------------------------------------------
// The words, the same on every design
// ---------------------------------------------------------------------------

function words(doc: PDFKit.PDFDocument, art: CertificateArt, inset: number): void {
  const { width, height } = doc.page;
  const brand = art.school.primaryColor;
  const left = inset + 40;
  const span = width - left * 2;
  const footY = height - inset - 86;

  // Centred in the room above the signatures, so a short certificate does not
  // sit at the top with a gap under it.
  const room = footY - 24 - (inset + 18);
  let y = inset + 18 + Math.max(0, (room - measure(doc, art, span)) / 2);

  // The school, small, at the top: whose certificate this is.
  if (drawLogo(doc, art.school.logo, width / 2 - 26, y, 52, 'center')) y += 58;
  doc
    .font(FONT.bold)
    .fontSize(13)
    .fillColor(shade(brand, 0.15))
    .text(art.school.name, left, y, { width: span, align: 'center' });
  y = doc.y + 12;

  // "CERTIFICATE" then the title, which is what the child will point at.
  doc
    .font(FONT.regular)
    .fontSize(11)
    .fillColor(MUTED)
    .text('CERTIFICATE', left, y, { width: span, align: 'center', characterSpacing: 6 });
  y = doc.y + 2;
  const titleSize = fitSize(doc, art.title.toUpperCase(), FONT.bold, 34, 16, span);
  doc
    .font(FONT.bold)
    .fontSize(titleSize)
    .fillColor(brand)
    .text(art.title.toUpperCase(), left, y, {
      width: span,
      align: 'center',
      characterSpacing: 1.5,
    });
  y = doc.y + 14;

  doc
    .font(FONT.regular)
    .fontSize(12)
    .fillColor(MUTED)
    .text('This certificate is proudly presented to', left, y, { width: span, align: 'center' });
  y = doc.y + 8;

  // The child's name, as large as it will go on one line.
  const nameSize = fitSize(doc, art.childName, FONT.bold, 40, 18, span - 80);
  doc
    .font(FONT.bold)
    .fontSize(nameSize)
    .fillColor(INK)
    .text(art.childName, left, y, { width: span, align: 'center' });
  y = doc.y + 4;
  const lineHalf = Math.min(doc.widthOfString(art.childName) / 2 + 30, span / 2);
  doc
    .save()
    .moveTo(width / 2 - lineHalf, y)
    .lineTo(width / 2 + lineHalf, y)
    .lineWidth(1.2)
    .strokeColor(tint(brand, 0.35))
    .stroke()
    .restore();
  y += 10;

  if (art.classroomLabel) {
    doc
      .font(FONT.regular)
      .fontSize(11)
      .fillColor(MUTED)
      .text(art.classroomLabel, left, y, { width: span, align: 'center' });
    y = doc.y + 6;
  }

  if (art.body.trim()) {
    doc
      .font(FONT.regular)
      .fontSize(13)
      .fillColor(INK)
      .text(art.body.trim(), left + 40, y, { width: span - 80, align: 'center', lineGap: 2 });
  }

  // Foot: class teacher on the left, date in the middle, principal on the right.
  const colW = 190;
  signature(
    doc,
    art.classTeacher?.signature ?? null,
    art.classTeacher?.name ?? null,
    'Class teacher',
    left,
    footY,
    colW,
  );
  signature(
    doc,
    art.school.principalSignature,
    art.school.principalName,
    'Principal',
    width - left - colW,
    footY,
    colW,
  );

  doc
    .font(FONT.bold)
    .fontSize(11)
    .fillColor(INK)
    .text(longDate(art.issuedOn), width / 2 - 100, footY + 44, { width: 200, align: 'center' });
  doc
    .font(FONT.regular)
    .fontSize(8)
    .fillColor(MUTED)
    .text(art.number ? `Date  ·  No. ${art.number}` : 'Date', width / 2 - 120, doc.y + 1, {
      width: 240,
      align: 'center',
    });
}

/** How tall the words above the signatures will be, to centre them. */
function measure(doc: PDFKit.PDFDocument, art: CertificateArt, span: number): number {
  let h = art.school.logo ? 58 : 0;
  doc.font(FONT.bold).fontSize(13);
  h += doc.heightOfString(art.school.name, { width: span }) + 12;
  doc.font(FONT.regular).fontSize(11);
  h += doc.currentLineHeight(true) + 2;
  const titleSize = fitSize(doc, art.title.toUpperCase(), FONT.bold, 34, 16, span);
  doc.font(FONT.bold).fontSize(titleSize);
  h += doc.heightOfString(art.title.toUpperCase(), { width: span }) + 14;
  doc.font(FONT.regular).fontSize(12);
  h += doc.currentLineHeight(true) + 8;
  const nameSize = fitSize(doc, art.childName, FONT.bold, 40, 18, span - 80);
  doc.font(FONT.bold).fontSize(nameSize);
  h += doc.heightOfString(art.childName, { width: span }) + 14;
  if (art.classroomLabel) {
    doc.font(FONT.regular).fontSize(11);
    h += doc.currentLineHeight(true) + 6;
  }
  if (art.body.trim()) {
    doc.font(FONT.regular).fontSize(13);
    h += doc.heightOfString(art.body.trim(), { width: span - 80, lineGap: 2 });
  }
  return h;
}

/** A signature picture over a line, the name under it, the role under that. */
function signature(
  doc: PDFKit.PDFDocument,
  image: Buffer | null,
  name: string | null,
  role: string,
  x: number,
  y: number,
  width: number,
): void {
  if (image) {
    tryImage(() =>
      doc.image(image, x + 20, y, { fit: [width - 40, 36], align: 'center', valign: 'bottom' }),
    );
  }
  const lineY = y + 42;
  doc
    .save()
    .moveTo(x + 10, lineY)
    .lineTo(x + width - 10, lineY)
    .lineWidth(0.8)
    .strokeColor('#9CA3AF')
    .stroke()
    .restore();
  if (name) {
    doc
      .font(FONT.bold)
      .fontSize(10)
      .fillColor(INK)
      .text(name, x, lineY + 4, { width, align: 'center', height: 14, ellipsis: true });
  }
  doc
    .font(FONT.regular)
    .fontSize(8)
    .fillColor(MUTED)
    .text(role, x, lineY + (name ? 18 : 4), { width, align: 'center' });
}

// ---------------------------------------------------------------------------
// The designs
// ---------------------------------------------------------------------------

/** A cream page in a double border, with diamonds at the corners. */
function classic(doc: PDFKit.PDFDocument, brand: string): void {
  const { width, height } = doc.page;
  doc.rect(0, 0, width, height).fill('#FFFCF5');
  doc
    .save()
    .lineWidth(10)
    .strokeColor(brand)
    .rect(22, 22, width - 44, height - 44)
    .stroke()
    .restore();
  doc
    .save()
    .lineWidth(1.5)
    .strokeColor(tint(brand, 0.35))
    .rect(38, 38, width - 76, height - 76)
    .stroke()
    .restore();
  for (const [cx, cy] of [
    [38, 38],
    [width - 38, 38],
    [38, height - 38],
    [width - 38, height - 38],
  ] as const) {
    diamond(doc, cx, cy, 11, GOLD);
  }
}

/** Bands of the school's colour top and bottom, and stars scattered between. */
function stars(doc: PDFKit.PDFDocument, brand: string): void {
  const { width, height } = doc.page;
  doc.rect(0, 0, width, height).fill(WHITE);
  doc.rect(0, 0, width, 30).fill(brand);
  doc.rect(0, height - 30, width, 30).fill(brand);
  doc.rect(0, 30, width, 5).fill(GOLD);
  doc.rect(0, height - 35, width, 5).fill(GOLD);

  const spots: Array<[number, number, number, string]> = [
    [70, 80, 16, GOLD],
    [120, 150, 9, tint(brand, 0.45)],
    [60, 250, 11, tint(GOLD, 0.25)],
    [110, 420, 14, GOLD],
    [70, 500, 8, tint(brand, 0.45)],
    [width - 70, 82, 15, GOLD],
    [width - 125, 160, 9, tint(brand, 0.45)],
    [width - 62, 260, 12, tint(GOLD, 0.25)],
    [width - 110, 410, 16, GOLD],
    [width - 68, 505, 9, tint(brand, 0.45)],
  ];
  for (const [x, y, r, colour] of spots) star(doc, x, y, r, colour);
}

/** Bunting along the top, confetti, and a soft rounded frame. */
function playful(doc: PDFKit.PDFDocument, brand: string): void {
  const { width, height } = doc.page;
  doc.rect(0, 0, width, height).fill(tint(brand, 0.94));
  doc
    .save()
    .lineWidth(4)
    .strokeColor(tint(brand, 0.5))
    .roundedRect(20, 20, width - 40, height - 40, 28)
    .stroke()
    .restore();

  const flags = ['#FF6B6B', '#FFB547', '#2EC4A0', '#3FA9F5', '#7B5CF0', '#F0648C'];
  const count = 16;
  const step = (width - 80) / count;
  doc
    .save()
    .lineWidth(1)
    .strokeColor('#9CA3AF')
    .moveTo(40, 34)
    .lineTo(width - 40, 34)
    .stroke()
    .restore();
  for (let i = 0; i < count; i++) {
    const x = 40 + i * step;
    doc
      .save()
      .moveTo(x + 3, 34)
      .lineTo(x + step - 3, 34)
      .lineTo(x + step / 2, 62)
      .closePath()
      .fill(flags[i % flags.length]!)
      .restore();
  }

  const dots: Array<[number, number, number]> = [
    [60, 120, 5],
    [95, 210, 4],
    [55, 330, 6],
    [100, 460, 5],
    [70, 540, 4],
    [width - 62, 125, 6],
    [width - 98, 220, 4],
    [width - 55, 335, 5],
    [width - 102, 455, 6],
    [width - 70, 540, 4],
  ];
  dots.forEach(([x, y, r], i) => {
    doc.circle(x, y, r).fill(flags[i % flags.length]!);
  });
}

/** A deep frame in the school's colour, a gold rule inside it, and a seal. */
function elegant(doc: PDFKit.PDFDocument, brand: string): void {
  const { width, height } = doc.page;
  const deep = shade(brand, 0.25);
  doc.rect(0, 0, width, height).fill(deep);
  doc.rect(26, 26, width - 52, height - 52).fill('#FFFEFB');
  doc
    .save()
    .lineWidth(1.2)
    .strokeColor(GOLD)
    .rect(36, 36, width - 72, height - 72)
    .stroke()
    .restore();
  doc
    .save()
    .lineWidth(0.6)
    .strokeColor(GOLD)
    .rect(41, 41, width - 82, height - 82)
    .stroke()
    .restore();

  // Corner flourishes: two short gold strokes meeting at each corner.
  for (const [x, y, dx, dy] of [
    [41, 41, 1, 1],
    [width - 41, 41, -1, 1],
    [41, height - 41, 1, -1],
    [width - 41, height - 41, -1, -1],
  ] as const) {
    doc
      .save()
      .lineWidth(2)
      .strokeColor(GOLD)
      .moveTo(x + dx * 34, y + dy * 6)
      .lineTo(x + dx * 6, y + dy * 6)
      .lineTo(x + dx * 6, y + dy * 34)
      .stroke()
      .restore();
  }

  // A gold seal at the bottom centre, just above the date.
  const cx = width / 2;
  const cy = height - 58 - 86 + 12;
  doc.circle(cx, cy, 24).fill(mix(GOLD, WHITE, 0.8));
  doc.save().lineWidth(1.5).strokeColor(GOLD).circle(cx, cy, 24).stroke().restore();
  star(doc, cx, cy, 14, GOLD);
}

function star(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, colour: string): void {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  doc
    .save()
    .polygon(...points)
    .fill(colour)
    .restore();
}

function diamond(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, colour: string): void {
  doc
    .save()
    .polygon([cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy])
    .fill(colour)
    .restore();
}
