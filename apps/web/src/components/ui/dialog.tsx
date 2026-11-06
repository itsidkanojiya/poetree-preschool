'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A window over the page, for a form too long to sit in a table row.
 *
 * A portal, so it is not clipped by the card it was opened from and not nested
 * inside another form. Escape or a click outside closes it; nothing is saved
 * until the form inside is submitted.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Kept in a ref so a new arrow on every render does not re-run the effect
  // below, which would pull focus back to the first field mid-edit.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    panelRef.current
      ?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')
      ?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    // The page behind should not scroll while the window is in front of it.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mx-auto my-8 w-full max-w-2xl rounded-2xl bg-white p-6 text-left shadow-xl ring-1 ring-navy-950/10"
      >
        <h2 id={titleId} className="text-lg font-semibold text-navy-950">
          {title}
        </h2>
        {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
