/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'header-break': '900px', // Example: a custom breakpoint at 900px
      },
      colors: {
        // Custom dark mode colors
        dark: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          text: '#f1f5f9',
          'text-secondary': '#cbd5e1',
        }
      }
    },
  },
  plugins: [],
}
