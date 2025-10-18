module.exports = {
  plugins: {
    'tailwindcss': {},
    'autoprefixer': {},
    ...(process.env.NODE_ENV === 'production' && {
      'cssnano': {
        preset: ['default', {
          // Optimize for production
          discardComments: {
            removeAll: true,
          },
          minifyFontValues: {
            removeQuotes: false,
          },
          minifySelectors: true,
          normalizeWhitespace: true,
          reduceIdents: false, // Keep CSS custom properties
          zindex: false, // Don't optimize z-index values
        }],
      },
    }),
  },
};