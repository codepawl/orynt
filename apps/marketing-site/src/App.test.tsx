import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import codepawlLogoLoading from "../../../assets/pictures/codepawl-logo-loading.gif";
import App from "./App";

const renderAtRoute = (path = "/") => {
  window.history.pushState({}, "", path);
  return render(<App />);
};

describe("CodePawl landing page", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("declares the icon dependency without a shader runtime", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toHaveProperty("lucide-react");
    expect(packageJson.dependencies).not.toHaveProperty("@paper-design/shaders-react");
  });

  it("renders the landing nav, hero, and primary landing animation", () => {
    render(<App />);

    const brandLink = screen.getByRole("link", { name: "CodePawl home" });
    const logo = brandLink.querySelector(".brand-logo");
    expect(logo?.tagName.toLowerCase()).toBe("svg");
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(brandLink.querySelector("img")).not.toBeInTheDocument();

    const loadingStatus = screen.getByRole("status", { name: "Loading CodePawl content" });
    expect(loadingStatus.querySelector(".loading-screen-logo-motion")).toHaveAttribute("src", codepawlLogoLoading);
    expect(loadingStatus.querySelector(".loading-screen-logo-static")).toBeInTheDocument();

    const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(primaryNav).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Product" })).toHaveAttribute("href", "/");
    expect(within(primaryNav).getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    expect(within(primaryNav).getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    expect(within(primaryNav).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(primaryNav).queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Features" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Workflow" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Brain" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Architecture" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Changelog" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Company" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Book demo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See cockpit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open cockpit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View cockpit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Animation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start Local Walkthrough" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download CodePawl" })).toHaveAttribute("href", "/access");
    expect(screen.getByRole("link", { name: "Start here" })).toHaveAttribute("href", "/docs");
    expect(screen.getAllByRole("link", { name: "Start Here" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Learn More" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "View plans" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review workflow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start free trial" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View early access plans" })).not.toBeInTheDocument();

    expect(
      screen.getByRole("heading", { level: 1, name: "Give AI agents a working brain." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/codepawl is a brain-like operating system for adaptive ai agents/i)).toBeInTheDocument();
    expect(
      screen.getByText(/structured memory, reusable skills, verification, self-improvement loops, and safe tool use/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/local-first, approval-based, built for operators/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Trial highlights" })).not.toBeInTheDocument();
    expect(screen.queryByText(/inspectable runs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reviewed memory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^closed-source product$/i)).not.toBeInTheDocument();

    const preview = screen.getByRole("region", { name: "CodePawl landing page animation" });
    expect(within(preview).queryByRole("heading", { level: 2, name: "Working brain loop" })).not.toBeInTheDocument();
    ["Perceive", "Remember", "Plan", "Act", "Verify", "Improve"].forEach((label) => {
      expect(within(preview).queryByText(label)).not.toBeInTheDocument();
    });
    ["Memory", "Skills", "Verification", "Safe tool use"].forEach((label) => {
      expect(within(preview).queryByRole("heading", { level: 3, name: label })).not.toBeInTheDocument();
    });
    const asciiBrain = preview.querySelector(".landing-ascii-brain");
    expect(asciiBrain).toBeInTheDocument();
    expect(asciiBrain?.tagName.toLowerCase()).toBe("img");
    expect(asciiBrain).toHaveAttribute("alt", "");
    expect(asciiBrain).toHaveAttribute("aria-hidden", "true");
    expect(asciiBrain).toHaveAttribute("src", expect.stringContaining("brain-ascii-monochrome"));
    const brainAsciiSvg = readFileSync(resolve(process.cwd(), "../../assets/pictures/brain-ascii-monochrome.svg"), "utf8");
    const brainAsciiOpacities = [...brainAsciiSvg.matchAll(/fill-opacity="([^"]+)"/g)].map((match) =>
      Number(match[1]),
    );
    expect((brainAsciiSvg.match(/<text\b/g) ?? [])).toHaveLength(2320);
    expect(brainAsciiSvg).toContain('font-weight="900"');
    expect(brainAsciiSvg).toContain('fill="#f2f0ec"');
    expect(brainAsciiSvg).toContain('stroke="#f2f0ec"');
    expect(brainAsciiSvg).toContain('stroke-width="0.55"');
    expect(brainAsciiSvg).toContain('stroke-opacity="0.2"');
    expect(brainAsciiSvg).toContain('paint-order="stroke fill"');
    expect(Math.min(...brainAsciiOpacities)).toBeGreaterThanOrEqual(0.49);
    expect(brainAsciiSvg).not.toContain("rgb(");
    expect(brainAsciiSvg).not.toContain('role="img"');
    expect(preview.querySelector(".landing-ascii-brain-electric")).toBeInTheDocument();
    expect(preview.querySelectorAll(".landing-ascii-brain-current")).toHaveLength(7);
    expect(preview.querySelector(".landing-ascii-brain-idea")).not.toBeInTheDocument();
    expect(preview.querySelector(".landing-pixel-brain")).not.toBeInTheDocument();
    expect(preview.querySelector(".landing-pixel-brain-block")).not.toBeInTheDocument();
    expect(preview.querySelector(".landing-animation-brain-frame")).not.toBeInTheDocument();
    expect(preview.querySelectorAll("img")).toHaveLength(1);
    expect(preview.querySelectorAll(".landing-animation-halftone")).toHaveLength(2);
    preview.querySelectorAll(".landing-animation-halftone").forEach((layer) => {
      expect(layer).toHaveAttribute("aria-hidden", "true");
    });
    expect(preview.querySelector(".landing-animation-brain")).not.toBeInTheDocument();
    expect(preview.querySelector(".landing-animation-glow")).not.toBeInTheDocument();
    expect(preview.querySelector(".landing-animation-vignette")).not.toBeInTheDocument();
    expect(preview.querySelector(".landing-animation-dither")).not.toBeInTheDocument();
    expect(preview.querySelector("canvas")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Candidate repository rule")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Candidate repository rule from verified correction")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Run #42")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Event Timeline")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Cost")).not.toBeInTheDocument();
    expect(within(preview).queryByText("Candidate Memory")).not.toBeInTheDocument();
  });

  it("keeps the logo loading screen visible briefly and then removes it", () => {
    vi.useFakeTimers();
    render(<App />);

    expect(screen.getByRole("status", { name: "Loading CodePawl content" })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(649);
    });
    expect(screen.getByRole("status", { name: "Loading CodePawl content" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status", { name: "Loading CodePawl content" })).not.toBeInTheDocument();
  });

  it("renders value props, workflow, pricing, and footer without removed middle marketing sections", () => {
    render(<App />);

    const valueStrip = screen.getByLabelText("Core product values");
    expect(valueStrip.querySelectorAll("article")).toHaveLength(4);
    ["Working memory", "Skill formation", "Verifier reflex", "Bounded agency"].forEach((label) => {
      expect(within(valueStrip).getByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    });
    expect(within(valueStrip).getByText(/goals, repo state, constraints, and evidence stay in the agent's active context across runs/i)).toBeInTheDocument();
    expect(within(valueStrip).getByText(/reviewed corrections become reusable behavior instead of one-off prompt history/i)).toBeInTheDocument();
    expect(within(valueStrip).getByText(/tests, traces, and source evidence become the agent's habit before trust/i)).toBeInTheDocument();
    expect(within(valueStrip).getByText(/tools, budgets, connectors, and risky actions stay inside explicit operator gates/i)).toBeInTheDocument();

    expect(screen.queryByRole("heading", { level: 2, name: "Everything you need to run agents with confidence." })).not.toBeInTheDocument();
    [
      "Remember useful context",
      "Practice in a sandbox",
      "Verify before trust",
      "Gate risky actions",
      "Measure the run",
      "Promote reviewed skills",
    ].forEach((label) => {
      expect(screen.queryByRole("heading", { level: 3, name: label })).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/memory, skills, verification, safe tool use, and measurable feedback sit in one operator surface/i)).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "A simple operator workflow." })).toBeInTheDocument();
    ["Perceive", "Remember", "Plan", "Act", "Verify", "Improve"].forEach((label) => {
      expect(screen.getAllByRole("heading", { level: 3, name: label }).length).toBeGreaterThan(0);
    });
    const workflowSection = screen.getByRole("region", { name: "A simple operator workflow." });
    expect(workflowSection.querySelector(".section-kicker")).not.toBeInTheDocument();
    expect(
      within(workflowSection).getByText(
        /move from prompt to live run to human review to repeatable skill without hiding the agent's decisions/i,
      ),
    ).toBeInTheDocument();

    expect(screen.queryByRole("heading", { level: 2, name: "A working brain, not a bigger prompt." })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "A working brain, not a bigger prompt." })).not.toBeInTheDocument();
    expect(screen.queryByText(/perceive and remember/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/act with gates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/verify and improve/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/React renderer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rust\/Tauri host/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Node\/TypeScript sidecar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Capability packs/i)).not.toBeInTheDocument();

    expect(screen.queryByRole("heading", { level: 2, name: "From correction to reusable skill." })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "From correction to reusable skill." })).not.toBeInTheDocument();
    ["Correction captured", "Sandbox practice", "Verifier evidence", "Skill promotion"].forEach((label) => {
      expect(screen.queryByRole("heading", { level: 3, name: label })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { level: 2, name: "The operating loop for adaptive agents." })).not.toBeInTheDocument();

    expect(screen.queryByRole("heading", { level: 2, name: "Download the supervised desktop preview." })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Download the supervised desktop preview." })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Desktop build" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download opens with early access" })).not.toBeInTheDocument();
    ["Evaluation build", "Solo operator build", "Team control build"].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { level: 2, name: "Simple, predictable pricing." })).not.toBeInTheDocument();
    expect(screen.queryByText(/early access packaging/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download trial build opens soon" })).not.toBeInTheDocument();

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Brain-like operating system for adaptive AI agents.");
    expect(within(footer).getByRole("link", { name: "Product" })).toHaveAttribute("href", "/");
    expect(within(footer).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(footer).getByRole("link", { name: "Download" })).toHaveAttribute("href", "/access");
    expect(within(footer).getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    expect(within(footer).getByRole("link", { name: "Guides" })).toHaveAttribute("href", "/guides");
    expect(within(footer).getByRole("link", { name: "API reference" })).toHaveAttribute("href", "/api-reference");
    expect(within(footer).getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    expect(within(footer).getByRole("link", { name: "Build log" })).toHaveAttribute("href", "/build-log");
    expect(within(footer).getByRole("link", { name: "Careers" })).toHaveAttribute("href", "/careers");
    expect(within(footer).getByRole("link", { name: "Legal" })).toHaveAttribute("href", "/legal");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(within(footer).getByRole("link", { name: "Security notes" })).toHaveAttribute("href", "/security");
    expect(within(footer).queryByText(/local-first/i)).not.toBeInTheDocument();
    expect(within(footer).queryByText("Docs coming soon")).not.toBeInTheDocument();
    expect(within(footer).queryByText("Guides coming soon")).not.toBeInTheDocument();
    expect(within(footer).queryByText("API reference coming soon")).not.toBeInTheDocument();
    expect(within(footer).queryByText("Build log coming soon")).not.toBeInTheDocument();
    expect(within(footer).queryByText("Careers later")).not.toBeInTheDocument();
    expect(within(footer).queryByText("Privacy coming soon")).not.toBeInTheDocument();
    expect(within(footer).queryByText("Terms coming soon")).not.toBeInTheDocument();
    expect(within(footer).queryByText("Security notes coming soon")).not.toBeInTheDocument();
  });

  it("renders pricing and direct application download on the pricing page", () => {
    renderAtRoute("/pricing");

    expect(screen.queryByRole("heading", { level: 1, name: "Choose a CodePawl build." })).not.toBeInTheDocument();
    expect(screen.queryByText(/compare the early-access package/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Simple, predictable pricing." })).toBeInTheDocument();
    const pricingSection = screen.getByRole("region", { name: "Simple, predictable pricing." });
    const pricingPageHeader = pricingSection.querySelector(".pricing-page-header");
    expect(pricingPageHeader).not.toBeNull();
    expect(pricingSection.querySelector(".section-intro")).toBeNull();
    expect(within(pricingSection).queryByText("Pricing")).not.toBeInTheDocument();
    expect(screen.getByText(/early access packaging/i)).toBeInTheDocument();
    expect(screen.getByText(/alpha planning numbers/i)).toBeInTheDocument();
    expect(screen.getByText(/not a live checkout/i)).toBeInTheDocument();
    expect(screen.getByText(/provider\/model usage is billed separately/i)).toBeInTheDocument();
    const billingPeriod = screen.getByRole("group", { name: "Billing period" });
    expect(within(billingPeriod).getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
    expect(within(billingPeriod).getByRole("button", { name: "Quarterly" })).toHaveAttribute("aria-pressed", "false");
    expect(within(billingPeriod).getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Monthly planning numbers shown.")).not.toBeInTheDocument();
    expect(screen.getByText("Best for evaluating CodePawl before committing.")).toBeInTheDocument();
    expect(screen.getByText("Closed-source product access")).toBeInTheDocument();
    expect(screen.getByText("Best for solo operators running recurring browser work.")).toBeInTheDocument();
    expect(screen.getByText("Best for heavier usage, shared skills, and tighter approvals.")).toBeInTheDocument();
    expect(screen.getByText("Best price")).toBeInTheDocument();
    expect(screen.getByText("Best value")).toBeInTheDocument();
    expect(screen.getByText("Most control")).toBeInTheDocument();
    expect(screen.getByText("100% off trial window")).toBeInTheDocument();
    expect(screen.getByText("20% off yearly planned")).toBeInTheDocument();
    expect(screen.getByText("Priority support lane")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Pricing highlights" })).not.toBeInTheDocument();
    [
      "Full-loop trial",
      "Evaluate memory, skills, verification, and approval gates before paying.",
      "Clear base price",
      "Plan price buys CodePawl control; provider usage stays separate instead of buried in markup.",
      "Early-access upside",
      "Final package, limits, and support terms are explicit before signup while these anchors stay visible.",
      "No live checkout",
      "Provider usage separate",
      "Terms may change before launch",
    ].forEach((label) => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
    ["Free Trial", "Starter", "Pro"].forEach((label) => {
      expect(within(pricingSection).getByRole("heading", { level: 3, name: label })).toBeInTheDocument();
    });
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$19")).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();
    expect(screen.getAllByText("Per user / month")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /join .*waitlist/i })).not.toBeInTheDocument();
    ["Sign in to unlock trial build", "Sign in to unlock starter build", "Sign in to unlock pro build"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    });
    const directDownload = screen.getByRole("region", { name: "Direct application download" });
    expect(pricingSection).toContainElement(directDownload);
    expect(within(directDownload).getByRole("heading", { name: "Just take me to the application download." })).toBeInTheDocument();
    expect(within(directDownload).getByText(/early access builds are not live yet/i)).toBeInTheDocument();
    expect(within(directDownload).getByRole("button", { name: "Sign in to unlock application download" })).toBeEnabled();
    const pricingGrid = pricingSection.querySelector(".pricing-grid");
    const pricingReassurance = pricingSection.querySelector(".pricing-reassurance");
    expect(pricingGrid).not.toBeNull();
    expect(pricingReassurance).toBeNull();
    expect(pricingGrid?.nextElementSibling).toBe(directDownload);
  });

  it("gates download actions behind the access page before returning to pricing", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Download CodePawl" }));

    expect(window.location.pathname).toBe("/access");
    expect(
      screen.getByRole("heading", { level: 1, name: "Create access before downloading CodePawl." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/downloads stay behind a lightweight account step/i)).toBeInTheDocument();
    const accessForm = screen.getByRole("form", { name: "Sign up to continue to downloads." });
    const accessMode = screen.getByRole("group", { name: "Access mode" });
    expect(within(accessMode).getByRole("button", { name: "Sign up" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("complementary", { name: "Why access is required" })).toBeInTheDocument();

    fireEvent.click(within(accessMode).getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("form", { name: "Log in to continue to downloads." })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "operator@codepawl.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "early-access" },
    });
    fireEvent.submit(accessForm);

    expect(window.location.pathname).toBe("/pricing");
    expect(screen.getByRole("heading", { level: 2, name: "Simple, predictable pricing." })).toBeInTheDocument();
    ["Download trial build opens soon", "Download starter build opens soon", "Download pro build opens soon"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Download application opens soon" })).toBeDisabled();
  });

  it("switches pricing billing period without changing alpha price anchors", () => {
    renderAtRoute("/pricing");

    const pricingSection = screen.getByRole("region", { name: "Simple, predictable pricing." });
    const billingPeriod = within(pricingSection).getByRole("group", { name: "Billing period" });
    const monthly = within(billingPeriod).getByRole("button", { name: "Monthly" });
    const quarterly = within(billingPeriod).getByRole("button", { name: "Quarterly" });
    const yearly = within(billingPeriod).getByRole("button", { name: "Yearly" });

    fireEvent.click(quarterly);

    expect(monthly).toHaveAttribute("aria-pressed", "false");
    expect(quarterly).toHaveAttribute("aria-pressed", "true");
    expect(yearly).toHaveAttribute("aria-pressed", "false");
    expect(within(pricingSection).getAllByText("Per user / quarter")).toHaveLength(2);
    expect(
      within(pricingSection).queryByText("Quarterly billing cadence planned; prices remain alpha monthly anchors."),
    ).not.toBeInTheDocument();
    expect(within(pricingSection).getByText("$19")).toBeInTheDocument();
    expect(within(pricingSection).getByText("$49")).toBeInTheDocument();

    fireEvent.click(yearly);

    expect(monthly).toHaveAttribute("aria-pressed", "false");
    expect(quarterly).toHaveAttribute("aria-pressed", "false");
    expect(yearly).toHaveAttribute("aria-pressed", "true");
    expect(within(pricingSection).getAllByText("Per user / year")).toHaveLength(2);
    expect(
      within(pricingSection).queryByText("Yearly billing cadence planned; prices remain alpha monthly anchors."),
    ).not.toBeInTheDocument();
    expect(within(pricingSection).getByText("$19")).toBeInTheDocument();
    expect(within(pricingSection).getByText("$49")).toBeInTheDocument();
  });

  it("does not render the old dashboard demo section", () => {
    render(<App />);

    expect(screen.queryByRole("region", { name: "Dashboard demo overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tasks overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usage / Billing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Trial setup" })).not.toBeInTheDocument();
  });

  it("routes landing CTAs to pricing and docs pages", () => {
    render(<App />);

    const headerActions = screen.getByRole("banner").querySelector(".header-actions");
    const heroActions = document.querySelector(".hero-actions");
    const finalCta = screen.getByRole("region", { name: "Final call to action" });
    const finalCtaActions = finalCta.querySelector(".final-cta-actions");

    expect(within(finalCta).getByRole("heading", { level: 2, name: "Make agents do the work. Keep the final say." })).toBeInTheDocument();
    expect(within(finalCta).queryByText("Give agents room to work without giving up control.")).not.toBeInTheDocument();
    expect(headerActions).toBeInTheDocument();
    expect(within(headerActions as HTMLElement).getByRole("link", { name: "Start here" })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(within(headerActions as HTMLElement).getByRole("link", { name: "Download CodePawl" })).toHaveAttribute(
      "href",
      "/access",
    );

    [heroActions, finalCtaActions].forEach((actions) => {
      expect(actions).toBeInTheDocument();
      expect(within(actions as HTMLElement).getByRole("link", { name: "Start Here" })).toHaveAttribute(
        "href",
        "/pricing",
      );
      expect(within(actions as HTMLElement).getByRole("link", { name: "Learn More" })).toHaveAttribute(
        "href",
        "/docs",
      );
      expect(within(actions as HTMLElement).queryByRole("link", { name: "Download CodePawl" })).not.toBeInTheDocument();
      expect(within(actions as HTMLElement).queryByRole("link", { name: "Review workflow" })).not.toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: "Review workflow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View plans" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start Local Walkthrough" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Animation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open cockpit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View cockpit" })).not.toBeInTheDocument();
    expect(document.querySelectorAll('a[href="#download"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="/pricing"]')).toHaveLength(4);
    expect(document.querySelectorAll('a[href="/docs"]')).toHaveLength(5);
    expect(document.querySelectorAll('a[href="/contact"]')).toHaveLength(2);
    expect(document.querySelectorAll('a[href="/access"]')).toHaveLength(2);
    expect(document.querySelectorAll('a[href="/guides"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/api-reference"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/build-log"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/careers"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/legal"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/privacy"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/terms"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="/security"]')).toHaveLength(1);
    expect(document.querySelectorAll('a[href="#pricing"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="#workflow"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="#animation"]')).toHaveLength(0);
    expect(document.querySelectorAll('a[href="#demo"]')).toHaveLength(0);
  });

  it("renders clean docs and contact pages from top navigation", () => {
    const { unmount } = renderAtRoute("/docs");
    const docsPage = screen.getByRole("region", { name: "Future docs for operator-led agents." });

    expect(screen.getByRole("heading", { level: 1, name: "Future docs for operator-led agents." })).toBeInTheDocument();
    expect(screen.getByText(/a preview of the CodePawl documentation structure/i)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Future documentation sections" })).not.toBeInTheDocument();
    const docsFilters = screen.getByRole("complementary", { name: "Documentation filters" });
    expect(within(docsFilters).getByText("Find useful docs")).toBeInTheDocument();
    expect(within(docsFilters).getByRole("searchbox", { name: "Search documents" })).toBeInTheDocument();
    expect(within(docsFilters).getByRole("button", { name: "All docs" })).toHaveAttribute("aria-pressed", "true");
    ["Get started", "Operate runs", "Teach agents", "Trust results"].forEach((category) => {
      expect(within(docsFilters).getByRole("button", { name: category })).toHaveAttribute("aria-pressed", "false");
    });
    expect(screen.queryByRole("complementary", { name: "Documentation index" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Documentation availability" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "How CodePawl perceives, plans, acts, and verifies" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Turn reviewed corrections into reusable behavior" })).toBeInTheDocument();
    expect(docsPage.querySelectorAll(".docs-preview-thumb")).toHaveLength(7);
    expect(docsPage.querySelectorAll(".docs-preview-item small")).toHaveLength(0);
    expect(screen.queryByText("Provider/model billing notes will stay separate from CodePawl plan docs.")).not.toBeInTheDocument();
    expect(screen.queryByText("These pages are not live docs yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(within(docsPage).queryByRole("link", { name: "Review pricing" })).not.toBeInTheDocument();
    expect(within(docsPage).queryByRole("link", { name: "Contact" })).not.toBeInTheDocument();
    expect(screen.queryByText(/product docs are being assembled/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Give AI agents a working brain." })).not.toBeInTheDocument();

    fireEvent.click(within(docsFilters).getByRole("button", { name: "Teach agents" }));
    expect(within(docsFilters).getByRole("button", { name: "Teach agents" })).toHaveAttribute("aria-pressed", "true");
    expect(docsPage.querySelectorAll(".docs-preview-thumb")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: "What becomes durable context" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Turn reviewed corrections into reusable behavior" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "How CodePawl perceives, plans, acts, and verifies" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(docsFilters).getByRole("button", { name: "All docs" }));
    const docsSearch = within(docsFilters).getByRole("searchbox", { name: "Search documents" });
    fireEvent.change(docsSearch, { target: { value: "approval" } });
    expect(docsPage.querySelectorAll(".docs-preview-thumb")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Keep risky actions behind explicit gates" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "What becomes durable context" })).not.toBeInTheDocument();

    fireEvent.change(docsSearch, { target: { value: "nonexistent packet" } });
    expect(docsPage.querySelectorAll(".docs-preview-thumb")).toHaveLength(0);
    expect(screen.getByText("No matching docs.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(docsSearch).toHaveValue("");
    expect(docsPage.querySelectorAll(".docs-preview-thumb")).toHaveLength(7);

    unmount();
    renderAtRoute("/contact");

    const contactPage = screen.getByRole("region", { name: "Reach the right CodePawl inbox." });
    expect(screen.getByRole("heading", { level: 1, name: "Reach the right CodePawl inbox." })).toBeInTheDocument();
    expect(screen.getByText(/use the clearest lane for early-access questions/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Start with hello for general CodePawl intake." })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Start with hello for general CodePawl intake." })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("type", "email");
    expect(screen.getByRole("combobox", { name: "Topic" })).toHaveValue("early-access");
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message opens soon" })).toBeDisabled();
    [
      { email: "hello@codepawl.com", name: "hello@codepawl.com" },
      { email: "support@codepawl.com", name: "Email product/support" },
      { email: "security@codepawl.com", name: "Email security reports" },
      { email: "privacy@codepawl.com", name: "Email legal/privacy later" },
    ].forEach(({ email, name }) => {
      expect(within(contactPage).getByText(email)).toBeInTheDocument();
      const mailLink = within(contactPage).getByRole("link", { name });
      expect(mailLink).toHaveAttribute("href", `mailto:${email}`);
      expect(mailLink).toHaveClass("button", "button-secondary", "contact-mail-button");
    });
    expect(screen.queryByRole("complementary", { name: "What to include" })).not.toBeInTheDocument();
    expect(screen.queryByText(/for security reports, describe impact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contact intake is opening with early access/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Give AI agents a working brain." })).not.toBeInTheDocument();
  });

  it("renders mock pages for every footer-only page route", () => {
    [
      {
        href: "/guides",
        title: "Guides for operator-led agent work.",
        panel: "Start with a bounded run",
      },
      {
        href: "/api-reference",
        title: "API reference preview for CodePawl integrations.",
        panel: "Run lifecycle contracts",
      },
      {
        href: "/build-log",
        title: "Build log for CodePawl early access.",
        panel: "Release notes",
      },
      {
        href: "/careers",
        title: "Careers at CodePawl will open later.",
        panel: "Product engineering",
      },
    ].forEach(({ href, panel, title }) => {
      const { unmount } = renderAtRoute(href);
      const page = screen.getByRole("region", { name: title });

      expect(window.location.pathname).toBe(href);
      expect(within(page).getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(within(page).getByRole("region", { name: `${title} preview` })).toBeInTheDocument();
      expect(within(page).getByRole("heading", { level: 2, name: panel })).toBeInTheDocument();
      expect(within(page).getByText("Mock page only. Final content will be published as early access opens.")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1, name: "Give AI agents a working brain." })).not.toBeInTheDocument();

      unmount();
    });
  });

  it("renders full launch-draft legal pages for legal, privacy, terms, and security", () => {
    [
      {
        href: "/legal",
        title: "Legal center for CodePawl.",
        section: "What this covers",
        contact: "hello@codepawl.com",
      },
      {
        href: "/privacy",
        title: "Privacy policy launch draft.",
        section: "Information we expect to collect",
        contact: "privacy@codepawl.com",
      },
      {
        href: "/terms",
        title: "Terms of use launch draft.",
        section: "Early-access status",
        contact: "hello@codepawl.com",
      },
      {
        href: "/security",
        title: "Security notes and reporting.",
        section: "Report a vulnerability",
        contact: "security@codepawl.com",
      },
    ].forEach(({ contact, href, section, title }) => {
      const { unmount } = renderAtRoute(href);
      const page = screen.getByRole("region", { name: title });

      expect(window.location.pathname).toBe(href);
      expect(within(page).getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(within(page).getByText("Last updated: July 3, 2026")).toBeInTheDocument();
      expect(within(page).getByText(/Launch draft for review/i)).toBeInTheDocument();
      expect(within(page).getByRole("navigation", { name: `${title} sections` })).toBeInTheDocument();
      expect(within(page).getByRole("heading", { level: 2, name: section })).toBeInTheDocument();
      expect(within(page).getByRole("heading", { level: 2, name: "Questions or requests" })).toBeInTheDocument();
      expect(within(page).getByRole("link", { name: contact })).toHaveAttribute("href", `mailto:${contact}`);
      expect(within(page).queryByText("Mock page only. Final content will be published as early access opens.")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1, name: "Give AI agents a working brain." })).not.toBeInTheDocument();

      unmount();
    });
  });

  it("keeps legal copy conservative and avoids unsupported compliance claims", () => {
    ["/legal", "/privacy", "/terms", "/security"].forEach((href) => {
      const { unmount } = renderAtRoute(href);

      expect(screen.queryByText(/SOC 2/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/bug bounty/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/guaranteed response/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/attorney-approved/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/live checkout/i)).not.toBeInTheDocument();

      unmount();
    });
  });

  it("updates page routes from local links and browser history", () => {
    render(<App />);

    fireEvent.click(within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Docs" }));
    expect(window.location.pathname).toBe("/docs");
    expect(screen.getByRole("heading", { level: 1, name: "Future docs for operator-led agents." })).toBeInTheDocument();

    act(() => {
      window.history.pushState({}, "", "/contact");
      window.dispatchEvent(new Event("popstate"));
    });

    expect(screen.getByRole("heading", { level: 1, name: "Reach the right CodePawl inbox." })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("navigation", { name: "Footer resource links" })).getByRole("link", { name: "Guides" }));
    expect(window.location.pathname).toBe("/guides");
    expect(screen.getByRole("heading", { level: 1, name: "Guides for operator-led agent work." })).toBeInTheDocument();
  });

  it("scrolls to the top when page routes change", () => {
    const scrollTo = vi.fn();
    const originalScrollTo = window.scrollTo;
    const originalScrollYDescriptor = Object.getOwnPropertyDescriptor(window, "scrollY");
    const setScrollY = (value: number) => {
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value,
      });
    };

    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    try {
      render(<App />);
      scrollTo.mockClear();

      setScrollY(640);
      fireEvent.click(within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Docs" }));

      expect(window.location.pathname).toBe("/docs");
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });

      scrollTo.mockClear();
      setScrollY(520);

      act(() => {
        window.history.pushState({}, "", "/contact");
        window.dispatchEvent(new Event("popstate"));
      });

      expect(window.location.pathname).toBe("/contact");
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });

      scrollTo.mockClear();
      setScrollY(480);
      fireEvent.click(within(screen.getByRole("navigation", { name: "Footer legal links" })).getByRole("link", { name: "Privacy" }));

      expect(window.location.pathname).toBe("/privacy");
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
    } finally {
      Object.defineProperty(window, "scrollTo", {
        configurable: true,
        value: originalScrollTo,
      });

      if (originalScrollYDescriptor) {
        Object.defineProperty(window, "scrollY", originalScrollYDescriptor);
      } else {
        delete (window as { scrollY?: unknown }).scrollY;
      }
    }
  });

  it("keeps the docs mockup aligned with the marketing-site layout system", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const docsThumbStart = styles.indexOf(".docs-preview-thumb {");
    const docsThumbStyles = styles.slice(docsThumbStart, styles.indexOf(".docs-preview-copy {", docsThumbStart));

    expect(styles).toContain(".docs-page,");
    expect(styles).toContain(".docs-shell {\n  display: grid;");
    expect(styles).toContain("grid-template-columns: minmax(180px, 230px) minmax(0, 1fr)");
    expect(styles).toContain(".docs-preview-item {\n  display: grid;");
    expect(styles).toContain("grid-template-columns: minmax(150px, 220px) minmax(0, 1fr)");
    expect(styles).toContain(".docs-preview-thumb {");
    expect(styles).toContain("--docs-thumb-accent: var(--accent-info)");
    expect(styles).toContain("--docs-thumb-accent-soft: var(--mono-300)");
    expect(styles).toContain("color-mix(in srgb, var(--docs-thumb-accent) 34%, var(--background-deep))");
    expect(styles).toContain(".docs-preview-thumb[data-tone=\"rose\"]");
    expect(styles).toContain(".docs-preview-thumb[data-tone=\"blue\"]");
    expect(styles).toContain("color: var(--mono-100)");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(docsThumbStyles).not.toContain("rgba(255, 255, 255, 0.58)");
    expect(docsThumbStyles).not.toContain("color-mix(in srgb, var(--accent-info) 84%, var(--mono-100))");
    expect(styles).toContain(".docs-preview-copy {");
    expect(styles).not.toContain(".docs-availability");
    expect(styles).not.toContain(".docs-preview-item small");
    expect(styles).toContain(".docs-search-form {");
    expect(styles).toContain(".docs-search-form input {");
    expect(styles).toContain(".docs-category-list {");
    expect(styles).toContain(".docs-category-button[aria-pressed=\"true\"]");
    expect(styles).toContain(".docs-empty-state {");
    expect(styles).not.toContain(".docs-index nav");
    expect(styles).toContain("  .footer-mock-grid,\n  .legal-page-header,\n  .legal-page-shell,\n  .docs-shell,");
    expect(styles).toContain("  .docs-shell,\n  .access-shell,\n  .contact-shell,");
    expect(styles).toContain("  .docs-index {\n    position: relative;");
  });

  it("keeps footer mock pages aligned with the marketing-site layout system", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toContain(".footer-mock-page,");
    expect(styles).toContain(".footer-mock-page {\n  display: grid;");
    expect(styles).toContain("padding: clamp(72px, 9vw, 118px) 0 var(--section-gap-tight)");
    expect(styles).toContain(".footer-mock-grid {\n  display: grid;");
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(styles).toContain(".footer-mock-card {");
    expect(styles).toContain("border-radius: 8px");
    expect(styles).toContain(".footer-mock-note");
    expect(styles).toContain("  .footer-mock-grid,\n  .legal-page-header,\n  .legal-page-shell,\n  .docs-shell,");
    expect(styles).toContain("  .footer-mock-page,\n  .legal-page,\n  .docs-page,");
    expect(styles).not.toContain(".footer-mock-page small");
  });

  it("keeps legal pages aligned with the marketing-site document layout", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toContain(".legal-page,");
    expect(styles).toContain(".legal-page {\n  display: grid;");
    expect(styles).toContain(".legal-page-header {");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) minmax(260px, 360px)");
    expect(styles).toContain(".legal-page-summary {");
    expect(styles).toContain(".legal-page-shell {");
    expect(styles).toContain("grid-template-columns: minmax(180px, 230px) minmax(0, 1fr)");
    expect(styles).toContain(".legal-page-index {\n  position: sticky;");
    expect(styles).toContain(".legal-section,\n.legal-contact-card");
    expect(styles).toContain(".footer-nav-heading");
    expect(styles).toContain("  .legal-page-index {\n    position: relative;");
    expect(styles).toContain("  .legal-contact-card {\n    grid-template-columns: 1fr;");
  });

  it("keeps the contact mockup aligned with the marketing-site layout system", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const contactFormStyles = styles.match(/\.contact-form \{[\s\S]*?\}/)?.[0] ?? "";
    const contactGridStyles = styles.match(/\.contact-grid \{[\s\S]*?\}/)?.[0] ?? "";

    expect(styles).toContain(".contact-page,");
    expect(styles).toContain(".contact-shell {\n  display: grid;");
    expect(styles).toContain("grid-template-columns: minmax(260px, 0.92fr) minmax(0, 1.08fr)");
    expect(styles).toContain("align-items: stretch;");
    expect(styles).toContain(".contact-form {");
    expect(contactFormStyles).toContain("grid-column: 2");
    expect(contactFormStyles).toContain("grid-row: 1");
    expect(styles).toContain(".contact-field-row {\n  display: grid;");
    expect(styles).toContain(".contact-field input,\n.contact-field select,\n.contact-field textarea");
    expect(styles).toContain(".contact-form-actions {");
    expect(styles).toContain(".contact-mail-button {");
    expect(styles).toContain("min-height: 40px");
    expect(styles).toContain(".contact-grid {\n  display: grid;");
    expect(contactGridStyles).toContain("grid-column: 1");
    expect(contactGridStyles).toContain("grid-row: 1");
    expect(styles).toContain("grid-template-rows: repeat(3, minmax(0, 1fr))");
    expect(styles).toContain("height: 100%");
    expect(styles).not.toContain(".contact-expectations");
    expect(styles).toContain("  .contact-field-row {\n    grid-template-columns: 1fr;");
    expect(styles).toContain("  .contact-form,\n  .contact-grid {\n    grid-column: auto;");
    expect(styles).toContain("  .contact-page {\n    gap: 24px;");
  });

  it("uses a decorative painterly wash instead of a visible ascii motion layer", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".ascii-motion-layer")).not.toBeInTheDocument();
    expect(container.querySelector(".painterly-wash")).toBeInTheDocument();
  });

  it("does not drag the background grid toward pointer movement", () => {
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const { container } = render(<App />);
    const shell = container.querySelector(".landing-shell") as HTMLElement;

    fireEvent.pointerMove(shell, { clientX: 1000, clientY: 600 });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(shell.style.getPropertyValue("--grid-drag-x")).toBe("");
    expect(shell.style.getPropertyValue("--grid-drag-y")).toBe("");

    requestAnimationFrameSpy.mockRestore();
  });

  it("keeps workflow cards centered in the viewport at every edge", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const workflowTimelineStyles = styles.match(/\.workflow-timeline \{[\s\S]*?\}/)?.[0] ?? "";
    const workflowTrackStyles = styles.match(/\.workflow-track \{[\s\S]*?\}/)?.[0] ?? "";
    const workflowCardStyles = styles.match(/\.workflow-card \{[\s\S]*?\}/)?.[0] ?? "";

    expect(workflowTimelineStyles).toContain("--workflow-card-width: clamp(320px, 82%, 520px);");
    expect(workflowTimelineStyles).toContain("--workflow-track-edge-padding:");
    expect(workflowTrackStyles).toContain("grid-auto-columns: var(--workflow-card-width);");
    expect(workflowTrackStyles).toContain("padding-inline: var(--workflow-track-edge-padding);");
    expect(workflowTrackStyles).toContain("scroll-padding-inline: var(--workflow-track-edge-padding);");
    expect(workflowCardStyles).toContain("justify-self: center;");
    expect(workflowCardStyles).toContain("width: 100%;");
    expect(workflowCardStyles).toContain("scroll-snap-align: center;");
    expect(workflowCardStyles).not.toContain("scroll-snap-align: start;");
  });

  it("renders Lucide SVG icons instead of placeholder icon text", () => {
    const { container } = render(<App />);

    const lineIcons = Array.from(container.querySelectorAll(".line-icon"));
    const workflowIcons = Array.from(container.querySelectorAll(".workflow-card:not([aria-hidden='true']) .workflow-icon"));
    expect(lineIcons).toHaveLength(4);
    expect(workflowIcons).toHaveLength(6);
    [...lineIcons, ...workflowIcons].forEach((icon) => {
      expect(icon.querySelector("svg")).toBeInTheDocument();
      expect(icon.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    const placeholderIconText = ["screen", "shield", "globe", "bars", "view", "safe", "live", "code", "cost", "save"];
    lineIcons.forEach((icon) => {
      expect(placeholderIconText).not.toContain(icon.textContent?.trim());
    });
  });

  it("uses the monochromatic landing palette, semantic accents, and painterly background assets", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const backgroundStart = styles.indexOf(".landing-shell {");
    const backgroundEnd = styles.indexOf(".site-header,", backgroundStart);
    const backgroundStyles = styles.slice(backgroundStart, backgroundEnd);

    expect(styles).toContain("../../../assets/fonts/Outfit/Outfit-VariableFont_wght.ttf");
    expect(styles).toContain("../../../assets/fonts/Lora/Lora-VariableFont_wght.ttf");
    expect(styles).not.toContain(`${"Ro"}boto`);
    expect(styles).not.toContain(`../../../assets/fonts/${"La"}to/`);
    expect(styles).not.toContain(`../../../assets/fonts/${"Nu"}nito/`);
    expect(styles).toContain("--ink-990: #050607");
    expect(styles).toContain("--mist-100: #f2f0ec");
    expect(styles).toContain("--wash-bright: rgba(242, 240, 236, 0.16)");
    expect(styles).toContain("--wash-dim: rgba(198, 196, 191, 0.1)");
    expect(styles).toContain("--wash-shadow: rgba(5, 6, 7, 0.46)");
    expect(styles).toContain("--accent-success:");
    expect(styles).toContain("--accent-warning:");
    expect(styles).toContain("--accent-info:");
    expect(styles).toContain("--accent-alert:");
    expect(styles).toContain("--dither-dot:");
    expect(styles).toContain("--dither-dot-soft: rgba(198, 196, 191, 0.032)");
    expect(styles).toContain("--dither-shadow:");
    expect(styles).not.toContain("../../../assets/pictures/academic-ascii-glitch-background.webp");
    expect(styles).toContain("../../../assets/landing/section-halftone-cool.svg");
    expect(styles).toContain("../../../assets/landing/trace-ribbon-element.svg");
    expect(styles).not.toContain("--grid-drag");
    expect(backgroundStyles).not.toContain("rgba(143, 182, 232");
    expect(backgroundStyles).not.toContain("rgba(120, 201, 155");
    expect(styles).toContain("radial-gradient(circle at center, var(--dither-dot)");
    expect(styles).toContain("radial-gradient(circle at center, var(--dither-dot-soft)");
    expect(styles).toContain("9px 9px");
    expect(styles).toContain("13px 13px");
    expect(styles).toContain("filter: grayscale(1)");
    expect(styles).toContain("blur(");
    expect(backgroundStyles).toContain("opacity: 0.58;");
    expect(backgroundStyles).toContain("right -10vw top -12vh");
    expect(styles).toContain("animation:");
    expect(styles).toContain("@keyframes painterlyDrift");
    expect(styles).toContain("@keyframes painterlyPulse");
    expect(styles).toContain("@keyframes landingAsciiBrainFloat");
    expect(styles).toContain("@keyframes landingAsciiBrainCurrent");
    expect(styles).toContain("width: min(50%, 360px);");
    expect(styles).toContain("width: min(58%, 280px);");
    expect(styles).toContain("filter: contrast(1.16) brightness(1.1);");
    expect(styles).toContain("filter: drop-shadow(0 18px 30px rgba(0, 0, 0, 0.28));");
    expect(styles).toContain("stroke-width: 2.8;");
    expect(styles).toContain("opacity: 0.28;");
    expect(styles).toContain("animation: landingAsciiBrainFloat 14s ease-in-out infinite");
    expect(styles).toContain("animation: landingAsciiBrainCurrent 11s cubic-bezier(0.45, 0, 0.2, 1) infinite");
    expect(styles).toContain(".landing-ascii-brain-current-septenary");
    expect(styles).toContain("@keyframes landingHalftoneDrift");
    expect(styles).toContain("@keyframes landingHalftonePulse");
    expect(styles).toContain("animation: landingHalftoneDrift 18s linear infinite");
    expect(styles).toContain("animation: landingHalftonePulse 12s ease-in-out infinite");
    expect(styles).toContain(".landing-animation-halftone");
    expect(styles).toContain(".landing-ascii-brain");
    expect(styles).toContain(".landing-ascii-brain-electric");
    expect(styles).toContain(".landing-ascii-brain-current");
    expect(styles).not.toContain(".landing-ascii-brain-idea");
    expect(styles).toContain("opacity: 0.44;");
    expect(styles).not.toContain(".landing-pixel-brain");
    expect(styles).not.toContain(".landing-pixel-brain-block");
    expect(styles).not.toContain(".landing-animation-brain-frame");
    expect(styles).not.toContain("@keyframes landingBrainRotation");
    expect(styles).not.toContain("landingBrainRotation");
    expect(styles).not.toContain("--brain-frame-delay");
    expect(styles).not.toContain("steps(1");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".loading-screen-logo-motion");
    expect(styles).toContain("display: none;");
    expect(styles).toContain(".loading-screen-logo-static");
    expect(styles).toContain("display: block;");
    expect(styles).toContain(".brand:hover .brand-logo-dot");
    expect(styles).toContain(".final-cta::before");
    expect(styles).toContain(".final-cta::after");
    expect(styles).toContain(".line-icon svg");
    expect(styles).toContain(".workflow-icon svg");
    expect(styles).not.toContain('content: "check"');
  });

  it("uses varied section rhythm and hierarchy instead of repeated equal card grids", () => {
    vi.useFakeTimers();
    const { unmount } = renderAtRoute("/pricing");
    const advanceWorkflowNavigationCooldown = () => {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    };

    const pricingSection = screen.getByRole("region", { name: "Simple, predictable pricing." });
    const starterPlan = within(pricingSection).getByRole("heading", { level: 3, name: "Starter" }).closest("article");
    expect(starterPlan).toHaveClass("pricing-card-featured");
    expect(starterPlan).toHaveClass("tilt-card");

    unmount();
    renderAtRoute("/");

    expect(screen.queryByRole("slider", { name: "Workflow step" })).not.toBeInTheDocument();
    expect(screen.queryByText("swipe")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /swipe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Loop back to first workflow step" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous workflow step" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next workflow step" })).toBeEnabled();
    const workflowTrack = screen.getByLabelText("Workflow steps");
    const workflowTimeline = workflowTrack.closest(".workflow-timeline");
    const workflowHitZones = workflowTimeline?.querySelector(".workflow-carousel-hit-zones");
    const perceiveStep = screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article");
    expect(perceiveStep).toHaveAttribute("aria-current", "step");
    expect(perceiveStep).toHaveAttribute("data-focus", "active");
    expect(document.querySelectorAll(".workflow-card")).toHaveLength(6);
    expect(document.querySelectorAll(".workflow-card[aria-hidden='true']")).toHaveLength(0);
    expect(screen.queryByRole("heading", { level: 3, name: "Perceive again" })).not.toBeInTheDocument();
    expect(workflowHitZones).toBeInTheDocument();
    expect(workflowHitZones?.querySelectorAll(".workflow-carousel-hit-zone")).toHaveLength(2);
    expect(perceiveStep?.querySelector(".workflow-carousel-hit-zones")).not.toBeInTheDocument();
    expect(workflowHitZones?.closest("article")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article")).toHaveAttribute(
      "data-focus",
      "near",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Plan" }).closest("article")).toHaveAttribute(
      "data-focus",
      "far",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Act" }).closest("article")).toHaveAttribute(
      "data-focus",
      "ghost",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next workflow step" }));

    expect(screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Previous workflow step" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next workflow step" })).toBeEnabled();

    advanceWorkflowNavigationCooldown();
    fireEvent.click(screen.getByRole("button", { name: "Previous workflow step" }));

    expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Previous workflow step" })).toBeEnabled();

    advanceWorkflowNavigationCooldown();
    fireEvent.click(screen.getByRole("button", { name: "Previous workflow step" }));

    expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    advanceWorkflowNavigationCooldown();
    fireEvent.click(screen.getByRole("button", { name: "Next workflow step" }));

    expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.queryByRole("heading", { level: 3, name: "Perceive again" })).not.toBeInTheDocument();

    advanceWorkflowNavigationCooldown();
    for (let step = 0; step < 5; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next workflow step" }));
      advanceWorkflowNavigationCooldown();
    }

    expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Loop back to first workflow step" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Focus Remember workflow step" }));

    const rememberStep = screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article");
    expect(rememberStep).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText("swipe")).not.toBeInTheDocument();
    expect(rememberStep?.querySelector(".workflow-carousel-hit-zones")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
      "data-focus",
      "near",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Plan" }).closest("article")).toHaveAttribute(
      "data-focus",
      "near",
    );
    expect(screen.getByRole("heading", { level: 3, name: "Act" }).closest("article")).toHaveAttribute(
      "data-focus",
      "far",
    );

    fireEvent.pointerDown(workflowTrack, { button: 0, clientX: 260, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(workflowTrack, { clientX: 150, clientY: 122, pointerId: 1 });

    const planStep = screen.getByRole("heading", { level: 3, name: "Plan" }).closest("article");
    expect(planStep).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText("swipe")).not.toBeInTheDocument();

    advanceWorkflowNavigationCooldown();
    fireEvent.pointerDown(workflowTrack, { button: 0, clientX: 150, clientY: 120, pointerId: 2 });
    fireEvent.pointerUp(workflowTrack, { clientX: 260, clientY: 122, pointerId: 2 });

    expect(screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    advanceWorkflowNavigationCooldown();
    fireEvent.pointerDown(workflowTrack, { button: 0, clientX: 260, clientY: 120, pointerId: 3 });
    fireEvent.pointerCancel(workflowTrack, { clientX: 150, clientY: 122, pointerId: 3 });

    expect(screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    fireEvent.click(screen.getByRole("button", { name: "Focus Perceive workflow step" }));
    fireEvent.keyDown(workflowTrack, { key: "ArrowLeft" });

    expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    advanceWorkflowNavigationCooldown();
    fireEvent.keyDown(workflowTrack, { key: "ArrowRight" });

    expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    advanceWorkflowNavigationCooldown();
    fireEvent.keyDown(workflowTrack, { key: "ArrowRight" });

    expect(screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    advanceWorkflowNavigationCooldown();
    fireEvent.keyDown(workflowTrack, { key: "ArrowLeft" });

    expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    fireEvent.click(screen.getByRole("button", { name: "Focus Improve workflow step" }));

    expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Previous workflow step" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next workflow step" })).toBeEnabled();
    advanceWorkflowNavigationCooldown();
    fireEvent.pointerDown(workflowTrack, { button: 0, clientX: 260, clientY: 120, pointerId: 4 });
    fireEvent.pointerUp(workflowTrack, { clientX: 150, clientY: 122, pointerId: 4 });

    expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toContain("--section-gap:");
    expect(styles).toContain(".section-intro");
    expect(styles).toContain(".section-intro > div");
    expect(styles).toContain(".section-note {");
    expect(styles).toContain(".pricing-page-header");
    expect(styles).toContain(".pricing-page-header .pricing-note");
    expect(styles).not.toContain(".feature-grid");
    expect(styles).not.toContain(".feature-card");
    const workflowTimelineStyles = styles.match(/\.workflow-timeline \{[\s\S]*?\}/)?.[0] ?? "";
    const workflowHitZoneLayerStyles = styles.match(/\.workflow-carousel-hit-zones \{[\s\S]*?\}/)?.[0] ?? "";
    const workflowHitZoneStyles = styles.match(/\.workflow-carousel-hit-zone \{[\s\S]*?\}/)?.[0] ?? "";
    const workflowTrackStyles = styles.match(/\.workflow-track \{[\s\S]*?\}/)?.[0] ?? "";
    const workflowCardStyles = styles.match(/\.workflow-card \{[\s\S]*?\}/)?.[0] ?? "";
    const workflowIconStyles = Array.from(styles.matchAll(/\.workflow-icon \{[\s\S]*?\}/g)).map((match) => match[0]);
    const workflowIconPlacementStyles = workflowIconStyles.find((rule) => rule.includes("grid-column: 2;")) ?? "";
    expect(styles).toContain(".workflow-timeline");
    expect(styles).toContain(".workflow-track");
    expect(styles).toContain(".workflow-card-hitbox");
    expect(styles).toContain(".workflow-carousel-hit-zones");
    expect(styles).toContain(".workflow-carousel-hit-zone");
    expect(styles).toContain(".workflow-loop-arrow-button");
    expect(styles).not.toContain(".workflow-loop-trail");
    expect(styles).not.toContain(".workflow-loop-trail-head");
    expect(styles).not.toContain("@keyframes workflowLoopTrail");
    expect(styles).not.toContain(".workflow-swipe-hint");
    expect(styles).not.toContain(".workflow-step-controls");
    expect(styles).not.toContain(".workflow-step-button");
    expect(styles).not.toContain(".workflow-timeline::before");
    expect(styles).not.toContain(".workflow-timeline::after");
    expect(styles).not.toContain(".workflow-tick");
    expect(styles).not.toContain(".workflow-controls");
    expect(styles).not.toContain(".workflow-arrow-button");
    expect(styles).not.toContain(".workflow-track-dragging");
    expect(styles).toContain(".workflow-card[aria-current=\"step\"]");
    expect(styles).toContain(".workflow-card[data-focus=\"active\"]");
    expect(styles).toContain(".workflow-card[data-focus=\"near\"]");
    expect(styles).toContain(".workflow-card[data-focus=\"far\"]");
    expect(styles).toContain(".workflow-card[data-focus=\"ghost\"]");
    expect(styles).not.toContain(".workflow-card[data-focus=\"hidden\"]");
    expect(workflowTimelineStyles).toContain("overflow: hidden;");
    expect(workflowTimelineStyles).toContain("--workflow-card-width: clamp(320px, 82%, 520px);");
    expect(workflowTimelineStyles).toContain("--workflow-track-edge-padding:");
    expect(workflowHitZoneLayerStyles).toContain("position: absolute;");
    expect(workflowHitZoneLayerStyles).toContain("pointer-events: none;");
    expect(workflowHitZoneLayerStyles).toContain(
      "grid-template-columns: minmax(56px, 1fr) var(--workflow-card-width) minmax(56px, 1fr);",
    );
    expect(styles).toContain(
      "grid-template-columns: minmax(52px, 1fr) var(--workflow-card-width) minmax(52px, 1fr);",
    );
    expect(workflowHitZoneStyles).toContain("pointer-events: auto;");
    expect(workflowHitZoneStyles).toContain("background: transparent;");
    expect(workflowHitZoneStyles).toContain("border: 0;");
    expect(workflowHitZoneStyles).not.toContain("border-radius:");
    expect(workflowTrackStyles).toContain("overflow-x: hidden;");
    expect(workflowTrackStyles).toContain("scroll-snap-type: x mandatory;");
    expect(workflowTrackStyles).toContain("touch-action: pan-y;");
    expect(workflowTrackStyles).toContain("grid-auto-columns: var(--workflow-card-width);");
    expect(workflowTrackStyles).toContain("padding-inline: var(--workflow-track-edge-padding);");
    expect(workflowTrackStyles).toContain("scroll-padding-inline: var(--workflow-track-edge-padding);");
    expect(workflowCardStyles).toContain("justify-self: center;");
    expect(workflowCardStyles).toContain("width: 100%;");
    expect(workflowCardStyles).toContain("scroll-snap-align: center;");
    expect(workflowCardStyles).not.toContain("scroll-snap-align: start;");
    expect(workflowCardStyles).not.toContain("grid-template-rows: auto 1fr auto;");
    expect(styles).toContain(".workflow-title-row");
    expect(styles).not.toContain(".workflow-swipe-hint svg");
    expect(styles).not.toContain(".workflow-swipe-mark");
    expect(styles).not.toContain(".workflow-swipe-arrow-line");
    expect(styles).not.toContain(".workflow-swipe-arrow-head-left");
    expect(styles).not.toContain(".workflow-swipe-arrow-head-right");
    expect(styles).not.toContain(".workflow-swipe-arrows");
    expect(styles).not.toContain(".workflow-swipe-arrow-left");
    expect(workflowIconStyles.join("\n")).not.toContain("position: absolute;");
    expect(workflowIconStyles.join("\n")).not.toContain("top: 130px;");
    expect(workflowIconStyles.join("\n")).not.toContain("left: 0;");
    expect(workflowIconPlacementStyles).toContain("grid-column: 2;");
    expect(styles).toContain("filter: blur(3px);");
    expect(styles).toContain("filter: blur(6px);");
    expect(styles).toContain("pointer-events: none;");
    expect(styles).not.toContain(".workflow-slider");
    expect(styles).not.toContain("grid-template-rows: repeat(6, minmax(98px, auto));");
    expect(styles).not.toContain("grid-column: 3 / span 4;");
    expect(styles).toContain(".pricing-card-featured");
    expect(styles).toContain(".pricing-card-featured::before");
    expect(styles).toContain(".pricing-card-value");
    expect(styles).toContain(".pricing-card-price");
    expect(styles).toContain(".pricing-card-control");
    expect(styles).toContain(".plan-bait-row");
    expect(styles).toContain(".plan-savings");
    expect(styles).toContain("var(--accent-warning)");
    expect(styles).toContain("var(--accent-success)");
    expect(styles).toContain("--card-raise-y: -12px");
    expect(styles).not.toContain('content: "->"');
  });

  it("ignores rapid workflow navigation until the cooldown finishes", () => {
    vi.useFakeTimers();
    render(<App />);

    const nextWorkflowStep = screen.getByRole("button", { name: "Next workflow step" });
    const workflowTrack = screen.getByLabelText("Workflow steps");

    fireEvent.click(nextWorkflowStep);
    fireEvent.click(nextWorkflowStep);
    fireEvent.click(nextWorkflowStep);
    fireEvent.keyDown(workflowTrack, { key: "ArrowRight" });

    expect(screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    act(() => {
      vi.advanceTimersByTime(499);
    });
    fireEvent.click(nextWorkflowStep);
    expect(screen.getByRole("heading", { level: 3, name: "Remember" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );

    act(() => {
      vi.advanceTimersByTime(1);
    });
    fireEvent.click(nextWorkflowStep);
    expect(screen.getByRole("heading", { level: 3, name: "Plan" }).closest("article")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("wraps the single-line workflow carousel with smooth scrolling", () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn();
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    try {
      render(<App />);

      const advanceWorkflowNavigationCooldown = () => {
        act(() => {
          vi.advanceTimersByTime(500);
        });
      };
      const nextWorkflowStep = screen.getByRole("button", { name: "Next workflow step" });
      const previousWorkflowStep = screen.getByRole("button", { name: "Previous workflow step" });

      for (let step = 0; step < 5; step += 1) {
        fireEvent.click(nextWorkflowStep);
        advanceWorkflowNavigationCooldown();
      }

      expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
        "aria-current",
        "step",
      );
      expect(document.querySelectorAll(".workflow-card")).toHaveLength(6);
      expect(document.querySelectorAll(".workflow-card[aria-hidden='true']")).toHaveLength(0);
      expect(screen.queryByRole("heading", { level: 3, name: "Perceive again" })).not.toBeInTheDocument();
      const loopBackButton = screen.getByRole("button", { name: "Loop back to first workflow step" });
      expect(loopBackButton).toHaveClass("workflow-loop-arrow-button");
      expect(loopBackButton.querySelector(".lucide-chevron-right")).toBeInTheDocument();

      scrollTo.mockClear();
      fireEvent.click(loopBackButton);

      expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
        "aria-current",
        "step",
      );
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));
      expect(document.querySelector(".workflow-loop-trail")).not.toBeInTheDocument();
      expect(document.querySelector(".workflow-loop-trail-head")).not.toBeInTheDocument();

      advanceWorkflowNavigationCooldown();
      scrollTo.mockClear();
      fireEvent.click(previousWorkflowStep);

      expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
        "aria-current",
        "step",
      );
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));

      advanceWorkflowNavigationCooldown();
      fireEvent.keyDown(screen.getByLabelText("Workflow steps"), { key: "ArrowRight" });

      expect(screen.getByRole("heading", { level: 3, name: "Perceive" }).closest("article")).toHaveAttribute(
        "aria-current",
        "step",
      );
      expect(document.querySelector(".workflow-loop-trail")).not.toBeInTheDocument();
      expect(document.querySelector(".workflow-loop-trail-head")).not.toBeInTheDocument();
    } finally {
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
          configurable: true,
          value: originalScrollTo,
        });
      } else {
        delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
      }
    }
  });

  it("recenters the active workflow card when returning to the product route", () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn();
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    try {
      render(<App />);

      const advanceWorkflowNavigationCooldown = () => {
        act(() => {
          vi.advanceTimersByTime(500);
        });
      };
      const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
      const nextWorkflowStep = screen.getByRole("button", { name: "Next workflow step" });

      for (let step = 0; step < 5; step += 1) {
        fireEvent.click(nextWorkflowStep);
        advanceWorkflowNavigationCooldown();
      }

      expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
        "aria-current",
        "step",
      );
      const scrollCallsBeforeRouteSwitch = scrollTo.mock.calls.length;

      fireEvent.click(within(primaryNav).getByRole("link", { name: "Docs" }));
      expect(screen.getByRole("heading", { level: 1, name: "Future docs for operator-led agents." })).toBeInTheDocument();

      fireEvent.click(within(primaryNav).getByRole("link", { name: "Product" }));

      expect(screen.getByRole("heading", { level: 3, name: "Improve" }).closest("article")).toHaveAttribute(
        "aria-current",
        "step",
      );
      expect(scrollTo.mock.calls.length).toBeGreaterThan(scrollCallsBeforeRouteSwitch);
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto" }));
    } finally {
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
          configurable: true,
          value: originalScrollTo,
        });
      } else {
        delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
      }
    }
  });

  it("tilts compatible pricing cards with pointer movement", () => {
    renderAtRoute("/pricing");

    const pricingSection = screen.getByRole("region", { name: "Simple, predictable pricing." });
    const pricingCard = within(pricingSection).getByRole("heading", { level: 3, name: "Starter" }).closest("article");
    expect(pricingCard).toHaveClass("pricing-card", "tilt-card");

    Object.defineProperty(pricingCard, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 140,
        height: 120,
        left: 20,
        right: 260,
        top: 20,
        width: 240,
        x: 20,
        y: 20,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerMove(pricingCard as HTMLElement, { clientX: 240, clientY: 130 });

    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-rotate-x")).toMatch(/deg$/);
    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-rotate-y")).toMatch(/deg$/);
    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-lift")).toBe("1");
    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-rotate-x")).not.toBe("0deg");
    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-rotate-y")).not.toBe("0deg");

    fireEvent.pointerLeave(pricingCard as HTMLElement);

    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-rotate-x")).toBe("0deg");
    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-rotate-y")).toBe("0deg");
    expect((pricingCard as HTMLElement).style.getPropertyValue("--tilt-lift")).toBe("0");
  });

  it("keeps structural cards out of the 3d tilt treatment", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".value-strip article.tilt-card")).not.toBeInTheDocument();
    expect(container.querySelector(".workflow-card.tilt-card")).not.toBeInTheDocument();
    expect(container.querySelector(".trace-panel.tilt-card")).not.toBeInTheDocument();
    expect(container.querySelector(".approval-panel.tilt-card")).not.toBeInTheDocument();
    expect(container.querySelector(".final-cta.tilt-card")).not.toBeInTheDocument();
  });

  it("defines a restrained reduced-motion 3d card hover system", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toContain(".tilt-card");
    expect(styles).toContain("--tilt-rotate-x: 0deg");
    expect(styles).toContain("--tilt-rotate-y: 0deg");
    expect(styles).toContain("--tilt-lift: 0");
    expect(styles).toContain("--card-raise-y: 0px");
    expect(styles).toContain("perspective: 900px");
    expect(styles).toContain("transform-style: preserve-3d");
    expect(styles).toContain("rotateX(var(--tilt-rotate-x))");
    expect(styles).toContain("rotateY(var(--tilt-rotate-y))");
    expect(styles).toContain("translateZ(");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce), (hover: none)");
  });

  it("keeps early access pricing cards aligned when status labels wrap", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const pricingPageHeaderStyles = styles.match(/\.pricing-page-header \{[\s\S]*?\}/)?.[0] ?? "";
    const billingToggleWrapStyles = styles.match(/\.billing-toggle-wrap \{[\s\S]*?\}/)?.[0] ?? "";

    expect(styles).toContain("grid-template-rows: auto auto auto auto 1fr auto");
    expect(styles).toContain("align-content: start");
    expect(styles).toContain(".pricing-card ul {");
    expect(styles).toContain("align-self: stretch");
    expect(styles).toContain(".pricing-status {");
    expect(styles).toContain("white-space: normal");
    expect(styles).toContain("line-height: 1.2");
    expect(styles).toContain("justify-items: center");
    expect(styles).toContain("text-align: center");
    expect(pricingPageHeaderStyles).toContain("width: 100%");
    expect(pricingPageHeaderStyles).toContain("max-width: none");
    expect(billingToggleWrapStyles).toContain("justify-items: center");
    expect(billingToggleWrapStyles).toContain("width: min(1020px, 100%)");
    expect(billingToggleWrapStyles).toContain("margin: 6px auto 0");
    expect(styles).toContain(".billing-toggle");
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(styles).toContain("width: min(360px, 100%)");
    expect(styles).toContain(".billing-period-button");
    expect(styles).toContain("justify-content: center");
    expect(styles).toContain(".billing-period-button-active");
    expect(styles).not.toContain(".billing-period-note");
    expect(styles).toContain(".plan-fit");
    expect(styles).toContain(".plan-badge");
    expect(styles).not.toContain(".pricing-reassurance");
    expect(styles).not.toContain(".pricing-reassurance-icon");
    expect(styles).toContain(".download-direct {");
    expect(styles).toContain("width: min(1020px, 100%)");
    expect(styles).toContain("margin: 22px auto 0");
    expect(styles).toContain("padding: 16px 18px");
    expect(styles).toContain("font-size: clamp(20px, 2vw, 26px)");
    expect(styles).toContain("font-size: 13px");
    expect(styles).toContain(".pricing-card .button {");
    expect(styles).toContain("min-height: 46px");
  });

  it("hardens keyboard focus, text contrast, and base touch targets", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toContain("--text-soft: rgba(242, 240, 236, 0.56)");
    expect(styles).toContain("a:focus-visible");
    expect(styles).toContain("button:focus-visible");
    expect(styles).toContain(".button:focus-visible");
    expect(styles).toContain("outline: 2px solid var(--accent-info)");
    expect(styles).toContain("outline-offset: 3px");
    expect(styles).toContain("min-height: 44px");
  });

  it("centers and hardens the header layout across desktop and touch widths", () => {
    render(<App />);

    const header = screen.getByRole("banner");
    const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
    const actions = header.querySelector(".header-actions");
    expect(within(primaryNav).getByRole("link", { name: "Product" })).toHaveAttribute("href", "/");
    expect(within(primaryNav).getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    expect(within(primaryNav).getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    expect(within(primaryNav).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
    expect(within(primaryNav).queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
    expect(actions).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "Start here" })).toHaveAttribute("href", "/docs");
    expect(within(actions as HTMLElement).queryByRole("link", { name: "Learn More" })).not.toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "Download CodePawl" })).toHaveAttribute("href", "/access");

    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const headerStart = styles.indexOf(".site-header {\n  position: sticky");
    const headerStyles = styles.slice(headerStart, styles.indexOf(".brand {", headerStart));
    expect(headerStyles).toContain("grid-template-columns: minmax(220px, 1fr) minmax(420px, auto) minmax(220px, 1fr)");
    expect(headerStyles).toContain("top: 12px");
    expect(headerStyles).toContain("border: 1px solid var(--border)");
    expect(headerStyles).toContain("background: color-mix(in srgb, var(--background-deep) 72%, transparent)");
    expect(headerStyles).toContain("backdrop-filter: blur(18px)");

    const navStart = styles.indexOf(".primary-nav {");
    const navStyles = styles.slice(navStart, styles.indexOf(".primary-nav a", navStart));
    expect(navStyles).toContain("justify-self: center");
    expect(navStyles).toContain("justify-content: center");
    expect(navStyles).toContain("width: fit-content");
    expect(navStyles).not.toContain("border:");
    expect(navStyles).not.toContain("background:");

    const navLinkStart = styles.indexOf(".primary-nav a {");
    const navLinkStyles = styles.slice(navLinkStart, styles.indexOf("}", navLinkStart));
    expect(navLinkStyles).not.toContain("border:");
    expect(navLinkStyles).not.toContain("background:");

    const brandStyles = Array.from(styles.matchAll(/\.brand \{[\s\S]*?\}/g))
      .map((match) => match[0])
      .find((rule) => rule.includes("transition: color 180ms ease")) ?? "";
    expect(brandStyles).toContain("transition: color 180ms ease");
    expect(brandStyles).not.toContain("transition: background");

    const brandHoverStart = styles.indexOf(".brand:hover,");
    const brandHoverStyles = styles.slice(brandHoverStart, styles.indexOf("}", brandHoverStart));
    expect(brandHoverStyles).toContain("color: var(--mist-200)");
    expect(brandHoverStyles).not.toContain("background:");

    expect(styles).toContain(".brand-logo-surface");
    expect(styles).toContain("@keyframes brandLogoChevronUpper");
    expect(styles).toContain("@keyframes brandLogoChevronLower");
    expect(styles).toContain("@keyframes brandLogoConnector");
    expect(styles).toContain("@keyframes brandLogoDot");
    expect(styles).toContain(".loading-screen");
    expect(styles).toContain(".loading-screen-logo-motion");
    expect(styles).toContain(".loading-screen-logo-static");
    expect(styles).toContain(".brand:hover .brand-logo-chevron-upper");

    const tabletStyles = styles.slice(styles.indexOf("@media (max-width: 1120px)"), styles.indexOf("@media (max-width: 760px)"));
    expect(tabletStyles).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(tabletStyles).toContain("flex-wrap: wrap");
    expect(tabletStyles).toContain("justify-content: center");
    expect(tabletStyles).toContain("overflow-x: visible");

    const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 760px)"));
    expect(mobileStyles).toContain("top: auto");
    expect(mobileStyles).toContain("justify-self: center");
    expect(mobileStyles).toContain(".header-actions .button");
    expect(mobileStyles).toContain("width: 100%");
  });

  it("keeps the final CTA buttons above a plain blurred gradient background", () => {
    render(<App />);

    const finalCta = screen.getByRole("region", { name: "Final call to action" });
    const actions = finalCta.querySelector(".final-cta-actions");
    expect(actions).toBeInTheDocument();
    expect(within(actions as HTMLElement).queryByRole("link", { name: "View plans" })).not.toBeInTheDocument();
    expect(within(actions as HTMLElement).queryByRole("link", { name: "Review workflow" })).not.toBeInTheDocument();
    expect(within(actions as HTMLElement).queryByRole("link", { name: "Download CodePawl" })).not.toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "Start Here" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    expect(within(actions as HTMLElement).getByRole("link", { name: "Learn More" })).toHaveAttribute("href", "/docs");

    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const finalCtaStart = styles.indexOf(".final-cta {\n  display: grid");
    const finalCtaStyles = styles.slice(finalCtaStart, styles.indexOf(".site-footer {", finalCtaStart));
    const siteFooterStart = styles.indexOf(".site-footer {\n  display: grid");
    const siteFooterStyles = styles.slice(siteFooterStart, styles.indexOf(".site-footer p {", siteFooterStart));
    expect(finalCtaStyles).toContain("isolation: isolate");
    expect(finalCtaStyles).toContain(".final-cta > *");
    expect(finalCtaStyles).toContain("z-index: 1");
    expect(finalCtaStyles).toContain(".final-cta::before");
    expect(finalCtaStyles).toContain(".final-cta::after");
    expect(finalCtaStyles).not.toContain("academic-ascii-glitch-background.webp");
    expect(finalCtaStyles).not.toContain("section-halftone-cool.svg");
    expect(finalCtaStyles).not.toContain("trace-ribbon-element.svg");
    expect(finalCtaStyles).not.toContain("ascii-orbit-element.svg");
    expect(finalCtaStyles).not.toContain("painterlyDrift");
    expect(finalCtaStyles).not.toContain("painterlyPulse");
    expect(finalCtaStyles).not.toContain("animation:");
    expect(finalCtaStyles).not.toContain("radial-gradient(circle at center");
    expect(finalCtaStyles).not.toContain("background-size:");
    expect(finalCtaStyles).toContain("radial-gradient(ellipse at 24% 28%, color-mix(in srgb, var(--mono-100)");
    expect(finalCtaStyles).toContain("radial-gradient(ellipse at 72% 42%, color-mix(in srgb, var(--mono-300)");
    expect(finalCtaStyles).toContain("color-mix(in srgb, var(--background-deep)");
    expect(finalCtaStyles).toContain("filter: blur(18px) grayscale(1)");
    expect(finalCtaStyles).toContain("mix-blend-mode: screen");
    expect(finalCtaStyles).toContain(".final-cta-actions");
    expect(siteFooterStyles).toContain("margin-top: clamp(34px, 5vw, 64px)");
  });

  it("adapts the primary navigation for narrow touch viewports without horizontal scrolling", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 760px)"));

    expect(mobileStyles).toContain(".primary-nav {");
    expect(mobileStyles).toContain("flex-wrap: wrap");
    expect(mobileStyles).toContain("overflow-x: visible");
    expect(mobileStyles).toContain(".primary-nav a {");
    expect(mobileStyles).toContain("min-height: 44px");
    expect(mobileStyles).not.toContain("overflow-x: auto");

    const mobileLinkStart = mobileStyles.indexOf(".primary-nav a {");
    const mobileLinkStyles = mobileStyles.slice(
      mobileLinkStart,
      mobileStyles.indexOf("}", mobileLinkStart),
    );
    expect(mobileLinkStyles).not.toContain("border:");
    expect(mobileLinkStyles).not.toContain("background:");

    expect(mobileStyles).toContain(".final-cta-actions");
    expect(mobileStyles).toContain("grid-template-columns: 1fr");
    expect(mobileStyles).toContain(".final-cta-actions .button");
    expect(mobileStyles).toContain("width: 100%");
  });
});
