import { readFile } from 'node:fs/promises';
import { ID_CARD_SIZES, type IdCardSize } from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { storage } from '../lib/storage.js';
import { createDocument, FONT, mm, toBuffer } from '../lib/pdf.js';
import { assertCanReadStudent } from './scope.service.js';

/**
 * The card a child wears on a lanyard.
 *
 * Drawn rather than laid out in a template, because the school chooses the
 * size and a layout is not size-independent: what fits beside a photograph on
 * a credit-card blank does not fit the same way on A6 portrait. Everything
 * below is expressed against the page it is drawn on.
 *
 * What appears is the school's choice too — blood group, guardian's phone and
 * address are each a switch, because a card that goes home in a bag with a
 * four-year-old is not the place for a phone number every school wants printed.
 */

const CARD_INK = '#1A1D29';
const CARD_MUTED = '#6B7280';

/** PDFKit embeds JPEG and PNG. Anything else has to be left out. */
const EMBEDDABLE = new Set(['image/jpeg', 'image/png']);

interface CardData {
  school: {
    name: string;
    addressLine: string | null;
    primaryColor: string;
    logo: Buffer | null;
    size: IdCardSize;
    showBloodGroup: boolean;
    showGuardianPhone: boolean;
    showAddress: boolean;
  };
  student: {
    name: string;
    admissionNo: string;
    classroom: string | null;
    bloodGroup: string | null;
    address: string | null;
    photo: Buffer | null;
    guardianName: string | null;
    guardianPhone: string | null;
  };
}

/**
 * The bytes of an uploaded image, or null for every reason it might not work.
 *
 * Null rather than throwing, in all of: no file, a soft-deleted one, a format
 * PDFKit cannot embed, or bytes that have gone missing from disk. A card with
 * initials where a photograph should be is a card; an exception is a school
 * that cannot print anything today.
 *
 * The WebP case is real rather than theoretical — the upload route accepts
 * WebP, and PDFKit cannot embed it.
 */
async function imageBytes(fileId: string | null): Promise<Buffer | null> {
  if (!fileId) return null;

  const file = await prisma.fileObject.findFirst({
    where: { id: fileId, deletedAt: null },
    select: { storageKey: true, mimeType: true },
  });
  if (!file || !EMBEDDABLE.has(file.mimeType)) return null;

  try {
    return await readFile(storage.locate(file.storageKey));
  } catch {
    return null;
  }
}

async function gather(studentId: string): Promise<CardData> {
  await assertCanReadStudent(studentId);

  const school = await prisma.school.findUniqueOrThrow({
    where: { id: requireSchoolId() },
    select: {
      name: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      primaryColor: true,
      logoFileId: true,
      idCardSize: true,
      idCardShowBloodGroup: true,
      idCardShowGuardianPhone: true,
      idCardShowAddress: true,
    },
  });

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: {
      firstName: true,
      lastName: true,
      admissionNo: true,
      bloodGroup: true,
      addressLine1: true,
      city: true,
      photoFileId: true,
      enrolments: {
        where: { status: 'ACTIVE' },
        orderBy: { enrolledOn: 'desc' },
        take: 1,
        select: {
          classroom: { select: { section: true, classLevel: { select: { name: true } } } },
        },
      },
      guardians: {
        orderBy: { isPrimary: 'desc' },
        take: 1,
        select: {
          parentProfile: { select: { user: { select: { name: true, phone: true } } } },
        },
      },
    },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const [logo, photo] = await Promise.all([
    imageBytes(school.logoFileId),
    imageBytes(student.photoFileId),
  ]);

  const guardian = student.guardians[0]?.parentProfile.user;
  const classroom = student.enrolments[0]?.classroom;

  return {
    school: {
      name: school.name,
      addressLine:
        [school.addressLine1, school.city, school.state, school.postalCode]
          .filter(Boolean)
          .join(', ') || null,
      primaryColor: school.primaryColor ?? '#16307C',
      logo,
      size: school.idCardSize,
      showBloodGroup: school.idCardShowBloodGroup,
      showGuardianPhone: school.idCardShowGuardianPhone,
      showAddress: school.idCardShowAddress,
    },
    student: {
      name: [student.firstName, student.lastName].filter(Boolean).join(' '),
      admissionNo: student.admissionNo,
      classroom: classroom ? `${classroom.classLevel.name} — ${classroom.section}` : null,
      bloodGroup: student.bloodGroup,
      address: [student.addressLine1, student.city].filter(Boolean).join(', ') || null,
      photo,
      guardianName: guardian?.name ?? null,
      guardianPhone: guardian?.phone ?? null,
    },
  };
}

/** Two letters, for a child with no photograph on file. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * One card onto the current page.
 *
 * Split out so a class's worth can be produced by calling it once per page,
 * which is how a school actually issues them — eighty at the start of a year,
 * not one at a time.
 */
function drawCard(doc: PDFKit.PDFDocument, data: CardData): void {
  const { school, student } = data;
  const width = doc.page.width;
  const height = doc.page.height;
  const pad = mm(4);

  // A band of the school's colour, with its name reversed out. It is also what
  // makes the card recognisable across a playground at a distance.
  const bandHeight = Math.max(mm(9), height * 0.16);
  doc.rect(0, 0, width, bandHeight).fill(school.primaryColor);

  let logoWidth = 0;
  if (school.logo) {
    const box = bandHeight - mm(2.5);
    try {
      // Left is where it lands without asking, and 'left' is not a value the
      // image options accept.
      doc.image(school.logo, pad, mm(1.25), { fit: [box, box] });
      logoWidth = box + mm(2);
    } catch {
      // A corrupt or unreadable image must not cost the school its cards.
      logoWidth = 0;
    }
  }

  doc
    .font(FONT.bold)
    .fontSize(bandHeight * 0.34)
    .fillColor('#FFFFFF')
    .text(school.name, pad + logoWidth, bandHeight * 0.3, {
      width: width - pad * 2 - logoWidth,
      lineBreak: false,
      ellipsis: true,
    });

  // Portrait cards put the photograph above the details; landscape puts it
  // beside them. The same fields either way — only the room differs.
  const portrait = height > width;
  const photoSize = portrait ? Math.min(width * 0.42, mm(32)) : height - bandHeight - pad * 2;
  const photoX = portrait ? (width - photoSize) / 2 : pad;
  const photoY = bandHeight + pad;

  if (student.photo) {
    try {
      doc.image(student.photo, photoX, photoY, {
        fit: [photoSize, photoSize],
        align: 'center',
        valign: 'center',
      });
    } catch {
      drawInitials(doc, student.name, photoX, photoY, photoSize, school.primaryColor);
    }
  } else {
    drawInitials(doc, student.name, photoX, photoY, photoSize, school.primaryColor);
  }

  const textX = portrait ? pad : photoX + photoSize + mm(3);
  const textY = portrait ? photoY + photoSize + mm(3) : photoY;
  const textWidth = portrait ? width - pad * 2 : width - textX - pad;

  doc.fillColor(CARD_INK).font(FONT.bold).fontSize(portrait ? 13 : 11);
  doc.text(student.name, textX, textY, { width: textWidth, ellipsis: true, lineBreak: false });

  const lines: Array<[string, string]> = [];
  if (student.classroom) lines.push(['Class', student.classroom]);
  lines.push(['Admission no.', student.admissionNo]);
  if (school.showBloodGroup && student.bloodGroup) {
    lines.push(['Blood group', student.bloodGroup]);
  }
  if (school.showGuardianPhone && student.guardianPhone) {
    lines.push([student.guardianName ?? 'Guardian', student.guardianPhone]);
  }
  if (school.showAddress && student.address) lines.push(['Address', student.address]);

  let y = doc.y + mm(1.5);
  for (const [label, value] of lines) {
    doc.font(FONT.regular).fontSize(6).fillColor(CARD_MUTED);
    doc.text(label.toUpperCase(), textX, y, { width: textWidth, lineBreak: false });

    doc.font(FONT.bold).fontSize(portrait ? 9 : 8).fillColor(CARD_INK);
    doc.text(value, textX, y + mm(2.2), { width: textWidth, ellipsis: true, lineBreak: false });

    y += mm(6.2);
  }
}

function drawInitials(
  doc: PDFKit.PDFDocument,
  name: string,
  x: number,
  y: number,
  size: number,
  colour: string,
): void {
  doc.roundedRect(x, y, size, size, mm(2)).fill('#EFEDE9');
  doc
    .font(FONT.bold)
    .fontSize(size * 0.36)
    .fillColor(colour)
    .text(initials(name), x, y + size * 0.3, { width: size, align: 'center' });
}

function pageFor(size: IdCardSize): { size: [number, number]; margin: number } {
  const { widthMm, heightMm } = ID_CARD_SIZES[size];
  return { size: [mm(widthMm), mm(heightMm)], margin: 0 };
}

/** One child's card. */
export async function studentIdCard(studentId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const data = await gather(studentId);
  const doc = createDocument(`ID card — ${data.student.admissionNo}`, pageFor(data.school.size));

  drawCard(doc, data);

  return {
    buffer: await toBuffer(doc),
    filename: `id-card-${data.student.admissionNo}.pdf`,
  };
}

/**
 * Every child in a class, one card per page.
 *
 * A school issues these in one go at the start of a year. One request per child
 * would be eighty downloads and eighty chances to miss one.
 */
export async function classroomIdCards(classroomId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId },
    select: {
      section: true,
      classLevel: { select: { name: true } },
      enrolments: {
        where: { status: 'ACTIVE' },
        select: { student: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!classroom) throw ApiError.notFound('Classroom not found');

  const children = classroom.enrolments
    .map((enrolment) => enrolment.student)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  if (children.length === 0) {
    throw ApiError.badRequest('There are no children in this class yet.');
  }

  const first = await gather(children[0]!.id);
  const page = pageFor(first.school.size);
  const doc = createDocument(
    `ID cards — ${classroom.classLevel.name} ${classroom.section}`,
    page,
  );

  drawCard(doc, first);
  for (const child of children.slice(1)) {
    doc.addPage({ size: page.size, margin: page.margin });
    drawCard(doc, await gather(child.id));
  }

  return {
    buffer: await toBuffer(doc),
    filename: `id-cards-${classroom.classLevel.name}-${classroom.section}.pdf`
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-'),
  };
}

/** The same card as data, for the app to draw on a phone. */
export async function studentIdCardData(studentId: string): Promise<{
  schoolName: string;
  schoolLogoUrl: string | null;
  primaryColor: string;
  name: string;
  admissionNo: string;
  classroom: string | null;
  photoUrl: string | null;
  bloodGroup: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  address: string | null;
}> {
  await assertCanReadStudent(studentId);

  const school = await prisma.school.findUniqueOrThrow({
    where: { id: requireSchoolId() },
    select: {
      name: true,
      primaryColor: true,
      logoFileId: true,
      idCardShowBloodGroup: true,
      idCardShowGuardianPhone: true,
      idCardShowAddress: true,
    },
  });

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: {
      firstName: true,
      lastName: true,
      admissionNo: true,
      bloodGroup: true,
      addressLine1: true,
      city: true,
      photoFileId: true,
      enrolments: {
        where: { status: 'ACTIVE' },
        orderBy: { enrolledOn: 'desc' },
        take: 1,
        select: {
          classroom: { select: { section: true, classLevel: { select: { name: true } } } },
        },
      },
      guardians: {
        orderBy: { isPrimary: 'desc' },
        take: 1,
        select: {
          parentProfile: { select: { user: { select: { name: true, phone: true } } } },
        },
      },
    },
  });
  if (!student) throw ApiError.notFound('Student not found');

  const guardian = student.guardians[0]?.parentProfile.user;
  const classroom = student.enrolments[0]?.classroom;

  return {
    schoolName: school.name,
    schoolLogoUrl: school.logoFileId ? `/api/v1/files/${school.logoFileId}` : null,
    primaryColor: school.primaryColor ?? '#16307C',
    name: [student.firstName, student.lastName].filter(Boolean).join(' '),
    admissionNo: student.admissionNo,
    classroom: classroom ? `${classroom.classLevel.name} — ${classroom.section}` : null,
    photoUrl: student.photoFileId ? `/api/v1/files/${student.photoFileId}` : null,
    // The school's switches decide what the phone shows too, or the card in a
    // pocket would say less than the card on a screen.
    bloodGroup: school.idCardShowBloodGroup ? student.bloodGroup : null,
    guardianName: school.idCardShowGuardianPhone ? (guardian?.name ?? null) : null,
    guardianPhone: school.idCardShowGuardianPhone ? (guardian?.phone ?? null) : null,
    address: school.idCardShowAddress
      ? [student.addressLine1, student.city].filter(Boolean).join(', ') || null
      : null,
  };
}
