import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BarChart3,
  Check,
  Code2,
  Eye,
  Globe2,
  Monitor,
  PanelTop,
  PieChart,
  Play,
  Save,
  ScreenShare,
  ShieldCheck,
} from "lucide-react";

import darkThemeLogo from "../../../assets/pictures/dark-theme-logo.svg";

const navItems = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "Cockpit", href: "#demo" },
  { label: "Pricing", href: "#pricing" },
];

const taskPreview = [
  { title: "Research competitors", state: "Running" },
  { title: "Update pricing page", state: "Paused" },
  { title: "Find customer quotes", state: "Done" },
  { title: "Monitor mentions", state: "Queued" },
];

type IconCard = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

type WorkflowStep = IconCard & {
  step: string;
};

const valueProps: IconCard[] = [
  {
    icon: Monitor,
    title: "Closed-source",
    copy: "Commercial product with controlled releases.",
  },
  {
    icon: ShieldCheck,
    title: "Approval-based",
    copy: "You stay in control of risky actions.",
  },
  {
    icon: Globe2,
    title: "Browser automation",
    copy: "Real browsers. Real web. No shortcuts.",
  },
  {
    icon: BarChart3,
    title: "Cost visibility",
    copy: "Track tokens, cost, and usage live.",
  },
];

const features: IconCard[] = [
  {
    icon: PanelTop,
    title: "Browser task control",
    copy: "Run real browser tasks while watching exactly what your agent is doing.",
  },
  {
    icon: BadgeCheck,
    title: "Approve risky actions",
    copy: "Review and approve sensitive steps before they execute.",
  },
  {
    icon: ScreenShare,
    title: "Live preview",
    copy: "See the browser in real time with clear step-by-step progress.",
  },
  {
    icon: Code2,
    title: "Trace & inspect",
    copy: "Inspect traces, inputs, and results to understand every decision.",
  },
  {
    icon: PieChart,
    title: "Token & cost usage",
    copy: "Track token usage, cost estimates, and task duration.",
  },
  {
    icon: Save,
    title: "Save as skills",
    copy: "Turn successful runs into reusable skills for future tasks.",
  },
];

const workflow: WorkflowStep[] = [
  {
    step: "01",
    icon: Play,
    title: "Start a task",
    copy: "Describe what you want the agent to accomplish in natural language.",
  },
  {
    step: "02",
    icon: Eye,
    title: "Watch the agent work",
    copy: "See every action in the browser as it happens.",
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Approve risky actions",
    copy: "Review any risky or sensitive steps before they run.",
  },
  {
    step: "04",
    icon: Save,
    title: "Save as a skill",
    copy: "Save successful runs as reusable skills to run again anytime.",
  },
];

const pricing = [
  {
    name: "Free Trial",
    price: "$0",
    meta: "Planned: 7 days",
    badge: "Best price",
    savings: "100% off trial window",
    tone: "price",
    fit: "Best for evaluating CodePawl before committing.",
    copy: "Explore CodePawl with full access.",
    cta: "Trial waitlist opens soon",
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
    cta: "Starter waitlist opens soon",
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
    cta: "Pro waitlist opens soon",
    features: ["Unlimited tasks & steps", "Advanced approval rules", "Skills library & sharing", "Priority support"],
  },
];

const billingPeriods = [
  {
    id: "monthly",
    label: "Monthly",
    planMeta: "Per user / month",
    note: "Monthly planning numbers shown.",
  },
  {
    id: "quarterly",
    label: "Quarterly",
    planMeta: "Per user / quarter",
    note: "Quarterly billing cadence planned; prices remain alpha monthly anchors.",
  },
  {
    id: "yearly",
    label: "Yearly",
    planMeta: "Per user / year",
    note: "Yearly billing cadence planned; prices remain alpha monthly anchors.",
  },
] as const;

type BillingPeriod = (typeof billingPeriods)[number]["id"];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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

function App() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const shellRef = useRef<HTMLElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetGridDragRef = useRef({ x: 0, y: 0 });
  const currentGridDragRef = useRef({ x: 0, y: 0 });
  const prefersReducedMotionRef = useRef(false);
  const selectedBillingPeriod =
    billingPeriods.find((period) => period.id === billingPeriod) ?? billingPeriods[0];

  const setGridDragStyle = (x: number, y: number) => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    shell.style.setProperty("--grid-drag-x", `${x.toFixed(2)}px`);
    shell.style.setProperty("--grid-drag-y", `${y.toFixed(2)}px`);
  };

  const cancelGridDragFrame = () => {
    if (animationFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  };

  const animateGridDrag = () => {
    const current = currentGridDragRef.current;
    const target = targetGridDragRef.current;
    const nextX = current.x + (target.x - current.x) * 0.08;
    const nextY = current.y + (target.y - current.y) * 0.08;
    const settled = Math.abs(target.x - nextX) < 0.08 && Math.abs(target.y - nextY) < 0.08;

    currentGridDragRef.current = settled ? { ...target } : { x: nextX, y: nextY };
    setGridDragStyle(currentGridDragRef.current.x, currentGridDragRef.current.y);

    animationFrameRef.current = settled ? null : window.requestAnimationFrame(animateGridDrag);
  };

  const startGridDragFrame = () => {
    if (prefersReducedMotionRef.current || animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(animateGridDrag);
  };

  const resetGridDrag = () => {
    targetGridDragRef.current = { x: 0, y: 0 };
    startGridDragFrame();
  };

  const handleShellPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (prefersReducedMotionRef.current) {
      return;
    }

    const viewportWidth = window.innerWidth || 1;
    const viewportHeight = window.innerHeight || 1;
    const normalizedX = event.clientX / viewportWidth - 0.5;
    const normalizedY = event.clientY / viewportHeight - 0.5;
    targetGridDragRef.current = {
      x: Math.max(-18, Math.min(18, normalizedX * 36)),
      y: Math.max(-12, Math.min(12, normalizedY * 24)),
    };
    startGridDragFrame();
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

  useEffect(() => {
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      prefersReducedMotionRef.current = motionQuery?.matches ?? false;

      if (prefersReducedMotionRef.current) {
        cancelGridDragFrame();
        targetGridDragRef.current = { x: 0, y: 0 };
        currentGridDragRef.current = { x: 0, y: 0 };
        setGridDragStyle(0, 0);
      }
    };

    syncMotionPreference();
    motionQuery?.addEventListener("change", syncMotionPreference);
    window.addEventListener("blur", resetGridDrag);

    return () => {
      motionQuery?.removeEventListener("change", syncMotionPreference);
      window.removeEventListener("blur", resetGridDrag);
      cancelGridDragFrame();
    };
  }, []);

  return (
    <main
      className="landing-shell"
      onPointerLeave={resetGridDrag}
      onPointerMove={handleShellPointerMove}
      ref={shellRef}
    >
      <div className="ascii-motion-layer" aria-hidden="true">
        <span>.:--==++**##%%@@%%##**++==--:.. .:-=+*#%@#*+=-:.</span>
        <span>..::--==++**##%%##**++==--::..   ..:-=+*##*+=-:..</span>
        <span>   .::--==++**####**++==--::.     .:-=+*#%%#*+=-:.</span>
        <span>.....::::----====++++====----::::.....  ..::-=+*+=-::..</span>
        <span>@@%%##**++==--::..::--==++**##%%@@  .:-=+*#%@%#*+=-:.</span>
      </div>

      <header className="site-header">
        <a className="brand" href="/" aria-label="CodePawl home">
          <img className="brand-logo" src={darkThemeLogo} alt="" width="40" height="40" />
          <span>CodePawl</span>
        </a>

        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a href={item.href} key={item.label}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <a className="button button-secondary" href="#demo">
            See cockpit
          </a>
          <a className="button button-primary" href="#pricing">
            View early access plans
          </a>
        </div>
      </header>

      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Run computer agents without losing control.</h1>
          <p className="hero-lede">
            CodePawl is your closed-source control cockpit for browser agents. Start tasks, watch every step,
            approve risky actions, track cost, and save successful runs as reusable skills.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#pricing">
              View early access plans
            </a>
            <a className="button button-secondary" href="#demo">
              See cockpit
            </a>
          </div>
          <ul className="trust-list" aria-label="Trial highlights">
            <CheckItem>No credit card</CheckItem>
            <CheckItem>7-day trial planned</CheckItem>
            <CheckItem>Closed-source product</CheckItem>
          </ul>
        </div>

        <section className="product-preview" aria-label="CodePawl product preview" id="product">
          <div className="preview-shell">
            <aside className="preview-sidebar" aria-label="Preview tasks">
              <div className="preview-brand">
                <span className="mini-logo">CP</span>
                <strong>CodePawl</strong>
              </div>
              <button type="button">+ New task</button>
              <div className="preview-tasks">
                {taskPreview.map((task) => (
                  <article key={task.title}>
                    <strong>{task.title}</strong>
                    <span>{task.state}</span>
                  </article>
                ))}
              </div>
              <div className="preview-footer-links">
                <span>Skills</span>
                <span>Settings</span>
              </div>
            </aside>

            <div className="preview-main">
              <div className="preview-topline">
                <strong>Research competitors</strong>
                <span>Running - 03:42</span>
              </div>
              <div className="preview-tabs" aria-label="Preview tabs">
                <span className="active">Live</span>
                <span>Steps</span>
                <span>Traces</span>
                <span>Files</span>
                <span>Metrics</span>
              </div>
              <div className="mock-browser">
                <div className="mock-address">https://www.example.com/pricing</div>
                <div className="mock-site">
                  <div className="mock-site-nav">
                    <strong>Example</strong>
                    <span>Product</span>
                    <span>Pricing</span>
                    <span>Docs</span>
                    <button type="button">Sign in</button>
                  </div>
                  <h2>Simple, transparent pricing</h2>
                  <p>Choose the plan that works for you.</p>
                  <div className="mock-price-grid">
                    <span>
                      <strong>$29</strong>
                      /mo
                    </span>
                    <span>
                      <strong>$79</strong>
                      /mo
                    </span>
                    <span>
                      <strong>$199</strong>
                      /mo
                    </span>
                  </div>
                </div>
              </div>
              <div className="step-review">
                <div>
                  <strong>Step 7 of 18</strong>
                  <span>Extract pricing table</span>
                </div>
                <dl>
                  <div>
                    <dt>Action</dt>
                    <dd>Click element</dd>
                  </div>
                  <div>
                    <dt>Risk level</dt>
                    <dd className="risk-warning">Medium</dd>
                  </div>
                </dl>
                <div className="review-actions">
                  <button type="button">Approve</button>
                  <button type="button">Skip</button>
                </div>
              </div>
            </div>

            <aside className="preview-metrics" aria-label="Preview metrics">
              <h2>Metrics</h2>
              <dl>
                <div>
                  <dt>Tokens</dt>
                  <dd>128,934</dd>
                </div>
                <div>
                  <dt>Cost est.</dt>
                  <dd>$0.42</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>03:42</dd>
                </div>
                <div>
                  <dt>Steps</dt>
                  <dd>7 / 18</dd>
                </div>
              </dl>
              <div className="sparkline" aria-hidden="true" />
              <h3>Recent steps</h3>
              <ol>
                <li>Navigated to example.com</li>
                <li>Clicked Pricing</li>
                <li>Scrolled Down</li>
                <li>Extracting Pricing table</li>
              </ol>
            </aside>
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

      <section className="section features-section" aria-labelledby="features-title" id="features">
        <div className="section-intro">
          <div>
            <h2 id="features-title">Everything you need to run agents with confidence.</h2>
            <p className="section-note">
              Control, approvals, trace inspection, usage visibility, and reusable skills sit in one operator surface.
            </p>
          </div>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article
              className="feature-card tilt-card"
              key={feature.title}
              onPointerLeave={resetTiltCard}
              onPointerMove={handleTiltCardPointerMove}
            >
              <span className="line-icon" aria-hidden="true">
                <feature.icon aria-hidden="true" />
              </span>
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </div>
            </article>
          ))}
        </div>
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
        <div className="workflow-grid">
          {workflow.map((item) => (
            <article className="workflow-card" key={item.step}>
              <span className="step-number">{item.step}</span>
              <span className="workflow-icon" aria-hidden="true">
                <item.icon aria-hidden="true" />
              </span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section cockpit-section" aria-labelledby="cockpit-title" id="demo">
        <div className="section-intro">
          <div>
            <h2 id="cockpit-title">Your cockpit for computer agents.</h2>
            <p className="section-note">
              The demo surface keeps task state, trace data, approvals, and budget signals visible while the agent runs.
            </p>
          </div>
        </div>
        <div className="cockpit-grid">
          <article className="trace-panel">
            <div className="panel-tabs">
              <span>Tasks</span>
              <span>Live</span>
              <span>Steps</span>
              <span className="active">Traces</span>
              <span>Files</span>
              <span>Metrics</span>
            </div>
            <div className="trace-body">
              <aside>
                <span>Research competitors</span>
                <span>Update pricing page</span>
                <span>Find customer quotes</span>
              </aside>
              <div>
                <h3>Trace timeline</h3>
                <div className="timeline-dots" aria-hidden="true">
                  {Array.from({ length: 13 }, (_, index) => (
                    <span key={index} />
                  ))}
                </div>
                <h3>Step 7</h3>
                <pre>{`{
  "action": "click",
  "selector": "button_primary",
  "text": "Free plan"
}`}</pre>
              </div>
              <aside className="mini-metrics">
                <h3>Metrics</h3>
                <span>Tokens 128,934</span>
                <span>Cost est. $0.42</span>
                <span>Time 03:42</span>
                <span>Steps 7 / 18</span>
              </aside>
            </div>
          </article>

          <article className="approval-panel">
            <div className="approval-header">
              <h3>Approval center</h3>
              <span>1 pending</span>
            </div>
            <div className="approval-question">
              <h3>Delete all cookies for example.com?</h3>
              <p>This action will remove cookies and may sign you out.</p>
              <dl>
                <div>
                  <dt>Target</dt>
                  <dd>example.com</dd>
                </div>
                <div>
                  <dt>Action</dt>
                  <dd>Delete cookies</dd>
                </div>
                <div>
                  <dt>Risk level</dt>
                  <dd>Medium</dd>
                </div>
              </dl>
              <div className="approval-buttons">
                <button type="button">Approve</button>
                <button type="button">Reject</button>
              </div>
            </div>
            <div className="rules-list">
              <strong>Auto-approve rules</strong>
              <span>Allow list: example.com, docs.example.com</span>
              <span>Low risk actions</span>
            </div>
          </article>
        </div>
      </section>

      <section className="section pricing-section" aria-labelledby="pricing-title" id="pricing">
        <div className="section-intro">
          <div>
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
              <p className="billing-period-note">{selectedBillingPeriod.note}</p>
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
              <button className="button button-primary pricing-status" type="button" disabled>
                {plan.cta}
              </button>
            </article>
          ))}
        </div>
        <ul className="pricing-reassurance" aria-label="Pricing notes">
          <li>
            <strong>No live checkout</strong>
            <span>Plans are directional until early access opens.</span>
          </li>
          <li>
            <strong>Provider usage separate</strong>
            <span>Model and browser-provider costs remain pass-through.</span>
          </li>
          <li>
            <strong>Terms may change before launch</strong>
            <span>We will keep the final package explicit before signup.</span>
          </li>
        </ul>
      </section>

      <section className="final-cta" aria-label="Final call to action">
        <div>
          <h2>Run agents with power. Stay in control.</h2>
        </div>
        <div className="final-cta-actions">
          <a className="button button-primary" href="#pricing">
            View early access plans
          </a>
          <a className="button button-secondary" href="#demo">
            See cockpit
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <a className="brand" href="/" aria-label="CodePawl home footer">
            <img className="brand-logo" src={darkThemeLogo} alt="" width="36" height="36" />
            <span>CodePawl</span>
          </a>
          <p>Closed-source control cockpit for computer agents.</p>
          <small>© 2026 CodePawl. All rights reserved.</small>
        </div>
        <nav aria-label="Footer product links">
          <strong>Product</strong>
          <a href="#product">Product preview</a>
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
        </nav>
        <nav aria-label="Footer resource links" id="docs">
          <strong>Resources</strong>
          <span>Docs coming soon</span>
          <span>Guides coming soon</span>
          <span>API reference coming soon</span>
        </nav>
        <nav aria-label="Footer company links" id="company">
          <strong>Company</strong>
          <span>About coming soon</span>
          <span>Build log coming soon</span>
          <span>Careers later</span>
        </nav>
        <nav aria-label="Footer legal links">
          <strong>Legal</strong>
          <span>Privacy coming soon</span>
          <span>Terms coming soon</span>
          <span>Security notes coming soon</span>
        </nav>
      </footer>
    </main>
  );
}

export default App;
