import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Inter for everything read and typed — tables, forms, numbers — and Nunito,
 * rounded like the children's books, for page and card titles.
 *
 * Both are bundled rather than fetched from Google Fonts so the build never
 * depends on outbound network access. Each is one variable file, cut down to
 * Latin (with ₹) — a quarter of the four Poppins files they replace. Licences
 * (SIL OFL 1.1) sit beside them in assets/fonts.
 */
const inter = localFont({
  src: '../assets/fonts/Inter.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-sans',
  display: 'swap',
});

const nunito = localFont({
  src: '../assets/fonts/Nunito.woff2',
  weight: '200 1000',
  style: 'normal',
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Poetree Admin',
  description: 'School management portal for Poetree Publication',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
