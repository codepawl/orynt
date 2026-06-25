import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import darkThemeLogo from "../../../assets/pictures/dark-theme-logo.svg";
import App from "./App";

describe("CodePawl landing page", () => {
  it("declares lucide-react as the icon dependency", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toHaveProperty("lucide-react");
  });

  it("renders the landing nav, hero, and primary product preview", () => {
    render(<App />);

    const brandLink = screen.getByRole("link", { name: "CodePawl home" });
    const logo = brandLink.querySelector("img");
    expect(logo).toHaveAttribute("src", darkThemeLogo);
    expect(logo).toHaveAttribute("alt", "");

    const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(primaryNav).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Product" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Features" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Workflow" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Cockpit" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Pricing" })).toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Docs" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Changelog" })).not.toBeInTheDocument();
    expect(within(primaryNav).queryByRole("link", { name: "Company" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Book demo" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "See cockpit" }).length).toBeGreaterThan(1);
    expect(screen.queryByRole("link", { name: "Start free trial" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View early access plans" }).length).toBeGreaterThan(1);

    expect(
      screen.getByRole("heading", { level: 1, name: "Run computer agents without losing control." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/codepawl is your closed-source control cockpit for browser agents/i)).toBeInTheDocument();
    expect(screen.queryByText(/local-first, approval-based, built for operators/i)).not.toBeInTheDocument();
    const trialHighlights = screen.getByRole("list", { name: "Trial highlights" });
    expect(within(trialHighlights).getByText(/no credit card/i)).toBeInTheDocument();
    expect(within(trialHighlights).getByText(/7-day trial planned/i)).toBeInTheDocument();
    expect(within(trialHighlights).getByText(/closed-source product/i)).toBeInTheDocument();

    const preview = screen.getByRole("region", { name: "CodePawl product preview" });
    expect(within(preview).getAllByText("Research competitors").length).toBeGreaterThan(1);
    expect(within(preview).getByText(/step 7 of 18/i)).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(preview).getAllByText("Metrics").length).toBeGreaterThan(1);
  });

  it("renders value props, features, workflow, cockpit, pricing, and footer", () => {
    render(<App />);

    ["Closed-source", "Approval-based", "Browser automation", "Cost visibility"].forEach((label) => {
      expect(screen.getByRole("heading", { level: 2, name: label })).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Everything you need to run agents with confidence.",
      }),
    ).toBeInTheDocument();
    [
      "Browser task control",
      "Approve risky actions",
      "Live preview",
      "Trace & inspect",
      "Token & cost usage",
      "Save as skills",
    ].forEach((label) => {
      expect(screen.getAllByRole("heading", { level: 3, name: label }).length).toBeGreaterThan(0);
    });
    const featuresSection = screen.getByRole("region", {
      name: "Everything you need to run agents with confidence.",
    });
    expect(featuresSection.querySelector(".section-kicker")).not.toBeInTheDocument();
    expect(
      within(featuresSection).getByText(
        /control, approvals, trace inspection, usage visibility, and reusable skills sit in one operator surface/i,
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "A simple operator workflow." })).toBeInTheDocument();
    ["Start a task", "Watch the agent work", "Approve risky actions", "Save as a skill"].forEach((label) => {
      expect(screen.getAllByRole("heading", { level: 3, name: label }).length).toBeGreaterThan(0);
    });
    const workflowSection = screen.getByRole("region", { name: "A simple operator workflow." });
    expect(workflowSection.querySelector(".section-kicker")).not.toBeInTheDocument();
    expect(
      within(workflowSection).getByText(
        /move from prompt to live run to human review to repeatable skill without hiding the agent's decisions/i,
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "Your cockpit for computer agents." })).toBeInTheDocument();
    const cockpitSection = screen.getByRole("region", { name: "Your cockpit for computer agents." });
    expect(cockpitSection.querySelector(".section-kicker")).not.toBeInTheDocument();
    expect(
      within(cockpitSection).getByText(
        /the demo surface keeps task state, trace data, approvals, and budget signals visible while the agent runs/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/delete all cookies for example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/trace timeline/i)).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "Simple, predictable pricing." })).toBeInTheDocument();
    const pricingSection = screen.getByRole("region", { name: "Simple, predictable pricing." });
    expect(within(pricingSection).queryByText("Pricing")).not.toBeInTheDocument();
    expect(screen.getByText(/early access packaging/i)).toBeInTheDocument();
    expect(screen.getByText(/alpha planning numbers/i)).toBeInTheDocument();
    expect(screen.getByText(/not a live checkout/i)).toBeInTheDocument();
    expect(screen.getByText(/provider\/model usage is billed separately/i)).toBeInTheDocument();
    const billingPeriod = screen.getByRole("group", { name: "Billing period" });
    expect(within(billingPeriod).getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
    expect(within(billingPeriod).getByRole("button", { name: "Quarterly" })).toHaveAttribute("aria-pressed", "false");
    expect(within(billingPeriod).getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Monthly planning numbers shown.")).toBeInTheDocument();
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
    expect(screen.getByText("No live checkout")).toBeInTheDocument();
    expect(screen.getByText("Provider usage separate")).toBeInTheDocument();
    expect(screen.getByText("Terms may change before launch")).toBeInTheDocument();
    ["Free Trial", "Starter", "Pro"].forEach((label) => {
      expect(screen.getByRole("heading", { level: 3, name: label })).toBeInTheDocument();
    });
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$19")).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();
    expect(screen.getAllByText("Per user / month")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /join .*waitlist/i })).not.toBeInTheDocument();
    ["Trial waitlist opens soon", "Starter waitlist opens soon", "Pro waitlist opens soon"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    });

    expect(screen.getByRole("contentinfo")).toHaveTextContent("Closed-source control cockpit for computer agents.");
    expect(screen.queryByText(/local-first/i)).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Docs coming soon");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Security notes coming soon");
    expect(within(screen.getByRole("contentinfo")).queryByRole("link", { name: "API Reference" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
  });

  it("switches pricing billing period without changing alpha price anchors", () => {
    render(<App />);

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
      within(pricingSection).getByText("Quarterly billing cadence planned; prices remain alpha monthly anchors."),
    ).toBeInTheDocument();
    expect(within(pricingSection).getByText("$19")).toBeInTheDocument();
    expect(within(pricingSection).getByText("$49")).toBeInTheDocument();

    fireEvent.click(yearly);

    expect(monthly).toHaveAttribute("aria-pressed", "false");
    expect(quarterly).toHaveAttribute("aria-pressed", "false");
    expect(yearly).toHaveAttribute("aria-pressed", "true");
    expect(within(pricingSection).getAllByText("Per user / year")).toHaveLength(2);
    expect(
      within(pricingSection).getByText("Yearly billing cadence planned; prices remain alpha monthly anchors."),
    ).toBeInTheDocument();
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

  it("renders a decorative hidden ascii motion layer", () => {
    const { container } = render(<App />);

    const motionLayer = container.querySelector(".ascii-motion-layer");
    expect(motionLayer).toBeInTheDocument();
    expect(motionLayer).toHaveAttribute("aria-hidden", "true");
    expect(motionLayer).toHaveTextContent(/[.:\-+*=#%@]/);
  });

  it("drags the background grid toward pointer movement without re-rendered state", () => {
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    const innerWidthSpy = vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    const innerHeightSpy = vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);

    const { container, unmount } = render(<App />);
    const shell = container.querySelector(".landing-shell") as HTMLElement;

    fireEvent.pointerMove(shell, { clientX: 1000, clientY: 600 });
    expect(requestAnimationFrameSpy).toHaveBeenCalled();

    animationFrames.shift()?.(16);

    expect(shell.style.getPropertyValue("--grid-drag-x")).toMatch(/px$/);
    expect(shell.style.getPropertyValue("--grid-drag-y")).toMatch(/px$/);
    expect(shell.style.getPropertyValue("--grid-drag-x")).not.toBe("0px");
    expect(shell.style.getPropertyValue("--grid-drag-y")).not.toBe("0px");

    fireEvent.pointerLeave(shell);
    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalled();

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    innerWidthSpy.mockRestore();
    innerHeightSpy.mockRestore();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("renders Lucide SVG icons instead of placeholder icon text", () => {
    const { container } = render(<App />);

    const lineIcons = Array.from(container.querySelectorAll(".line-icon"));
    const workflowIcons = Array.from(container.querySelectorAll(".workflow-icon"));
    expect(lineIcons).toHaveLength(10);
    expect(workflowIcons).toHaveLength(4);
    [...lineIcons, ...workflowIcons].forEach((icon) => {
      expect(icon.querySelector("svg")).toBeInTheDocument();
      expect(icon.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    const placeholderIconText = ["screen", "shield", "globe", "bars", "view", "safe", "live", "code", "cost", "save"];
    lineIcons.forEach((icon) => {
      expect(placeholderIconText).not.toContain(icon.textContent?.trim());
    });
  });

  it("uses the monochromatic landing palette, semantic accents, and ascii gradient assets", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toContain("../../../assets/fonts/Lato/Lato-Regular.ttf");
    expect(styles).toContain("../../../assets/fonts/Roboto_Slab/RobotoSlab-VariableFont_wght.ttf");
    expect(styles).toContain("--mono-950: #08090a");
    expect(styles).toContain("--ascii-gradient-glow:");
    expect(styles).toContain("--mono-800: #474747");
    expect(styles).toContain("--mono-650: #717171");
    expect(styles).toContain("--mono-500: #9c9c9c");
    expect(styles).toContain("--mono-300: #c6c6c6");
    expect(styles).toContain("--mono-100: #f1f1f1");
    expect(styles).toContain("--accent-success:");
    expect(styles).toContain("--accent-warning:");
    expect(styles).toContain("--accent-info:");
    expect(styles).toContain("--accent-alert:");
    expect(styles).toContain("--dither-dot:");
    expect(styles).toContain("--dither-dot-soft:");
    expect(styles).toContain("--dither-shadow:");
    expect(styles).toContain("../../../assets/landing/hero-ascii-glow-teal.svg");
    expect(styles).toContain("../../../assets/landing/trace-ribbon-element.svg");
    expect(styles).toContain("--grid-drag-x: 0px");
    expect(styles).toContain("--grid-drag-y: 0px");
    expect(styles).toContain("var(--grid-drag-x)");
    expect(styles).toContain("var(--grid-drag-y)");
    expect(styles).toContain("radial-gradient(circle at center, var(--dither-dot)");
    expect(styles).toContain("radial-gradient(circle at center, var(--dither-dot-soft)");
    expect(styles).toContain("9px 9px");
    expect(styles).toContain("13px 13px");
    expect(styles).toContain("filter: grayscale(1)");
    expect(styles).toContain("blur(");
    expect(styles).toContain("animation:");
    expect(styles).toContain("@keyframes asciiWaveDrift");
    expect(styles).toContain("@keyframes asciiGlowPulse");
    expect(styles).toContain("@keyframes asciiGradientSweep");
    expect(styles).toContain("@keyframes asciiSymbolShift");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".line-icon svg");
    expect(styles).toContain(".workflow-icon svg");
    expect(styles).not.toContain('content: "check"');
  });

  it("uses varied section rhythm and hierarchy instead of repeated equal card grids", () => {
    render(<App />);

    const starterPlan = screen.getByRole("heading", { level: 3, name: "Starter" }).closest("article");
    expect(starterPlan).toHaveClass("pricing-card-featured");
    expect(starterPlan).toHaveClass("tilt-card");

    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(styles).toContain("--section-gap:");
    expect(styles).toContain(".section-intro");
    expect(styles).toContain(".section-intro > div");
    expect(styles).toContain(".section-note,");
    expect(styles).toContain(".feature-card:first-child");
    expect(styles).toContain("grid-column: span 7");
    expect(styles).toContain(".workflow-card::before");
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

  it("tilts compatible feature and pricing cards with pointer movement", () => {
    render(<App />);

    const featureCard = screen.getByRole("heading", { level: 3, name: "Browser task control" }).closest("article");
    expect(featureCard).toHaveClass("feature-card", "tilt-card");

    Object.defineProperty(featureCard, "getBoundingClientRect", {
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

    fireEvent.pointerMove(featureCard as HTMLElement, { clientX: 240, clientY: 130 });

    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-rotate-x")).toMatch(/deg$/);
    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-rotate-y")).toMatch(/deg$/);
    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-lift")).toBe("1");
    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-rotate-x")).not.toBe("0deg");
    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-rotate-y")).not.toBe("0deg");

    fireEvent.pointerLeave(featureCard as HTMLElement);

    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-rotate-x")).toBe("0deg");
    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-rotate-y")).toBe("0deg");
    expect((featureCard as HTMLElement).style.getPropertyValue("--tilt-lift")).toBe("0");

    const pricingCard = screen.getByRole("heading", { level: 3, name: "Starter" }).closest("article");
    expect(pricingCard).toHaveClass("pricing-card", "tilt-card");
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

    expect(styles).toContain("grid-template-rows: auto auto auto auto 1fr auto");
    expect(styles).toContain("align-content: start");
    expect(styles).toContain(".pricing-card ul {");
    expect(styles).toContain("align-self: stretch");
    expect(styles).toContain(".pricing-status {");
    expect(styles).toContain("white-space: normal");
    expect(styles).toContain("line-height: 1.2");
    expect(styles).toContain("justify-items: center");
    expect(styles).toContain("text-align: center");
    expect(styles).toContain(".billing-toggle");
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(styles).toContain("width: min(360px, 100%)");
    expect(styles).toContain(".billing-period-button");
    expect(styles).toContain("justify-content: center");
    expect(styles).toContain(".billing-period-button-active");
    expect(styles).toContain(".billing-period-note");
    expect(styles).toContain(".plan-fit");
    expect(styles).toContain(".plan-badge");
    expect(styles).toContain(".pricing-reassurance");
    expect(styles).toContain(".pricing-card .button {");
    expect(styles).toContain("min-height: 46px");
  });

  it("hardens keyboard focus, text contrast, and base touch targets", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(styles).toContain("--text-soft: rgba(241, 241, 241, 0.56)");
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
    expect(within(primaryNav).getByRole("link", { name: "Product" })).toBeInTheDocument();
    expect(actions).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "See cockpit" })).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "View early access plans" })).toBeInTheDocument();

    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const headerStart = styles.indexOf(".site-header {\n  position: sticky");
    const headerStyles = styles.slice(headerStart, styles.indexOf(".brand {", headerStart));
    expect(headerStyles).toContain("grid-template-columns: minmax(220px, 1fr) minmax(420px, auto) minmax(220px, 1fr)");
    expect(headerStyles).toContain("top: 12px");
    expect(headerStyles).toContain("border: 1px solid var(--border)");
    expect(headerStyles).toContain("background: rgba(8, 9, 10, 0.72)");
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

  it("keeps the final CTA buttons above a centered ascii background", () => {
    render(<App />);

    const finalCta = screen.getByRole("region", { name: "Final call to action" });
    const actions = finalCta.querySelector(".final-cta-actions");
    expect(actions).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "View early access plans" })).toBeInTheDocument();
    expect(within(actions as HTMLElement).getByRole("link", { name: "See cockpit" })).toBeInTheDocument();

    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const finalCtaStart = styles.indexOf(".final-cta {\n  display: grid");
    const finalCtaStyles = styles.slice(finalCtaStart, styles.indexOf(".site-footer {", finalCtaStart));
    expect(finalCtaStyles).toContain("isolation: isolate");
    expect(finalCtaStyles).toContain(".final-cta > *");
    expect(finalCtaStyles).toContain("z-index: 1");
    expect(finalCtaStyles).toContain(".final-cta::before");
    expect(finalCtaStyles).toContain(".final-cta::after");
    expect(finalCtaStyles).toContain("ascii-orbit-element.svg");
    expect(finalCtaStyles).toContain(".final-cta-actions");
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
