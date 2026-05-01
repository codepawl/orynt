/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  // Shiki generates `.astro-code` and `.line` at runtime so they never appear
  // in scanned content. Safelist any custom rules that target them.
  safelist: ["astro-code", "line"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f5f4f0",
          200: "#c7c2b3",
          400: "#7a7466",
          500: "#5a5547",
          700: "#2a2820",
          900: "#0d0c0a",
          950: "#070605",
        },
        ratchet: {
          300: "#ffc266",
          500: "#ff9500",
          700: "#c25c00",
        },
        graph: {
          500: "#6ba889",
        },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', "ui-serif", "Georgia", "serif"],
        sans: ['"Inter Tight Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SF Mono", "Consolas", "monospace"],
      },
      letterSpacing: {
        "tightest": "-0.04em",
        "tighter-2": "-0.02em",
        "technical": "0.18em",
        "technical-wide": "0.22em",
      },
      maxWidth: {
        container: "1440px",
      },
      spacing: {
        "section": "8rem",
        "hero-top": "6rem",
        "hero-bottom": "8rem",
      },
      backgroundImage: {
        "blueprint-grid":
          "linear-gradient(to right, rgba(167, 162, 147, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(167, 162, 147, 0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        "blueprint": "48px 48px",
      },
    },
  },
  plugins: [],
};
