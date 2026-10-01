import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * Streams a printable document from the API to the browser.
 *
 * Same reason the CSV proxy exists: the access token lives in an httpOnly
 * cookie, deliberately, so no plain link can carry the Authorization header.
 * This attaches it and passes the bytes through — the API still decides who
 * may print what, and a parent still gets only their own child's.
 *
 * Each dashboard tree has its own route over this, because the middleware
 * keeps a teacher out of /school entirely; what each tree may ask for is the
 * map it passes in.
 */

/** The API path for a document, or null when the request does not name one. */
export type DocumentPath = (id: string, params: URLSearchParams) => string | null;

/** cuid, which is what every id in this system is. */
export const ID = /^[a-z0-9]{20,32}$/;

export async function streamDocument(
  request: NextRequest,
  documents: Record<string, DocumentPath>,
): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const kind = params.get('kind') ?? '';
  const id = params.get('id') ?? '';

  const path = ID.test(id) ? documents[kind]?.(id, params) : null;
  if (!path) {
    return NextResponse.json({ error: 'Unknown document' }, { status: 404 });
  }

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;

  // The portal's server fetches this API on loopback, so an X-Accel-Redirect
  // would be answered by nobody — Nginx is not in the path. Ask for the bytes.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-no-accel': '1',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.status === 404 ? 'Not found' : 'Could not produce the document' },
      { status: response.status },
    );
  }

  return new NextResponse(response.body, {
    headers: {
      'content-type': 'application/pdf',
      // Inline: an office wants to look at a receipt before deciding to print
      // it, and a forced download makes that two steps.
      'content-disposition':
        response.headers.get('content-disposition') ?? `inline; filename="${kind}.pdf"`,
      'cache-control': 'no-store',
    },
  });
}

/** A whole class's report cards for one term: the class is the id, the term a param. */
export const classReportCards: DocumentPath = (id, params) => {
  const term = params.get('term') ?? '';
  return ID.test(term) ? `/results/classrooms/${id}/terms/${term}/pdf` : null;
};
