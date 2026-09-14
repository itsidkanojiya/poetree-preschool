import { readFile } from 'node:fs/promises';
import { ID_CARD_SIZES, type IdCardLayout, type IdCardSize } from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { storage } from '../lib/storage.js';
import { createDocument, mm, toBuffer } from '../lib/pdf.js';
import { assertCanReadStudent } from './scope.service.js';
import { SIDES, type CardData } from './idCardLayouts.js';

/**
 * The card a child wears on a lanyard.
 *
 * The school chooses the size and the layout; the artwork for each layout lives
 * in idCardLayouts.ts and is drawn against whatever page it lands on.
 *
 * What appears is the school's choice too — blood group, guardian's phone,
 * address and birth date are each a switch, because a card that goes home in a
 * bag with a four-year-old is not the place for everything a school holds. The
 * switches are applied once, here, so neither a layout nor the phone can print
 * a field the office turned off.
 */

/** PDFKit embeds JPEG and PNG. Anything else has to be left out. */
const EMBEDDABLE = new Set(['image/jpeg', 'image/png']);

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

/** dd/mm/yyyy, as every form a parent in India has filled in writes it. */
function printedDate(value: Date): string {
  return value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Everything a card can show, with the school's switches already applied, plus
 * the ids of the two pictures — which the PDF reads as bytes and the phone
 * fetches by URL.
 */
async function load(studentId: string): Promise<{
  size: IdCardSize;
  layout: IdCardLayout;
  logoFileId: string | null;
  photoFileId: string | null;
  school: Omit<CardData['school'], 'logo'>;
  student: Omit<CardData['student'], 'photo'>;
}> {
  await assertCanReadStudent(studentId);

  const school = await prisma.school.findUniqueOrThrow({
    where: { id: requireSchoolId() },
    select: {
      name: true,
      phone: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      primaryColor: true,
      logoFileId: true,
      idCardSize: true,
      idCardLayout: true,
      idCardShowBloodGroup: true,
      idCardShowGuardianPhone: true,
      idCardShowAddress: true,
      idCardShowDateOfBirth: true,
    },
  });

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: {
      firstName: true,
      lastName: true,
      admissionNo: true,
      dateOfBirth: true,
      bloodGroup: true,
      addressLine1: true,
      city: true,
      photoFileId: true,
      enrolments: {
        where: { status: 'ACTIVE' },
        orderBy: { enrolledOn: 'desc' },
        take: 1,
        select: {
          classroom: {
            select: {
              section: true,
              classLevel: { select: { name: true } },
              academicYear: { select: { name: true } },
            },
          },
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
  const address = [student.addressLine1, student.city].filter(Boolean).join(', ') || null;

  return {
    size: school.idCardSize,
    layout: school.idCardLayout,
    logoFileId: school.logoFileId,
    photoFileId: student.photoFileId,
    school: {
      name: school.name,
      addressLine:
        [school.addressLine1, school.city, school.state, school.postalCode]
          .filter(Boolean)
          .join(', ') || null,
      phone: school.phone,
      primaryColor: school.primaryColor ?? '#16307C',
    },
    student: {
      name: [student.firstName, student.lastName].filter(Boolean).join(' '),
      admissionNo: student.admissionNo,
      classroom: classroom ? `${classroom.classLevel.name} — ${classroom.section}` : null,
      batch: classroom?.academicYear.name ?? null,
      dateOfBirth: school.idCardShowDateOfBirth ? printedDate(student.dateOfBirth) : null,
      bloodGroup: school.idCardShowBloodGroup ? student.bloodGroup : null,
      address: school.idCardShowAddress ? address : null,
      guardianName: school.idCardShowGuardianPhone ? (guardian?.name ?? null) : null,
      guardianPhone: school.idCardShowGuardianPhone ? (guardian?.phone ?? null) : null,
    },
  };
}

async function gather(
  studentId: string,
): Promise<{ size: IdCardSize; layout: IdCardLayout; card: CardData }> {
  const loaded = await load(studentId);

  const [logo, photo] = await Promise.all([
    imageBytes(loaded.logoFileId),
    imageBytes(loaded.photoFileId),
  ]);

  return {
    size: loaded.size,
    layout: loaded.layout,
    card: {
      school: { ...loaded.school, logo },
      student: { ...loaded.student, photo },
    },
  };
}

function pageFor(size: IdCardSize): { size: [number, number]; margin: number } {
  const { widthMm, heightMm } = ID_CARD_SIZES[size];
  return { size: [mm(widthMm), mm(heightMm)], margin: 0 };
}

/**
 * Every side of one child's card, each on its own page.
 *
 * The document is created with its first page already open, so the very first
 * side of the file draws onto that and everything after it asks for a page.
 */
function drawChild(
  doc: PDFKit.PDFDocument,
  page: ReturnType<typeof pageFor>,
  layout: IdCardLayout,
  card: CardData,
  isFirstInFile: boolean,
): void {
  SIDES[layout].forEach((side, index) => {
    if (!(isFirstInFile && index === 0)) doc.addPage({ size: page.size, margin: page.margin });
    side(doc, card);
  });
}

/** One child's card. */
export async function studentIdCard(studentId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const { size, layout, card } = await gather(studentId);
  const page = pageFor(size);
  const doc = createDocument(`ID card — ${card.student.admissionNo}`, page);

  drawChild(doc, page, layout, card, true);

  return {
    buffer: await toBuffer(doc),
    filename: `id-card-${card.student.admissionNo}.pdf`,
  };
}

/**
 * Every child in a class, one card per page — or front then back, for a
 * two-sided layout, so the file prints duplex in one go.
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
  const page = pageFor(first.size);
  const doc = createDocument(
    `ID cards — ${classroom.classLevel.name} ${classroom.section}`,
    page,
  );

  drawChild(doc, page, first.layout, first.card, true);
  for (const child of children.slice(1)) {
    // The layout and size from the first child, so one file cannot come out
    // half in one design if the office saves settings while it renders.
    const { card } = await gather(child.id);
    drawChild(doc, page, first.layout, card, false);
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
  layout: IdCardLayout;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
  primaryColor: string;
  name: string;
  admissionNo: string;
  classroom: string | null;
  batch: string | null;
  dateOfBirth: string | null;
  photoUrl: string | null;
  bloodGroup: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  address: string | null;
}> {
  // The switches are already applied by load(), so the phone cannot say more
  // than the card in the child's pocket.
  const { layout, logoFileId, photoFileId, school, student } = await load(studentId);

  return {
    layout,
    schoolName: school.name,
    schoolLogoUrl: logoFileId ? `/api/v1/files/${logoFileId}` : null,
    schoolAddress: school.addressLine,
    schoolPhone: school.phone,
    primaryColor: school.primaryColor,
    name: student.name,
    admissionNo: student.admissionNo,
    classroom: student.classroom,
    batch: student.batch,
    dateOfBirth: student.dateOfBirth,
    photoUrl: photoFileId ? `/api/v1/files/${photoFileId}` : null,
    bloodGroup: student.bloodGroup,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
    address: student.address,
  };
}
