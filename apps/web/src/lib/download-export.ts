/**
 * Fetches an Excel export and hands it to the browser as a download.
 *
 * Fetched rather than linked, so the screen can say "preparing" while the
 * server builds it and say what went wrong when it does not arrive — an
 * `<a href>` to a refused export downloads a file containing an error.
 */
export type ExportResult = { ok: true; file: string } | { ok: false; error: string };

export async function downloadExport(url: string): Promise<ExportResult> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    return { ok: false, error: 'Could not reach the server. Check the connection and try again.' };
  }

  if (!response.ok) {
    let message = 'The export did not work. Please try again.';
    try {
      const body = (await response.json()) as { error?: string | { message?: string } };
      message = (typeof body.error === 'string' ? body.error : body.error?.message) ?? message;
    } catch {
      // Not JSON: keep the plain message.
    }
    return { ok: false, error: message };
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const file = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'export.xlsx';

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    // The server stopped part-way: say so, rather than save half a file.
    return { ok: false, error: 'The export stopped part-way. Please try again.' };
  }

  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = file;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for the browser to have taken the file.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);

  return { ok: true, file };
}
