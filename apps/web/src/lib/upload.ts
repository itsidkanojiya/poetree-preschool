import 'server-only';
import { cookies } from 'next/headers';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

/**
 * The first of the two steps every attachment here uses: hand the bytes to
 * the upload route, which owns the sniffing and the size caps, and get back
 * the file's id. The second step — saying what the file is for — is the
 * caller's.
 *
 * Multipart, so it cannot go through apiFetch, which speaks JSON.
 */
export async function uploadFile(file: File): Promise<string> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`${API_BASE_URL}/files`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
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

/** A chosen file, or null for a form submitted with nothing chosen. */
export function chosenFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}
