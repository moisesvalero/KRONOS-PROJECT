/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        kronos: {
          black: '#020202',
          surface: '#0A0A0A',
          border: '#1A1A1A',
          gold: '#D4AF37',
          alert: '#E63946'
        }
      },
      boxShadow: {
        'neon-gold': '0 0 24px rgba(212, 175, 55, 0.24)',
        'neon-red': '0 0 24px rgba(230, 57, 70, 0.24)'
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
};
