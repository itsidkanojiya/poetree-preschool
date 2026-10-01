import Link from 'next/link';
import { notFound } from 'next/navigation';
import type {
  CertificateDetail,
  ClassroomSummary,
  Paginated,
  SchoolProfile,
  StudentSummary,
} from '@poetree/shared';
import { CERTIFICATE_DESIGN_LABELS } from '@poetree/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Card, EmptyState, Notice, PageHeader, Pill } from '@/components/ui/layout';
import { Table, TCell, THead, TPrimary, TRow } from '@/components/ui/table';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { IconArrowLeft } from '@/components/icons';
import { CertificateThumb } from '@/components/certificates/thumb';
import { StepButton } from '@/components/results/step-button';
import { deleteCertificateAction, issueCertificateAction, revokeAwardAction } from '../actions';
import { CertificateForm, RecipientsForm } from '../forms';

const LINK =
  'rounded-xl px-4 py-2.5 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50';

const label = (classroom: ClassroomSummary) =>
  `${classroom.classLevel.name} — ${classroom.section}`;

export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const { id } = await params;
  const { classroomId } = await searchParams;

  let certificate: CertificateDetail;
  try {
    certificate = await apiFetch<CertificateDetail>(`/certificates/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const school = await apiFetch<SchoolProfile>('/school/profile');
  const brand = school.primaryColor ?? '#16307C';

  const back = (
    <Link
      href="/school/certificates"
      className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-900"
    >
      <IconArrowLeft size={15} /> Certificates
    </Link>
  );

  if (certificate.status === 'ISSUED') {
    const live = certificate.recipients.filter((r) => !r.revokedAt);
    return (
      <>
        <PageHeader
          eyebrow={back}
          title={certificate.title}
          description={`${CERTIFICATE_DESIGN_LABELS[certificate.design]} · dated ${formatDate(certificate.issuedOn)} · issued ${formatDate(certificate.issuedAt)}`}
          action={
            live.length > 0 ? (
              <a
                href={`/school/documents?kind=certificate&id=${certificate.id}`}
                target="_blank"
                rel="noreferrer"
                className={LINK}
              >
                Print all ({live.length})
              </a>
            ) : undefined
          }
        />

        <Card>
          <Table>
            <THead
              columns={['Number', 'Child', 'Class', 'Status', { label: 'Actions', hidden: true }]}
            />
            <tbody>
              {certificate.recipients.map((recipient) => (
                <TRow key={recipient.awardId}>
                  <TCell className="font-mono text-xs">{recipient.number ?? '—'}</TCell>
                  <TCell>
                    <TPrimary>{recipient.fullName}</TPrimary>
                  </TCell>
                  <TCell>{recipient.classroomLabel ?? '—'}</TCell>
                  <TCell>
                    {recipient.revokedAt ? (
                      <Pill>Revoked {formatDate(recipient.revokedAt)}</Pill>
                    ) : (
                      <Pill tone="brand">With the family</Pill>
                    )}
                  </TCell>
                  <TCell numeric>
                    {!recipient.revokedAt && (
                      <span className="inline-flex items-center gap-2">
                        <a
                          href={`/school/documents?kind=certificate-award&id=${recipient.awardId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50"
                        >
                          PDF
                        </a>
                        <ConfirmButton
                          action={revokeAwardAction.bind(null, certificate.id, recipient.awardId)}
                          label="Revoke"
                          title={`Revoke ${recipient.fullName}’s certificate?`}
                          body="It disappears from the family’s app. The number is not reused."
                        />
                      </span>
                    )}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        </Card>
      </>
    );
  }

  // A draft: wording, design and children can all still change.
  const classrooms = (await apiFetch<ClassroomSummary[]>('/classrooms')).filter(
    (c) => c.academicYear.isCurrent,
  );
  const selected = classrooms.find((c) => c.id === classroomId) ?? classrooms[0];
  const students = selected
    ? await apiFetch<Paginated<StudentSummary>>('/students', {
        query: { classroomId: selected.id, status: 'ACTIVE', pageSize: 100 },
      })
    : null;

  const chosen = new Set(certificate.recipients.map((r) => r.studentId));
  const roster = (students?.items ?? []).map((student) => ({
    id: student.id,
    fullName: student.fullName,
    rollNo: student.rollNo,
    chosen: chosen.has(student.id),
  }));
  const shown = new Set(roster.map((child) => child.id));
  const others = certificate.recipients
    .filter((r) => !shown.has(r.studentId))
    .map((r) => r.studentId);
  const count = certificate.recipients.length;

  return (
    <>
      <PageHeader
        eyebrow={back}
        title={certificate.title}
        description="Draft — families cannot see it until it is issued."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/school/documents?kind=certificate-preview&id=${certificate.id}`}
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              Preview
            </a>
            <StepButton
              action={issueCertificateAction.bind(null, certificate.id)}
              label={`Issue to ${count} ${count === 1 ? 'child' : 'children'}`}
              confirm={`Yes, issue ${count} ${count === 1 ? 'copy' : 'copies'}`}
              variant="gold"
              disabled={count === 0}
            />
            <ConfirmButton
              action={deleteCertificateAction.bind(null, certificate.id)}
              label="Delete"
              title="Delete this draft?"
              body="Nobody has received it yet, so nothing is taken from any family."
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50"
            />
          </div>
        }
      />

      <Notice tone="info">
        Issuing gives each child a numbered copy and tells their family in the app. After that the
        wording is fixed; a copy can only be revoked.
      </Notice>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card
          title={`Children (${count})`}
          description="Tick the children in each class who earned it, and save before moving to the next class."
        >
          {count > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {certificate.recipients.map((r) => (
                <Pill key={r.studentId} tone="brand">
                  {r.fullName}
                  {r.classroomLabel ? ` · ${r.classroomLabel}` : ''}
                </Pill>
              ))}
            </div>
          )}

          {!selected ? (
            <EmptyState title="No classes this year" />
          ) : (
            <>
              <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Class">
                {classrooms.map((c) => (
                  <Link
                    key={c.id}
                    href={`/school/certificates/${certificate.id}?classroomId=${c.id}`}
                    aria-current={c.id === selected.id ? 'page' : undefined}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
                      c.id === selected.id
                        ? 'bg-navy-900 text-white'
                        : 'text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-navy-50'
                    }`}
                  >
                    {label(c)}
                  </Link>
                ))}
              </nav>
              {roster.length === 0 ? (
                <p className="text-sm text-slate-500">No children in {label(selected)}.</p>
              ) : (
                <RecipientsForm
                  key={selected.id}
                  certificateId={certificate.id}
                  roster={roster}
                  others={others}
                />
              )}
            </>
          )}
        </Card>

        <Card title="Wording and design">
          <div className="mb-4">
            <CertificateThumb design={certificate.design} brand={brand} />
          </div>
          <CertificateForm brand={brand} certificate={certificate} />
        </Card>
      </div>
    </>
  );
}
