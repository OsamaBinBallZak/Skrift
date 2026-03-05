/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './shared/**/*.{js,ts,jsx,tsx}',
    './features/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Base colors - intuitive, readable names
        base: 'rgb(var(--color-bg) / <alpha-value>)',
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        elevated: 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        accent: 'rgb(var(--color-primary) / <alpha-value>)',
        
        // Theme-prefixed aliases
        theme: {
          primary: 'rgb(var(--color-primary) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
        },
        
        // Surfaces
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        
        // Buttons
        btn: {
          primary: 'rgb(var(--btn-primary) / <alpha-value>)',
          primaryText: 'rgb(var(--btn-primary-text) / <alpha-value>)',
          secondary: 'rgb(var(--btn-secondary) / <alpha-value>)',
          secondaryText: 'rgb(var(--btn-secondary-text) / <alpha-value>)',
        },
        
        // Tabs
        tab: {
          active: 'rgb(var(--tab-active) / <alpha-value>)',
          inactive: 'rgb(var(--tab-inactive) / <alpha-value>)',
        },
        
        // Status colors - clean shorthand with full set
        success: {
          DEFAULT: 'rgb(var(--status-success-bg) / <alpha-value>)',
          text: 'rgb(var(--status-success-text) / <alpha-value>)',
          border: 'rgb(var(--status-success-border) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'rgb(var(--status-error-bg) / <alpha-value>)',
          text: 'rgb(var(--status-error-text) / <alpha-value>)',
          border: 'rgb(var(--status-error-border) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--status-warning-bg) / <alpha-value>)',
          text: 'rgb(var(--status-warning-text) / <alpha-value>)',
          border: 'rgb(var(--status-warning-border) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--status-info-bg) / <alpha-value>)',
          text: 'rgb(var(--status-info-text) / <alpha-value>)',
          border: 'rgb(var(--status-info-border) / <alpha-value>)',
        },
        enhanced: {
          DEFAULT: 'rgb(var(--status-enhanced-bg) / <alpha-value>)',
          text: 'rgb(var(--status-enhanced-text) / <alpha-value>)',
          border: 'rgb(var(--status-enhanced-border) / <alpha-value>)',
        },
        processing: {
          DEFAULT: 'rgb(var(--status-processing-bg) / <alpha-value>)',
          text: 'rgb(var(--status-processing-text) / <alpha-value>)',
          border: 'rgb(var(--status-processing-border) / <alpha-value>)',
        },
        
        // Status color direct mappings (for bg-status-*-* pattern)
        'status-success-bg': 'rgb(var(--status-success-bg) / <alpha-value>)',
        'status-success-text': 'rgb(var(--status-success-text) / <alpha-value>)',
        'status-success-border': 'rgb(var(--status-success-border) / <alpha-value>)',
        'status-error-bg': 'rgb(var(--status-error-bg) / <alpha-value>)',
        'status-error-text': 'rgb(var(--status-error-text) / <alpha-value>)',
        'status-error-border': 'rgb(var(--status-error-border) / <alpha-value>)',
        'status-warning-bg': 'rgb(var(--status-warning-bg) / <alpha-value>)',
        'status-warning-text': 'rgb(var(--status-warning-text) / <alpha-value>)',
        'status-warning-border': 'rgb(var(--status-warning-border) / <alpha-value>)',
        'status-info-bg': 'rgb(var(--status-info-bg) / <alpha-value>)',
        'status-info-text': 'rgb(var(--status-info-text) / <alpha-value>)',
        'status-info-border': 'rgb(var(--status-info-border) / <alpha-value>)',
        'status-enhanced-bg': 'rgb(var(--status-enhanced-bg) / <alpha-value>)',
        'status-enhanced-text': 'rgb(var(--status-enhanced-text) / <alpha-value>)',
        'status-enhanced-border': 'rgb(var(--status-enhanced-border) / <alpha-value>)',
        'status-processing-bg': 'rgb(var(--status-processing-bg) / <alpha-value>)',
        'status-processing-text': 'rgb(var(--status-processing-text) / <alpha-value>)',
        'status-processing-border': 'rgb(var(--status-processing-border) / <alpha-value>)',
        
        // Muted text color
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        
        // Primary brand colors extracted from design (keep for legacy compat)
        primary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        
        // Background variations - theme-aware
        background: {
          primary: 'rgb(var(--color-surface) / <alpha-value>)',
          secondary: 'rgb(var(--color-bg) / <alpha-value>)',
          tertiary: 'rgb(var(--color-surface-elevated) / <alpha-value>)',
          dark: 'rgb(var(--color-surface) / <alpha-value>)',
        },
        
        // Text variations - theme-aware
        text: {
          primary: 'rgb(var(--color-fg) / <alpha-value>)',
          secondary: 'rgb(var(--color-muted) / <alpha-value>)',
          tertiary: 'rgb(var(--color-muted) / <alpha-value>)',
          muted: 'rgb(var(--color-muted) / <alpha-value>)',
          inverse: 'rgb(var(--color-bg) / <alpha-value>)',
        },
        
        // Border colors - theme-aware
        border: {
          primary: 'rgb(var(--color-border) / <alpha-value>)',
          secondary: 'rgb(var(--color-border) / <alpha-value>)',
          focus: 'rgb(var(--color-primary) / <alpha-value>)',
          error: '#ef4444',
        },
        
        // Component-specific colors - theme-aware
        card: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          foreground: 'rgb(var(--color-fg) / <alpha-value>)',
          background: 'rgb(var(--color-surface) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          shadow: 'rgba(0, 0, 0, 0.1)',
        },
        
        // Ring colors for focus states
        ring: '#3b82f6',
        
        // Switch component colors
        'switch-background': '#e2e8f0',
        
        // Input background for form elements
        input: '#f9fafb',
        
        // Primary foreground for contrast
        'primary-foreground': '#ffffff',
        
        // Status badge colors (matching component usage)
        badge: {
          exported: {
            bg: '#dcfce7',
            text: '#166534',
          },
          enhanced: {
            bg: '#f3e8ff',
            text: '#7c3aed',
          },
          sanitised: {
            bg: '#dbeafe',
            text: '#1e40af',
          },
          transcribed: {
            bg: '#e0e7ff',
            text: '#3730a3',
          },
          processing: {
            bg: '#dbeafe',
            text: '#1e40af',
          },
          error: {
            bg: '#fee2e2',
            text: '#991b1b',
          },
          unprocessed: {
            bg: '#f3f4f6',
            text: '#374151',
          },
        },
      },
      
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
        ],
        mono: [
          '"SF Mono"',
          'Monaco',
          '"Cascadia Code"',
          '"Roboto Mono"',
          'Consolas',
          '"Liberation Mono"',
          '"Menlo"',
          'monospace',
        ],
      },
      
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      
      spacing: {
        '0.5': '0.125rem',
        '1.5': '0.375rem',
        '2.5': '0.625rem',
        '3.5': '0.875rem',
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '6.5': '1.625rem',
        '7.5': '1.875rem',
        '8.5': '2.125rem',
        '9.5': '2.375rem',
        '18': '4.5rem',
        '88': '22rem',
        '100': '25rem',
        '112': '28rem',
        '128': '32rem',
      },
      
      borderRadius: {
        'sm': '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'focus': '0 0 0 3px rgba(59, 130, 246, 0.5)',
      },
      
      animation: {
        'fade-in': 'fade-in 0.5s ease-in-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
      
      screens: {
        'xs': '475px',
        '3xl': '1920px',
      },
      
      backdropBlur: {
        'xs': '2px',
      },
      
      transitionTimingFunction: {
        'in-expo': 'cubic-bezier(0.95, 0.05, 0.795, 0.035)',
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
    },
  },
  plugins: [
    // Add plugins for better form styling
    require('@tailwindcss/forms')({
      strategy: 'class',
    }),
    
    // Custom plugin for electron-specific utilities
    function({ addUtilities, theme }) {
      const newUtilities = {
        '.electron-drag': {
          '-webkit-app-region': 'drag',
        },
        '.electron-no-drag': {
          '-webkit-app-region': 'no-drag',
        },
        '.font-smooth': {
          '-webkit-font-smoothing': 'antialiased',
          '-moz-osx-font-smoothing': 'grayscale',
        },
        '.select-none-electron': {
          '-webkit-user-select': 'none',
          '-moz-user-select': 'none',
          '-ms-user-select': 'none',
          'user-select': 'none',
        },
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      }
      addUtilities(newUtilities)
    },
  ],
}