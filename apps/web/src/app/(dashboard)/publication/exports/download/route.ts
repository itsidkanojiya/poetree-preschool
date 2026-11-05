import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { GLOBAL_EXPORT_TYPES } from '@poetree/shared';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * Streams the Super Admin's export across schools from the API to the browser.
 *
 * The middleware already keeps everyone but the Super Admin out of
 * /publication; the API checks again, validates every filter, and audits it.
 */

/** Query keys forwarded upstream. Anything else is dropped rather than relayed. */
const FORWARDED = ['type', 'schoolIds', 'classLevelId', 'section', 'academicYear', 'status'];

export async function GET(request: NextRequest): Promise<Response> {
  const type = request.nextUrl.searchParams.get('type') ?? '';
  if (!(GLOBAL_EXPORT_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  }

  const upstream = new URL(`${API_BASE_URL}/publication/exports`);
  for (const key of FORWARDED) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) upstream.searchParams.set(key, value);
  }

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const response = await fetch(upstream, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return NextResponse.json(
      {
        error:
          response.status === 403
            ? 'Only the Super Admin can export across schools.'
            : (body?.error?.message ?? 'The export did not work. Please try again.'),
      },
      { status: response.status },
    );
  }

  return new NextResponse(response.body, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition':
        response.headers.get('content-disposition') ?? `attachment; filename="${type}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
