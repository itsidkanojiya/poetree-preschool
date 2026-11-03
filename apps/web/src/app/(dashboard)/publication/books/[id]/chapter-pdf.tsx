'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOOK_PDF_MAX_BYTES, type ChapterSummary } from '@poetree/shared';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Pill } from '@/components/ui/layout';
import { removeChapterPdfAction } from './actions';

const MB = 1024 * 1024;

function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

const BUTTON =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-navy-900 ring-1 ring-navy-200 transition-colors hover:bg-navy-50 disabled:opacity-60';

/**
 * The chapter's pages, as the PDF a child reads inside the chapter.
 *
 * A book is uploaded chapter by chapter, not whole: each row of the contents
 * page carries its own. Uploaded with a progress bar rather than through the
 * chapters' Save — a chapter of full-page pictures is still too large for a
 * server action — and the file box has no name, so that Save never sees it.
 */
export function ChapterPdf({ bookId, chapter }: { bookId: string; chapter: ChapterSummary }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('That is not a PDF. Export the chapter as a PDF and upload that.');
      return;
    }
    // Checked here as well as by the API, so a too-large chapter is refused at
    // once rather than after minutes of uploading.
    if (file.size > BOOK_PDF_MAX_BYTES) {
      setError(
        `That PDF is ${megabytes(file.size)}. A chapter may be at most ${megabytes(BOOK_PDF_MAX_BYTES)}.`,
      );
      return;
    }

    const form = new FormData();
    form.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', `/publication/chapters/${chapter.id}/pdf`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      setProgress(null);
      if (input.current) input.current.value = '';
      if (request.status >= 200 && request.status < 300) {
        router.refresh();
        return;
      }
      // Nginx answers a body over its limit itself, before the API sees it.
      if (request.status === 413) {
        setError(
          `That PDF is too large. A chapter may be at most ${megabytes(BOOK_PDF_MAX_BYTES)}.`,
        );
        return;
      }
      let message = 'Could not upload the PDF.';
      try {
        const body = JSON.parse(request.responseText) as { error?: { message?: string } };
        message = body.error?.message ?? message;
      } catch {
        // Not JSON: keep the plain message.
      }
      setError(message);
    };
    request.onerror = () => {
      setProgress(null);
      setError('The upload stopped. Check the connection and try again.');
    };

    setProgress(0);
    request.send(form);
  }

  const uploading = progress !== null;
  const choose = () => input.current?.click();

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 md:ml-7">
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
        }}
        aria-label={`PDF of ${chapter.name}`}
      />

      {chapter.pdf ? (
        <>
          <Pill tone="brand">
            PDF · {megabytes(chapter.pdf.sizeBytes)}
            {chapter.pdf.originalSizeBytes !== null &&
              ` (from ${megabytes(chapter.pdf.originalSizeBytes)})`}
          </Pill>
          <a
            href={`/publication/chapters/${chapter.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className={BUTTON}
          >
            Open
          </a>
          <button type="button" onClick={choose} disabled={uploading} className={BUTTON}>
            {uploading ? `Uploading… ${progress}%` : 'Replace'}
          </button>
          <ConfirmButton
            action={removeChapterPdfAction.bind(null, bookId, chapter.id)}
            label="Remove PDF"
            title={`Remove the PDF of ${chapter.name}?`}
            body="Children see this chapter with nothing to read until you upload it again. Copies already on their phones stop opening the next time they are online."
            confirmLabel="Remove"
          />
        </>
      ) : (
        <>
          <Pill tone="neutral">No PDF</Pill>
          <button type="button" onClick={choose} disabled={uploading} className={BUTTON}>
            {uploading ? `Uploading… ${progress}%` : '+ Add PDF'}
          </button>
        </>
      )}

      {error && (
        <span role="alert" className="text-xs font-medium text-rose-700">
          {error}
        </span>
      )}
    </div>
  );
}
