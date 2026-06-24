import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BarChart3,
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

import lightThemeLogo from "../../../assets/pictures/light-theme-logo.svg";

const navItems = [
  { label: "Product", href: "#product" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "#docs" },
  { label: "Changelog", href: "#changelog" },
  { label: "Company", href: "#company" },
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
    title: "Local-first",
    copy: "Your data stays on your machine.",
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
    meta: "7 days",
    copy: "Explore CodePawl with full access.",
    cta: "Start free trial",
    features: ["All core features", "Up to 50 agent steps", "Local-first by default", "Community support"],
  },
  {
    name: "Starter",
    price: "$19",
    meta: "Per user / month",
    copy: "For individuals getting started.",
    cta: "Start Starter",
    features: ["Unlimited tasks", "Up to 10k steps / month", "Cost & token tracking", "Email support"],
  },
  {
    name: "Pro",
    price: "$49",
    meta: "Per user / month",
    copy: "For power users and teams.",
    cta: "Start Pro",
    features: ["Unlimited tasks & steps", "Advanced approval rules", "Skills library & sharing", "Priority support"],
  },
];

function App() {
  return (
    <main className="landing-shell">
      <div className="ascii-motion-layer" aria-hidden="true">
        <span>.:--==++**##%%@@%%##**++==--:.. .:-=+*#%@#*+=-:.</span>
        <span>..::--==++**##%%##**++==--::..   ..:-=+*##*+=-:..</span>
        <span>   .::--==++**####**++==--::.     .:-=+*#%%#*+=-:.</span>
        <span>.....::::----====++++====----::::.....  ..::-=+*+=-::..</span>
        <span>@@%%##**++==--::..::--==++**##%%@@  .:-=+*#%@%#*+=-:.</span>
      </div>

      <header className="site-header">
        <a className="brand" href="/" aria-label="CodePawl home">
          <img className="brand-logo" src={lightThemeLogo} alt="" width="40" height="40" />
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
            Book demo
          </a>
          <a className="button button-primary" href="#pricing">
            Start free trial
          </a>
        </div>
      </header>

      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Local-first, approval-based, built for operators.</p>
          <h1 id="hero-title">Run computer agents without losing control.</h1>
          <p className="hero-lede">
            CodePawl is your local control cockpit for browser agents. Start tasks, watch every step,
            approve risky actions, track cost, and save successful runs as reusable skills.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#pricing">
              Start free trial
            </a>
            <a className="button button-secondary" href="#demo">
              Book demo
            </a>
          </div>
          <ul className="trust-list" aria-label="Trial highlights">
            <li>No credit card</li>
            <li>7-day free trial</li>
            <li>Local-first by default</li>
          </ul>
        </div>

        <section className="product-preview" aria-label="CodePawl product preview" id="product">
          <div className="preview-ascii" aria-hidden="true" />
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

      <section className="section features-section" aria-labelledby="features-title">
        <p className="section-kicker">Features</p>
        <h2 id="features-title">Everything you need to run agents with confidence.</h2>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
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

      <section className="section workflow-section" aria-labelledby="workflow-title">
        <p className="section-kicker">How it works</p>
        <h2 id="workflow-title">A simple operator workflow.</h2>
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
        <p className="section-kicker">Built for operators</p>
        <h2 id="cockpit-title">Your cockpit for computer agents.</h2>
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
        <p className="section-kicker">Pricing</p>
        <h2 id="pricing-title">Simple, predictable pricing.</h2>
        <div className="pricing-grid">
          {pricing.map((plan) => (
            <article className="pricing-card" key={plan.name}>
              <div className="price-header">
                <div>
                  <h3>{plan.name}</h3>
                  <span>{plan.meta}</span>
                </div>
                <strong>{plan.price}</strong>
              </div>
              <p>{plan.copy}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <a className="button button-primary" href="#pricing">
                {plan.cta}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta" aria-label="Final call to action">
        <div>
          <h2>Run agents with power. Stay in control.</h2>
        </div>
        <a className="button button-primary" href="#pricing">
          Start free trial
        </a>
        <a className="button button-secondary" href="#demo">
          Start demo
        </a>
      </section>

      <footer className="site-footer">
        <div>
          <a className="brand" href="/" aria-label="CodePawl home footer">
            <img className="brand-logo" src={lightThemeLogo} alt="" width="36" height="36" />
            <span>CodePawl</span>
          </a>
          <p>Local-first control cockpit for computer agents.</p>
          <small>© 2025 CodePawl. All rights reserved.</small>
        </div>
        <nav aria-label="Footer product links">
          <strong>Product</strong>
          <a href="#features">Features</a>
          <a href="#product">Integrations</a>
          <a href="#changelog">Changelog</a>
        </nav>
        <nav aria-label="Footer resource links" id="docs">
          <strong>Resources</strong>
          <a href="#docs">Docs</a>
          <a href="#docs">Guides</a>
          <a href="#docs">API Reference</a>
        </nav>
        <nav aria-label="Footer company links" id="company">
          <strong>Company</strong>
          <a href="#company">About</a>
          <a href="#company">Blog</a>
          <a href="#company">Careers</a>
        </nav>
        <nav aria-label="Footer legal links">
          <strong>Legal</strong>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#security">Security</a>
        </nav>
      </footer>
    </main>
  );
}

export default App;
