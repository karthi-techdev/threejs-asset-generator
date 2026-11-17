/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Satoshi', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        studio: {
          950: '#09090b',
          900: '#121215',
          850: '#18181b',
          800: '#202024',
          750: '#27272a',
          700: '#323238',
          600: '#52525b',
          500: '#71717a',
          400: '#a1a1aa',
          accent: '#ffffff',
          accentHover: '#e4e4e7',
          green: '#10b981',
          amber: '#f59e0b',
          rose: '#ef4444',
          cyan: '#38bdf8',
        },
      },
    },
  },
  plugins: [],
};
