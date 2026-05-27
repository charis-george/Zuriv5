/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        landing: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        'zuri-yellow': '#ffcd1c',
        'zuri-orange': '#ffbd59',
        'zuri-orange-dark': '#ffbd59',
        'zuri-light': '#fffdf5',
        'zuri-black': '#000000',
      },
    },
  },
  plugins: [],
}

