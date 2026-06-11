"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { BLOCK_BASE, BLOCK_FAST } from "./motion-primitives";

const JOURNEY_STEPS = [
  {
    id: "diagnose",
    label: "Diagnose failures",
    problem:
      "Agent runs fail after hundreds of steps, and teams cannot see which decision, file state, or tool call caused the drift.",
    response:
      "TracePawl turns failed runs into replayable evidence so engineers can inspect root cause before retrying or shipping a fix.",
    layer: "TracePawl / failure diagnosis and replay",
  },
  {
    id: "context",
    label: "Preserve context",
    problem:
      "Teams repeat the same recovery work because agents forget previous failures, workflow preferences, and project-specific constraints.",
    response:
      "Mempawl stores operational memory for long-running agents so useful lessons survive across sessions and handoffs.",
    layer: "Mempawl / persistent operational memory",
  },
  {
    id: "coordinate",
    label: "Coordinate execution",
    problem:
      "Multi-agent work becomes hard to trust when tasks, shared state, and recovery ownership are spread across scripts and chat logs.",
    response:
      "Openpawl turns agent tasks into reviewable plans, validations, guarded changes, traceable artifacts, and explicit maintainer approval before beta write mode.",
    layer: "Openpawl / coordination runtime",
  },
  {
    id: "cost",
    label: "Control cost",
    problem:
      "Repeated agent runs burn time and inference budget when every replay, memory lookup, and evaluation starts from scratch.",
    response:
      "CachePawl reduces repeated work for replay-heavy and memory-heavy agent workloads without becoming another inference platform.",
    layer: "CachePawl / workload optimization",
  },
] as const;

export function CustomerJourney() {
  const [selectedId, setSelectedId] =
    useState<(typeof JOURNEY_STEPS)[number]["id"]>("diagnose");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const selected =
    JOURNEY_STEPS.find((step) => step.id === selectedId) ?? JOURNEY_STEPS[0];

  return (
    <div
      className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
      data-testid="customer-journey"
      data-hydrated={hydrated ? "true" : "false"}
    >
      <div className="grid gap-3" role="tablist" aria-label="Customer problems">
        {JOURNEY_STEPS.map((step, index) => {
          const active = step.id === selected.id;
          return (
            <motion.button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="customer-journey-detail"
              onClick={() => setSelectedId(step.id)}
              className={
                active
                  ? "cp-hover-frame product-state-active grid border-2 border-ratchet bg-ink-1 p-5 text-left transition-colors"
                  : "cp-hover-frame grid border-2 border-ink-4 bg-ink-0 p-5 text-left transition-colors hover:border-ratchet hover:bg-ink-1"
              }
              whileHover={{ y: -3 }}
              whileTap={{ x: 2, y: 2 }}
              transition={{
                duration: BLOCK_FAST,
                ease: "linear",
              }}
            >
              <span className="cp-caption text-ratchet">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="cp-h4 mt-3 text-fg-1">{step.label}</span>
              <span className="cp-small mt-2 text-fg-3">{step.layer}</span>
            </motion.button>
          );
        })}
      </div>

      <section
        id="customer-journey-detail"
        role="tabpanel"
        className="cp-hover-frame border-2 border-ink-4 bg-ink-0 p-6 md:p-8"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{
              duration: BLOCK_BASE,
              ease: "linear",
            }}
          >
            <p className="product-badge-active">
              <span className="product-pulse-dot" aria-hidden />
              Customer workflow
            </p>
            <h3 className="cp-h3 mt-6 text-fg-1">{selected.label}</h3>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <p className="cp-caption text-fg-3">Customer problem</p>
                <p className="cp-body mt-3 text-fg-2">{selected.problem}</p>
              </div>
              <div>
                <p className="cp-caption text-fg-3">CodePawl response</p>
                <p className="cp-body mt-3 text-fg-2">{selected.response}</p>
              </div>
            </div>
            <div className="mt-8 border-t border-ink-4 pt-5">
              <p className="cp-caption text-fg-3">Architecture layer</p>
              <p className="cp-h4 mt-2 text-fg-1">{selected.layer}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
