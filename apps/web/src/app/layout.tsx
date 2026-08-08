import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Poppins is bundled rather than fetched from Google Fonts so the VPS build
 * never depends on outbound network access at build time.
 */
const poppins = localFont({
  src: [
    { path: '../assets/fonts/Poppins-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../assets/fonts/Poppins-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../assets/fonts/Poppins-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../assets/fonts/Poppins-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Poetree Admin',
  description: 'School management portal for Poetree Publication',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
