import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import lightThemeLogo from "../../../assets/pictures/light-theme-logo.svg";
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
    expect(logo).toHaveAttribute("src", lightThemeLogo);
    expect(logo).toHaveAttribute("alt", "");

    const primaryNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(primaryNav).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Product" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Pricing" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Docs" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Changelog" })).toBeInTheDocument();
    expect(within(primaryNav).getByRole("link", { name: "Company" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Book demo" }).length).toBeGreaterThan(1);
    expect(screen.getAllByRole("link", { name: "Start free trial" }).length).toBeGreaterThan(1);

    expect(
      screen.getByRole("heading", { level: 1, name: "Run computer agents without losing control." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/local-first, approval-based, built for operators/i)).toBeInTheDocument();
    const trialHighlights = screen.getByRole("list", { name: "Trial highlights" });
    expect(within(trialHighlights).getByText(/no credit card/i)).toBeInTheDocument();
    expect(within(trialHighlights).getByText(/7-day free trial/i)).toBeInTheDocument();
    expect(within(trialHighlights).getByText(/local-first by default/i)).toBeInTheDocument();

    const preview = screen.getByRole("region", { name: "CodePawl product preview" });
    expect(within(preview).getAllByText("Research competitors").length).toBeGreaterThan(1);
    expect(within(preview).getByText(/step 7 of 18/i)).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(preview).getAllByText("Metrics").length).toBeGreaterThan(1);
  });

  it("renders value props, features, workflow, cockpit, pricing, and footer", () => {
    render(<App />);

    ["Local-first", "Approval-based", "Browser automation", "Cost visibility"].forEach((label) => {
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

    expect(screen.getByRole("heading", { level: 2, name: "A simple operator workflow." })).toBeInTheDocument();
    ["Start a task", "Watch the agent work", "Approve risky actions", "Save as a skill"].forEach((label) => {
      expect(screen.getAllByRole("heading", { level: 3, name: label }).length).toBeGreaterThan(0);
    });

    expect(screen.getByRole("heading", { level: 2, name: "Your cockpit for computer agents." })).toBeInTheDocument();
    expect(screen.getByText(/delete all cookies for example.com/i)).toBeInTheDocument();
    expect(screen.getByText(/trace timeline/i)).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "Simple, predictable pricing." })).toBeInTheDocument();
    ["Free Trial", "Starter", "Pro"].forEach((label) => {
      expect(screen.getByRole("heading", { level: 3, name: label })).toBeInTheDocument();
    });
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText("$19")).toBeInTheDocument();
    expect(screen.getByText("$49")).toBeInTheDocument();

    expect(screen.getByRole("contentinfo")).toHaveTextContent("Local-first control cockpit for computer agents.");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Privacy");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Security");
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
    expect(styles).toContain("--mono-950: #1c1c1c");
    expect(styles).toContain("--mono-800: #474747");
    expect(styles).toContain("--mono-650: #717171");
    expect(styles).toContain("--mono-500: #9c9c9c");
    expect(styles).toContain("--mono-300: #c6c6c6");
    expect(styles).toContain("--mono-100: #f1f1f1");
    expect(styles).toContain("--accent-success:");
    expect(styles).toContain("--accent-warning:");
    expect(styles).toContain("--accent-info:");
    expect(styles).toContain("--accent-alert:");
    expect(styles).toContain("../../../assets/landing/hero-ascii-glow-teal.svg");
    expect(styles).toContain("../../../assets/landing/trace-ribbon-element.svg");
    expect(styles).toContain("filter: grayscale(1)");
    expect(styles).toContain("blur(");
    expect(styles).toContain("animation:");
    expect(styles).toContain("@keyframes asciiWaveDrift");
    expect(styles).toContain("@keyframes asciiGlowPulse");
    expect(styles).toContain("@keyframes asciiSymbolShift");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".line-icon svg");
    expect(styles).toContain(".workflow-icon svg");
  });
});
