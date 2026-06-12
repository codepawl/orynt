import { Link } from "@/components/link";
import { OPENPAWL_RELEASE } from "@/src/data/openpawl-release";
import { ArrowRight, Github, JournalText } from "react-bootstrap-icons";

import { ArchitecturalOverlay } from "./architectural-overlay";
import { CustomerJourney } from "./customer-journey";
import {
  BlockMotionItem,
  BlockMotionListItem,
  BlockPress,
  BlockReveal,
  BlockRevealListItem,
} from "./motion-primitives";
import {
  STACK_PRODUCTS,
  productAvailabilityLabel,
  productBadgeClass,
  productStateClass,
  type StackProduct,
} from "./products";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  body?: string;
};

type BrutalCardProps = {
  children: React.ReactNode;
  tone?: "bone" | "concrete" | "charcoal";
  className?: string;
};

type EvidenceItem = {
  label: string;
  body: string;
  href: string;
  action: string;
};

type RoadmapItem = {
  phase: string;
  title: string;
  status: "available" | "upcoming" | "roadmap";
};

const LANDING_PRODUCTS = STACK_PRODUCTS;

const EVIDENCE_ITEMS: ReadonlyArray<EvidenceItem> = [
  {
    label: "Install",
    body: "Pin the public Openpawl Action release for reviewable agent work.",
    href: "/openpawl/install",
    action: "Install Openpawl",
  },
  {
    label: "Docs",
    body: "Read Action inputs, reviewable plans, artifacts, safety gates, and support boundaries.",
    href: "/openpawl/docs",
    action: "Read Openpawl docs",
  },
  {
    label: "Support",
    body: "Use public issues for product questions and private advisories for security reports.",
    href: "/openpawl/support",
    action: "Get support",
  },
  {
    label: "Status",
    body: "Check public source, workflow, legal, and Marketplace-readiness links.",
    href: "/status",
    action: "View status",
  },
] as const;

const ROADMAP_ITEMS: ReadonlyArray<RoadmapItem> = [
  {
    phase: "Now",
    title: "Openpawl public Action release",
    status: "available",
  },
  {
    phase: "Next",
    title: "CodePawl Cloud waitlist",
    status: "upcoming",
  },
  {
    phase: "Roadmap",
    title: "TracePawl evidence and replay layer",
    status: "roadmap",
  },
  {
    phase: "Roadmap",
    title: "Mempawl and CachePawl architecture layers",
    status: "roadmap",
  },
] as const;

function SectionHeader({ eyebrow, title, body }: SectionHeaderProps) {
  return (
    <BlockReveal className="max-w-3xl">
      <header>
        <p className="cp-marker">{eyebrow}</p>
        <h2 className="cp-h2 mt-5 text-fg-1">{title}</h2>
        {body ? <p className="cp-body mt-4 max-w-xl">{body}</p> : null}
      </header>
    </BlockReveal>
  );
}

function BrutalCard({ children, tone = "bone", className = "" }: BrutalCardProps) {
  const toneClass =
    tone === "charcoal"
      ? "bg-ink-0 text-fg-1"
      : tone === "concrete"
        ? "bg-ink-2 text-fg-1"
        : "bg-ink-1 text-fg-1";

  return (
    <article
      className={`cp-card block-shadow-sm border-2 border-ink-4 ${toneClass} ${className}`}
    >
      {children}
    </article>
  );
}

function StatusTag({
  status,
}: {
  status: StackProduct["status"] | RoadmapItem["status"];
}) {
  const tone =
    status === "available" || status === "stable" || status === "beta"
      ? "bg-success/15 text-success border-success"
      : status === "upcoming" || status === "alpha" || status === "pre-alpha"
        ? "bg-ratchet/10 text-ratchet border-ratchet"
        : "bg-ink-2 text-fg-3 border-ink-4";

  return (
    <span className={`cp-caption cp-small-surface inline-flex border px-2 py-1 ${tone}`}>
      {status}
    </span>
  );
}

function CTAGroup() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <BlockPress className="inline-flex">
        <Link
          href="/products"
          className="cp-hover-button cp-button inline-flex items-center justify-center gap-2 border-2 border-ink-4 bg-ink-4 px-5 py-3 text-ink-1 transition-colors hover:bg-ratchet focus:outline-none focus:ring-4 focus:ring-ratchet/20"
        >
          View architecture
          <ArrowRight aria-hidden size={16} />
        </Link>
      </BlockPress>
      <BlockPress className="inline-flex">
        <Link
          href="/openpawl/install"
          className="cp-hover-button cp-button inline-flex items-center justify-center gap-2 border-2 border-ink-4 bg-ink-1 px-5 py-3 text-fg-1 transition-colors hover:bg-ink-2 focus:outline-none focus:ring-4 focus:ring-ratchet/20"
        >
          Install Openpawl
          <JournalText aria-hidden size={16} />
        </Link>
      </BlockPress>
    </div>
  );
}

function ProjectCard({
  product,
  index,
}: {
  product: StackProduct;
  index: number;
}) {
  return (
    <BlockMotionItem className="h-full" delay={index * 0.04}>
      <BrutalCard
        className={`cp-hover-frame flex h-full flex-col p-5 ${productStateClass(product)}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-4 pb-4">
          <div>
            <p className="cp-caption text-fg-3">
              {String(product.display_order).padStart(2, "0")} /{" "}
              {product.language}
            </p>
            <h3 className="cp-h3 mt-2 text-fg-1">{product.name}</h3>
          </div>
          <span className={productBadgeClass(product)}>
            {product.availability === "available" || product.availability === "beta" ? (
              <span className="product-pulse-dot" aria-hidden />
            ) : null}
            {productAvailabilityLabel(product)}
          </span>
        </header>
        <p className="cp-body mt-5">{product.tagline}</p>
        <Link
          href={product.slug === "openpawl" ? "/openpawl" : `/products/${product.slug}`}
          className="cp-hover-link cp-link mt-auto inline-flex w-fit items-center gap-2 pt-8 text-ratchet hover:text-ratchet-hot"
        >
          {product.availability === "available" ? "View product" : "View roadmap"}{" "}
          <ArrowRight aria-hidden size={14} />
        </Link>
      </BrutalCard>
    </BlockMotionItem>
  );
}

function EvidenceRow({ item, index }: { item: EvidenceItem; index: number }) {
  return (
    <BlockMotionListItem
      className="cp-hover-frame block-shadow-sm h-full border-2 border-ink-4 bg-ink-1 p-5"
      delay={index * 0.04}
    >
      <p className="cp-caption text-ratchet">{item.label}</p>
      <p className="cp-body mt-4 min-h-[48px] text-fg-1">{item.body}</p>
      <Link
        href={item.href}
        className="cp-hover-link cp-link mt-6 inline-flex w-full items-center justify-between gap-2 border-t border-ink-4 pt-4 text-fg-1 hover:text-ratchet"
      >
        {item.action} <ArrowRight aria-hidden size={14} />
      </Link>
    </BlockMotionListItem>
  );
}

function RoadmapStep({
  item,
  isLast,
  index,
}: {
  item: RoadmapItem;
  isLast: boolean;
  index: number;
}) {
  const markerClass =
    item.status === "available"
      ? "bg-success"
      : item.status === "upcoming"
        ? "bg-ratchet"
        : "bg-ink-2";

  return (
    <BlockRevealListItem
      className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-4 pb-8 last:pb-0 md:grid-cols-[150px_24px_minmax(0,1fr)_auto] md:gap-x-6"
      delay={index * 0.04}
    >
      <p className="cp-caption col-start-2 text-fg-3 md:col-start-1 md:pt-1">
        {item.phase}
      </p>
      <div
        className="relative col-start-1 row-span-3 row-start-1 flex justify-center md:col-start-2"
        aria-hidden="true"
      >
        <span
          className={`relative z-10 mt-1 h-5 w-5 border-2 border-ink-4 ${markerClass}`}
        />
        {!isLast ? (
          <span className="absolute bottom-[-32px] left-1/2 top-9 w-0.5 -translate-x-1/2 bg-ink-4" />
        ) : null}
      </div>
      <h3 className="cp-h4 col-start-2 text-fg-1 md:col-start-3">
        {item.title}
      </h3>
      <div className="col-start-2 md:col-start-4 md:justify-self-end">
        <StatusTag status={item.status} />
      </div>
    </BlockRevealListItem>
  );
}

export function ModernistLanding() {
  return (
    <div className="text-fg-1">
      <section className="concrete-grid relative overflow-hidden border-b-2 border-ink-4">
        <div className="relative mx-auto max-w-[1240px] px-6 py-16 md:py-24">
          <ArchitecturalOverlay className="right-[-210px] top-[-92px] h-[720px] w-[670px] opacity-[0.07] lg:right-[-170px] lg:top-[-120px] lg:opacity-[0.085]" />
          <div className="relative z-10 max-w-4xl">
            <div className="flex flex-col justify-between gap-12">
              <div>
                <BlockReveal>
                  <p className="cp-marker mb-6">001 / codepawl public surface</p>
                  <h1 className="cp-display max-w-4xl text-fg-1">
                    CodePawl makes coding agents work{" "}
                    <em className="cp-em">together</em>.
                  </h1>
                </BlockReveal>
                <BlockReveal delay={0.05}>
                  <p className="cp-lead mt-8 max-w-2xl">
                    Infrastructure for coordinated agent work - plans, evidence,
                    guardrails, memory, replay, and cloud workflows. Openpawl is
                    the current open coordination runtime: reviewable agent work,
                    starting in GitHub.
                  </p>
                </BlockReveal>
              </div>
              <BlockReveal
                className="grid gap-5 border-y-2 border-ink-4 py-5 sm:grid-cols-3"
                delay={0.1}
              >
                <div>
                  <p className="cp-caption text-fg-3">Current product</p>
                  <p className="cp-h4 mt-1 text-fg-1">
                    Openpawl
                  </p>
                </div>
                <div>
                  <p className="cp-caption text-fg-3">Readiness</p>
                  <p className="cp-small mt-1 text-fg-2">
                    Openpawl AVAILABLE / future layers ROADMAP
                  </p>
                </div>
                <div>
                  <p className="cp-caption text-fg-3">Cloud</p>
                  <p className="cp-small mt-1 text-fg-2">Upcoming</p>
                </div>
              </BlockReveal>
              <BlockReveal delay={0.15}>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <BlockPress className="inline-flex">
                    <Link
                      href="/openpawl/install"
                      className="cp-hover-button cp-button inline-flex items-center justify-center gap-2 border-2 border-ink-4 bg-ink-4 px-5 py-3 text-ink-1 transition-colors hover:bg-ratchet focus:outline-none focus:ring-4 focus:ring-ratchet/20"
                    >
                      Install Openpawl
                      <ArrowRight aria-hidden size={16} />
                    </Link>
                  </BlockPress>
                  <BlockPress className="inline-flex">
                    <a
                      href={OPENPAWL_RELEASE.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cp-hover-button cp-button inline-flex items-center justify-center gap-2 border-2 border-ink-4 bg-ink-1 px-5 py-3 text-fg-1 transition-colors hover:bg-ink-2 focus:outline-none focus:ring-4 focus:ring-ratchet/20"
                    >
                      {OPENPAWL_RELEASE.actionRef}
                      <Github aria-hidden size={16} />
                    </a>
                  </BlockPress>
                  <BlockPress className="inline-flex">
                    <Link
                      href="/contact"
                      className="cp-hover-button cp-button inline-flex items-center justify-center gap-2 border-2 border-ink-4 bg-ink-1 px-5 py-3 text-fg-1 transition-colors hover:bg-ink-2 focus:outline-none focus:ring-4 focus:ring-ratchet/20"
                    >
                      Join Cloud waitlist
                      <ArrowRight aria-hidden size={16} />
                    </Link>
                  </BlockPress>
                </div>
              </BlockReveal>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-ink-4 bg-ink-1">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <SectionHeader
            eyebrow="002 / customer journey"
            title="Reviewable agent work, starting in GitHub."
            body="Start with the GitHub Action surface: dry-run by default, reviewable plans, schema-versioned artifacts, Evidence Summary output, and explicit write-mode gates."
          />
          <CustomerJourney />
        </div>
      </section>

      <section className="concrete-grid border-b-2 border-ink-4">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <SectionHeader
            eyebrow="003 / products"
            title="One open runtime, three future architecture layers."
            body="Openpawl is available now. TracePawl, Mempawl, and CachePawl describe future layers around coordination evidence, memory, and optimization, not equal ready products."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {LANDING_PRODUCTS.map((product, index) => (
              <ProjectCard key={product.id} product={product} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-b-2 border-ink-4 bg-ink-1">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <SectionHeader
            eyebrow="004 / roadmap and status"
            title="What is available, upcoming, and still roadmap."
          />
          <ol className="mt-10 border-2 border-ink-4 bg-ink-0 p-6 md:p-8">
            {ROADMAP_ITEMS.map((item, index) => (
              <RoadmapStep
                key={`${item.phase}-${item.title}`}
                item={item}
                isLast={index === ROADMAP_ITEMS.length - 1}
                index={index}
              />
            ))}
          </ol>
        </div>
      </section>

      <section className="concrete-grid border-b-2 border-ink-4">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <SectionHeader
            eyebrow="005 / start"
            title="Openpawl links for install, docs, support, and status."
          />
          <ul className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {EVIDENCE_ITEMS.map((item, index) => (
              <EvidenceRow key={item.label} item={item} index={index} />
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b-2 border-ink-4 bg-ink-0">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <BlockReveal>
            <p className="cp-marker mb-6">006 / next</p>
            <h2 className="cp-h2 max-w-2xl text-fg-1">
              CodePawl Cloud is upcoming and waitlist-only.
            </h2>
            <p className="cp-body mt-5 max-w-xl">
              The hosted Cloud layer is not generally available yet. Join the
              waitlist to discuss run evidence, team review workflows, and
              future coordination, memory, and optimization surfaces.
            </p>
            <div className="mt-8">
              <CTAGroup />
            </div>
          </BlockReveal>
        </div>
      </section>
    </div>
  );
}
