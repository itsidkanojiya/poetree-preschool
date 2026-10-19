'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BOOK_PDF_MAX_BYTES, type BookSummary } from '@poetree/shared';
import { Button, FormError, Input } from '@/components/ui/form';
import { ConfirmButton } from '@/components/ui/confirm-button';
import { Toast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { removeBookPdfAction } from '../actions';

const MB = 1024 * 1024;

function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

/**
 * The book itself, as the PDF a child reads in the app.
 *
 * Uploaded with a progress bar rather than through a form action: a printed
 * book is tens of megabytes, which on a school's connection is long enough to
 * look broken without one.
 */
export function BookPdfForm({ book }: { book: BookSummary }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  // A new key clears the file box after an upload.
  const [inputKey, setInputKey] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function upload() {
    setError(null);
    setSaved(null);

    if (!file) {
      setError('Choose the book’s PDF first.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('That is not a PDF. Export the book as a PDF and upload that.');
      return;
    }
    // Checked here as well as by the API, so a too-large book is refused at
    // once rather than after minutes of uploading.
    if (file.size > BOOK_PDF_MAX_BYTES) {
      setError(
        `That PDF is ${megabytes(file.size)}. A book may be at most ${megabytes(BOOK_PDF_MAX_BYTES)} — export it with smaller pictures and try again.`,
      );
      return;
    }

    const form = new FormData();
    form.append('file', file);

    const request = new XMLHttpRequest();
    request.open('POST', `/publication/books/${book.id}/pdf`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      setProgress(null);
      if (request.status >= 200 && request.status < 300) {
        setFile(null);
        setInputKey((key) => key + 1);
        setSaved(
          'Book saved. Children can read it now — and in a minute or two it is made smaller for phones, looking the same.',
        );
        router.refresh();
        return;
      }
      // Nginx answers a body over its limit itself, before the API sees it.
      if (request.status === 413) {
        setError(`That PDF is too large. A book may be at most ${megabytes(BOOK_PDF_MAX_BYTES)}.`);
        return;
      }
      let message = 'Could not upload the book.';
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

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <Toast message={saved} />

      {book.pdf ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-50 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-950">{book.pdf.fileName}</p>
            <p className="text-xs text-slate-500">
              {megabytes(book.pdf.sizeBytes)}
              {book.pdf.originalSizeBytes !== null && (
                <span className="text-leaf-800">
                  {' '}
                  · made smaller from {megabytes(book.pdf.originalSizeBytes)}
                </span>
              )}{' '}
              · uploaded {formatDate(book.pdf.uploadedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/publication/books/${book.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-3 py-2 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-950/15 hover:bg-white"
            >
              Open
            </a>
            <ConfirmButton
              action={removeBookPdfAction.bind(null, book.id)}
              label="Remove"
              title={`Remove the PDF of ${book.name}?`}
              body="Children will see that the book is not ready to read yet, until you upload it again. Copies already on their phones stop opening the next time they are online."
              confirmLabel="Remove"
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Not uploaded yet. Children see this book on their shelf, marked as not ready to read.
        </p>
      )}

      <div className="space-y-3">
        <Input
          key={inputKey}
          type="file"
          accept="application/pdf,.pdf"
          disabled={uploading}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          aria-label={`PDF of ${book.name}`}
        />

        {uploading && (
          <div
            className="h-2 overflow-hidden rounded-full bg-navy-50"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Uploading the book"
          >
            <div
              className="h-full rounded-full bg-navy-900 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <Button type="button" variant="secondary" disabled={uploading} onClick={upload}>
          {uploading ? `Uploading… ${progress}%` : book.pdf ? 'Replace' : 'Upload'}
        </Button>

        <p className="text-xs text-slate-500">
          The whole book, as printed, up to {megabytes(BOOK_PDF_MAX_BYTES)}. It is made smaller for
          phones after it arrives — the pictures inside to screen sharpness — so children download
          less and it looks the same. Phones keep a copy, so a child can read it again without the
          internet; replacing it sends everyone the new one.
        </p>
      </div>
    </div>
  );
}
