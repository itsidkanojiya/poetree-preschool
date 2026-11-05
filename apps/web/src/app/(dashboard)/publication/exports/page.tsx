import type { Metadata } from 'next';
import type { GlobalExportFilters } from '@poetree/shared';
import { apiFetch } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui/layout';
import { GlobalExportForm } from './export-form';

export const metadata: Metadata = { title: 'Export data · Poetree Admin' };

/**
 * Records from one school, several or all, as an Excel file.
 *
 * Only the Super Admin reaches /publication. Every export is checked and
 * audited by the API, and never carries a password, a code or a token.
 */
export default async function ExportDataPage() {
  const filters = await apiFetch<GlobalExportFilters>('/publication/exports/filters');

  return (
    <>
      <PageHeader
        title="Export data"
        description="Download students, teachers, parents or schools as an Excel file — from one school, several, or all of them. Every row says which school it is from."
      />
      <div className="max-w-3xl">
        <Card>
          <GlobalExportForm filters={filters} />
        </Card>
      </div>
    </>
  );
}
