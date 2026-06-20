/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Tuned for higher contrast (darker borders, stronger secondary text).
        border: 'hsl(215 18% 76%)',
        input: 'hsl(215 18% 76%)',
        ring: 'hsl(221 83% 48%)',
        background: 'hsl(0 0% 100%)',
        foreground: 'hsl(222 47% 8%)',
        muted: 'hsl(210 33% 92%)',
        'muted-foreground': 'hsl(215 22% 32%)',
        accent: 'hsl(210 33% 92%)',
        primary: 'hsl(222 47% 8%)',
        'primary-foreground': 'hsl(210 40% 99%)'
      }
    }
  },
  plugins: []
}
