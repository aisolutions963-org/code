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
        glass: {
          900: 'rgba(10,10,18,0.95)',
          800: 'rgba(18,18,30,0.92)',
          700: 'rgba(24,24,40,0.88)',
          600: 'rgba(32,32,52,0.80)',
          border: 'rgba(255,255,255,0.08)',
        },
        glow: {
          installation: '#3b82f6',
          fabrication: '#f59e0b',
          sed: '#a855f7',
          manager: '#22c55e',
          superadmin: '#d95e1a',
        },
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-out-right': 'slide-out-right 0.25s ease-in',
      },
    },
  },
  plugins: [],
}
export default config
