/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./public/**/*.svg"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
        heading: ["var(--font-playfair)", "serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        button: ["var(--font-inter)", "system-ui", "sans-serif"],
        subtitle: ["var(--font-playfair)", "serif"],
        code: ["var(--font-jetbrains-mono)", "monospace"],
      },
      typography: {
        quoteless: {
          css: {
            "blockquote p:first-of-type::before": { content: "none" },
            "blockquote p:first-of-type::after": { content: "none" },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")], // eslint-disable-line @typescript-eslint/no-require-imports
  safelist: ['glass-card', 'glass-panel'], // Ensure these serve as utilities if dynamically used, though usually not needed if class names are static.
};
