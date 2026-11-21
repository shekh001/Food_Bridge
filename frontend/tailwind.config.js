/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F5F1',
        ink: '#1C2321',
        rescue: {
          DEFAULT: '#2F6F4E',
          dark: '#1F4D37',
          light: '#E6F0EA',
        },
        amber: {
          DEFAULT: '#F2A93B',
          dark: '#C9840F',
          light: '#FCEBCB',
        },
        // Logistics/tracking accent — a deliberate third color so the app
        // doesn't read as "green everywhere": movement, ETAs, and live
        // status get this cool teal-blue, distinct in meaning from rescue
        // (impact/success) and amber (time pressure/urgency).
        transit: {
          DEFAULT: '#2C6E8E',
          dark: '#1E4F66',
          light: '#E4EEF2',
        },
        claim: {
          DEFAULT: '#D64545',
          light: '#FBE4E4',
        },
        line: '#DAD6CB',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,35,33,0.06), 0 8px 24px -12px rgba(28,35,33,0.12)',
        tile: '0 1px 2px rgba(28,35,33,0.05), 0 1px 1px rgba(28,35,33,0.04)',
      },
    },
  },
  plugins: [],
};
