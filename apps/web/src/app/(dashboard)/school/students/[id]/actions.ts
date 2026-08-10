'use server';

import { revalidatePath } from 'next/cache';
import { STUDENT_DOCUMENT_TYPES, type StudentDocumentType } from '@poetree/shared';
import { API_BASE_URL, apiFetch, errorMessage } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';
import { cookies } from 'next/headers';

export interface DocumentState {
  error?: string;
  success?: string;
}

function isDocumentType(value: string): value is StudentDocumentType {
  return (STUDENT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Upload, then attach — two calls, deliberately.
 *
 * POST /files owns content sniffing, the size caps and where the bytes land;
 * this only records what the file is and whose it is. Doing the upload here
 * rather than in the browser keeps the access token in its httpOnly cookie.
 */
export async function attachDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const studentId = String(formData.get('studentId') ?? '');
  const type = String(formData.get('type') ?? 'OTHER');
  const label = String(formData.get('label') ?? '').trim();
  const file = formData.get('file');

  if (!studentId) return { error: 'No child selected.' };
  if (!isDocumentType(type)) return { error: 'Pick a document type.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };

  let fileId: string;

  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    const upload = new FormData();
    upload.append('file', file);

    const response = await fetch(`${API_BASE_URL}/files`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: upload,
      cache: 'no-store',
    });

    const data: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error: { message?: string } }).error.message ?? 'Upload failed')
          : 'Upload failed';
      return { error: message };
    }

    fileId = (data as { id: string }).id;
  } catch (error) {
    return { error: errorMessage(error, 'Could not upload the file.') };
  }

  try {
    await apiFetch(`/students/${studentId}/documents`, {
      method: 'POST',
      body: { fileId, type, label: label || undefined },
      redirectOnAuthFailure: false,
    });
  } catch (error) {
    // The bytes are stored but unattached. The purge job clears an orphaned
    // file, so this is a retry, not a leak.
    return { error: errorMessage(error, 'The file uploaded but would not attach.') };
  }

  revalidatePath(`/school/students/${studentId}`);
  return { success: 'Document added.' };
}

export async function removeDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const studentId = String(formData.get('studentId') ?? '');
  const documentId = String(formData.get('documentId') ?? '');

  try {
    await apiFetch(`/students/${studentId}/documents/${documentId}`, {
      method: 'DELETE',
      redirectOnAuthFailure: false,
    });
  } catch (error) {
    return { error: errorMessage(error, 'Could not remove the document.') };
  }

  revalidatePath(`/school/students/${studentId}`);
  return { success: 'Document removed.' };
}
