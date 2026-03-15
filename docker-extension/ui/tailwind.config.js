/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'toyota-red': '#EB0A1E',
        'toyota-black': '#1a1a2e',
        'toyota-gray': '#58595B',
      },
    },
  },
  plugins: [],
}
