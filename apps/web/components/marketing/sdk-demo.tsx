"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const LINES = [
  "$ npx openpawl@latest run",
  "",
  "openpawl> spinning up 3 agents (planner, coder, reviewer)…",
  "openpawl> planner → drafting outline",
  "openpawl> coder   → opening src/handler.ts",
  "openpawl> reviewer → 2 suggestions queued",
  "",
  "openpawl> done. 12 file changes, all tests green.",
] as const;

export function SDKDemo() {
  const prefersReducedMotion = useReducedMotion();
  const [visibleLines, setVisibleLines] = useState(
    prefersReducedMotion ? LINES.length : 1,
  );

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleLines(LINES.length);
      return;
    }
    if (visibleLines >= LINES.length) {
      return;
    }
    const handle = window.setTimeout(() => {
      setVisibleLines((prev) => Math.min(prev + 1, LINES.length));
    }, 420);
    return () => window.clearTimeout(handle);
  }, [visibleLines, prefersReducedMotion]);

  return (
    <section
      aria-label="SDK demo"
      className="border-ink-4 border-b"
    >
      <div className="mx-auto grid max-w-[1240px] items-start gap-12 px-6 py-20 md:grid-cols-2">
        <div>
          <p className="cp-marker mb-6">004 · from npm install to ship</p>
          <h2 className="cp-h2 text-fg-1 max-w-xl">
            One command. Six libraries. No framework.
          </h2>
          <p className="cp-lead text-fg-2 mt-6 max-w-xl">
            Install OpenPawl, point it at your repo, and let the team plan,
            edit, and review. Replace any agent with your own — we never
            assumed otherwise.
          </p>
        </div>
        <pre
          aria-live="polite"
          className="border-ink-5 bg-code-bg cp-code min-h-[280px] overflow-x-auto border p-6"
        >
          {LINES.slice(0, visibleLines).map((line, idx) => (
            <motion.div
              key={`${idx}-${line}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            >
              {line || " "}
            </motion.div>
          ))}
        </pre>
      </div>
    </section>
  );
}
