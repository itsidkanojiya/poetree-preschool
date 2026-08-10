import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * Streams a CSV export from the API to the browser.
 *
 * The browser cannot call the API directly: the access token lives in an
 * httpOnly cookie, deliberately, so no `<a href>` can carry the Authorization
 * header. This handler is the one place that can read the cookie and attach it.
 *
 * It is a pass-through, not a re-implementation. The API still decides whether
 * the caller holds `report:export`, still writes the audit entry, and still
 * decides which rows belong to this school — none of that is repeated here,
 * where it could drift out of step.
 */

/** Only the reports that exist. An unknown name is not proxied at all. */
const REPORTS: Record<string, string> = {
  'attendance-register': '/reports/attendance/register',
  'attendance-by-student': '/reports/attendance/students',
  'fee-collection': '/reports/fees/collection',
  'outstanding-dues': '/reports/fees/dues',
  'homework-completion': '/reports/homework/completion',
};

/** Query keys forwarded upstream. Anything else is dropped rather than relayed. */
const FORWARDED = ['from', 'to', 'classroomId'] as const;

export async function GET(request: NextRequest): Promise<Response> {
  const name = request.nextUrl.searchParams.get('report') ?? '';
  const path = REPORTS[name];

  if (!path) {
    return NextResponse.json({ error: 'Unknown report' }, { status: 404 });
  }

  const upstream = new URL(`${API_BASE_URL}${path}`);
  upstream.searchParams.set('format', 'csv');
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
    // A refusal here is nearly always "you may view but not export" — say that
    // rather than downloading a file containing an error message.
    return NextResponse.json(
      { error: response.status === 403 ? 'You may view this report but not export it' : 'Export failed' },
      { status: response.status },
    );
  }

  return new NextResponse(response.body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition':
        response.headers.get('content-disposition') ?? `attachment; filename="${name}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
