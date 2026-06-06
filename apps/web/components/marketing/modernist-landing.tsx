import Link from "next/link";
import { ArrowRight, JournalText } from "react-bootstrap-icons";

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
  status: "complete" | "current" | "todo";
};

const LANDING_PRODUCTS = STACK_PRODUCTS;

const EVIDENCE_ITEMS: ReadonlyArray<EvidenceItem> = [
  {
    label: "Products",
    body: "Browse the current agent tooling catalog.",
    href: "/products",
    action: "Browse products",
  },
  {
    label: "Docs",
    body: "Read setup notes and product documentation.",
    href: "/docs",
    action: "Read docs",
  },
  {
    label: "Contact",
    body: "Talk to us about production agent workflows.",
    href: "/contact",
    action: "Contact us",
  },
  {
    label: "Updates",
    body: "Follow product releases and notes.",
    href: "/blog",
    action: "Read updates",
  },
] as const;

const ROADMAP_ITEMS: ReadonlyArray<RoadmapItem> = [
  {
    phase: "Phase 1-2",
    title: "Foundation",
    status: "complete",
  },
  {
    phase: "Phase 3-5",
    title: "Catalog and API",
    status: "complete",
  },
  {
    phase: "Now",
    title: "Product surface",
    status: "current",
  },
  {
    phase: "Next",
    title: "More demos and guides",
    status: "todo",
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
      className={`block-shadow-sm border-2 border-ink-4 ${toneClass} ${className}`}
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
    status === "complete" || status === "stable" || status === "beta"
      ? "bg-success/15 text-success border-success"
      : status === "current" || status === "alpha" || status === "pre-alpha"
        ? "bg-ratchet/10 text-ratchet border-ratchet"
        : "bg-ink-2 text-fg-3 border-ink-4";

  return (
    <span className={`cp-caption inline-flex border px-2 py-1 ${tone}`}>
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
          Browse products
          <ArrowRight aria-hidden size={16} />
        </Link>
      </BlockPress>
      <BlockPress className="inline-flex">
        <Link
          href="/docs"
          className="cp-hover-button cp-button inline-flex items-center justify-center gap-2 border-2 border-ink-4 bg-ink-1 px-5 py-3 text-fg-1 transition-colors hover:bg-ink-2 focus:outline-none focus:ring-4 focus:ring-ratchet/20"
        >
          Read docs
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
            {product.availability === "active" ? (
              <span className="product-pulse-dot" aria-hidden />
            ) : null}
            {productAvailabilityLabel(product)}
          </span>
        </header>
        <p className="cp-body mt-5">{product.tagline}</p>
        <Link
          href={`/products/${product.slug}`}
          className="cp-hover-link cp-link mt-auto inline-flex w-fit items-center gap-2 pt-8 text-ratchet hover:text-ratchet-hot"
        >
          {product.availability === "active" ? "View product" : "Early access"}{" "}
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
    item.status === "complete"
      ? "bg-success"
      : item.status === "current"
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
  const productStatuses = Array.from(
    new Set(LANDING_PRODUCTS.map((product) => product.status)),
  ).join(" / ");

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
                    AI agent products for teams building production{" "}
                    <em className="cp-em">platforms</em>.
                  </h1>
                </BlockReveal>
                <BlockReveal delay={0.05}>
                  <p className="cp-lead mt-8 max-w-2xl">
                    Codepawl builds agent tooling for designing, evaluating, and
                    operating production systems across modern engineering teams.
                  </p>
                </BlockReveal>
              </div>
              <BlockReveal
                className="grid gap-5 border-y-2 border-ink-4 py-5 sm:grid-cols-3"
                delay={0.1}
              >
                <div>
                  <p className="cp-caption text-fg-3">Products</p>
                  <p className="cp-h4 mt-1 text-fg-1">
                    {LANDING_PRODUCTS.length}
                  </p>
                </div>
                <div>
                  <p className="cp-caption text-fg-3">Statuses</p>
                  <p className="cp-small mt-1 text-fg-2">{productStatuses}</p>
                </div>
                <div>
                  <p className="cp-caption text-fg-3">Focus</p>
                  <p className="cp-small mt-1 text-fg-2">Production agents</p>
                </div>
              </BlockReveal>
              <BlockReveal delay={0.15}>
                <CTAGroup />
              </BlockReveal>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-ink-4 bg-ink-1">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <SectionHeader
            eyebrow="002 / customer journey"
            title="The problem is not writing code. It is operating agent work."
            body="CodePawl connects failure diagnosis, memory, coordination, and cost control into the workflow teams need after the first demo works."
          />
          <CustomerJourney />
        </div>
      </section>

      <section className="concrete-grid border-b-2 border-ink-4">
        <div className="mx-auto max-w-[1240px] px-6 py-16 md:py-20">
          <SectionHeader
            eyebrow="003 / products"
            title="A focused toolkit for production agents."
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
            title="What is ready, and what is next."
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
            title="Pick the path you need."
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
              Start with the product catalog.
            </h2>
            <p className="cp-body mt-5 max-w-xl">
              Browse the tools, read the docs, or contact us when you are ready
              to talk through a production agent workflow.
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
