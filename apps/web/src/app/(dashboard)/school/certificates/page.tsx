import Link from 'next/link';
import type { CertificateSummary, SchoolProfile } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Card, EmptyState, PageHeader, Pill } from '@/components/ui/layout';
import { Table, TCell, THead, TPrimary, TRow } from '@/components/ui/table';
import { CertificateThumb } from '@/components/certificates/thumb';
import { CertificateForm } from './forms';

/**
 * Certificates the school awards. Written once, given to as many children as
 * earned it; each family gets their own numbered copy when it is issued.
 */
export default async function CertificatesPage() {
  const [certificates, school] = await Promise.all([
    apiFetch<CertificateSummary[]>('/certificates'),
    apiFetch<SchoolProfile>('/school/profile'),
  ]);
  const brand = school.primaryColor ?? '#16307C';

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Award a certificate to one child, a few, or a whole class. Families get it in the app."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card title="Awarded">
          {certificates.length === 0 ? (
            <EmptyState
              title="No certificates yet"
              description="Write one on the right. It stays a draft, unseen by families, until you issue it."
            />
          ) : (
            <Table>
              <THead
                columns={[
                  { label: 'Design', hidden: true },
                  'Certificate',
                  'Date',
                  { label: 'Children', numeric: true },
                  'Status',
                ]}
              />
              <tbody>
                {certificates.map((certificate) => (
                  <TRow key={certificate.id}>
                    <TCell className="w-24">
                      <CertificateThumb design={certificate.design} brand={brand} />
                    </TCell>
                    <TCell>
                      <Link
                        href={`/school/certificates/${certificate.id}`}
                        className="hover:underline"
                      >
                        <TPrimary sub={certificate.body || undefined}>{certificate.title}</TPrimary>
                      </Link>
                    </TCell>
                    <TCell>{formatDate(certificate.issuedOn)}</TCell>
                    <TCell numeric>{certificate.recipientCount}</TCell>
                    <TCell>
                      {certificate.status === 'ISSUED' ? (
                        <Pill tone="brand">Issued</Pill>
                      ) : (
                        <Pill tone="gold">Draft</Pill>
                      )}
                    </TCell>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="New certificate" tone="accent">
          <CertificateForm brand={brand} />
        </Card>
      </div>
    </>
  );
}
