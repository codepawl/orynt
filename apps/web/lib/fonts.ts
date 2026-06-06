import localFont from "next/font/local";

export const fontDisplay = localFont({
  src: [
    { path: "../public/fonts/Fraunces.ttf", style: "normal", weight: "100 900" },
    {
      path: "../public/fonts/Fraunces-Italic.ttf",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-display",
  display: "swap",
  preload: false,
});

export const fontBody = localFont({
  src: [
    { path: "../public/fonts/InterTight.ttf", style: "normal", weight: "100 900" },
    {
      path: "../public/fonts/InterTight-Italic.ttf",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-body",
  display: "swap",
  preload: false,
});

export const fontMono = localFont({
  src: [
    {
      path: "../public/fonts/JetBrainsMono.ttf",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../public/fonts/JetBrainsMono-Italic.ttf",
      style: "italic",
      weight: "100 900",
    },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});
