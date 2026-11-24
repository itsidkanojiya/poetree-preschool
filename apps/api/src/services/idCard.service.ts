import {
  ID_CARD_SIZES,
  type IdCardLayout,
  type IdCardOrientation,
  type IdCardSize,
} from '@poetree/shared';
import { prisma } from '../db/prisma.js';
import { requireSchoolId } from '../context/requestContext.js';
import { ApiError } from '../lib/apiError.js';
import { createDocument, mm, toBuffer } from '../lib/pdf.js';
import { assertCanReadStudent } from './scope.service.js';
import { imageBytes } from './printAssets.service.js';
import { SIDES, type CardData } from './idCardLayouts.js';
import { studentName } from '../lib/names.js';

/**
 * The card a child wears on a lanyard.
 *
 * The school chooses the size and the layout; the artwork for each layout lives
 * in idCardLayouts.ts and is drawn against whatever page it lands on.
 *
 * Name, grade, address, mobile, birth date and batch are on every card; the
 * admission number, GR number and blood group are the school's to tick. The
 * ticks are applied once, here, so neither a layout nor the phone can print a
 * field the office left off. Vertical or horizontal stands the chosen size
 * upright or on its side.
 */

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
  orientation: IdCardOrientation;
  layout: IdCardLayout;
  fileKey: string;
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
      idCardOrientation: true,
      idCardShowAdmissionNo: true,
      idCardShowGrNo: true,
    },
  });

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: {
      firstName: true,
      middleName: true,
      lastName: true,
      admissionNo: true,
      grNo: true,
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
    orientation: school.idCardOrientation,
    layout: school.idCardLayout,
    /** For the file's name, whether or not the card prints it. */
    fileKey: student.admissionNo,
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
      name: studentName(student),
      // Name, grade, address, mobile, birth date and batch are on every card;
      // the admission number, GR number and blood group when ticked.
      admissionNo: school.idCardShowAdmissionNo ? student.admissionNo : null,
      grNo: school.idCardShowGrNo ? student.grNo : null,
      classroom: classroom ? `${classroom.classLevel.name} ${classroom.section}` : null,
      batch: classroom?.academicYear.name ?? null,
      dateOfBirth: printedDate(student.dateOfBirth),
      bloodGroup: school.idCardShowBloodGroup ? student.bloodGroup : null,
      address,
      guardianName: guardian?.name ?? null,
      guardianPhone: guardian?.phone ?? null,
    },
  };
}

async function gather(studentId: string): Promise<{
  size: IdCardSize;
  orientation: IdCardOrientation;
  layout: IdCardLayout;
  fileKey: string;
  card: CardData;
}> {
  const loaded = await load(studentId);

  const [logo, photo] = await Promise.all([
    imageBytes(loaded.logoFileId),
    imageBytes(loaded.photoFileId),
  ]);

  return {
    size: loaded.size,
    orientation: loaded.orientation,
    layout: loaded.layout,
    fileKey: loaded.fileKey,
    card: {
      school: { ...loaded.school, logo },
      student: { ...loaded.student, photo },
    },
  };
}

/**
 * The page: the chosen size, stood upright or laid on its side. A6 is half A5
 * by another name, so it turns the same way.
 */
function pageFor(
  size: IdCardSize,
  orientation: IdCardOrientation,
): { size: [number, number]; margin: number } {
  const { widthMm, heightMm } = ID_CARD_SIZES[size];
  const long = mm(Math.max(widthMm, heightMm));
  const short = mm(Math.min(widthMm, heightMm));
  return { size: orientation === 'VERTICAL' ? [short, long] : [long, short], margin: 0 };
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
  const { size, orientation, layout, fileKey, card } = await gather(studentId);
  const page = pageFor(size, orientation);
  const doc = createDocument(`ID card — ${fileKey}`, page);

  drawChild(doc, page, layout, card, true);

  return {
    buffer: await toBuffer(doc),
    filename: `id-card-${fileKey}.pdf`,
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
        select: {
          student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        },
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
  const page = pageFor(first.size, first.orientation);
  const doc = createDocument(`ID cards — ${classroom.classLevel.name} ${classroom.section}`, page);

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
  orientation: IdCardOrientation;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolAddress: string | null;
  schoolPhone: string | null;
  primaryColor: string;
  name: string;
  admissionNo: string | null;
  grNo: string | null;
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
  const { layout, orientation, logoFileId, photoFileId, school, student } = await load(studentId);

  return {
    layout,
    orientation,
    schoolName: school.name,
    schoolLogoUrl: logoFileId ? `/api/v1/files/${logoFileId}` : null,
    schoolAddress: school.addressLine,
    schoolPhone: school.phone,
    primaryColor: school.primaryColor,
    name: student.name,
    admissionNo: student.admissionNo,
    grNo: student.grNo,
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
