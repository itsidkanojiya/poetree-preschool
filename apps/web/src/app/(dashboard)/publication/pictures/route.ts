import { NextResponse, type NextRequest } from 'next/server';
import type { LibraryPicture, Paginated } from '@poetree/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * The picture library, for the picker in the browser.
 *
 * A proxy for the same reason as `/attachments`: the access token lives in an
 * httpOnly cookie, so the browser cannot ask the API itself. It grants
 * nothing — the API decides who may see the library, and the middleware keeps
 * everyone but the publisher out of /publication before this runs.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  try {
    const library = await apiFetch<Paginated<LibraryPicture>>('/publication/assets', {
      redirectOnAuthFailure: false,
      query: {
        search: params.get('search')?.trim().slice(0, 100) || undefined,
        page: Number(params.get('page')) || 1,
        pageSize: 48,
      },
    });
    return NextResponse.json(library, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : 502;
    return NextResponse.json({ error: 'The pictures could not be loaded.' }, { status });
  }
}
