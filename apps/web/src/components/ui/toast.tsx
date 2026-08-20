'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck } from '@/components/icons';

/**
 * A save that says so, and then gets out of the way.
 *
 * Success used to be a green panel wedged into the form, which pushed
 * everything below it down the page — so the reward for saving was that the
 * thing you were looking at moved. A toast says the same words without
 * disturbing the layout, and leaves on its own.
 *
 * Keyed on the message so two saves in a row are two toasts: without that, the
 * second save of the same form shows nothing, which reads as a save that did
 * not happen.
 */
export function Toast({ message, tone = 'good' }: { message?: string | null; tone?: 'good' | 'bad' }) {
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;

    setShown(message);
    // Long enough to read a sentence, short enough not to sit there.
    const timer = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!shown || !mounted) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
          tone === 'good'
            ? 'bg-leaf-50 text-leaf-900 ring-leaf-200'
            : 'bg-rose-50 text-rose-900 ring-rose-200'
        }`}
      >
        {tone === 'good' && <IconCheck size={17} className="shrink-0" />}
        <span>{shown}</span>
      </div>
    </div>,
    document.body,
  );
}
