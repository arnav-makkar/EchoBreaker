/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,jsx,html}',
    './manifest.json',
  ],
  theme: {
    extend: {
      colors: {
        left:   '#e53e3e',
        center: '#6b7280',
        right:  '#3182ce',
        warn:   '#dd6b20',
        ok:     '#38a169',
      },
    },
  },
  plugins: [],
};
