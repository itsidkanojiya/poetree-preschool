import type { Config } from 'tailwindcss';

/**
 * Admin surfaces only. Clean, professional, dashboard-oriented — the bright and
 * gamified palette belongs to the student app in a later phase.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e5ff',
          200: '#bcd1ff',
          300: '#8eb3ff',
          400: '#598aff',
          500: '#3462ff',
          600: '#1e40f5',
          700: '#182fe1',
          800: '#1a2ab6',
          900: '#1c2b8f',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
