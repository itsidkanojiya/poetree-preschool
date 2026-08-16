import 'server-only';

import { cookies } from 'next/headers';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * Uploads one picture to the catalogue and returns its id.
 *
 * Publisher artwork goes to `/publication/assets`, not `POST /files`: that route
 * stamps the caller's school onto every row and throws for a Super Admin, who
 * has no school at all. The bytes end up publication-owned, which is what lets
 * the same apple be served to every school that bought the book.
 *
 * Done from the server so the access token stays in its httpOnly cookie — the
 * same two-step every attachment in this system uses: the upload route owns the
 * sniffing and the size caps, and the caller only records what the file is for.
 */
export async function uploadCatalogueAsset(file: File): Promise<string> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${API_BASE_URL}/publication/assets`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
    cache: 'no-store',
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: { message?: string } }).error.message ?? 'Upload failed')
        : 'Upload failed';
    throw new Error(message);
  }

  return (data as { id: string }).id;
}

/**
 * The bare file id out of an API path.
 *
 * The API answers with `/api/v1/catalogue/assets/<id>`, which a browser cannot
 * fetch — the token is httpOnly. Rendering one means going through the
 * `/attachments` proxy, which takes the id rather than the path.
 */
export function assetIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.split('/').pop() ?? null;
}
