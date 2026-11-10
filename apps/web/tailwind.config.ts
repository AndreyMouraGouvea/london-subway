import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070B12',
          900: '#0B111B',
          850: '#0E1622',
          800: '#111A28',
          750: '#162132',
          700: '#1A2638',
          600: '#25344A',
        },
        accent: {
          DEFAULT: '#39D0FF',
          soft: '#9AE8FF',
        },
        status: {
          normal: '#2FD18B',
          attention: '#F5B544',
          severe: '#FF8A3D',
          closure: '#FF5A5F',
          unknown: '#7A879C',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.45)',
        glow: '0 0 0 1px rgba(57, 208, 255, 0.25), 0 0 32px rgba(57, 208, 255, 0.08)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '48px 48px',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        pulseSoft: 'pulseSoft 2.4s ease-in-out infinite',
        slideIn: 'slideIn 220ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
