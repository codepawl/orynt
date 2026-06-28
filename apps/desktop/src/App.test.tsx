/// <reference types="node" />
import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRunState } from "@codepawl/shared";
import type { MockRunState } from "@codepawl/shared";

import App from "./App";
import darkThemeLogo from "../../../assets/pictures/dark-theme-logo.svg";

function installLocalStorageMock() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  });
}

function createEmptyMockRunState(): MockRunState {
  const state = createMockRunState();
  return {
    ...state,
    memoryReview: {
      ...state.memoryReview,
      latestEpisode: undefined,
      episodes: [],
      candidateRules: [],
      summary: {
        ...state.memoryReview.summary,
        episodeCount: 0,
        candidateRuleCount: 0,
        candidateRuleStatusCounts: {
          candidate: 0,
          accepted: 0,
          rejected: 0,
          superseded: 0,
        },
      },
    },
    skillRegistry: {
      ...state.skillRegistry,
      skills: [],
      summary: {
        ...state.skillRegistry.summary,
        skillCount: 0,
        statusCounts: {
          candidate: 0,
          active: 0,
          rejected: 0,
          superseded: 0,
          archived: 0,
        },
      },
    },
  };
}

function openCockpitTab(name: RegExp | string) {
  const tabs = screen.getByRole("navigation", { name: "Cockpit sections" });
  fireEvent.click(within(tabs).getByRole("button", { name }));
}

function openRunInfo() {
  const toggle = screen.getByRole("button", { name: "Open run info" });
  fireEvent.click(toggle);
  return screen.getByRole("complementary", { name: "Run info" });
}

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Toggle settings" }));
  return screen.getByRole("complementary", { name: "Settings" });
}

describe("CodePawl desktop shell", () => {
  beforeEach(() => {
    installLocalStorageMock();
    window.localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders the repository cockpit with topbar navigation and core control primitives", () => {
    render(<App />);

    const topbar = screen.getByLabelText("Primary app top bar");
    const brandButton = within(topbar).getByRole("button", { name: "Open Cockpit" });
    const logo = brandButton.querySelector("img");
    expect(logo).toHaveAttribute("src", darkThemeLogo);
    expect(logo).toHaveAttribute("alt", "");
    expect(screen.getByRole("heading", { level: 1, name: "Cockpit" })).toBeInTheDocument();

    const navigation = screen.getByRole("navigation", { name: "Primary app navigation" });
    expect(within(navigation).getByRole("link", { name: "Cockpit" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Run" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Tasks" })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole("link", { name: "Permissions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Settings sections" })).not.toBeInTheDocument();
    const settingsToggle = screen.getByRole("button", { name: "Toggle settings" });
    expect(settingsToggle).toHaveAttribute("title", "Settings");
    expect(settingsToggle).toHaveAttribute("aria-controls", "settings-sidebar");
    expect(settingsToggle).toHaveAttribute("aria-expanded", "false");

    const spaces = screen.getByRole("navigation", { name: "Purpose spaces" });
    expect(within(spaces).getAllByRole("button")[0]).toHaveTextContent("Code");
    expect(within(spaces).getByRole("button", { name: /Code/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(spaces).getByRole("button", { name: /Marketing/ })).toBeInTheDocument();
    expect(within(spaces).getByRole("button", { name: /Research/ })).toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Inbox/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Approvals/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Memory/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Skills/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Archive/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create purpose space" })).toBeInTheDocument();

    const cockpitTabs = screen.getByRole("navigation", { name: "Cockpit sections" });
    expect(within(cockpitTabs).getByRole("button", { name: /Chat/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(cockpitTabs).getByRole("button", { name: /Approvals/ })).toBeInTheDocument();
    expect(within(cockpitTabs).getByRole("button", { name: /Memory/ })).toBeInTheDocument();
    expect(within(cockpitTabs).getByRole("button", { name: /Skills/ })).toBeInTheDocument();
    expect(within(cockpitTabs).getByRole("button", { name: /Archive/ })).toBeInTheDocument();

    const cockpitChat = screen.getByRole("region", { name: "Cockpit conversation" });
    expect(within(cockpitChat).getByRole("heading", { name: "Cockpit" })).toBeInTheDocument();
    expect(within(cockpitChat).getByText("Code workspace / Chat")).toBeInTheDocument();
    expect(within(cockpitChat).getByText("Operator")).toBeInTheDocument();
    expect(within(cockpitChat).getAllByText("CodePawl").length).toBeGreaterThan(0);
    expect(within(cockpitChat).queryByText("Run chat")).not.toBeInTheDocument();
    expect(within(cockpitChat).queryByRole("heading", { name: "Runs" })).not.toBeInTheDocument();
    expect(within(cockpitChat).getByText("Verifier: pass")).toBeInTheDocument();
    expect(within(cockpitChat).getByRole("article", { name: "Verifier evidence summary" })).toBeInTheDocument();
    expect(within(cockpitChat).getByText("Candidate repository rule from verified correction")).toBeInTheDocument();
    expect(within(cockpitChat).getByRole("article", { name: "Approval request" })).toBeInTheDocument();
    expect(within(cockpitChat).getByRole("textbox", { name: "Repository task message" })).toHaveAttribute("placeholder", "Describe the next Code task...");
    expect(within(cockpitChat).getByRole("button", { name: "Send task" })).toBeDisabled();
    expect(within(cockpitChat).getByText("Info")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Run timeline" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full timeline view")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Controlled Codex execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mock event stream" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open run info" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("complementary", { name: "Settings" })).not.toBeInTheDocument();

    fireEvent.click(settingsToggle);
    expect(settingsToggle).toHaveAttribute("aria-expanded", "true");
    const settingsSidebar = screen.getByRole("complementary", { name: "Settings" });
    expect(settingsSidebar).toHaveTextContent("Settings");
    expect(settingsSidebar).toHaveTextContent("Workspace controls");
    expect(settingsSidebar).toHaveTextContent("Permission mode");
    expect(settingsSidebar).toHaveTextContent("Allowed surfaces");
    expect(within(settingsSidebar).queryByText("Local Alpha Workspace")).not.toBeInTheDocument();
    expect(within(settingsSidebar).queryByText("Fix a failing unit test")).not.toBeInTheDocument();
    expect(within(settingsSidebar).queryByRole("button", { name: "Run task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Workspace and run inspector" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Run inspector" })).not.toBeInTheDocument();

    const settings = screen.getByRole("complementary", { name: "Settings" });
    expect(settings.querySelector(".eyebrow")).toBeNull();
    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toHaveDisplayValue("Safe");
    expect(within(settings).getByText("Run limits")).toBeInTheDocument();
    expect(within(settings).getByText("$0.00 / $1.00")).toBeInTheDocument();
    expect(within(settings).getByText("46 events")).toBeInTheDocument();
    expect(within(settings).getByText("Latest verdict: pass")).toBeInTheDocument();

    fireEvent.click(settingsToggle);
    expect(settingsToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("complementary", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("places the settings sidebar to the right of the run surface when toggled open", () => {
    render(<App />);
    const styles = readFileSync("src/styles.css", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const packageManifest = readFileSync("package.json", "utf8");
    const shellClasses = Array.from(screen.getByRole("main").children).map((child) => child.className);

    expect(packageManifest).toContain('"lucide-react": "^1.21.0"');
    expect(appSource).toContain('from "lucide-react"');
    expect(appSource).not.toContain("function NavIcon");
    expect(shellClasses).toEqual(["topbar", "channel-sidebar purpose-sidebar", "run-surface run-surface-cockpit"]);
    fireEvent.click(screen.getByRole("button", { name: "Toggle settings" }));
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["topbar", "channel-sidebar purpose-sidebar", "run-surface run-surface-cockpit", "settings-sidebar"]);
    expect(styles).toContain(".app-shell-settings-open");
    expect(styles).toContain(".app-shell-dashboard");
    expect(styles).toContain(".app-shell-dashboard.app-shell-settings-open");
    expect(styles).toContain(".app-shell-dashboard .run-surface");
    expect(styles).toContain("grid-template-columns: 240px minmax(520px, 1fr);");
    expect(styles).toContain("grid-template-columns: 240px minmax(520px, 1fr) minmax(320px, 380px);");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);");
    expect(styles).toContain(".channel-sidebar");
    expect(styles).toContain(".purpose-sidebar");
    expect(styles).toContain(".purpose-sidebar-header");
    expect(styles).toContain(".purpose-add-button");
    expect(styles).toContain(".purpose-space-button");
    expect(styles).toContain(".channel-icon");
    expect(styles).toContain(".cockpit-tabs");
    expect(styles).toContain(".cockpit-tab");
    expect(styles).toContain(".settings-sidebar");
    expect(styles).toContain(".topbar-actions");
    expect(styles).toContain(".topbar-icon-button");
    expect(styles).toContain(".dashboard-surface");
    expect(styles).toContain(".dashboard-chat-header");
    expect(styles).toContain(".dashboard-thread");
    expect(styles).toContain(".dashboard-metrics-chat");
    expect(styles).toContain(".dashboard-intro-bubble");
    expect(styles).toContain(".settings-control");
    expect(styles).toContain(".settings-metric");
    expect(styles).toContain(".surface-switch");
    expect(styles).toContain(".run-surface::before");
    expect(styles).toContain(".run-surface::after");
    expect(styles).toContain("pointer-events: none;");
    expect(styles).toContain("mix-blend-mode: screen;");
    expect(styles).toContain("grid-template-rows: auto minmax(0, 1fr) auto;");
    expect(styles).toContain("min-height: calc(100vh - 107px);");
    expect(styles).toContain("overflow-y: auto;");
    expect(styles).toContain("--font-body: Lato, ui-sans-serif, system-ui, sans-serif;");
    expect(styles).toContain('--font-title: "Roboto Slab", Georgia, serif;');
    expect(styles).toContain("../../../assets/fonts/Lato/Lato-Regular.ttf");
    expect(styles).toContain("../../../assets/fonts/Lato/Lato-Bold.ttf");
    expect(styles).toContain("../../../assets/fonts/Lato/Lato-Black.ttf");
    expect(styles).toContain("../../../assets/fonts/Roboto_Slab/RobotoSlab-VariableFont_wght.ttf");
    expect(styles).toContain("font-synthesis: none;");
    expect(styles).toContain("--chat-surface: #232323;");
    expect(styles).toContain("--chat-bubble: #2a2a2a;");
    expect(styles).toContain("--chat-bubble-user: #243044;");
    expect(styles).toContain("--chat-bubble-action: #352b18;");
    expect(styles).toContain(".chat-surface");
    expect(styles).toContain(".chat-bubble");
    expect(styles).toContain(".channel-chat-surface");
    expect(styles).toContain(".channel-chat-thread");
    expect(styles).toContain(".channel-summary-bubble");
    expect(styles).toContain(".channel-workbench-bubble");
    expect(styles).toContain(".channel-empty-row");
    expect(styles).toContain(".run-info-panel");
    expect(styles).toContain(".verifier-evidence-panel");
    expect(styles).toContain(".verifier-evidence-grid");
    expect(styles).toContain(".chat-bubble-verifier");
    expect(styles).toContain(".run-status-chip-success");
    expect(styles).toContain(".status-icon");
    expect(styles).toContain(".execution-control");
    expect(styles).toContain("position: sticky;");
    expect(styles).toContain("bottom: 18px;");
    expect(styles).toContain(".chat-composer input");
    expect(styles).toMatch(/\.chat-composer \{[\s\S]*?border: 0;/);
    expect(styles).toMatch(
      /\.chat-composer input \{[\s\S]*?border: 1px solid rgba\(241, 241, 241, 0\.24\);/,
    );
    expect(styles).toContain(".chat-composer input:focus-visible");
    expect(styles).toContain(".send-icon");
    expect(styles).toContain("stroke: currentColor;");
    expect(styles).toContain("fill: none;");
    expect(styles).toContain("grid-template-columns: 16px minmax(0, 1fr) auto;");
    expect(styles).toContain("background: var(--chat-surface);");
    expect(styles).toContain("background: var(--chat-bubble);");
    expect(styles).toContain("background: var(--chat-bubble-user);");
    expect(styles).toContain("background: var(--chat-bubble-action);");
    expect(styles).toContain("background: #2a2a2a;");
    expect(styles).not.toContain("background: rgba(28, 28, 28, 0.52);");
    expect(styles).not.toContain(
      "background: linear-gradient(180deg, rgba(28, 28, 28, 0.8), rgba(28, 28, 28, 0.68)), rgba(241, 241, 241, 0.035);",
    );
    expect(styles).not.toContain(".app-rail");
    expect(styles).not.toContain(".settings-subset");
    expect(styles).not.toContain(".onboarding-panel");
    expect(styles).not.toContain(".trial-card");
    expect(styles).not.toContain(".surface-list");
    expect(styles).not.toContain(".workspace-sidebar");
    expect(styles).not.toContain(".inspector-control");
    expect(styles).not.toContain(".compact-step");
    expect(styles).not.toContain(".timeline-full");
    expect(styles).not.toContain(".approval-card");
    expect(styles).not.toContain(".event-log");
    expect(styles).not.toContain(".execution-panel");
    expect(styles).not.toContain(".dashboard-header");
    expect(styles).not.toContain(".channel-button");
    expect(styles).not.toContain("minmax(280px, 360px)");
  });

  it("adds local purpose spaces in the sidebar and scopes the cockpit composer", () => {
    render(<App />);

    const spaces = screen.getByRole("navigation", { name: "Purpose spaces" });
    expect(within(spaces).queryByRole("button", { name: /Workspace 4/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create purpose space" }));

    const created = within(spaces).getByRole("button", { name: /Workspace 4/ });
    expect(created).toHaveAttribute("aria-pressed", "true");
    expect(created).toHaveTextContent("Custom cockpit purpose space.");
    expect(screen.getByRole("textbox", { name: "Repository task message" })).toHaveAttribute("placeholder", "Describe the next Workspace 4 task...");

    fireEvent.click(within(spaces).getByRole("button", { name: /Marketing/ }));

    expect(within(spaces).getByRole("button", { name: /Marketing/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("navigation", { name: "Cockpit sections" })).getByRole("button", { name: /Chat/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Marketing workspace / Chat")).toBeInTheDocument();
  });

  it("opens a mock dashboard page from the topbar and returns to the cockpit", () => {
    render(<App />);

    const navigation = screen.getByRole("navigation", { name: "Primary app navigation" });
    fireEvent.click(within(navigation).getByRole("link", { name: "Dashboard" }));

    expect(within(navigation).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveClass("app-shell-dashboard");
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["topbar", "run-surface run-surface-dashboard"]);
    expect(screen.queryByRole("navigation", { name: "Purpose spaces" })).not.toBeInTheDocument();
    const dashboard = screen.getByRole("region", { name: "Dashboard overview" });
    expect(dashboard).toHaveClass("chat-surface", "dashboard-surface");
    expect(within(dashboard).getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(dashboard).getByText("Local preview")).toBeInTheDocument();
    expect(within(dashboard).getByText("Dashboard is the compact cockpit overview.")).toBeInTheDocument();
    expect(within(dashboard).getByText("Active run")).toBeInTheDocument();
    expect(within(dashboard).getByText("Run spend")).toBeInTheDocument();
    expect(within(dashboard).getByText("Approvals")).toBeInTheDocument();
    expect(within(dashboard).getByText("Allowed surfaces")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cockpit conversation" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle settings" }));
    expect(screen.getByRole("main")).toHaveClass("app-shell-dashboard", "app-shell-settings-open");
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["topbar", "run-surface run-surface-dashboard", "settings-sidebar"]);
    expect(screen.getByRole("complementary", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Purpose spaces" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Cockpit" }));

    expect(within(navigation).getByRole("link", { name: "Cockpit" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveClass("app-shell-cockpit");
    expect(screen.getByRole("navigation", { name: "Purpose spaces" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cockpit conversation" })).toBeInTheDocument();
  });

  it("switches cockpit tabs without leaving the local mock cockpit", () => {
    render(<App />);

    const tabs = screen.getByRole("navigation", { name: "Cockpit sections" });
    fireEvent.click(within(tabs).getByRole("button", { name: /Memory/ }));

    expect(within(tabs).getByRole("button", { name: /Memory/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Code workspace / Memory")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Memory review" })).toBeInTheDocument();

    fireEvent.click(within(tabs).getByRole("button", { name: /Skills/ }));

    expect(within(tabs).getByRole("button", { name: /Skills/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Code workspace / Skills")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Skill registry" })).toBeInTheDocument();
  });

  it("renders cockpit tabs as purpose-specific chat surfaces", async () => {
    render(<App />);

    expect(screen.queryByRole("region", { name: "Inbox channel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Inbox/ })).not.toBeInTheDocument();

    openCockpitTab(/Approvals/);
    const approvals = screen.getByRole("region", { name: "Approvals tab" });
    expect(within(approvals).getByText("Code workspace / Approvals")).toBeInTheDocument();
    expect(within(approvals).getByText(/Protected actions pause here/i)).toBeInTheDocument();
    expect(within(approvals).getByRole("article", { name: "Approval request" })).toBeInTheDocument();
    expect(within(approvals).getByRole("button", { name: "Approve step" })).toBeInTheDocument();

    openCockpitTab(/Memory/);
    const memory = screen.getByRole("region", { name: "Memory tab" });
    expect(within(memory).getByText(/Candidate rules stay local and review-only/i)).toBeInTheDocument();
    expect(within(memory).getByRole("region", { name: "Memory review" })).toBeInTheDocument();

    openCockpitTab(/Skills/);
    const skills = screen.getByRole("region", { name: "Skills tab" });
    expect(within(skills).getByText(/Skills are promoted manually/i)).toBeInTheDocument();
    expect(within(skills).getByRole("region", { name: "Skill registry" })).toBeInTheDocument();

    openCockpitTab(/Archive/);
    const archive = screen.getByRole("region", { name: "Archive tab" });
    expect(within(archive).getByText("Code workspace / Archive")).toBeInTheDocument();
    expect(within(archive).getByText(/No archived repository runs yet/i)).toBeInTheDocument();
    expect(within(archive).getByText(/Finished local runs will move here/i)).toBeInTheDocument();
  });

  it("streams a mock run event through the client before live sidecar work exists", async () => {
    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), {
      target: { value: "Fix a failing unit test in the selected repository" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    openRunInfo();

    expect(await screen.findByText(/mock repository run started/i)).toBeInTheDocument();
    expect(screen.getByText(/run_event: run_finished/i)).toBeInTheDocument();
  });

  it("sends typed cockpit tasks as local operator chat bubbles", async () => {
    render(<App />);

    const conversation = screen.getByRole("region", { name: "Cockpit conversation" });
    const composer = screen.getByRole("form", { name: "Cockpit composer" });
    const input = within(composer).getByRole("textbox", { name: "Repository task message" });
    const send = within(composer).getByRole("button", { name: "Send task" });

    expect(send).toBeDisabled();
    expect(within(conversation).getAllByText("Operator")).toHaveLength(1);

    fireEvent.submit(composer);
    expect(within(conversation).getAllByText("Operator")).toHaveLength(1);

    fireEvent.change(input, { target: { value: "Add validation coverage for repository rules" } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);

    expect(await within(conversation).findByText("Add validation coverage for repository rules")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(within(conversation).getAllByText("Operator")).toHaveLength(2);
  });

  it("keeps onboarding and trial cards out of the compact cockpit", () => {
    render(<App />);

    expect(screen.queryByRole("region", { name: "Product onboarding" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Trial status" })).not.toBeInTheDocument();
    expect(screen.queryByText(/trial runs left/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Local trial/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Active run").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Local MVP/i)).not.toBeInTheDocument();
  });

  it("lets the compact inspector change permission mode locally", () => {
    render(<App />);

    const settings = openSettings();
    const modeSelector = within(settings).getByRole("combobox", { name: "Permission mode" });

    expect(modeSelector).toHaveDisplayValue("Safe");
    expect(within(settings).getByText(/Ask before protected paths/i)).toBeInTheDocument();

    fireEvent.change(modeSelector, { target: { value: "locked" } });

    expect(modeSelector).toHaveDisplayValue("Locked");
    expect(within(settings).getByText(/Keep the cockpit read-only/i)).toBeInTheDocument();
  });

  it("renders allowed surfaces as switchers with local toggles", () => {
    render(<App />);

    const settings = openSettings();
    const surfaces = within(settings).getByRole("region", { name: "Allowed surfaces" });
    const repository = within(surfaces).getByRole("switch", { name: /Repository/ });
    const browser = within(surfaces).getByRole("switch", { name: /Browser/ });
    const desktop = within(surfaces).getByRole("switch", { name: /Desktop/ });
    const files = within(surfaces).getByRole("switch", { name: /Files/ });
    const terminal = within(surfaces).getByRole("switch", { name: /Terminal/ });

    expect(repository).toHaveAttribute("aria-checked", "true");
    expect(browser).toHaveAttribute("aria-checked", "false");
    expect(desktop).toHaveAttribute("aria-checked", "false");
    expect(files).toHaveAttribute("aria-checked", "false");
    expect(terminal).toHaveAttribute("aria-checked", "false");
    expect(within(browser).getByText("blocked")).toBeInTheDocument();

    fireEvent.click(browser);

    expect(browser).toHaveAttribute("aria-checked", "true");
    expect(within(browser).getByText("enabled")).toBeInTheDocument();
  });

  it("records approval decisions in the mock cockpit state", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Approve step" }));

    expect(await screen.findByText("Approval approved for approval-submit-1")).toBeInTheDocument();
  });

  it("renders controlled Codex execution approval, blocked, status, and result-ready states", async () => {
    render(<App />);

    expect(screen.queryByRole("region", { name: "Controlled Codex execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mock event stream" })).not.toBeInTheDocument();
    const infoPanel = openRunInfo();
    expect(screen.getByRole("button", { name: "Close run info" })).toHaveAttribute("aria-expanded", "true");
    const panel = within(infoPanel).getByRole("region", { name: "Controlled Codex execution" });
    const verifierEvidence = within(infoPanel).getByRole("region", { name: "Verifier evidence" });
    expect(within(verifierEvidence).getByRole("heading", { name: "Verifier evidence" })).toBeInTheDocument();
    expect(within(verifierEvidence).getByText("Candidate repository rule from verified correction")).toBeInTheDocument();
    expect(within(verifierEvidence).getAllByText("pass").length).toBeGreaterThan(0);
    expect(within(verifierEvidence).getByText("46 events")).toBeInTheDocument();
    expect(within(verifierEvidence).getByText("8 captured")).toBeInTheDocument();
    expect(within(panel).getByText("Approval required")).toBeInTheDocument();
    expect(within(panel).queryByText(/codex exec --json --ephemeral/)).not.toBeInTheDocument();
    expect(within(panel).getByText("codepawl-artifact://run-1/codex-contract.md")).toBeInTheDocument();
    expect(within(infoPanel).getByRole("region", { name: "Mock event stream" })).toBeInTheDocument();
    expect(within(panel).getByText(/Verification remains separate/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /autonomous/i })).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Approve Codex execution" }));
    expect(await within(panel).findByText("Running")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: codex_execution_started/)).toBeInTheDocument();
    expect(await within(panel).findByText("Result ready")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: codex_execution_result_ready/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Show blocked reason" }));
    expect(await within(panel).findByText("Blocked")).toBeInTheDocument();
    expect(within(panel).getByText(/codex_missing/)).toBeInTheDocument();
    expect(await screen.findByText(/run_event: codex_execution_blocked/)).toBeInTheDocument();
  });

  it("renders the memory review panel with latest episode, namespace, provenance, and candidate evidence", async () => {
    render(<App />);
    openCockpitTab(/Memory/);

    const panel = await screen.findByRole("region", { name: "Memory review" });
    expect(within(panel).getByRole("heading", { name: "Memory review" })).toBeInTheDocument();
    expect(within(panel).getByText(/latest successful run episode/i)).toBeInTheDocument();
    expect(within(panel).getByText("coding-apprentice / workspace-local-alpha")).toBeInTheDocument();
    expect(within(panel).getAllByText(/run-1/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Candidate").length).toBeGreaterThan(0);
    expect(within(panel).getByText("allowed_scope_pattern")).toBeInTheDocument();
    expect(within(panel).getByText("86% confidence")).toBeInTheDocument();
  });

  it("accepts, rejects, and supersedes candidate rules with visible event stream entries", async () => {
    const firstRender = render(<App />);
    openRunInfo();
    openCockpitTab(/Memory/);

    fireEvent.click(await screen.findByRole("button", { name: "Accept Keep package fixes scoped" }));
    expect(await screen.findByText("Accepted")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: candidate_rule_accepted/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promote Keep package fixes scoped" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reject Avoid secret-bearing logs" }));
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: candidate_rule_rejected/)).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);
    openRunInfo();
    openCockpitTab(/Memory/);
    fireEvent.click(await screen.findByRole("button", { name: "Mark superseded Keep package fixes scoped" }));
    expect(await screen.findByText("Superseded")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: candidate_rule_superseded/)).toBeInTheDocument();
  });

  it("copies only redacted rule text and never renders raw sensitive values", async () => {
    render(<App />);
    openCockpitTab(/Memory/);

    expect(screen.queryByText(/sk-memorysecret123/)).not.toBeInTheDocument();
    expect((await screen.findAllByText(/\[REDACTED\]/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Copy Avoid secret-bearing logs" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("[REDACTED]"));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(expect.stringContaining("sk-memorysecret123"));
  });

  it("renders candidate skills with provenance, evidence, validation, and no auto-run controls", async () => {
    render(<App />);
    openCockpitTab(/Skills/);

    const panel = await screen.findByRole("region", { name: "Skill registry" });
    expect(within(panel).getByRole("heading", { name: "Skill registry" })).toBeInTheDocument();
    expect(within(panel).getAllByText("Candidate").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Keep package fixes scoped")).toBeInTheDocument();
    expect(within(panel).getByText(/candidate-rule-package-scope/)).toBeInTheDocument();
    expect(within(panel).getByText(/episode-latest-successful-run/)).toBeInTheDocument();
    expect(within(panel).getAllByText(/pnpm test:contracts/).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/automatic_execution/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /run skill/i })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Preview dry-run plan Keep package fixes scoped" })).toBeInTheDocument();
  });

  it("renders skill replay dry-run previews without exposing execution controls", async () => {
    render(<App />);
    openRunInfo();
    openCockpitTab(/Skills/);

    const panel = await screen.findByRole("region", { name: "Skill registry" });
    fireEvent.click(within(panel).getByRole("button", { name: "Preview dry-run plan Keep package fixes scoped" }));

    expect(await within(panel).findByText("Dry-run only")).toBeInTheDocument();
    expect(within(panel).getByText("Preview only")).toBeInTheDocument();
    expect(within(panel).getByText("precondition-accepted-rule")).toBeInTheDocument();
    expect(within(panel).getByText("automatic_execution, codex_auto_run, browser_automation, secret_storage")).toBeInTheDocument();
    expect(within(panel).getByText("manual approval required before any future skill execution")).toBeInTheDocument();
    expect(within(panel).getAllByText("pnpm test:contracts").length).toBeGreaterThan(0);
    expect(within(panel).getByText(/steps/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /run skill/i })).not.toBeInTheDocument();

    expect(await screen.findByText(/run_event: skill_replay_plan_requested/)).toBeInTheDocument();
    expect(await screen.findByText(/run_event: skill_replay_plan_created/)).toBeInTheDocument();
  });

  it("promotes, rejects, and archives skills manually with visible event stream entries", async () => {
    const firstRender = render(<App />);
    openRunInfo();
    openCockpitTab(/Skills/);

    fireEvent.click(await screen.findByRole("button", { name: "Promote manually Keep package fixes scoped" }));
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: skill_promoted_manual/)).toBeInTheDocument();

    firstRender.unmount();
    const secondRender = render(<App />);
    openRunInfo();
    openCockpitTab(/Skills/);
    const rejectPanel = await screen.findByRole("region", { name: "Skill registry" });
    fireEvent.click(within(rejectPanel).getByRole("button", { name: "Reject Keep package fixes scoped" }));
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: skill_rejected/)).toBeInTheDocument();

    secondRender.unmount();
    render(<App />);
    openRunInfo();
    openCockpitTab(/Skills/);
    const archivePanel = await screen.findByRole("region", { name: "Skill registry" });
    fireEvent.click(within(archivePanel).getByRole("button", { name: "Archive Keep package fixes scoped" }));
    expect(await screen.findByText("Archived")).toBeInTheDocument();
    expect(await screen.findByText(/run_event: skill_archived/)).toBeInTheDocument();
  });

  it("copies only redacted skill summaries", async () => {
    render(<App />);
    openCockpitTab(/Skills/);

    const panel = await screen.findByRole("region", { name: "Skill registry" });
    expect(within(panel).queryByText(/sk-skillsecret123/)).not.toBeInTheDocument();
    expect(within(panel).getAllByText(/\[REDACTED\]/).length).toBeGreaterThan(0);

    fireEvent.click(within(panel).getByRole("button", { name: "Copy skill summary Keep package fixes scoped" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("[REDACTED]"));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(expect.stringContaining("sk-skillsecret123"));
  });

  it("renders a no-run-selected empty state without showing execution controls", () => {
    render(<App initialSelectedRunId={null} />);

    const emptyRun = screen.getByRole("region", { name: "No run selected" });
    expect(within(emptyRun).getByText(/Select a local repository task or start the fake Codex walkthrough/)).toBeInTheDocument();
    expect(within(emptyRun).getByText(/No Codex process runs until an execution plan is approved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Codex execution" })).not.toBeInTheDocument();
  });

  it("renders memory, skill, and replay empty states from an empty local snapshot", async () => {
    render(<App initialRunState={createEmptyMockRunState()} />);
    openCockpitTab(/Memory/);

    const memory = await screen.findByRole("region", { name: "Memory review" });
    expect(within(memory).getAllByText(/No memory yet/).length).toBeGreaterThan(0);
    expect(within(memory).getByText(/Verified runs will create local episodes and candidate rules here/)).toBeInTheDocument();

    openCockpitTab(/Skills/);
    const skills = await screen.findByRole("region", { name: "Skill registry" });
    expect(within(skills).getByText(/No skills yet/)).toBeInTheDocument();
    expect(within(skills).getByText(/Promote reviewed candidate rules manually before any skill appears here/)).toBeInTheDocument();
    expect(within(skills).getByText(/No replay plan yet/)).toBeInTheDocument();
    expect(within(skills).queryByRole("button", { name: /run skill/i })).not.toBeInTheDocument();
  });
});
