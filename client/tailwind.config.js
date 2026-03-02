/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'zuri-yellow': '#ffcd1c',
        'zuri-orange': '#f97316',
        'zuri-orange-dark': '#ea580c',
        'zuri-light': '#fffdf5',
        'zuri-black': '#000000',
      },
    },
  },
  plugins: [],
}

