"use client";

import { useEffect, useState } from "react";

export function KatexLoader({ source }: { source?: string }) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Check if KaTeX CSS is already loaded
    const existingLink = document.querySelector('link[href*="katex"]');
    if (existingLink) {
      return;
    }

    // Check source content for math delimiters ($ or $$)
    const hasMathInSource = source
      ? /(\$\$|\\\[|\\\(|\$\s)/.test(source)
      : false;

    if (hasMathInSource) {
      setShouldLoad(true);
      return;
    }

    // Check rendered DOM for KaTeX elements (with a small delay to allow SSR hydration)
    const checkDOM = () => {
      const hasMathContent =
        document.querySelector(".katex") ||
        document.querySelector('[class*="katex"]') ||
        document.querySelector("math");

      if (hasMathContent) {
        setShouldLoad(true);
      }
    };

    // Check immediately
    checkDOM();

    // Also check after a short delay for SSR hydration
    const timeoutId = setTimeout(checkDOM, 100);

    return () => clearTimeout(timeoutId);
  }, [source]);

  useEffect(() => {
    if (!shouldLoad) return;

    // Check again if already loaded
    const existingLink = document.querySelector('link[href*="katex"]');
    if (existingLink) {
      return;
    }

    // Dynamically load KaTeX CSS using Next.js public path
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/_next/static/css/katex.min.css";
    link.onerror = () => {
      // Fallback: try to load from node_modules via dynamic import
      import("katex/dist/katex.min.css").catch(() => {
        // If that fails, use CDN as last resort
        const cdnLink = document.createElement("link");
        cdnLink.rel = "stylesheet";
        cdnLink.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
        cdnLink.crossOrigin = "anonymous";
        document.head.appendChild(cdnLink);
      });
    };
    document.head.appendChild(link);
  }, [shouldLoad]);

  return null;
}
