import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * Streams one attached file — a worksheet, or the photograph a family sent
 * back — from the API to the browser.
 *
 * Same reason the printable-document proxy exists: the access token lives in an
 * httpOnly cookie, deliberately, so no plain <img> or <a> can carry the
 * Authorization header. This attaches it and passes the bytes through.
 *
 * It grants nothing. `/files/:id` still decides who may read what, and for a
 * submission photograph that means the guardians of that child and the teacher
 * of the class it was set for. A teacher opening another class's file gets the
 * same 404 here as they would there.
 *
 * Deliberately not under /school: teachers use this too, and the middleware
 * sends anyone who is not a school admin away from that tree.
 */

/** cuid, which is what every id in this system is. */
const ID = /^[a-z0-9]{20,32}$/;

/** Only what the API itself will store. Anything else is not ours to serve. */
const SERVEABLE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
]);

export async function GET(request: NextRequest): Promise<Response> {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!ID.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Catalogue artwork is publication-owned and served by its own route; a
  // school's uploads are tenant-scoped and served by /files/:id. The two
  // authorisation models are deliberately separate on the API, so the caller
  // has to say which it wants rather than have this guess.
  const kind = request.nextUrl.searchParams.get('kind');
  const path = kind === 'catalogue' ? `/catalogue/assets/${id}` : `/files/${id}`;

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: response.status });
  }

  const contentType = response.headers.get('content-type') ?? '';
  const mime = contentType.split(';')[0]!.trim();

  // A stored file the API would not label as one of its own types has no
  // business being rendered inline in somebody's browser.
  if (!SERVEABLE.has(mime)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(response.body, {
    headers: {
      'content-type': mime,
      'content-disposition': response.headers.get('content-disposition') ?? 'inline',
      // A child's photograph should not sit in a shared-computer cache after
      // the teacher signs out.
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
