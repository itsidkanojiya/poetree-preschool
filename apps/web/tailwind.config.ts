import type { Config } from 'tailwindcss';

/**
 * Palette derived from the Poetree Publications mark: the deep navy of the
 * wordmark, the gold of the open book, and the greens of the tree.
 *
 * Admin surfaces only — clean and professional. The bright, gamified treatment
 * belongs to the student app in a later phase.
 *
 * Status colours are deliberately NOT brand colours. They come from the fixed
 * status palette and are always paired with an icon and a text label, so state
 * never depends on hue alone.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f1f4fb',
          100: '#dfe6f6',
          200: '#c4d1ee',
          300: '#9bb2e1',
          400: '#6b8bd0',
          500: '#4767bd',
          600: '#334da2',
          700: '#243b83',
          800: '#1b2f6b',
          900: '#16307c',
          950: '#0d1c4a',
        },
        gold: {
          50: '#fffaeb',
          100: '#fdf0c7',
          200: '#fbe08a',
          300: '#f8ca4d',
          400: '#f5c518',
          500: '#e5ac0b',
          600: '#c68507',
          700: '#9d5f0a',
          800: '#814b10',
          900: '#6e3e12',
        },
        leaf: {
          50: '#f1f9f1',
          100: '#ddf0dd',
          200: '#bde1bd',
          300: '#8ecb8f',
          400: '#5bad5d',
          500: '#3a9040',
          600: '#2e7d32',
          700: '#245c29',
          800: '#204a25',
          900: '#1b3e20',
        },
        // Fixed status palette — never themed, never reused as a brand accent.
        status: {
          good: '#0ca30c',
          warning: '#fab219',
          serious: '#ec835a',
          critical: '#d03b3b',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(13 28 74 / 0.04), 0 1px 3px 0 rgb(13 28 74 / 0.06)',
        raised: '0 4px 12px -2px rgb(13 28 74 / 0.10), 0 2px 6px -2px rgb(13 28 74 / 0.06)',
        pop: '0 12px 32px -8px rgb(13 28 74 / 0.20)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};

export default config;
