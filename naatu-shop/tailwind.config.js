/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Purple theme colors
        purple: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
        // Primary brand colors
        primary: {
          DEFAULT: '#7e22ce',
          dark: '#6b21a8',
          light: '#a855f7',
          lighter: '#d8b4fe',
          lightest: '#f3e8ff',
        },
        // Background colors
        bgMain: '#FAFAFA',
        cardBg: '#FFFFFF',
        // Text colors
        textMain: '#111111',
        textMuted: '#6B7280',
        textLight: '#9CA3AF',
        // Border colors
        borderLight: '#E5E7EB',
        borderMedium: '#D1D5DB',
        borderDark: '#9CA3AF',
        // Accent colors
        accent: {
          green: '#10B981',
          red: '#EF4444',
          amber: '#F59E0B',
          blue: '#3B82F6',
        },
        // Success/Error/Warning
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        headline: ['Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.06)',
        card: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
        'card-hover': '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.03)',
        button: '0 2px 4px rgba(126, 34, 206, 0.2)',
        'button-hover': '0 4px 8px rgba(126, 34, 206, 0.3)',
      },
      borderRadius: {
        card: '12px',
        btn: '10px',
        input: '10px',
        table: '12px',
        xl: '16px',
        '2xl': '24px',
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'float-delay': 'float 4s ease-in-out 1.5s infinite',
        'slide-up': 'slideUp 0.6s ease forwards',
        'fade-in': 'fadeIn 0.5s ease forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
