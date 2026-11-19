'use client';

import type { FormHTMLAttributes } from 'react';

/**
 * A GET filter form that applies a dropdown the moment it is chosen.
 *
 * Choosing "Every book → Pre-Primary A" and then having to find and press a
 * Filter button is a step nobody expects; text still waits for Enter or the
 * Search button, so it does not reload on every letter typed. Without
 * JavaScript it is an ordinary form and the button still works.
 */
export function AutoSubmitForm({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      method="get"
      {...props}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
