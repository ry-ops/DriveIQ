/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        toyota: {
          red: '#EB0A1E',
          black: '#1A1A1A',
          gray: '#58595B',
        },
      },
    },
  },
  plugins: [],
}
