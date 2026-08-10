import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { StudentDocumentSummary, StudentSummary } from '@poetree/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { Avatar, Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { IconArrowLeft, IconChart, IconSpark } from '@/components/icons';
import { formatDate } from '@/lib/format';
import { AttachDocumentForm, RemoveDocumentButton } from './forms';

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

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-navy-950">{value || '—'}</dd>
    </div>
  );
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let student: StudentSummary;
  try {
    student = await apiFetch<StudentSummary>(`/students/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const { documents } = await apiFetch<{ documents: StudentDocumentSummary[] }>(
    `/students/${id}/documents`,
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href="/school/students"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy-900"
          >
            <IconArrowLeft size={16} />
            All children
          </Link>
        }
        title={student.fullName}
        description={`${student.admissionNo}${student.classroom ? ` · ${student.classroom.label}` : ' · not enrolled in a class'}`}
        action={
          student.classroom && (
            <Link
              href={`/school/progress?classroomId=${student.classroom.id}&studentId=${student.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 transition-colors hover:bg-navy-50"
            >
              <IconChart size={16} />
              Progress
            </Link>
          )
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          <Card title="Profile">
            <div className="mb-5 flex items-center gap-3">
              <Avatar name={student.fullName} />
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
              <Detail label="Class" value={student.classroom?.label} />
              <Detail label="Date of birth" value={formatDate(student.dateOfBirth)} />
              <Detail label="Age" value={age(student.dateOfBirth)} />
              <Detail
                label="Gender"
                value={student.gender.charAt(0) + student.gender.slice(1).toLowerCase()}
              />
              <Detail label="Blood group" value={student.bloodGroup} />
              <Detail label="Admitted" value={formatDate(student.createdAt)} />
            </dl>
          </Card>

          <Card title="Guardians" description="Who we contact, and who may collect.">
            {student.guardians.length === 0 ? (
              <EmptyState
                title="No guardian linked"
                description="A child with no guardian cannot be reached by any notification."
              />
            ) : (
              <ul className="space-y-2.5">
                {student.guardians.map((guardian) => (
                  <li
                    key={guardian.parentProfileId}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-navy-950/[0.06]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={guardian.name} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-navy-950">{guardian.name}</p>
                        <p className="text-xs text-slate-500">
                          {guardian.relation.charAt(0) + guardian.relation.slice(1).toLowerCase()}
                          {guardian.phone && ` · ${guardian.phone}`}
                        </p>
                      </div>
                    </div>
                    {guardian.isPrimary && <Pill tone="brand">Primary</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
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
                description="Add a birth certificate or address proof below."
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
      </div>
    </>
  );
}
