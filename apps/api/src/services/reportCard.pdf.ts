import type { ReportCardView } from '@poetree/shared';
import { FONT, longDate } from '../lib/pdf.js';
import {
  drawLogo,
  fitSize,
  inkOn,
  INK,
  MUTED,
  shade,
  tint,
  tryImage,
  WHITE,
} from '../lib/pdfArt.js';
import type { SchoolBranding } from './printAssets.service.js';

/**
 * A term report card on A4, portrait.
 *
 * The school's band across the top, the child, then each heading's lines with
 * the grade in a pill, the key to the grades, the teacher's remarks and the
 * two signatures. Written for a parent reading it at the kitchen table: large
 * enough to read, nothing that needs explaining.
 */

const PAGE = { width: 595.28, height: 841.89 };
const SIDE = 40;

export interface ReportCardArt {
  view: ReportCardView;
  school: SchoolBranding;
  classTeacherSignature: Buffer | null;
}

export function drawReportCard(doc: PDFKit.PDFDocument, art: ReportCardArt): void {
  const { view, school } = art;
  const brand = school.primaryColor;
  const width = PAGE.width - SIDE * 2;
  const bottom = PAGE.height - 150;

  // --- The school's band -------------------------------------------------------
  doc.rect(0, 0, PAGE.width, 104).fill(brand);
  const onBrand = inkOn(brand);
  let textLeft = SIDE;
  if (school.logo) {
    doc.circle(SIDE + 30, 52, 30).fill(WHITE);
    if (drawLogo(doc, school.logo, SIDE + 6, 28, 48, 'center')) textLeft = SIDE + 74;
  }
  const nameWidth = PAGE.width - textLeft - 190;
  doc
    .font(FONT.bold)
    .fontSize(fitSize(doc, school.name, FONT.bold, 18, 11, nameWidth))
    .fillColor(onBrand)
    .text(school.name, textLeft, 32, { width: nameWidth, height: 26, ellipsis: true });
  if (school.addressLine) {
    doc
      .font(FONT.regular)
      .fontSize(8.5)
      .fillColor(onBrand)
      .text(school.addressLine, textLeft, 58, { width: nameWidth, height: 24, ellipsis: true });
  }
  doc
    .font(FONT.bold)
    .fontSize(15)
    .fillColor(onBrand)
    .text('REPORT CARD', PAGE.width - SIDE - 170, 34, {
      width: 170,
      align: 'right',
      characterSpacing: 1.5,
    });
  doc
    .font(FONT.regular)
    .fontSize(10)
    .fillColor(onBrand)
    .text(`${view.term}  ·  ${view.academicYear}`, PAGE.width - SIDE - 170, 56, {
      width: 170,
      align: 'right',
    });

  // --- The child ---------------------------------------------------------------
  let y = 124;
  doc.roundedRect(SIDE, y, width, 74, 10).fill(tint(brand, 0.92));
  doc
    .font(FONT.bold)
    .fontSize(fitSize(doc, view.student.fullName, FONT.bold, 17, 11, width - 24))
    .fillColor(INK)
    .text(view.student.fullName, SIDE + 14, y + 11, { width: width - 28 });

  const facts: Array<[string, string]> = [
    ['Class', view.classroom],
    ['Roll no.', view.student.rollNo ?? '—'],
    ['Admission no.', view.student.admissionNo],
    ['Date of birth', longDate(new Date(view.student.dateOfBirth))],
  ];
  const factWidth = (width - 28) / facts.length;
  facts.forEach(([label, value], i) => {
    const x = SIDE + 14 + i * factWidth;
    doc
      .font(FONT.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), x, y + 40, {
        width: factWidth - 6,
        characterSpacing: 0.5,
      });
    doc
      .font(FONT.bold)
      .fontSize(10)
      .fillColor(INK)
      .text(value, x, y + 51, {
        width: factWidth - 6,
        height: 14,
        ellipsis: true,
      });
  });
  y += 92;

  // --- The grades --------------------------------------------------------------
  const pillWidth = 130;
  for (const group of view.groups) {
    if (y > bottom - 60) {
      doc.addPage({ size: 'A4', margin: 0 });
      y = SIDE;
    }
    doc.roundedRect(SIDE, y, width, 22, 6).fill(shade(brand, 0.05));
    doc
      .font(FONT.bold)
      .fontSize(10)
      .fillColor(inkOn(shade(brand, 0.05)))
      .text(group.group.toUpperCase(), SIDE + 12, y + 6, {
        width: width - 24,
        characterSpacing: 1,
      });
    y += 26;

    group.rows.forEach((row, index) => {
      if (y > bottom - 24) {
        doc.addPage({ size: 'A4', margin: 0 });
        y = SIDE;
      }
      if (index % 2 === 1) doc.rect(SIDE, y, width, 22).fill('#F7F6F3');
      doc
        .font(FONT.regular)
        .fontSize(10)
        .fillColor(INK)
        .text(row.area, SIDE + 12, y + 6, {
          width: width - pillWidth - 30,
          height: 14,
          ellipsis: true,
        });
      const pillX = SIDE + width - pillWidth - 8;
      if (row.grade) {
        doc.roundedRect(pillX, y + 3, pillWidth, 16, 8).fill(tint(brand, 0.82));
        doc
          .font(FONT.bold)
          .fontSize(9)
          .fillColor(shade(brand, 0.35))
          .text(row.grade, pillX, y + 6.5, { width: pillWidth, align: 'center' });
      } else {
        doc
          .font(FONT.regular)
          .fontSize(9)
          .fillColor(MUTED)
          .text('—', pillX, y + 6, {
            width: pillWidth,
            align: 'center',
          });
      }
      y += 22;
    });
    y += 10;
  }

  // --- What the grades mean ----------------------------------------------------
  if (view.scale.length > 0) {
    if (y > bottom - 40) {
      doc.addPage({ size: 'A4', margin: 0 });
      y = SIDE;
    }
    const key = view.scale
      .map((level) => (level.description ? `${level.label} — ${level.description}` : level.label))
      .join('     ');
    doc.font(FONT.regular).fontSize(8).fillColor(MUTED).text(key, SIDE, y, { width });
    y = doc.y + 12;
  }

  // --- Remarks -----------------------------------------------------------------
  if (view.remarks) {
    doc.font(FONT.regular).fontSize(10);
    const textHeight = doc.heightOfString(view.remarks, { width: width - 28 });
    const boxHeight = Math.min(textHeight + 36, 160);
    if (y + boxHeight > bottom) {
      doc.addPage({ size: 'A4', margin: 0 });
      y = SIDE;
    }
    doc
      .save()
      .roundedRect(SIDE, y, width, boxHeight, 10)
      .lineWidth(1)
      .strokeColor(tint(brand, 0.6))
      .stroke()
      .restore();
    doc
      .font(FONT.bold)
      .fontSize(8)
      .fillColor(MUTED)
      .text("TEACHER'S REMARKS", SIDE + 14, y + 10, { characterSpacing: 0.8 });
    doc
      .font(FONT.regular)
      .fontSize(10)
      .fillColor(INK)
      .text(view.remarks, SIDE + 14, y + 24, {
        width: width - 28,
        height: boxHeight - 30,
        ellipsis: true,
      });
  }

  // --- Signatures --------------------------------------------------------------
  const signY = PAGE.height - 120;
  sign(doc, art.classTeacherSignature, view.classTeacher, 'Class teacher', SIDE, signY);
  sign(doc, school.principalSignature, view.principal, 'Principal', PAGE.width - SIDE - 180, signY);

  if (view.publishedAt) {
    doc
      .font(FONT.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(`Issued ${longDate(new Date(view.publishedAt))}`, SIDE, PAGE.height - 34, {
        width,
        align: 'center',
      });
  }
}

function sign(
  doc: PDFKit.PDFDocument,
  image: Buffer | null,
  name: string | null,
  role: string,
  x: number,
  y: number,
): void {
  const width = 180;
  if (image) {
    tryImage(() =>
      doc.image(image, x + 20, y, { fit: [width - 40, 40], align: 'center', valign: 'bottom' }),
    );
  }
  doc
    .save()
    .moveTo(x, y + 46)
    .lineTo(x + width, y + 46)
    .lineWidth(0.8)
    .strokeColor('#9CA3AF')
    .stroke()
    .restore();
  if (name) {
    doc
      .font(FONT.bold)
      .fontSize(10)
      .fillColor(INK)
      .text(name, x, y + 50, {
        width,
        align: 'center',
        height: 14,
        ellipsis: true,
      });
  }
  doc
    .font(FONT.regular)
    .fontSize(8)
    .fillColor(MUTED)
    .text(role, x, y + (name ? 64 : 50), {
      width,
      align: 'center',
    });
}
