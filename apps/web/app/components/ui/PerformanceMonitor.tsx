"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

interface PerformanceMetrics {
  loadTime: number;
  domContentLoaded: number;
  firstPaint: number;
  firstContentfulPaint: number;
  timeToInteractive: number;
  totalSize: number;
  jsSize: number;
  cssSize: number;
  imageSize: number;
}

export function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [showMonitor, setShowMonitor] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    // Toggle with Ctrl+Shift+P
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setShowMonitor((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyPress);

    // Measure performance
    if (typeof window !== "undefined" && "performance" in window) {
      window.addEventListener("load", () => {
        const perfData = window.performance;
        const navigation = perfData.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        const paint = perfData.getEntriesByType("paint");

        const loadTime = navigation.loadEventEnd - navigation.fetchStart;
        const domContentLoaded = navigation.domContentLoadedEventEnd - navigation.fetchStart;
        const firstPaint = paint.find((entry) => entry.name === "first-paint")?.startTime || 0;
        const firstContentfulPaint =
          paint.find((entry) => entry.name === "first-contentful-paint")?.startTime || 0;

        // Calculate resource sizes
        const resources = perfData.getEntriesByType("resource") as PerformanceResourceTiming[];
        let totalSize = 0;
        let jsSize = 0;
        let cssSize = 0;
        let imageSize = 0;

        resources.forEach((resource) => {
          const size = (resource as any).transferSize || 0;
          totalSize += size;
          if (resource.name.includes(".js")) jsSize += size;
          else if (resource.name.includes(".css")) cssSize += size;
          else if (resource.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) imageSize += size;
        });

        // Estimate Time to Interactive (TTI)
        const timeToInteractive = navigation.domInteractive - navigation.fetchStart;

        setMetrics({
          loadTime: Math.round(loadTime),
          domContentLoaded: Math.round(domContentLoaded),
          firstPaint: Math.round(firstPaint),
          firstContentfulPaint: Math.round(firstContentfulPaint),
          timeToInteractive: Math.round(timeToInteractive),
          totalSize: Math.round(totalSize / 1024), // KB
          jsSize: Math.round(jsSize / 1024), // KB
          cssSize: Math.round(cssSize / 1024), // KB
          imageSize: Math.round(imageSize / 1024), // KB
        });
      });
    }

    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, []);

  const copyMetrics = async () => {
    if (!metrics) return;

    const metricsText = `Performance Metrics
==================
Load Time: ${metrics.loadTime}ms
DOM Content Loaded: ${metrics.domContentLoaded}ms
First Paint: ${metrics.firstPaint}ms
First Contentful Paint: ${metrics.firstContentfulPaint}ms
Time to Interactive: ${metrics.timeToInteractive}ms

Resource Sizes:
- Total: ${metrics.totalSize} KB
- JS: ${metrics.jsSize} KB
- CSS: ${metrics.cssSize} KB
- Images: ${metrics.imageSize} KB`;

    try {
      await navigator.clipboard.writeText(metricsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy metrics:", err);
    }
  };

  if (!showMonitor || !metrics) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        background: "rgba(0, 0, 0, 0.9)",
        color: "#fff",
        padding: "16px",
        borderRadius: "8px",
        fontFamily: "monospace",
        fontSize: "12px",
        zIndex: 10000,
        minWidth: "300px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div style={{ marginBottom: "8px", fontWeight: "bold", borderBottom: "1px solid #444", paddingBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Performance Metrics (Ctrl+Shift+P)</span>
        <button
          onClick={copyMetrics}
          style={{
            background: "transparent",
            border: "1px solid #666",
            color: "#fff",
            padding: "4px 8px",
            borderRadius: "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "11px",
          }}
          title="Copy metrics to clipboard"
        >
          {copied ? (
            <>
              <Check size={12} /> Copied!
            </>
          ) : (
            <>
              <Copy size={12} /> Copy
            </>
          )}
        </button>
      </div>
      <div style={{ display: "grid", gap: "4px" }}>
        <div>
          <span style={{ color: "#888" }}>Load Time:</span>{" "}
          <span style={{ color: metrics.loadTime > 3000 ? "#f44" : "#4f4" }}>
            {metrics.loadTime}ms
          </span>
        </div>
        <div>
          <span style={{ color: "#888" }}>DOM Content Loaded:</span>{" "}
          <span style={{ color: metrics.domContentLoaded > 2000 ? "#f44" : "#4f4" }}>
            {metrics.domContentLoaded}ms
          </span>
        </div>
        <div>
          <span style={{ color: "#888" }}>First Paint:</span>{" "}
          <span style={{ color: metrics.firstPaint > 2000 ? "#f44" : "#4f4" }}>
            {metrics.firstPaint}ms
          </span>
        </div>
        <div>
          <span style={{ color: "#888" }}>First Contentful Paint:</span>{" "}
          <span style={{ color: metrics.firstContentfulPaint > 2000 ? "#f44" : "#4f4" }}>
            {metrics.firstContentfulPaint}ms
          </span>
        </div>
        <div>
          <span style={{ color: "#888" }}>Time to Interactive:</span>{" "}
          <span style={{ color: metrics.timeToInteractive > 3000 ? "#f44" : "#4f4" }}>
            {metrics.timeToInteractive}ms
          </span>
        </div>
        <div style={{ marginTop: "8px", borderTop: "1px solid #444", paddingTop: "8px" }}>
          <div style={{ color: "#888", marginBottom: "4px" }}>Resource Sizes:</div>
          <div>
            Total: <span style={{ color: metrics.totalSize > 1000 ? "#f44" : "#4f4" }}>{metrics.totalSize} KB</span>
          </div>
          <div>
            JS: <span style={{ color: metrics.jsSize > 500 ? "#f44" : "#4f4" }}>{metrics.jsSize} KB</span>
          </div>
          <div>
            CSS: <span style={{ color: metrics.cssSize > 100 ? "#f44" : "#4f4" }}>{metrics.cssSize} KB</span>
          </div>
          <div>
            Images: <span style={{ color: metrics.imageSize > 500 ? "#f44" : "#4f4" }}>{metrics.imageSize} KB</span>
          </div>
        </div>
      </div>
    </div>
  );
}
