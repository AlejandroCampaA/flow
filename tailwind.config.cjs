/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: v('page'),
        surface: v('surface'),
        raised: v('raised'),
        high: v('high'),
        line: v('line'),
        outline: v('outline'),
        ink: v('ink'),
        ink2: v('ink2'),
        muted: v('muted'),
        accent: v('accent'),
        accentc: v('accentc'),
        onaccentc: v('onaccentc'),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad')
      },
      fontFamily: { sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 1px 3px rgb(var(--shadow) / 0.04)',
        pop: '0 8px 28px rgb(var(--shadow) / 0.18), 0 2px 6px rgb(var(--shadow) / 0.08)'
      }
    }
  },
  plugins: []
}
