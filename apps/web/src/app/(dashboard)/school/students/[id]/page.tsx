import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type {
  ClassroomSummary,
  ParentSummary,
  StudentChange,
  StudentDocumentSummary,
  StudentSummary,
} from '@poetree/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Avatar, Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { TabStrip } from '@/components/ui/tab-strip';
import { IconArrowLeft, IconChart, IconSpark } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { AttachDocumentForm, RemoveDocumentButton, StudentPhotoForm } from './forms';
import { FeePlanCard } from './fee-plan';
import { EditStudent } from './edit-student';
import { FamilyCard } from './family';
import {
  removeStudentAction,
  restoreParentAction,
  restoreStudentAction,
} from '../../removal-actions';
import { RestoreButton } from '../../restore-button';
import { OutcomeToast } from '../../outcome-toast';

const TYPE_LABELS: Record<string, string> = {
  PHOTO: 'Photograph',
  BIRTH_CERTIFICATE: 'Birth certificate',
  ADDRESS_PROOF: 'Address proof',
  MEDICAL: 'Medical',
  TRANSFER_CERTIFICATE: 'Transfer certificate',
  OTHER: 'Other',
};

/** Sizes a parent or an office user can reason about, not raw bytes. */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Months matter at this age — "3y 2m" is the useful answer, not "3". */
function age(dateOfBirth: string): string {
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return '—';

  const now = new Date();
  let months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return '—';

  const years = Math.floor(months / 12);
  const rest = months % 12;
  return years < 1 ? `${rest} month${rest === 1 ? '' : 's'}` : `${years}y ${rest}m`;
}

/** What each recorded field is called on screen. */
const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  avatarUrl: 'Photograph',
  bloodGroup: 'Blood group',
  status: 'Status',
  classroom: 'Class',
  rollNo: 'Roll no.',
  guardians: 'Parents',
  primaryGuardian: 'Main contact',
  guardianRelation: 'Relation',
  addressLine1: 'Address',
  addressLine2: 'Address, second line',
  city: 'City',
  postalCode: 'PIN code',
  emergencyContactName: 'Emergency contact',
  emergencyContactPhone: 'Emergency phone',
  allergies: 'Allergies',
  medicalNotes: 'Medical notes',
  // A correction to the family's request before it was verified.
  studentFirstName: 'First name',
  studentMiddleName: 'Middle name',
  studentLastName: 'Last name',
  studentDateOfBirth: 'Date of birth',
  classLevelId: 'Standard',
  guardianName: 'Parent’s name',
  fatherName: 'Father’s name',
  secondContactRelation: 'Second contact',
  motherName: 'Second contact’s name',
  motherEmail: 'Second contact’s email',
  address: 'Address',
};

const ACTION_LABELS: Record<string, string> = {
  STUDENT_CREATED: 'Added to the roll',
  STUDENT_UPDATED: 'Details changed',
  STUDENT_DELETED: 'Removed from the roll',
  STUDENT_RESTORED: 'Restored to the roll',
  STUDENT_WITHDRAWN: 'Withdrawn',
  STUDENT_DOCUMENT_ATTACHED: 'Document added',
  STUDENT_DOCUMENT_REMOVED: 'Document removed',
  REGISTRATION_UPDATED: 'Registration corrected before verification',
  REGISTRATION_APPROVED: 'Verified — the family’s registration was approved',
};

const when = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

function Detail({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy-950">{value || '—'}</dd>
    </div>
  );
}

const TABS = ['overview', 'fees', 'documents', 'history'] as const;
type Tab = (typeof TABS)[number];

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; done?: string; who?: string; problem?: string }>;
}) {
  const { id } = await params;
  const { tab: asked, ...outcome } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as Tab) : 'overview';

  let student: StudentSummary;
  try {
    student = await apiFetch<StudentSummary>(`/students/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const back = (
    <Link
      href={student.removedAt ? '/school/students?removed=true' : '/school/students'}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy-900"
    >
      <IconArrowLeft size={16} />
      All children
    </Link>
  );

  const toast = (
    <OutcomeToast
      outcome={outcome}
      removed={(name) => `${name} is removed. ${student.fullName} stays, with their other parent.`}
      restored={(name) => `${name} is back on the roll, without a class — place them in one.`}
      messages={{
        added: (name) => `${name} is added. Link a second parent below if there is one.`,
        primary: (name) => `${name} is the main contact now.`,
        unlinked: (name) =>
          `${name} is unlinked from ${student.fullName}. Their account is as it was.`,
        'parent-restored': (name) =>
          `${name} is restored, and ${student.fullName} with them — without a class, so place them in one.`,
      }}
    />
  );

  // Removed: their records are kept but closed, so the page offers the way
  // back and nothing else — through the parent they went with, if they did.
  if (student.removedAt) {
    const parent = student.removedWithParent;
    return (
      <>
        <PageHeader
          eyebrow={back}
          title={student.fullName}
          description={`${student.admissionNo} · removed ${formatDate(student.removedAt)}`}
          action={
            parent ? (
              <RestoreButton
                action={restoreParentAction.bind(null, parent.userId, student.id)}
                name={parent.name}
                label={`Restore with ${parent.name}`}
              />
            ) : (
              <RestoreButton
                action={restoreStudentAction.bind(null, student.id, 'child')}
                name={student.fullName}
              />
            )
          }
        />
        <Notice tone="info" title="Removed from the roll">
          {parent
            ? `Removed with ${parent.name}, their only parent here. Restoring ${parent.name} brings ${student.fullName} back. `
            : 'Restore them to see and change their record. '}
          Attendance, fees and report cards are kept; they come back without a class.
        </Notice>
        {toast}
      </>
    );
  }

  const [classrooms, parents, documents, history] = await Promise.all([
    apiFetch<ClassroomSummary[]>('/classrooms'),
    tab === 'overview'
      ? Promise.all(
          student.guardians.map((guardian) =>
            apiFetch<ParentSummary>(`/parents/${guardian.userId}`),
          ),
        )
      : Promise.resolve([]),
    tab === 'documents'
      ? apiFetch<{ documents: StudentDocumentSummary[] }>(`/students/${id}/documents`).then(
          (body) => body.documents,
        )
      : Promise.resolve([]),
    tab === 'history' ? apiFetch<StudentChange[]>(`/students/${id}/history`) : Promise.resolve([]),
  ]);

  // This year's sections to move between, and the child's own even if it is
  // not one of them, so opening the window never changes their class.
  const sections = classrooms
    .filter(
      (classroom) => classroom.academicYear.isCurrent || classroom.id === student.classroom?.id,
    )
    .map((classroom) => ({
      id: classroom.id,
      label: `${classroom.classLevel.name} — ${classroom.section}`,
    }));

  const address = [
    student.addressLine1,
    student.addressLine2,
    [student.city, student.postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const tabHref = (key: Tab) =>
    key === 'overview'
      ? `/school/students/${student.id}`
      : `/school/students/${student.id}?tab=${key}`;

  return (
    <>
      <PageHeader
        eyebrow={back}
        title={student.fullName}
        description={`${student.admissionNo}${student.classroom ? ` · ${student.classroom.label}` : ' · not in a class'}`}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <EditStudent student={student} classrooms={sections} />
            {/* Opens in a tab rather than downloading: an office looks at a
                card before deciding to print it. */}
            <a
              href={`/school/documents?kind=id-card&id=${student.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
            >
              ID card
            </a>
            {student.classroom && (
              <Link
                href={`/school/progress?classroomId=${student.classroom.id}&studentId=${student.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
              >
                <IconChart size={16} />
                Progress
              </Link>
            )}
            <ConfirmButton
              action={removeStudentAction.bind(null, student.id)}
              label="Remove"
              title={`Remove ${student.fullName}?`}
              body="Withdrawn from their class and hidden from lists and the parent app. Attendance, fees and report cards are kept. Their parents' accounts are not touched. You can restore them."
              confirmLabel="Remove child"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-50"
            />
          </span>
        }
      />

      {toast}

      <TabStrip
        current={tab}
        tabs={[
          { key: 'overview', label: 'Child & family', href: tabHref('overview') },
          { key: 'fees', label: 'Fees', href: tabHref('fees') },
          { key: 'documents', label: 'Documents', href: tabHref('documents') },
          { key: 'history', label: 'History', href: tabHref('history') },
        ]}
      />

      {tab === 'overview' && (
        <>
          {/* Verified stays editable — the school chose that — so the page
              says both: who verified the child, and that changes are logged. */}
          {student.verification && (
            <div className="mb-5">
              <Notice tone="success" title="Verified">
                {student.verification.verifiedBy ?? 'The school'} verified this child on{' '}
                {formatDate(student.verification.verifiedAt)} by approving their family’s
                registration. Their details can still be changed; every change is recorded under
                History, with what it was and what it became.
              </Notice>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-5">
              <Card title="Child">
                <div className="mb-5 flex items-center gap-3">
                  <Avatar name={student.fullName} photoUrl={student.avatarUrl} />
                  <div>
                    <p className="font-medium text-navy-950">{student.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {student.status === 'ACTIVE' ? 'Enrolled' : student.status.toLowerCase()}
                      {student.rollNo && ` · roll ${student.rollNo}`}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-4">
                  <Detail label="Admission no." value={student.admissionNo} />
                  <Detail label="Academic year" value={student.classroom?.academicYear} />
                  <Detail
                    label="Standard"
                    value={student.classroom?.standard ?? 'Not in a class'}
                  />
                  <Detail label="Section" value={student.classroom?.section} />
                  <Detail label="Roll no." value={student.rollNo} />
                  <Detail label="Date of birth" value={formatDate(student.dateOfBirth)} />
                  <Detail label="Age" value={age(student.dateOfBirth)} />
                  <Detail
                    label="Gender"
                    value={student.gender.charAt(0) + student.gender.slice(1).toLowerCase()}
                  />
                  <Detail label="Blood group" value={student.bloodGroup} />
                  <Detail label="Admitted" value={formatDate(student.createdAt)} />
                  <Detail
                    label="Verified"
                    value={
                      student.verification
                        ? formatDate(student.verification.verifiedAt)
                        : 'Added by the office'
                    }
                  />
                  <Detail label="Address" value={address} wide />
                  <Detail label="Emergency contact" value={student.emergencyContactName} />
                  <Detail label="Emergency phone" value={student.emergencyContactPhone} />
                  <Detail label="Allergies" value={student.allergies} wide />
                  <Detail
                    label="Medical notes"
                    wide
                    value={
                      student.medicalNotes && (
                        <span className="whitespace-pre-line">{student.medicalNotes}</span>
                      )
                    }
                  />
                </dl>
              </Card>
            </div>

            {/* The family before the photograph, so a phone reaches it first. */}
            <div className="space-y-5">
              <FamilyCard student={student} parents={parents} />
              <Card title="Photograph">
                <StudentPhotoForm studentId={student.id} />
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'fees' && (
        <div className="max-w-3xl">
          <FeePlanCard studentId={student.id} studentName={student.fullName} />
        </div>
      )}

      {tab === 'documents' && (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
          <Card
            title="Documents"
            description="Certificates and paperwork. Private — only this school and this child’s guardians can open them."
            action={
              <Pill tone="neutral">
                {documents.length} {documents.length === 1 ? 'file' : 'files'}
              </Pill>
            }
          >
            {documents.length === 0 ? (
              <EmptyState
                title="Nothing on file"
                description="Add a birth certificate or address proof."
              />
            ) : (
              <ul className="space-y-2.5">
                {documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-navy-950/[0.06] transition-colors hover:bg-navy-50"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-gold-600">
                          <IconSpark size={14} />
                        </span>
                        {/* Opens through the API, which re-checks entitlement on
                            every request — the URL alone is not a key. */}
                        <a
                          href={document.file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-sm font-medium text-navy-950 hover:text-navy-700"
                        >
                          {document.label || TYPE_LABELS[document.type] || document.type}
                        </a>
                        <Pill tone="neutral">{TYPE_LABELS[document.type] ?? document.type}</Pill>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {document.file.originalName} · {fileSize(document.file.sizeBytes)} ·{' '}
                        {formatDate(document.createdAt)}
                      </p>
                    </div>
                    <RemoveDocumentButton studentId={student.id} documentId={document.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Add a document">
            <AttachDocumentForm studentId={student.id} />
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <div className="max-w-3xl">
          <Card
            title="History"
            description="Who changed this child’s record or their family, when, and from what to what."
          >
            {history.length === 0 ? (
              <EmptyState
                title="Nothing recorded yet"
                description="Changes made from now on are listed here."
              />
            ) : (
              <ol className="space-y-3">
                {history.map((entry) => (
                  <li key={entry.id} className="rounded-xl px-3 py-2.5 ring-1 ring-navy-950/[0.06]">
                    <p className="text-sm font-medium text-navy-950">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="text-xs text-slate-500">
                      {when(entry.at)}
                      {entry.by && <> · {entry.by}</>}
                    </p>
                    {entry.changes.length > 0 && (
                      <dl className="mt-2 space-y-1 text-xs">
                        {entry.changes.map((change) => (
                          <div key={change.field} className="flex flex-wrap gap-x-1.5">
                            <dt className="font-medium text-slate-600">
                              {FIELD_LABELS[change.field] ?? change.field}:
                            </dt>
                            <dd className="text-slate-500">
                              <span className="line-through decoration-slate-300">
                                {change.before ?? 'empty'}
                              </span>{' '}
                              → <span className="text-navy-950">{change.after ?? 'empty'}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
