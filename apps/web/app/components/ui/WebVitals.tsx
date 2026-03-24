"use client";

import { useEffect } from "react";
import { onCLS, onFCP, onLCP, onTTFB, onINP, Metric } from "web-vitals";

export function WebVitals() {
  useEffect(() => {
    // Log Web Vitals to console in development
    if (process.env.NODE_ENV === "development") {
      const logMetric = (metric: Metric) => {
        console.log(`[Web Vitals] ${metric.name}:`, {
          value: metric.value,
          rating: metric.rating,
          delta: metric.delta,
        });
      };

      onCLS(logMetric);
      onFCP(logMetric);
      onLCP(logMetric);
      onTTFB(logMetric);
      onINP(logMetric); // INP replaces FID in web-vitals v5
    }

    // Send to analytics in production
    function sendToAnalytics(metric: Metric) {
      // You can send to your analytics service here
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", metric.name, {
          value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
          event_label: metric.id,
          non_interaction: true,
        });
      }
    }

    if (process.env.NODE_ENV === "production") {
      onCLS(sendToAnalytics);
      onFCP(sendToAnalytics);
      onLCP(sendToAnalytics);
      onTTFB(sendToAnalytics);
      onINP(sendToAnalytics); // INP replaces FID in web-vitals v5
    }
  }, []);

  return null;
}
