"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import Link from "next/link";

import { HERO_PRODUCTS } from "./products";

const CYCLE_MS = 7000;

export function Hero() {
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    const handle = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_PRODUCTS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(handle);
  }, [prefersReducedMotion]);

  const active = HERO_PRODUCTS[activeIndex];
  if (!active) {
    return null;
  }

  return (
    <section
      aria-label="Product showcase"
      className="border-ink-4 border-b"
    >
      <div className="mx-auto grid max-w-[1240px] items-start gap-12 px-6 py-20 md:grid-cols-[3fr_2fr]">
        <div>
          <p className="cp-marker mb-6">001 · the codepawl stack</p>
          <h1 className="cp-display text-fg-1">
            Ship <em className="cp-em">production</em> agents,
            <br />
            not demos.
          </h1>
          <p className="cp-lead mt-6 max-w-xl">
            Open-source tools and a closed studio for engineers building AI
            agents in 2026. Pick a primitive, ship it, then graduate to
            KStudio when you need the rest.
          </p>

          <ul
            className="mt-10 flex flex-wrap gap-2"
            aria-label="Cycle through products"
          >
            {HERO_PRODUCTS.map((product, idx) => {
              const isActive = idx === activeIndex;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-pressed={isActive}
                    className={
                      isActive
                        ? "bg-ratchet text-ink-0 cp-caption border-ratchet border px-3 py-1.5"
                        : "border-ink-5 text-fg-3 hover:text-fg-1 hover:border-fg-3 cp-caption border px-3 py-1.5 transition-colors"
                    }
                  >
                    {product.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <motion.aside
          key={active.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.36 }}
          className="border-ink-4 bg-ink-2 flex flex-col gap-6 border p-8"
        >
          <header className="flex items-center justify-between">
            <p className="cp-caption text-fg-3">
              {String(active.display_order).padStart(3, "0")} ·{" "}
              {active.language}
            </p>
            <span className="bg-ratchet-tint text-ratchet cp-caption px-2 py-1">
              {active.status}
            </span>
          </header>
          <h2 className="cp-h2 text-fg-1">{active.name}</h2>
          <p className="cp-body text-fg-2">{active.description}</p>
          <pre className="border-ink-5 bg-code-bg cp-code overflow-x-auto border p-4">
            <code>{active.install}</code>
          </pre>
          <Link
            href={`/products/${active.slug}`}
            className="text-ratchet hover:text-ratchet-hot cp-small inline-flex w-fit items-center gap-1 transition-colors"
          >
            Read the {active.name} docs →
          </Link>
        </motion.aside>
      </div>
    </section>
  );
}
