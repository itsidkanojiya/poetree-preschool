import type { NextRequest } from 'next/server';
import { classReportCards, streamDocument, type DocumentPath } from '@/lib/document-proxy';

/**
 * What a teacher can print: their own class's report cards. The API refuses
 * another class's, so this list is about what makes sense, not what is safe.
 */
const DOCUMENTS: Record<string, DocumentPath> = {
  'report-card': (id) => `/results/report-cards/${id}/pdf`,
  'report-cards': classReportCards,
};

export function GET(request: NextRequest): Promise<Response> {
  return streamDocument(request, DOCUMENTS);
}
