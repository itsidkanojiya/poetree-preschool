import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  homePathFor,
  needsRefresh,
  readClaims,
} from '@/lib/auth-cookies';

const PUBLIC_PATHS = new Set(['/login', '/blocked']);

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1';

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Silent rotation. Server components cannot set cookies, so the refresh has to
 * happen here — the only place that runs before rendering and can write both the
 * outgoing response *and* the request the page will read.
 */
async function rotate(refreshToken: string): Promise<RefreshResult | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const data = (await response.json()) as RefreshResult;
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  } catch {
    // API unreachable — treat as signed out rather than rendering a broken page.
    return null;
  }
}

function redirectToLogin(request: NextRequest, reason?: string): NextResponse {
  const url = new URL('/login', request.url);
  if (reason) url.searchParams.set('reason', reason);

  const response = NextResponse.redirect(url);
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (PUBLIC_PATHS.has(pathname)) {
    // Already signed in? Skip the login screen.
    if (pathname === '/login' && accessToken && !needsRefresh(accessToken)) {
      const claims = readClaims(accessToken);
      return NextResponse.redirect(new URL(homePathFor(claims?.role), request.url));
    }
    return NextResponse.next();
  }

  if (!refreshToken) {
    return redirectToLogin(request);
  }

  let token = accessToken;
  let rotated: RefreshResult | null = null;

  if (needsRefresh(token)) {
    rotated = await rotate(refreshToken);
    if (!rotated) return redirectToLogin(request, 'expired');
    token = rotated.accessToken;
  }

  const claims = readClaims(token);
  if (!claims) return redirectToLogin(request);

  const home = homePathFor(claims.role);

  // A password the office set is good for one thing. The API refuses the rest,
  // so every other page would render its error state — go where it can be
  // changed instead.
  if (claims.mustChangePassword && pathname !== '/account') {
    const response = NextResponse.redirect(new URL('/account', request.url));
    if (rotated) {
      response.cookies.set(ACCESS_COOKIE, rotated.accessToken, cookieOptions);
      response.cookies.set(REFRESH_COOKIE, rotated.refreshToken, cookieOptions);
    }
    return response;
  }

  // Role routing: each dashboard tree belongs to exactly one role.
  const wrongTree =
    (pathname.startsWith('/publication') && claims.role !== 'PUBLICATION_ADMIN') ||
    (pathname.startsWith('/school') && claims.role !== 'SCHOOL_ADMIN') ||
    (pathname.startsWith('/teacher') && claims.role !== 'TEACHER');

  if (pathname === '/' || wrongTree) {
    const response = NextResponse.redirect(new URL(home, request.url));
    if (rotated) {
      response.cookies.set(ACCESS_COOKIE, rotated.accessToken, cookieOptions);
      response.cookies.set(REFRESH_COOKIE, rotated.refreshToken, cookieOptions);
    }
    return response;
  }

  if (!rotated) return NextResponse.next();

  // Hand the fresh token to the page being rendered, not just to the browser.
  request.cookies.set(ACCESS_COOKIE, rotated.accessToken);
  const response = NextResponse.next({ request });
  response.cookies.set(ACCESS_COOKIE, rotated.accessToken, cookieOptions);
  response.cookies.set(REFRESH_COOKIE, rotated.refreshToken, cookieOptions);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
