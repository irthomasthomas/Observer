/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'header-break': '900px', // Example: a custom breakpoint at 900px
      },
    },
  },
  plugins: [],
}
