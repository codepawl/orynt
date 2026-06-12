"use client";

import { motion, useReducedMotion } from "motion/react";

import { Link } from "@/components/link";
import {
  CLOUD_ROADMAP,
  CLOUD_STATUS_CARDS,
  CLOUD_UPDATE_LOG,
  type CloudRoadmapItem,
  type CloudStatusCard,
} from "@/lib/cloud-status";

const X_URL = "https://x.com/codepawl";
const THREADS_URL = "https://www.threads.com/@codepawl?igshid=NTc4MTIwNjQ2YQ==";

const CARD_TONE_CLASS: Record<CloudStatusCard["tone"], string> = {
  open: "border-ratchet bg-ratchet/10",
  active: "border-success bg-success/10",
  preview: "border-ink-4 bg-ink-1",
  upcoming: "border-warning bg-warning/10",
  disabled: "border-ink-5 bg-ink-2",
};

const ROADMAP_STATE_CLASS: Record<CloudRoadmapItem["state"], string> = {
  shipped: "product-badge-active",
  "in-progress": "product-badge-soon",
  planned: "product-badge-soon",
};

function motionProps(index = 0, reducedMotion: boolean) {
  if (reducedMotion) {
    return {};
  }

  return {
    initial: { opacity: 0, y: 14 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.25 },
    transition: { duration: 0.28, ease: "linear", delay: Math.min(index * 0.04, 0.16) },
  } as const;
}

export function CloudStatusRoadmap() {
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div className="grid gap-14">
      <section aria-labelledby="cloud-status-cards">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="cp-marker mb-4">status</p>
            <h2 id="cloud-status-cards" className="cp-h2 text-fg-1">
              Current Cloud Evidence status.
            </h2>
          </div>
          <Link
            href="/cloud/waitlist?source=cloud_status"
            className="cp-hover-link cp-link text-ratchet hover:text-ratchet-hot"
          >
            Join the waitlist
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {CLOUD_STATUS_CARDS.map((card, index) => (
            <motion.article
              key={card.title}
              {...motionProps(index, reducedMotion)}
              className={`cp-card block-shadow-sm border-2 p-5 ${CARD_TONE_CLASS[card.tone]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="cp-h4 text-fg-1">{card.title}</h3>
                <span className="product-badge-soon whitespace-nowrap">{card.state}</span>
              </div>
              <p className="cp-small mt-4 text-fg-2">{card.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section aria-labelledby="cloud-roadmap">
        <p className="cp-marker mb-4">roadmap</p>
        <h2 id="cloud-roadmap" className="cp-h2 max-w-3xl text-fg-1">
          Now, next, later.
        </h2>
        <p className="cp-body mt-4 max-w-3xl text-fg-2">
          Roadmap status here is directional. It is not an uptime page, SLA, or
          production availability claim.
        </p>

        <ol className="mt-8 grid gap-5 lg:grid-cols-3">
          {["Now", "Next", "Later"].map((period) => (
            <li key={period} className="border-ink-4 bg-ink-1 border-2 p-5">
              <p className="cp-caption text-ratchet">{period}</p>
              <div className="mt-5 grid gap-4">
                {CLOUD_ROADMAP.filter((item) => item.period === period).map((item, index) => (
                  <motion.div
                    key={item.title}
                    layout={!reducedMotion}
                    {...motionProps(index, reducedMotion)}
                    className="border-ink-4 bg-ink-0 border p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="cp-h4 text-fg-1">{item.title}</h3>
                      <span className={ROADMAP_STATE_CLASS[item.state]}>{item.state}</span>
                    </div>
                    <p className="cp-small mt-3 text-fg-2">{item.body}</p>
                  </motion.div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="cloud-update-log">
        <p className="cp-marker mb-4">updates</p>
        <h2 id="cloud-update-log" className="cp-h2 text-fg-1">
          Update log.
        </h2>
        <ol className="border-ink-4 mt-8 grid gap-0 border-y-2">
          {CLOUD_UPDATE_LOG.map((item, index) => (
            <motion.li
              key={`${item.date}-${item.title}`}
              {...motionProps(index, reducedMotion)}
              className="border-ink-4 grid gap-2 border-b py-5 last:border-b-0 md:grid-cols-[160px_minmax(0,1fr)]"
            >
              <time dateTime={item.date} className="cp-caption text-fg-3">
                {item.date}
              </time>
              <div>
                <h3 className="cp-h4 text-fg-1">{item.title}</h3>
                <p className="cp-small mt-2 text-fg-2">{item.body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="cloud-status-links"
        className="border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6"
      >
        <p className="cp-marker mb-4">links</p>
        <h2 id="cloud-status-links" className="cp-h2 text-fg-1">
          Follow or review the preview.
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Link
            href="/cloud/waitlist?source=cloud_status"
            className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ratchet px-4 py-3 text-ink-0 transition-colors hover:bg-ratchet-hot"
          >
            Join waitlist
          </Link>
          <Link
            href="/cloud"
            className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-1 px-4 py-3 text-fg-1 transition-colors hover:bg-ink-2"
          >
            Cloud overview
          </Link>
          <a
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-1 px-4 py-3 text-fg-1 transition-colors hover:bg-ink-2"
          >
            X @codepawl
          </a>
          <a
            href={THREADS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-1 px-4 py-3 text-fg-1 transition-colors hover:bg-ink-2"
          >
            Threads @codepawl
          </a>
          <Link
            href="/cloud/evidence"
            className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-1 px-4 py-3 text-fg-1 transition-colors hover:bg-ink-2"
          >
            Evidence Hub
          </Link>
        </div>
      </section>
    </div>
  );
}
