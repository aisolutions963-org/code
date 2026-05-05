import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4ee',
          100: '#fbe3d0',
          200: '#f6c49e',
          300: '#f09e6c',
          400: '#ea7a3a',
          500: '#d95e1a',
          600: '#b84a14',
          700: '#8f3810',
          800: '#6b2a0e',
          900: '#4a1d0b',
        },
      },
    },
  },
  plugins: [],
}
export default config
