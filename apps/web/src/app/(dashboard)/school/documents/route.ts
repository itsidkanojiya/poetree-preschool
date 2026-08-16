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
 */

const DOCUMENTS: Record<string, (id: string) => string> = {
  receipt: (id) => `/fees/payments/${id}/receipt`,
  'fee-card': (id) => `/fees/students/${id}/fee-card`,
};

/** cuid, which is what every id in this system is. */
const ID = /^[a-z0-9]{20,32}$/;

export async function GET(request: NextRequest): Promise<Response> {
  const kind = request.nextUrl.searchParams.get('kind') ?? '';
  const id = request.nextUrl.searchParams.get('id') ?? '';

  const build = DOCUMENTS[kind];
  if (!build || !ID.test(id)) {
    return NextResponse.json({ error: 'Unknown document' }, { status: 404 });
  }

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;

  // The portal's server fetches this API on loopback, so an X-Accel-Redirect
  // would be answered by nobody — Nginx is not in the path. Ask for the bytes.
  const response = await fetch(`${API_BASE_URL}${build(id)}`, {
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
