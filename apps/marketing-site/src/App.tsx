import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BrainCircuit,
  ChevronRight,
  Check,
  Eye,
  GitBranchPlus,
  PanelTop,
  Play,
  Save,
  ScreenShare,
  ShieldCheck,
} from "lucide-react";

import brainAsciiMonochrome from "../../../assets/pictures/brain-ascii-monochrome.svg";
import lightbulbLogoOnDark from "../../../assets/pictures/lightbulb-mark-on-dark.svg";

const loadingScreenMinimumMs = 650;
const loadingScreenFallbackMs = 2400;
const workflowNavigationCooldownMs = 500;
const appRoutes = [
  "/",
  "/pricing",
  "/docs",
  "/contact",
  "/access",
  "/guides",
  "/api-reference",
  "/build-log",
  "/careers",
  "/legal",
  "/privacy",
  "/terms",
  "/security",
] as const;
type AppRoute = (typeof appRoutes)[number];

const isAppRoute = (href: string): href is AppRoute => appRoutes.includes(href as AppRoute);

const getAppRouteFromPathname = (pathname: string): AppRoute => {
  const normalizedPathname = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  return isAppRoute(normalizedPathname) ? normalizedPathname : "/";
};

const scrollPageToTop = () => {
  const left = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft;
  const top = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;

  if (left === 0 && top === 0) {
    return;
  }

  if (typeof window.scrollTo === "function") {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return;
  }

  document.documentElement.scrollLeft = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollLeft = 0;
  document.body.scrollTop = 0;
};

const asciiBrainCurrentPaths = [
  { className: "landing-ascii-brain-current-primary", d: "M94 224 H160 V196 H222 V218 H286 V188 H370" },
  { className: "landing-ascii-brain-current-secondary", d: "M112 300 H184 V276 H244 V314 H314 V286 H404" },
  { className: "landing-ascii-brain-current-tertiary", d: "M160 146 H226 V168 H288 V150 H350 V184 H420" },
  { className: "landing-ascii-brain-current-quaternary", d: "M126 190 H188 V170 H248 V194 H316 V172 H392" },
  { className: "landing-ascii-brain-current-quinary", d: "M88 262 H146 V244 H214 V268 H278 V246 H356" },
  { className: "landing-ascii-brain-current-senary", d: "M150 338 H214 V318 H274 V346 H334 V326 H390" },
  { className: "landing-ascii-brain-current-septenary", d: "M186 116 H244 V138 H306 V120 H362 V152 H420" },
] as const;

function getNavItems() {
  return [
    { label: "Product", href: "/" },
    { label: "Docs", href: "/docs" },
    { label: "Contact", href: "/contact" },
    { label: "Pricing", href: "/pricing" },
  ];
}

type IconCard = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

type WorkflowStep = IconCard & {
  step: string;
};

type FooterMockPage = {
  route: AppRoute;
  title: string;
  copy: string;
  panels: Array<{
    title: string;
    copy: string;
  }>;
};

type LegalPolicyPage = {
  route: AppRoute;
  title: string;
  summary: string;
  status: string;
  contactEmail: string;
  sections: Array<{
    title: string;
    body: string[];
    items?: string[];
  }>;
};

const valueProps: IconCard[] = [
  {
    icon: BrainCircuit,
    title: "Working memory",
    copy: "Goals, repo state, constraints, and evidence stay in the agent's active context across runs.",
  },
  {
    icon: GitBranchPlus,
    title: "Skill formation",
    copy: "Reviewed corrections become reusable behavior instead of one-off prompt history.",
  },
  {
    icon: BadgeCheck,
    title: "Verifier reflex",
    copy: "Tests, traces, and source evidence become the agent's habit before trust.",
  },
  {
    icon: ShieldCheck,
    title: "Bounded agency",
    copy: "Tools, budgets, connectors, and risky actions stay inside explicit operator gates.",
  },
];

const workflow: WorkflowStep[] = [
  {
    step: "01",
    icon: Eye,
    title: "Perceive",
    copy: "Capture the goal, workspace, current state, constraints, and available tools.",
  },
  {
    step: "02",
    icon: Save,
    title: "Remember",
    copy: "Bring forward durable context, prior corrections, and relevant run evidence.",
  },
  {
    step: "03",
    icon: PanelTop,
    title: "Plan",
    copy: "Produce a bounded route with approval gates, budgets, and verifier expectations.",
  },
  {
    step: "04",
    icon: Play,
    title: "Act",
    copy: "Use tools through permissioned adapters while keeping the operator in the loop.",
  },
  {
    step: "05",
    icon: BadgeCheck,
    title: "Verify",
    copy: "Check the result with deterministic evidence before trust is granted.",
  },
  {
    step: "06",
    icon: ScreenShare,
    title: "Improve",
    copy: "Consolidate useful lessons into candidate memory and reviewed skills.",
  },
];

const workflowTrackId = "workflow-track";
const workflowFocusStates = ["active", "near", "far", "ghost"] as const;

const pricing = [
  {
    name: "Free Trial",
    price: "$0",
    meta: "Planned: 7 days",
    badge: "Best price",
    savings: "100% off trial window",
    tone: "price",
    fit: "Best for evaluating Orynt before committing.",
    copy: "Explore Orynt with full access.",
    cta: "Download trial build opens soon",
    features: ["All core features", "Up to 50 agent steps", "Closed-source product access", "Community support"],
  },
  {
    name: "Starter",
    price: "$19",
    meta: "Per user / month",
    badge: "Best value",
    savings: "20% off yearly planned",
    tone: "value",
    fit: "Best for solo operators running recurring browser work.",
    copy: "For individuals getting started.",
    cta: "Download starter build opens soon",
    features: ["Unlimited tasks", "Up to 10k steps / month", "Cost & token tracking", "Email support"],
  },
  {
    name: "Pro",
    price: "$49",
    meta: "Per user / month",
    badge: "Most control",
    savings: "Priority support lane",
    tone: "control",
    fit: "Best for heavier usage, shared skills, and tighter approvals.",
    copy: "For power users and teams.",
    cta: "Download pro build opens soon",
    features: ["Unlimited tasks & steps", "Advanced approval rules", "Skills library & sharing", "Priority support"],
  },
];

const docsCategoryFilters = ["All docs", "Get started", "Operate runs", "Teach agents", "Trust results"] as const;
type DocsCategoryFilter = (typeof docsCategoryFilters)[number];
type DocsCategory = Exclude<DocsCategoryFilter, "All docs">;

const docsPreviewSections = [
  {
    label: "Start here",
    category: "Get started",
    title: "Install, sign in, and run the first supervised task",
    copy: "The future quickstart path for desktop setup, early-access builds, and the first operator-approved run.",
    keywords: ["quickstart", "setup", "install", "first run", "operator"],
    previewTone: "rose",
  },
  {
    label: "Agent loop",
    category: "Operate runs",
    title: "How Orynt perceives, plans, acts, and verifies",
    copy: "A guided map of the working loop, tool boundaries, run state, and the review points that keep autonomy bounded.",
    keywords: ["perceive", "plan", "act", "run state", "tools"],
    previewTone: "blue",
  },
  {
    label: "Memory",
    category: "Teach agents",
    title: "What becomes durable context",
    copy: "Rules for inspecting, approving, updating, and removing remembered project context across repeated sessions.",
    keywords: ["context", "remembered", "review", "project memory"],
    previewTone: "mint",
  },
  {
    label: "Skills",
    category: "Teach agents",
    title: "Turn reviewed corrections into reusable behavior",
    copy: "How local skills are proposed, reviewed, versioned, and applied without turning every fix into a bigger prompt.",
    keywords: ["skills", "corrections", "versioned", "reusable behavior"],
    previewTone: "violet",
  },
  {
    label: "Verification",
    category: "Trust results",
    title: "Attach evidence before trusting results",
    copy: "Test, lint, typecheck, browser, and source-evidence patterns for proving an agent run actually finished.",
    keywords: ["tests", "lint", "typecheck", "evidence", "browser"],
    previewTone: "amber",
  },
  {
    label: "Approvals",
    category: "Operate runs",
    title: "Keep risky actions behind explicit gates",
    copy: "Operator controls for tool access, budgets, external connectors, filesystem changes, and handoff checkpoints.",
    keywords: ["approval", "approvals", "gates", "budget", "connectors", "filesystem"],
    previewTone: "teal",
  },
  {
    label: "Desktop builds",
    category: "Get started",
    title: "Download, update, and audit local application builds",
    copy: "The planned lane for signed app downloads, update notes, platform checks, and release-boundary documentation.",
    keywords: ["download", "desktop", "builds", "release", "updates"],
    previewTone: "silver",
  },
] satisfies Array<{
  label: string;
  category: DocsCategory;
  title: string;
  copy: string;
  keywords: string[];
  previewTone: string;
}>;

const getDocsSectionId = (label: string) => `docs-${label.toLowerCase().replaceAll(" ", "-")}`;

const getDocsSearchCorpus = (section: (typeof docsPreviewSections)[number]) =>
  [section.label, section.category, section.title, section.copy, ...section.keywords].join(" ").toLowerCase();

const contactChannels = [
  {
    label: "Primary contact",
    email: "hello@codepawl.com",
    copy: "Early-access questions, partnerships, and general Orynt intake.",
    emphasis: true,
  },
  {
    label: "Product/support",
    email: "support@codepawl.com",
    copy: "Product help, build access, account questions, and operator workflow issues.",
    emphasis: false,
  },
  {
    label: "Security reports",
    email: "security@codepawl.com",
    copy: "Responsible disclosure, vulnerability reports, permission boundaries, and abuse-risk notes.",
    emphasis: false,
  },
  {
    label: "Legal/privacy later",
    email: "privacy@codepawl.com",
    copy: "Future privacy, legal, and data-handling requests as the public package opens.",
    emphasis: false,
  },
];

const billingPeriods = [
  {
    id: "monthly",
    label: "Monthly",
    planMeta: "Per user / month",
  },
  {
    id: "quarterly",
    label: "Quarterly",
    planMeta: "Per user / quarter",
  },
  {
    id: "yearly",
    label: "Yearly",
    planMeta: "Per user / year",
  },
] as const;

const footerMockPages: FooterMockPage[] = [
  {
    route: "/guides",
    title: "Guides for operator-led agent work.",
    copy: "Future guides will turn the Orynt operating model into practical setup, run review, and skill-promotion workflows.",
    panels: [
      {
        title: "Start with a bounded run",
        copy: "Guide drafts will show how to frame a task, set approval gates, and keep provider usage visible.",
      },
      {
        title: "Review before memory",
        copy: "Corrections, test evidence, and source notes stay reviewable before they become durable behavior.",
      },
      {
        title: "Promote repeatable skills",
        copy: "Successful fixes become reusable operator patterns only after they pass verification.",
      },
    ],
  },
  {
    route: "/api-reference",
    title: "API reference preview for Orynt integrations.",
    copy: "The public API surface is not live yet. This mock page reserves the future home for connectors, run events, and local control contracts.",
    panels: [
      {
        title: "Run lifecycle contracts",
        copy: "Reference notes will describe how runs are started, observed, paused, and reviewed.",
      },
      {
        title: "Connector boundaries",
        copy: "Tool and provider integration docs will keep permission, budget, and credential boundaries explicit.",
      },
      {
        title: "Evidence payloads",
        copy: "Future schemas will separate source evidence, verification results, and operator approvals.",
      },
    ],
  },
  {
    route: "/build-log",
    title: "Build log for Orynt early access.",
    copy: "A future build log will track product decisions, desktop build availability, and meaningful changes without pretending the package is final.",
    panels: [
      {
        title: "Release notes",
        copy: "Desktop build changes, download readiness, and compatibility notes will be staged here.",
      },
      {
        title: "Design changes",
        copy: "Major shifts in memory, skills, approvals, and verification flows will stay visible.",
      },
      {
        title: "Known limits",
        copy: "Alpha constraints and provider assumptions will be written plainly before signup.",
      },
    ],
  },
  {
    route: "/careers",
    title: "Careers at Orynt will open later.",
    copy: "Orynt is not publishing roles yet. This page previews the future hiring lane for people who care about agent control systems.",
    panels: [
      {
        title: "Product engineering",
        copy: "Future roles may focus on agent runtime surfaces, local desktop workflows, and operator control loops.",
      },
      {
        title: "Security-minded systems",
        copy: "Permission gates, audit trails, and safe tool boundaries will matter more than demo-only automation.",
      },
      {
        title: "Documentation craft",
        copy: "Clear operator docs will be part of the product, not an afterthought.",
      },
    ],
  },
];

const legalPolicyLastUpdated = "July 3, 2026";

const legalPolicyPages: LegalPolicyPage[] = [
  {
    route: "/legal",
    title: "Legal center for Orynt.",
    summary:
      "This launch-draft legal center gathers the current Orynt privacy, terms, and security notes for early-access visitors.",
    status: "Launch draft for review. These pages are informational and should be reviewed by counsel before public launch.",
    contactEmail: "hello@codepawl.com",
    sections: [
      {
        title: "What this covers",
        body: [
          "Orynt is currently presented as an early-access product. The legal pages describe the intended website, access, product, and security posture for that phase.",
          "The individual policy pages are written to be plain and conservative. They should not be treated as a substitute for legal advice.",
        ],
        items: [
          "Privacy covers data categories, use, sharing, retention, rights, and contact paths.",
          "Terms covers account access, acceptable use, provider costs, product ownership, and limitations.",
          "Security notes cover reporting expectations, safe testing, and responsible disclosure boundaries.",
        ],
      },
      {
        title: "Contact lanes",
        body: [
          "Use the most specific inbox so requests can be routed cleanly while Orynt is still in early access.",
        ],
        items: [
          "General legal or product intake: hello@codepawl.com.",
          "Privacy and data-handling requests: privacy@codepawl.com.",
          "Security reports and vulnerability details: security@codepawl.com.",
        ],
      },
      {
        title: "Current launch posture",
        body: [
          "Downloads, pricing, and account access are still staged. Plan numbers are alpha planning anchors, and provider/model/browser usage is handled separately unless a trial package says otherwise.",
          "If these pages conflict with a signed written agreement, the signed agreement should control for that relationship.",
        ],
      },
    ],
  },
  {
    route: "/privacy",
    title: "Privacy policy launch draft.",
    summary:
      "This privacy draft explains what Orynt expects to collect, why it is used, and how privacy requests should be sent during early access.",
    status: "Launch draft for review. This is not legal advice and may change before public signup opens.",
    contactEmail: "privacy@codepawl.com",
    sections: [
      {
        title: "Information we expect to collect",
        body: [
          "Orynt may collect information you provide directly, such as name, email address, organization, contact messages, plan interest, and early-access requests.",
          "If account access opens, Orynt may collect account credentials or authentication metadata needed to manage access. Do not send passwords, secrets, provider keys, or confidential workspace data through public contact forms.",
        ],
        items: [
          "Contact and account details.",
          "Product/support messages and related context.",
          "Security report contents you choose to submit.",
          "Basic website diagnostics such as pages visited, browser type, approximate region, and error events if analytics are added.",
        ],
      },
      {
        title: "How information is used",
        body: [
          "Information is used to respond to requests, manage early-access interest, provide product/support communication, protect the service, understand website performance, and prepare account/download access.",
          "Orynt does not need sensitive personal data for ordinary website intake. Users should avoid submitting regulated data, secrets, credentials, or third-party confidential material unless a specific secure process is provided.",
        ],
      },
      {
        title: "Sharing and service providers",
        body: [
          "Orynt may use service providers for hosting, email, analytics, security monitoring, support, and product operations. These providers should only receive information needed to perform those services.",
          "Provider/model/browser usage for agent work is separate from Orynt plan access. If those integrations become available, their own terms and privacy practices may also apply.",
        ],
      },
      {
        title: "Retention and security",
        body: [
          "Orynt should keep personal information only as long as it is reasonably needed for the purposes described here, legal compliance, dispute handling, security, or product operations.",
          "No website can promise perfect security. Orynt intends to use reasonable safeguards, limit access to operational need, and avoid collecting information that is not useful for the early-access relationship.",
        ],
      },
      {
        title: "Choices and rights",
        body: [
          "You may contact privacy@codepawl.com to request access, correction, deletion, or restriction of personal information where applicable. Some requests may require verification.",
          "Visitors outside the United States may have additional rights under local privacy laws. Orynt will evaluate those requests based on the applicable law and the current product stage.",
        ],
      },
      {
        title: "Children and updates",
        body: [
          "Orynt is intended for technical operators and teams, not children. The service should not knowingly collect information from children.",
          "This page may be updated as account access, downloads, analytics, billing, or provider integrations become more concrete.",
        ],
      },
    ],
  },
  {
    route: "/terms",
    title: "Terms of use launch draft.",
    summary:
      "These terms describe the expected rules for using the Orynt website, early-access materials, and future download lane.",
    status: "Launch draft for review. These terms are informational until public signup or a signed agreement adopts them.",
    contactEmail: "hello@codepawl.com",
    sections: [
      {
        title: "Early-access status",
        body: [
          "Orynt is not yet a generally available product. Website content, pricing, plan limits, download availability, support levels, and product capabilities may change before launch.",
          "A payment flow is not active on the current marketing site. If paid plans open later, the final package and cancellation terms should be presented before signup.",
        ],
      },
      {
        title: "Accounts and downloads",
        body: [
          "Downloads may require an account or access step so Orynt can connect builds, update notices, plan context, and security notes to the right operator.",
          "You are responsible for keeping account credentials and provider keys secure. Do not share access in a way that bypasses intended plan, security, or approval boundaries.",
        ],
      },
      {
        title: "Acceptable use",
        body: [
          "Use Orynt and related materials lawfully and responsibly. Do not use the service to violate third-party rights, attack systems, bypass access controls, abuse websites, evade security controls, or process data you are not authorized to use.",
          "Agentic tool use must remain under appropriate human supervision, especially for actions involving files, credentials, account changes, browser sessions, payments, or destructive operations.",
        ],
      },
      {
        title: "Provider usage and costs",
        body: [
          "Model, browser-provider, infrastructure, and third-party service costs are separate from Orynt plan access unless a trial or written package says otherwise.",
          "You are responsible for understanding the terms, costs, data handling, and limits of providers you connect to Orynt.",
        ],
      },
      {
        title: "Ownership and feedback",
        body: [
          "Orynt and its website, design, software, documentation, and product materials remain owned by Orynt or its licensors.",
          "If you send feedback, suggestions, or product ideas, Orynt may use them without obligation, while respecting any separate written confidentiality commitments.",
        ],
      },
      {
        title: "Disclaimers, limits, and changes",
        body: [
          "Early-access materials are provided for evaluation and may contain defects, incomplete features, or changing limits. Orynt should not be used as the only control for high-risk decisions.",
          "These terms may change as the product moves toward public access. Continued use after an update means the updated terms apply unless a signed agreement says otherwise.",
        ],
      },
    ],
  },
  {
    route: "/security",
    title: "Security notes and reporting.",
    summary:
      "These security notes describe how to report vulnerabilities and how Orynt expects responsible testing to work during early access.",
    status: "Launch draft for review. Security procedures may change as the product and disclosure process mature.",
    contactEmail: "security@codepawl.com",
    sections: [
      {
        title: "Report a vulnerability",
        body: [
          "Send security reports to security@codepawl.com. Include enough detail to understand impact, affected surface, reproduction steps, and whether credentials, personal data, or third-party systems may be involved.",
          "Please avoid sending sensitive exploit artifacts through public channels unless Orynt provides a secure transfer path.",
        ],
        items: [
          "Affected URL, build, route, package, or component.",
          "Steps to reproduce and expected impact.",
          "Screenshots, logs, or proof-of-concept details that avoid exposing unrelated data.",
          "Your preferred contact method for follow-up.",
        ],
      },
      {
        title: "Responsible testing boundaries",
        body: [
          "Testing should avoid harm, privacy intrusion, data destruction, persistence, social engineering, spam, denial-of-service, and attempts to access accounts or data you do not own.",
          "If you discover data exposure, stop testing, preserve minimal evidence, and report the issue promptly.",
        ],
      },
      {
        title: "Out of scope",
        body: [
          "Reports that rely only on missing headers, automated scanner output without exploitability, self-XSS, spam, social engineering, physical attacks, or denial-of-service may not be actionable during early access.",
          "Do not test third-party providers, websites, or accounts through Orynt unless you have independent authorization for those targets.",
        ],
      },
      {
        title: "Security posture",
        body: [
          "Orynt is designed around operator approval gates, bounded tool use, visible evidence, and separation between Orynt access and external provider usage.",
          "Security work should emphasize data minimization, access control, reviewable changes, dependency hygiene, and clear handling of credentials and provider tokens.",
        ],
      },
      {
        title: "Response expectations",
        body: [
          "Orynt will review legitimate reports and may ask for clarification. Response timing may vary while the early-access process is still being staged.",
          "Do not publicly disclose unresolved vulnerabilities before Orynt has had a reasonable opportunity to investigate and address the report.",
        ],
      },
    ],
  },
];

type BillingPeriod = (typeof billingPeriods)[number]["id"];
type AccessMode = "signup" | "login";

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeWorkflowIndex = (index: number) => ((Math.round(index) % workflow.length) + workflow.length) % workflow.length;

const formatWorkflowStep = (step: string) => `${Number.parseInt(step, 10)}.`;

const getWorkflowFocusState = (index: number, activeIndex: number) => {
  const distance = Math.abs(index - activeIndex);
  if (distance === 0) {
    return workflowFocusStates[0];
  }
  if (distance === 1) {
    return workflowFocusStates[1];
  }
  if (distance === 2) {
    return workflowFocusStates[2];
  }
  return workflowFocusStates[3];
};

type BrandMarkProps = {
  className?: string;
  size?: number;
};

function BrandMark({ className = "brand-logo", size = 40 }: BrandMarkProps) {
  return (
    <img
      className={className}
      src={lightbulbLogoOnDark}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ "--brand-logo-size": `${size}px` } as CSSProperties}
    />
  );
}

type RouteLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
  onNavigate?: (route: AppRoute) => void;
  ariaLabel?: string;
};

function RouteLink({ ariaLabel, children, className, href, onNavigate }: RouteLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onNavigate ||
      !isAppRoute(href) ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.currentTarget.target
    ) {
      return;
    }

    event.preventDefault();
    onNavigate(href);
  };

  return (
    <a className={className} href={href} aria-label={ariaLabel} onClick={handleClick}>
      {children}
    </a>
  );
}

function BrandLink({
  ariaLabel,
  logoSize = 40,
  onNavigate,
}: {
  ariaLabel: string;
  logoSize?: number;
  onNavigate?: (route: AppRoute) => void;
}) {
  return (
    <RouteLink className="brand" href="/" ariaLabel={ariaLabel} onNavigate={onNavigate}>
      <BrandMark size={logoSize} />
      <span>Orynt</span>
    </RouteLink>
  );
}

function LoadingScreen({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) {
    return null;
  }

  return (
    <section className="loading-screen" role="status" aria-live="polite" aria-label="Loading Orynt content">
      <div className="loading-screen-mark" aria-hidden="true">
        <BrandMark className="loading-screen-logo" size={128} />
      </div>
      <span className="loading-screen-label">Loading Orynt</span>
    </section>
  );
}

function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="check-list-item">
      <span className="check-icon" aria-hidden="true">
        <Check aria-hidden="true" />
      </span>
      <span>{children}</span>
    </li>
  );
}

function DownloadLinks({
  className,
  onNavigate,
  primaryHref = "/access",
  primaryLabel = "Download Orynt",
  secondaryHref = "/docs",
  secondaryLabel = "Start here",
}: {
  className: string;
  onNavigate?: (route: AppRoute) => void;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className={className}>
      <RouteLink className="button button-secondary" href={secondaryHref} onNavigate={onNavigate}>
        {secondaryLabel}
      </RouteLink>
      <RouteLink className="button button-primary" href={primaryHref} onNavigate={onNavigate}>
        {primaryLabel}
      </RouteLink>
    </div>
  );
}

function FooterMockPageView({ page }: { page: FooterMockPage }) {
  const titleId = `footer-page-title-${page.route.slice(1).replaceAll("/", "-")}`;

  return (
    <section className="footer-mock-page" aria-labelledby={titleId}>
      <div className="footer-mock-page-header">
        <h1 id={titleId}>{page.title}</h1>
        <p>{page.copy}</p>
      </div>
      <div className="footer-mock-grid" role="region" aria-label={`${page.title} preview`}>
        {page.panels.map((panel) => (
          <article className="footer-mock-card" key={panel.title}>
            <h2>{panel.title}</h2>
            <p>{panel.copy}</p>
          </article>
        ))}
      </div>
      <p className="footer-mock-note">Mock page only. Final content will be published as early access opens.</p>
    </section>
  );
}

function LegalPolicyPageView({ page }: { page: LegalPolicyPage }) {
  const titleId = `legal-page-title-${page.route.slice(1).replaceAll("/", "-")}`;

  return (
    <section className="legal-page" aria-labelledby={titleId}>
      <div className="legal-page-header">
        <div>
          <h1 id={titleId}>{page.title}</h1>
          <p>{page.summary}</p>
        </div>
        <aside className="legal-page-summary" aria-label={`${page.title} status`}>
          <strong>Launch-draft notice</strong>
          <p>{page.status}</p>
          <span>Last updated: {legalPolicyLastUpdated}</span>
        </aside>
      </div>

      <div className="legal-page-shell">
        <nav className="legal-page-index" aria-label={`${page.title} sections`}>
          <strong>On this page</strong>
          {page.sections.map((section) => (
            <a href={`#${getDocsSectionId(section.title)}`} key={section.title}>
              {section.title}
            </a>
          ))}
        </nav>

        <div className="legal-page-content">
          {page.sections.map((section) => (
            <section className="legal-section" id={getDocsSectionId(section.title)} key={section.title}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.items ? (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <div className="legal-contact-card">
            <div>
              <h2>Questions or requests</h2>
              <p>Use the policy-specific inbox so Orynt can route the request while early access is still staged.</p>
            </div>
            <a className="button button-secondary contact-mail-button" href={`mailto:${page.contactEmail}`}>
              {page.contactEmail}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function AsciiBrain() {
  return (
    <span className="landing-ascii-brain-shell" aria-hidden="true">
      <img className="landing-ascii-brain" src={brainAsciiMonochrome} alt="" aria-hidden="true" draggable={false} />
      <svg className="landing-ascii-brain-electric" viewBox="0 0 512 512" focusable="false">
        {asciiBrainCurrentPaths.map((path) => (
          <path className={`landing-ascii-brain-current ${path.className}`} d={path.d} key={path.className} />
        ))}
      </svg>
    </span>
  );
}

function LandingPageAnimation() {
  return (
    <div className="landing-animation-stage">
      <span className="landing-animation-halftone landing-animation-halftone-primary" aria-hidden="true" />
      <span className="landing-animation-halftone landing-animation-halftone-secondary" aria-hidden="true" />
      <AsciiBrain />
    </div>
  );
}

function App() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => getAppRouteFromPathname(window.location.pathname));
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [accessMode, setAccessMode] = useState<AccessMode>("signup");
  const [hasDownloadAccess, setHasDownloadAccess] = useState(false);
  const [docsSearchQuery, setDocsSearchQuery] = useState("");
  const [selectedDocsCategory, setSelectedDocsCategory] = useState<DocsCategoryFilter>("All docs");
  const [isLoadingScreenVisible, setIsLoadingScreenVisible] = useState(true);
  const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);
  const activeFooterMockPage = footerMockPages.find((page) => page.route === currentRoute);
  const activeLegalPage = legalPolicyPages.find((page) => page.route === currentRoute);
  const prefersReducedMotionRef = useRef(false);
  const workflowTrackRef = useRef<HTMLDivElement | null>(null);
  const workflowCardRefs = useRef<Record<number, HTMLElement | null>>({});
  const workflowSwipeRef = useRef({
    didSwipe: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
  });
  const workflowNavButtonPointerRef = useRef(false);
  const workflowNavigationLockedRef = useRef(false);
  const workflowNavigationUnlockTimerRef = useRef<number | null>(null);
  const previousRouteRef = useRef(currentRoute);
  const navItems = getNavItems();
  const selectedBillingPeriod = billingPeriods.find((period) => period.id === billingPeriod) ?? billingPeriods[0];
  const isWorkflowAtLoopEnd = activeWorkflowIndex === workflow.length - 1;
  const normalizedDocsSearchQuery = docsSearchQuery.trim().toLowerCase();
  const visibleDocsPreviewSections = docsPreviewSections.filter((section) => {
    const categoryMatches = selectedDocsCategory === "All docs" || section.category === selectedDocsCategory;
    const searchMatches =
      normalizedDocsSearchQuery.length === 0 || getDocsSearchCorpus(section).includes(normalizedDocsSearchQuery);

    return categoryMatches && searchMatches;
  });

  const navigateToRoute = (route: AppRoute) => {
    if (window.location.pathname !== route) {
      window.history.pushState({}, "", route);
    }
    setCurrentRoute(route);
  };

  const navigateToAccess = () => {
    navigateToRoute("/access");
  };

  const handleAccessSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasDownloadAccess(true);
    navigateToRoute("/pricing");
  };

  const resetTiltCard = (event: PointerEvent<HTMLElement>) => {
    const card = event.currentTarget;
    card.style.setProperty("--tilt-rotate-x", "0deg");
    card.style.setProperty("--tilt-rotate-y", "0deg");
    card.style.setProperty("--tilt-lift", "0");
  };

  const handleTiltCardPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (prefersReducedMotionRef.current) {
      resetTiltCard(event);
      return;
    }

    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const normalizedX = (event.clientX - rect.left) / width - 0.5;
    const normalizedY = (event.clientY - rect.top) / height - 0.5;

    card.style.setProperty("--tilt-rotate-x", `${clamp(normalizedY * -12, -6, 6).toFixed(2)}deg`);
    card.style.setProperty("--tilt-rotate-y", `${clamp(normalizedX * 12, -6, 6).toFixed(2)}deg`);
    card.style.setProperty("--tilt-lift", "1");
  };

  const lockWorkflowNavigation = () => {
    if (workflowNavigationLockedRef.current) {
      return false;
    }

    workflowNavigationLockedRef.current = true;
    workflowNavigationUnlockTimerRef.current = window.setTimeout(() => {
      workflowNavigationLockedRef.current = false;
      workflowNavigationUnlockTimerRef.current = null;
    }, workflowNavigationCooldownMs);

    return true;
  };

  const scrollWorkflowToPosition = (position: number, behaviorOverride?: ScrollBehavior) => {
    const track = workflowTrackRef.current;
    const card = workflowCardRefs.current[position];
    if (!track || !card) {
      return false;
    }

    const maxScroll = track.scrollWidth - track.clientWidth;
    const centeredLeft = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
    const left = clamp(centeredLeft, 0, Math.max(0, maxScroll));
    const behavior = prefersReducedMotionRef.current ? "auto" : (behaviorOverride ?? "smooth");
    if (typeof track.scrollTo === "function") {
      track.scrollTo({ left, behavior });
      return true;
    }

    track.scrollLeft = left;
    return true;
  };

  const selectWorkflowIndex = (index: number) => {
    setActiveWorkflowIndex(normalizeWorkflowIndex(index));
  };

  const selectRelativeWorkflowIndex = (direction: -1 | 1) => {
    if (!lockWorkflowNavigation()) {
      return;
    }

    setActiveWorkflowIndex((index) => normalizeWorkflowIndex(index + direction));
  };

  const handleWorkflowTrackKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectRelativeWorkflowIndex(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectRelativeWorkflowIndex(-1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectWorkflowIndex(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      selectWorkflowIndex(workflow.length - 1);
    }
  };

  const handleWorkflowPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    workflowSwipeRef.current = {
      didSwipe: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleWorkflowPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const swipeState = workflowSwipeRef.current;
    if (swipeState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    const deltaX = event.clientX - swipeState.startX;
    const deltaY = event.clientY - swipeState.startY;
    const isHorizontalSwipe = Math.abs(deltaX) >= 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

    workflowSwipeRef.current.pointerId = -1;

    if (isHorizontalSwipe) {
      workflowSwipeRef.current.didSwipe = true;
      selectRelativeWorkflowIndex(deltaX < 0 ? 1 : -1);
    }
  };

  const handleWorkflowPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (workflowSwipeRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    workflowSwipeRef.current.pointerId = -1;
    workflowSwipeRef.current.didSwipe = false;
  };

  const handleWorkflowCardClick = (index: number) => {
    if (workflowSwipeRef.current.didSwipe) {
      workflowSwipeRef.current.didSwipe = false;
      return;
    }

    selectWorkflowIndex(index);
  };

  const handleWorkflowNavButtonPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    workflowNavButtonPointerRef.current = true;
  };

  const handleWorkflowNavButtonClick = (event: MouseEvent<HTMLButtonElement>, direction: -1 | 1) => {
    selectRelativeWorkflowIndex(direction);

    if (!workflowNavButtonPointerRef.current) {
      return;
    }

    const button = event.currentTarget;
    workflowNavButtonPointerRef.current = false;
    window.requestAnimationFrame(() => {
      button.blur();
    });
  };

  useEffect(() => {
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      prefersReducedMotionRef.current = motionQuery?.matches ?? false;
    };

    syncMotionPreference();
    motionQuery?.addEventListener("change", syncMotionPreference);

    return () => {
      motionQuery?.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (workflowNavigationUnlockTimerRef.current !== null) {
        window.clearTimeout(workflowNavigationUnlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncRouteFromHistory = () => {
      setCurrentRoute(getAppRouteFromPathname(window.location.pathname));
    };

    window.addEventListener("popstate", syncRouteFromHistory);

    return () => {
      window.removeEventListener("popstate", syncRouteFromHistory);
    };
  }, []);

  useLayoutEffect(() => {
    scrollPageToTop();
  }, [currentRoute]);

  useEffect(() => {
    let contentLoaded = document.readyState === "complete";
    let minimumElapsed = false;

    const hideWhenReady = () => {
      if (contentLoaded && minimumElapsed) {
        setIsLoadingScreenVisible(false);
      }
    };

    const handleLoad = () => {
      contentLoaded = true;
      hideWhenReady();
    };

    const minimumTimer = window.setTimeout(() => {
      minimumElapsed = true;
      hideWhenReady();
    }, loadingScreenMinimumMs);

    const fallbackTimer = window.setTimeout(() => {
      setIsLoadingScreenVisible(false);
    }, loadingScreenFallbackMs);

    if (contentLoaded) {
      hideWhenReady();
    } else {
      window.addEventListener("load", handleLoad, { once: true });
    }

    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  useLayoutEffect(() => {
    const previousRoute = previousRouteRef.current;
    const isProductRoute = currentRoute === "/";
    const didReturnToProductRoute = previousRoute !== "/" && isProductRoute;
    previousRouteRef.current = currentRoute;
    if (!isProductRoute) {
      return;
    }

    const didScroll = scrollWorkflowToPosition(activeWorkflowIndex, didReturnToProductRoute ? "auto" : undefined);

    if (!didScroll && didReturnToProductRoute) {
      const frame = window.requestAnimationFrame(() => {
        scrollWorkflowToPosition(activeWorkflowIndex, "auto");
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [activeWorkflowIndex, currentRoute]);

  return (
    <main className="landing-shell">
      <div className="painterly-wash" aria-hidden="true" />
      <LoadingScreen isVisible={isLoadingScreenVisible} />

      <header className="site-header">
        <BrandLink ariaLabel="Orynt home" onNavigate={navigateToRoute} />

        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <RouteLink href={item.href} key={item.label} onNavigate={navigateToRoute}>
              {item.label}
            </RouteLink>
          ))}
        </nav>

        <DownloadLinks className="header-actions" onNavigate={navigateToRoute} />
      </header>

      {currentRoute === "/" ? (
        <>
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Give AI agents a working brain.</h1>
          <p className="hero-lede">
            Orynt is a brain-like operating system for adaptive AI agents. It gives them structured memory,
            reusable skills, verification, self-improvement loops, and safe tool use so successful work can become
            reusable behavior only after review.
          </p>
          <DownloadLinks
            className="hero-actions"
            onNavigate={navigateToRoute}
            primaryHref="/pricing"
            primaryLabel="Start Here"
            secondaryLabel="Learn More"
          />
        </div>

        <section className="landing-animation" aria-label="Orynt landing page animation" id="animation">
          <div className="landing-animation-frame">
            <div className="landing-animation-visual" aria-hidden="true">
              <LandingPageAnimation />
            </div>
          </div>
        </section>
      </section>

      <section className="value-strip" aria-label="Core product values">
        {valueProps.map((item) => (
          <article key={item.title}>
            <span className="line-icon" aria-hidden="true">
              <item.icon aria-hidden="true" />
            </span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.copy}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="section workflow-section" aria-labelledby="workflow-title" id="workflow">
        <div className="section-intro">
          <div>
            <h2 id="workflow-title">A simple operator workflow.</h2>
            <p className="section-note">
              Move from prompt to live run to human review to repeatable skill without hiding the agent's decisions.
            </p>
          </div>
        </div>
        <div className="workflow-timeline">
          <div
            className="workflow-track"
            id={workflowTrackId}
            ref={workflowTrackRef}
            aria-label="Workflow steps"
            onKeyDown={handleWorkflowTrackKeyDown}
            onPointerCancel={handleWorkflowPointerCancel}
            onPointerDown={handleWorkflowPointerDown}
            onPointerUp={handleWorkflowPointerEnd}
            role="group"
            tabIndex={0}
          >
            {workflow.map((item, index) => {
              const isActiveWorkflowCard = index === activeWorkflowIndex;

              return (
                <article
                  className="workflow-card"
                  key={item.step}
                  aria-current={isActiveWorkflowCard ? "step" : undefined}
                  data-focus={getWorkflowFocusState(index, activeWorkflowIndex)}
                  ref={(node) => {
                    workflowCardRefs.current[index] = node;
                  }}
                >
                  <button
                    className="workflow-card-hitbox"
                    type="button"
                    aria-label={`Focus ${item.title} workflow step`}
                    onClick={() => handleWorkflowCardClick(index)}
                  />
                  <span className="step-number">{formatWorkflowStep(item.step)}</span>
                  <span className="workflow-icon" aria-hidden="true">
                    <item.icon aria-hidden="true" />
                  </span>
                  <div className="workflow-title-row">
                    <h3>{item.title}</h3>
                  </div>
                  <p>{item.copy}</p>
                </article>
              );
            })}
          </div>
          <div className="workflow-carousel-hit-zones" aria-label="Workflow carousel navigation">
            <button
              className="workflow-carousel-hit-zone workflow-carousel-hit-zone-previous"
              type="button"
              aria-label="Previous workflow step"
              onPointerDown={handleWorkflowNavButtonPointerDown}
              onClick={(event) => handleWorkflowNavButtonClick(event, -1)}
            />
            <button
              className="workflow-carousel-hit-zone workflow-carousel-hit-zone-next"
              type="button"
              aria-label="Next workflow step"
              onPointerDown={handleWorkflowNavButtonPointerDown}
              onClick={(event) => handleWorkflowNavButtonClick(event, 1)}
            />
          </div>
          {isWorkflowAtLoopEnd ? (
            <button
              className="workflow-loop-arrow-button"
              type="button"
              aria-label="Loop back to first workflow step"
              onPointerDown={handleWorkflowNavButtonPointerDown}
              onClick={(event) => handleWorkflowNavButtonClick(event, 1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </section>

      <section className="final-cta" aria-label="Final call to action">
        <div>
          <h2>Make agents do the work. Keep the final say.</h2>
        </div>
        <DownloadLinks
          className="final-cta-actions"
          onNavigate={navigateToRoute}
          primaryHref="/pricing"
          primaryLabel="Start Here"
          secondaryHref="/docs"
          secondaryLabel="Learn More"
        />
      </section>
        </>
      ) : null}

      {currentRoute === "/pricing" ? (
        <>
      <section className="section pricing-section" aria-labelledby="pricing-title" id="pricing">
        <div className="pricing-page-header">
          <h2 id="pricing-title">Simple, predictable pricing.</h2>
          <p className="pricing-note">
            Early access packaging. These are alpha planning numbers, not a live checkout. Provider/model usage is
            billed separately unless trial credits are included.
          </p>
          <div className="billing-toggle-wrap">
            <div className="billing-toggle" role="group" aria-label="Billing period">
              {billingPeriods.map((period) => (
                <button
                  className={
                    period.id === billingPeriod
                      ? "billing-period-button billing-period-button-active"
                      : "billing-period-button"
                  }
                  type="button"
                  aria-pressed={period.id === billingPeriod}
                  onClick={() => setBillingPeriod(period.id)}
                  key={period.id}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="pricing-grid">
          {pricing.map((plan) => (
            <article
              className={`pricing-card pricing-card-${plan.tone} tilt-card${
                plan.name === "Starter" ? " pricing-card-featured" : ""
              }`}
              key={plan.name}
              onPointerLeave={resetTiltCard}
              onPointerMove={handleTiltCardPointerMove}
            >
              <div className="price-header">
                <div>
                  <h3>{plan.name}</h3>
                  <span>{plan.name === "Free Trial" ? plan.meta : selectedBillingPeriod.planMeta}</span>
                </div>
                <strong>{plan.price}</strong>
              </div>
              <div className="plan-bait-row" aria-label={`${plan.name} pricing highlights`}>
                <span className="plan-badge">{plan.badge}</span>
                <span className="plan-savings">{plan.savings}</span>
              </div>
              <p className="plan-fit">{plan.fit}</p>
              <p>{plan.copy}</p>
              <ul>
                {plan.features.map((feature) => (
                  <CheckItem key={feature}>{feature}</CheckItem>
                ))}
              </ul>
              <button
                className="button button-primary pricing-status"
                type="button"
                disabled={hasDownloadAccess}
                onClick={hasDownloadAccess ? undefined : navigateToAccess}
              >
                {hasDownloadAccess
                  ? plan.cta
                  : `Sign in to unlock ${
                      plan.name === "Free Trial" ? "trial build" : `${plan.name.toLowerCase()} build`
                    }`}
              </button>
            </article>
          ))}
        </div>
        <section className="download-direct" aria-label="Direct application download">
          <div>
            <h2>Just take me to the application download.</h2>
            <p>
              Early access builds are not live yet. This lane will host the signed desktop application when downloads open.
            </p>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={hasDownloadAccess}
            onClick={hasDownloadAccess ? undefined : navigateToAccess}
          >
            {hasDownloadAccess ? "Download application opens soon" : "Sign in to unlock application download"}
          </button>
        </section>
      </section>
        </>
      ) : null}

      {currentRoute === "/access" ? (
        <section className="access-page" aria-labelledby="access-page-title">
          <div className="access-page-header">
            <h1 id="access-page-title">Create access before downloading Orynt.</h1>
            <p>
              Downloads stay behind a lightweight account step so early-access builds, plan context, security notes,
              and update notices stay attached to the right operator.
            </p>
          </div>

          <div className="access-shell">
            <form className="access-card" aria-labelledby="access-form-title" onSubmit={handleAccessSubmit}>
              <div className="access-form-heading">
                <span>Early-access gate</span>
                <h2 id="access-form-title">
                  {accessMode === "signup" ? "Sign up to continue to downloads." : "Log in to continue to downloads."}
                </h2>
              </div>
              <div className="access-mode-toggle" role="group" aria-label="Access mode">
                <button
                  className={
                    accessMode === "signup" ? "access-mode-button access-mode-button-active" : "access-mode-button"
                  }
                  type="button"
                  aria-pressed={accessMode === "signup"}
                  onClick={() => setAccessMode("signup")}
                >
                  Sign up
                </button>
                <button
                  className={accessMode === "login" ? "access-mode-button access-mode-button-active" : "access-mode-button"}
                  type="button"
                  aria-pressed={accessMode === "login"}
                  onClick={() => setAccessMode("login")}
                >
                  Log in
                </button>
              </div>
              {accessMode === "signup" ? (
                <label className="access-field" htmlFor="access-name">
                  <span>Name</span>
                  <input id="access-name" name="name" type="text" autoComplete="name" placeholder="Your name" required />
                </label>
              ) : null}
              <label className="access-field" htmlFor="access-email">
                <span>Email</span>
                <input id="access-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
              </label>
              <label className="access-field" htmlFor="access-password">
                <span>Password</span>
                <input
                  id="access-password"
                  name="password"
                  type="password"
                  autoComplete={accessMode === "signup" ? "new-password" : "current-password"}
                  placeholder="Password"
                  required
                />
              </label>
              <button className="button button-primary" type="submit">
                Continue to download preview
              </button>
              <RouteLink className="button button-secondary" href="/pricing" onNavigate={navigateToRoute}>
                Review pricing first
              </RouteLink>
            </form>

            <aside className="access-proof" aria-label="Why access is required">
              <strong>Why this step exists</strong>
              <ul>
                <li>Build access is tied to the plan and early-access package shown on pricing.</li>
                <li>Security and update notes need a verified operator inbox.</li>
                <li>Provider/model usage stays separate from Orynt plan access.</li>
              </ul>
            </aside>
          </div>
        </section>
      ) : null}

      {currentRoute === "/docs" ? (
        <section className="docs-page" aria-labelledby="docs-page-title">
          <div className="docs-page-header">
            <h1 id="docs-page-title">Future docs for operator-led agents.</h1>
            <p>
              A preview of the Orynt documentation structure for setup, memory, skills, verification, approvals,
              and early-access builds.
            </p>
          </div>

          <div className="docs-shell">
            <aside className="docs-index" aria-label="Documentation filters">
              <strong>Find useful docs</strong>
              <form
                className="docs-search-form"
                role="search"
                aria-label="Search documents"
                onSubmit={(event) => event.preventDefault()}
              >
                <label htmlFor="docs-search-input">Search documents</label>
                <input
                  id="docs-search-input"
                  name="docs-search"
                  type="search"
                  value={docsSearchQuery}
                  placeholder="Memory, approval, builds..."
                  onChange={(event) => setDocsSearchQuery(event.currentTarget.value)}
                />
              </form>
              <div className="docs-category-list" aria-label="Document categories">
                {docsCategoryFilters.map((category) => (
                  <button
                    className="docs-category-button"
                    type="button"
                    aria-pressed={selectedDocsCategory === category}
                    key={category}
                    onClick={() => setSelectedDocsCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </aside>

            <div className="docs-preview-list" aria-label="Future documentation articles">
              {visibleDocsPreviewSections.length > 0 ? (
                visibleDocsPreviewSections.map((section) => (
                <article
                  className="docs-preview-item"
                  id={getDocsSectionId(section.label)}
                  key={section.label}
                >
                  <div className="docs-preview-thumb" data-tone={section.previewTone} aria-hidden="true">
                    <span>{section.label}</span>
                  </div>
                  <div className="docs-preview-copy">
                    <span>{section.category}</span>
                    <h2>{section.title}</h2>
                    <p>{section.copy}</p>
                  </div>
                </article>
                ))
              ) : (
                <div className="docs-empty-state" role="status">
                  <h2>No matching docs.</h2>
                  <p>Try another term or return to all categories.</p>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setDocsSearchQuery("");
                      setSelectedDocsCategory("All docs");
                    }}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {currentRoute === "/contact" ? (
        <section className="contact-page" aria-labelledby="contact-page-title">
          <div className="contact-page-header">
            <h1 id="contact-page-title">Reach the right Orynt inbox.</h1>
            <p>
              Use the clearest lane for early-access questions, product support, security reports, and future legal or
              privacy requests.
            </p>
          </div>

          <div className="contact-shell">
            <form className="contact-primary contact-form" aria-labelledby="primary-contact-title">
              <span>Primary contact</span>
              <h2 id="primary-contact-title">Start with hello for general Orynt intake.</h2>
              <p>Questions about access, partnerships, launch timing, or the product direction can start here.</p>
              <div className="contact-field-row">
                <label className="contact-field" htmlFor="contact-name">
                  <span>Name</span>
                  <input id="contact-name" name="name" type="text" autoComplete="name" placeholder="Your name" />
                </label>
                <label className="contact-field" htmlFor="contact-email">
                  <span>Email</span>
                  <input id="contact-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
                </label>
              </div>
              <label className="contact-field" htmlFor="contact-topic">
                <span>Topic</span>
                <select id="contact-topic" name="topic" defaultValue="early-access">
                  <option value="early-access">Early access</option>
                  <option value="partnership">Partnership</option>
                  <option value="product-question">Product question</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="contact-field" htmlFor="contact-message">
                <span>Message</span>
                <textarea id="contact-message" name="message" placeholder="What should we know?" rows={5} />
              </label>
              <div className="contact-form-actions">
                <button className="button button-primary" type="submit" disabled>
                  Send message opens soon
                </button>
                <span>
                  Prefer email?{" "}
                  <a className="button button-secondary contact-mail-button" href="mailto:hello@codepawl.com">
                    hello@codepawl.com
                  </a>
                </span>
              </div>
            </form>

            <div className="contact-grid" aria-label="Contact channels">
              {contactChannels
                .filter((channel) => !channel.emphasis)
                .map((channel) => (
                  <article className="contact-channel" key={channel.email}>
                    <div>
                      <span>{channel.label}</span>
                      <h2>{channel.email}</h2>
                    </div>
                    <p>{channel.copy}</p>
                    <a className="button button-secondary contact-mail-button" href={`mailto:${channel.email}`}>
                      Email {channel.label.toLowerCase()}
                    </a>
                  </article>
                ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeFooterMockPage ? <FooterMockPageView page={activeFooterMockPage} /> : null}
      {activeLegalPage ? <LegalPolicyPageView page={activeLegalPage} /> : null}

      <footer className="site-footer">
        <div>
          <BrandLink ariaLabel="Orynt home footer" logoSize={36} onNavigate={navigateToRoute} />
          <p>Brain-like operating system for adaptive AI agents.</p>
          <small>© 2026 Orynt. All rights reserved.</small>
        </div>
        <nav aria-label="Footer product links">
          <strong>Product</strong>
          <RouteLink href="/" onNavigate={navigateToRoute}>Product</RouteLink>
          <RouteLink href="/pricing" onNavigate={navigateToRoute}>Pricing</RouteLink>
          <RouteLink href="/access" onNavigate={navigateToRoute}>Download</RouteLink>
        </nav>
        <nav aria-label="Footer resource links" id="docs">
          <strong>Resources</strong>
          <RouteLink href="/docs" onNavigate={navigateToRoute}>Docs</RouteLink>
          <RouteLink href="/guides" onNavigate={navigateToRoute}>Guides</RouteLink>
          <RouteLink href="/api-reference" onNavigate={navigateToRoute}>API reference</RouteLink>
        </nav>
        <nav aria-label="Footer company links" id="company">
          <strong>Company</strong>
          <RouteLink href="/contact" onNavigate={navigateToRoute}>Contact</RouteLink>
          <RouteLink href="/build-log" onNavigate={navigateToRoute}>Build log</RouteLink>
          <RouteLink href="/careers" onNavigate={navigateToRoute}>Careers</RouteLink>
        </nav>
        <nav aria-label="Footer legal links">
          <RouteLink className="footer-nav-heading" href="/legal" onNavigate={navigateToRoute}>Legal</RouteLink>
          <RouteLink href="/privacy" onNavigate={navigateToRoute}>Privacy</RouteLink>
          <RouteLink href="/terms" onNavigate={navigateToRoute}>Terms</RouteLink>
          <RouteLink href="/security" onNavigate={navigateToRoute}>Security notes</RouteLink>
        </nav>
      </footer>
    </main>
  );
}

export default App;
