import { redirect } from 'next/navigation';

/**
 * Middleware normally sends "/" to the right dashboard before this renders.
 * This exists as the fallback for anyone arriving without a session.
 */
export default function RootPage() {
  redirect('/login');
}
