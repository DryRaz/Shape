/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefcf5',
          100: '#d6f7e4',
          200: '#aeedca',
          300: '#7cddab',
          400: '#48c78a',
          500: '#25ad6e',
          600: '#178b58',
          700: '#146f48',
          800: '#14583c',
          900: '#124933',
          950: '#07291d',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
}
