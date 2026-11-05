import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { SCHOOL_EXPORT_TYPES } from '@poetree/shared';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * Streams a School Admin's Excel export from the API to the browser.
 *
 * A pass-through, like the reports download beside it: the access token lives
 * in an httpOnly cookie, so only this handler can attach it. The API still
 * decides everything that matters — that the caller may export, that the rows
 * are their school's and nobody else's — and writes the audit entry.
 */

/** Query keys forwarded upstream. Anything else is dropped rather than relayed. */
const FORWARDED = ['type', 'academicYearId', 'classLevelId', 'classroomId', 'status', 'search'];

export async function GET(request: NextRequest): Promise<Response> {
  const type = request.nextUrl.searchParams.get('type') ?? '';
  if (!(SCHOOL_EXPORT_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  }

  const upstream = new URL(`${API_BASE_URL}/exports`);
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
            ? 'You do not have permission to export these records.'
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
