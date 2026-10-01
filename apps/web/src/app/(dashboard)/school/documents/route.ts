import type { NextRequest } from 'next/server';
import { classReportCards, streamDocument, type DocumentPath } from '@/lib/document-proxy';

/** What the office can print. The API checks each one again. */
const DOCUMENTS: Record<string, DocumentPath> = {
  receipt: (id) => `/fees/payments/${id}/receipt`,
  'fee-card': (id) => `/fees/students/${id}/fee-card`,
  'id-card': (id) => `/students/${id}/id-card`,
  // A whole class at once, which is how a school issues them in September.
  'id-cards': (id) => `/classrooms/${id}/id-cards`,
  'report-card': (id) => `/results/report-cards/${id}/pdf`,
  'report-cards': classReportCards,
  // Every child's copy, one page each; or one child's.
  certificate: (id) => `/certificates/${id}/pdf`,
  'certificate-award': (id) => `/certificates/awards/${id}/pdf`,
  // The design with a sample name, before anything is issued.
  'certificate-preview': (id) => `/certificates/${id}/preview`,
};

export function GET(request: NextRequest): Promise<Response> {
  return streamDocument(request, DOCUMENTS);
}
