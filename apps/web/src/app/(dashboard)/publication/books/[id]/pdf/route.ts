import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';
import { ID } from '@/lib/document-proxy';

/**
 * A book's PDF: uploaded through here, and opened from here to check it.
 *
 * A route rather than a server action because a printed book is far larger
 * than the 16 MB a server action may carry. The upload is streamed straight to
 * the API, which sniffs it, caps it and records it — nothing is held here.
 * The middleware has already kept everyone but the Super Admin out of
 * /publication; the API checks again.
 */

type Context = { params: Promise<{ id: string }> };

async function authorization(): Promise<Record<string, string>> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function POST(request: NextRequest, { params }: Context): Promise<Response> {
  const { id } = await params;
  if (!ID.test(id) || !request.body) {
    return NextResponse.json({ error: { message: 'Nothing to upload' } }, { status: 400 });
  }

  const response = await fetch(`${API_BASE_URL}/publication/books/${id}/pdf`, {
    method: 'POST',
    headers: {
      ...(await authorization()),
      'content-type': request.headers.get('content-type') ?? 'application/octet-stream',
    },
    body: request.body,
    // Required to send a stream as a request body.
    duplex: 'half',
    cache: 'no-store',
  } as RequestInit & { duplex: 'half' });

  const data: unknown = await response.json().catch(() => null);
  return NextResponse.json(data, { status: response.status });
}

export async function GET(_request: NextRequest, { params }: Context): Promise<Response> {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The portal's server fetches this API on loopback, so an X-Accel-Redirect
  // would be answered by nobody — Nginx is not in the path. Ask for the bytes.
  const response = await fetch(`${API_BASE_URL}/publication/books/${id}/pdf`, {
    headers: { ...(await authorization()), 'x-no-accel': '1' },
    cache: 'no-store',
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: response.status });
  }

  return new NextResponse(response.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': response.headers.get('content-disposition') ?? 'inline',
      'cache-control': 'no-store',
    },
  });
}
