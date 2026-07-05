/// <reference types="node" />
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockRunState } from "@codepawl/shared";
import type { MockRunState } from "@codepawl/shared";

import App, { getLandingUrl } from "./App";
import { codepawl } from "./codepawlClient";
import type { SettingsSnapshot } from "./codepawlClient";

const defaultLandingUrl = "http://127.0.0.1:5173/";
const privateBetaOnboardingStorageKey = "codepawl:private-beta-onboarding:v1";

function withPreferenceSettings(
  settings: Omit<SettingsSnapshot, "operatorProfile" | "uiPreferences" | "voicePreferences" | "modelConnection"> &
    Partial<Pick<SettingsSnapshot, "operatorProfile" | "uiPreferences" | "voicePreferences" | "modelConnection">>,
): SettingsSnapshot {
  return {
    ...settings,
    modelConnection: settings.modelConnection ?? null,
    operatorProfile: settings.operatorProfile ?? {
      fullName: "Operator",
      callSign: "Operator",
      workType: "engineering",
    },
    uiPreferences: settings.uiPreferences ?? {
      appearance: "dark",
      chatFont: "codepawl-sans",
      motion: "system",
      showMessageBlockMeta: false,
    },
    voicePreferences: settings.voicePreferences ?? {
      language: "english",
      style: "buttery",
      speed: "normal",
    },
  };
}

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

function openSettings() {
  const accountMenu = openAccountMenu();
  fireEvent.click(within(accountMenu).getByRole("menuitem", { name: "Settings" }));
  return screen.getByRole("dialog", { name: "Settings" });
}

function openAccountMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
  return screen.getByRole("menu", { name: "Account menu" });
}

function dismissPrivateBetaOnboarding() {
  window.localStorage.setItem(privateBetaOnboardingStorageKey, "dismissed");
}

function fillRepositoryPath(path = "/home/operator/project") {
  fireEvent.change(screen.getByRole("textbox", { name: "Repository path" }), {
    target: { value: path },
  });
}

function getArticleTexts(region: HTMLElement) {
  return within(region)
    .getAllByRole("article")
    .map((article) => article.textContent ?? "");
}

function selectTextInside(element: HTMLElement, startOffset: number, endOffset: number) {
  const textNode = element.firstChild;
  if (!textNode) {
    throw new Error("Expected selectable text content.");
  }
  const range = document.createRange();
  range.setStart(textNode, startOffset);
  range.setEnd(textNode, endOffset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function mockElementRect(element: Element, rect: Partial<DOMRect>) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: rect.x ?? rect.left ?? 0,
    y: rect.y ?? rect.top ?? 0,
    width: rect.width ?? 0,
    height: rect.height ?? 0,
    top: rect.top ?? rect.y ?? 0,
    right: rect.right ?? (rect.left ?? rect.x ?? 0) + (rect.width ?? 0),
    bottom: rect.bottom ?? (rect.top ?? rect.y ?? 0) + (rect.height ?? 0),
    left: rect.left ?? rect.x ?? 0,
    toJSON: () => ({}),
  } as DOMRect);
}

function mockMobileViewport(matches = true) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width: 720px") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("CodePawl desktop shell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    mockMobileViewport(false);
    installLocalStorageMock();
    window.localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("starts the first draft thread blank with setup in a popup and only a compact chat warning", () => {
    render(<App />);

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    expect(within(thread).getByRole("heading", { name: "Draft" })).toBeInTheDocument();
    expect(within(thread).queryByText("Controlled repository runtime only. Browser automation is unavailable in this private beta.")).not.toBeInTheDocument();
    expect(within(thread).queryByText("Verifier evidence stays separate from result import.")).not.toBeInTheDocument();
    expect(within(thread).queryByRole("article", { name: "Agent response" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("article", { name: "Approval request" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("region", { name: "Setup guide" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("heading", { name: "Set up CodePawl" })).not.toBeInTheDocument();
    expect(within(thread).getByRole("status", { name: "Setup required" })).toBeInTheDocument();
    expect(within(thread).getByRole("button", { name: "Open setup" })).toBeInTheDocument();
    const setupDialog = screen.getByRole("dialog", { name: "Set up CodePawl" });
    expect(within(setupDialog).queryByRole("heading", { name: "Set up CodePawl" })).not.toBeInTheDocument();
    expect(setupDialog.querySelectorAll("#setup-dialog-title")).toHaveLength(1);
    expect(within(setupDialog).queryByRole("heading", { name: "Setup controls" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("region", { name: "Setup controls" })).toBeInTheDocument();
    expect(within(setupDialog).getByText(/Connect a local repository, choose a model provider/i)).toBeInTheDocument();
    expect(within(thread).getByRole("textbox", { name: "Repository task message" })).toHaveValue("");
    expect(within(thread).getByRole("button", { name: "Send task" })).toBeDisabled();
  });

  it("keeps setup editable from the dedicated setup dialog without showing the full settings rail", async () => {
    const updatedSettings = withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "manual" as const,
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/project",
      welcomeCompleted: true,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 14,
        artifactRetentionDays: 21,
        cleanupEnabled: true,
        summary: "Automatic cleanup after 14 days for runs and 21 days for artifacts.",
      },
    });
    vi.spyOn(codepawl, "getSettings").mockResolvedValue(withPreferenceSettings({
      ...updatedSettings,
      permissionMode: "safe",
      defaultRepositoryPath: "",
      welcomeCompleted: false,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    }));
    const updateSettingsSpy = vi.spyOn(codepawl, "updateSettings").mockResolvedValue(updatedSettings);

    render(<App />);

    const setupDialog = await screen.findByRole("dialog", { name: "Set up CodePawl" });
    expect(within(setupDialog).queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("heading", { name: "Set up CodePawl" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("heading", { name: "Setup controls" })).not.toBeInTheDocument();
    const repositoryPath = within(setupDialog).getByRole("textbox", { name: "Default repository path" });
    fireEvent.change(repositoryPath, { target: { value: "/home/operator/project" } });
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Save setup settings" }));

    expect(updateSettingsSpy).toHaveBeenCalledWith({ defaultRepositoryPath: "/home/operator/project" });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Repository path" })).toHaveValue("/home/operator/project"));
  });

  it("detects and browses repository paths without silently saving them", async () => {
    vi.spyOn(codepawl, "getSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    }));
    const detectRepositorySpy = vi.spyOn(codepawl, "detectCurrentRepositoryPath").mockResolvedValue("/home/operator/detected-repo");
    const browseRepositorySpy = vi.spyOn(codepawl, "browseRepositoryPath").mockResolvedValue("/home/operator/browsed-repo");
    const updateSettingsSpy = vi.spyOn(codepawl, "updateSettings").mockImplementation(async (input) =>
      withPreferenceSettings({
        workspaceId: "workspace-local-alpha",
        permissionMode: "safe",
        executableSurfaces: ["repository"],
        blockedSurfaces: ["browser", "desktop", "files", "terminal"],
        defaultRepositoryPath: input.defaultRepositoryPath ?? "",
        welcomeCompleted: false,
        codexConnection: null,
        retentionPolicy: {
          runHistoryDays: 30,
          artifactRetentionDays: 30,
          cleanupEnabled: false,
          summary: "Cleanup is manual for private beta; automatic retention is planned.",
        },
      }),
    );

    render(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up CodePawl" });
    const repositoryPath = within(setupDialog).getByRole("textbox", { name: "Default repository path" });

    await waitFor(() => expect(repositoryPath).toHaveValue("/home/operator/detected-repo"));
    expect(detectRepositorySpy).toHaveBeenCalled();
    expect(updateSettingsSpy).not.toHaveBeenCalled();

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(repositoryPath).toHaveValue("/home/operator/browsed-repo"));
    expect(browseRepositorySpy).toHaveBeenCalledWith("/home/operator/detected-repo");
    expect(updateSettingsSpy).not.toHaveBeenCalled();

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Save setup settings" }));
    expect(updateSettingsSpy).toHaveBeenCalledWith({ defaultRepositoryPath: "/home/operator/browsed-repo" });
  });

  it("keeps each setup checklist item next to its related controls in one readable flow", () => {
    render(<App />);

    const setupDialog = screen.getByRole("dialog", { name: "Set up CodePawl" });
    const setupFlow = within(setupDialog).getByRole("list", { name: "Setup flow" });
    const steps = within(setupFlow).getAllByRole("listitem");

    expect(steps).toHaveLength(3);
    expect(within(steps[0]).getByText("Choose a repository")).toBeInTheDocument();
    expect(within(steps[0]).getByRole("textbox", { name: "Default repository path" })).toBeInTheDocument();
    expect(within(steps[0]).getByRole("button", { name: "Detect current" })).toBeInTheDocument();
    expect(within(steps[0]).getByRole("button", { name: "Browse" })).toBeInTheDocument();
    expect(within(steps[1]).getByText("Choose model provider")).toBeInTheDocument();
    expect(within(steps[1]).getByRole("searchbox", { name: "Search providers" })).toBeInTheDocument();
    expect(within(steps[1]).queryByRole("searchbox", { name: "Search models" })).not.toBeInTheDocument();
    expect(within(steps[1]).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(steps[2]).getByText("Review advanced defaults")).toBeInTheDocument();
    expect(within(steps[2]).getByRole("combobox", { name: "Permission mode" })).toBeInTheDocument();
    expect(setupDialog.querySelector(".setup-status-list")).toBeNull();
  });

  it("stages provider and model choices without showing both lists at once", async () => {
    vi.spyOn(codepawl, "getSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
      modelConnection: {
        providerId: "codex-cli",
        providerLabel: "Codex CLI",
        modelId: "gpt-5.5",
        modelLabel: "GPT-5.5",
        authMethod: "chatgptOAuth",
        status: "authRequired",
        lastPreflight: null,
      },
    } as Parameters<typeof withPreferenceSettings>[0]));

    render(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up CodePawl" });

    expect(await within(setupDialog).findByRole("searchbox", { name: "Search models" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("searchbox", { name: "Search providers" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("option", { name: /GPT-5.5/ })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("option", { name: /OpenAI API/ })).not.toBeInTheDocument();

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Change provider" }));

    expect(within(setupDialog).getByRole("searchbox", { name: "Search providers" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("searchbox", { name: "Search models" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("option", { name: /OpenAI API/ })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("option", { name: /GPT-5.5/ })).not.toBeInTheDocument();

    fireEvent.click(within(setupDialog).getByRole("option", { name: /OpenAI API/ }));

    expect(within(setupDialog).getByRole("searchbox", { name: "Search models" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("searchbox", { name: "Search providers" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("option", { name: /GPT-5.5/ })).toBeInTheDocument();
    expect(within(setupDialog).getByRole("textbox", { name: "API key environment variable" })).toHaveValue("OPENAI_API_KEY");
  });

  it("filters staged provider and model choices and shows env-var auth for OpenAI API only", async () => {
    vi.spyOn(codepawl, "getSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
      modelConnection: null,
    }));
    const saveModelConnectionSpy = vi
      .spyOn(codepawl, "saveModelConnection")
      .mockImplementation(async (input) => ({
        providerId: input.providerId,
        providerLabel: "OpenAI API",
        modelId: input.modelId,
        modelLabel: "GPT-5.5",
        authMethod: "apiKeyEnv",
        envKey: input.envKey,
        status: "authRequired",
        lastPreflight: null,
      }));
    vi.spyOn(codepawl, "preflightModelConnection").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "gpt-5.5",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });

    render(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up CodePawl" });

    fireEvent.change(within(setupDialog).getByRole("searchbox", { name: "Search providers" }), {
      target: { value: "openai" },
    });
    fireEvent.click(within(setupDialog).getByRole("option", { name: /OpenAI API/ }));

    expect(within(setupDialog).queryByRole("searchbox", { name: "Search providers" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("searchbox", { name: "Search models" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use device code" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("textbox", { name: "API key environment variable" })).toHaveValue("OPENAI_API_KEY");

    fireEvent.change(within(setupDialog).getByRole("searchbox", { name: "Search models" }), {
      target: { value: "mini" },
    });
    expect(within(setupDialog).getByRole("option", { name: /GPT-5.4 mini/ })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("option", { name: /GPT-5.5/ })).not.toBeInTheDocument();
    fireEvent.change(within(setupDialog).getByRole("searchbox", { name: "Search models" }), {
      target: { value: "5.5" },
    });
    fireEvent.click(within(setupDialog).getByRole("option", { name: /GPT-5.5/ }));
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Save provider setup" }));

    expect(saveModelConnectionSpy).toHaveBeenCalledWith({
      providerId: "openai-api",
      modelId: "gpt-5.5",
      authMethod: "apiKeyEnv",
      envKey: "OPENAI_API_KEY",
    });

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Run provider check" }));
    expect((await within(setupDialog).findAllByText("OPENAI_API_KEY is available for OpenAI API.")).length).toBeGreaterThan(0);
  });

  it("renders the repository cockpit with sidebar shell actions and core control primitives", () => {
    render(<App seedDemoThread />);

    const sidebar = screen.getByRole("complementary");
    const brandButton = within(sidebar).getByRole("button", { name: "Open Cockpit" });
    const wordmark = brandButton.querySelector(".workspace-brand-wordmark");
    expect(brandButton.querySelector("img")).toBeNull();
    expect(wordmark).toHaveTextContent("CodePawl");
    expect(wordmark?.children).toHaveLength(0);
    const collapsePanelButton = within(sidebar).getByRole("button", { name: "Collapse side panel" });
    expect(collapsePanelButton).toHaveAttribute("aria-controls", "workspace-panel");
    expect(collapsePanelButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("main")).toHaveClass("app-shell-workspace-open");
    fireEvent.click(collapsePanelButton);
    expect(screen.getByRole("main")).toHaveClass("app-shell-workspace-collapsed");
    const expandPanelButton = within(sidebar).getByRole("button", { name: "Expand side panel" });
    expect(expandPanelButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expandPanelButton);
    expect(screen.getByRole("main")).toHaveClass("app-shell-workspace-open");
    expect(screen.getByRole("heading", { level: 1, name: "Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Safety status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Coding Apprentice run flow" })).not.toBeInTheDocument();

    expect(screen.queryByRole("navigation", { name: "Primary app navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cockpit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Run" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Permissions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Settings sections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open dashboard" })).not.toBeInTheDocument();
    const accountToggle = within(sidebar).getByRole("button", { name: "Open account menu" });
    expect(accountToggle).toHaveAttribute("title", "Account menu");
    expect(accountToggle).toHaveAttribute("aria-controls", "account-menu");
    expect(accountToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar).getByText("Operator")).toBeInTheDocument();
    expect(within(sidebar).getByText("Free plan")).toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Open dashboard" })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: "Open settings" })).not.toBeInTheDocument();
    fireEvent.click(accountToggle);
    expect(accountToggle).toHaveAttribute("aria-expanded", "true");
    const accountMenu = within(sidebar).getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByText("operator@codepawl.local")).toBeInTheDocument();
    expect(within(accountMenu).getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(within(accountMenu).getByRole("menuitem", { name: "Language" })).toHaveAttribute("aria-disabled", "true");
    expect(within(accountMenu).getByRole("menuitem", { name: "Get help" })).toHaveAttribute("aria-disabled", "true");
    expect(within(accountMenu).getByRole("menuitem", { name: "Upgrade plan" })).toHaveAttribute("aria-disabled", "true");
    expect(within(accountMenu).getByRole("menuitem", { name: "Get apps and extensions" })).toHaveAttribute("aria-disabled", "true");
    expect(within(accountMenu).getByRole("menuitem", { name: "Gift CodePawl" })).toHaveAttribute("aria-disabled", "true");
    expect(within(accountMenu).getByRole("menuitem", { name: "Learn more" })).toHaveAttribute("aria-disabled", "true");
    expect(within(accountMenu).getByRole("menuitem", { name: "Log out" })).toHaveAttribute("href", defaultLandingUrl);

    expect(screen.queryByRole("navigation", { name: "Purpose spaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Channel space" })).not.toBeInTheDocument();
    const spaces = screen.getByRole("navigation", { name: "Threads" });
    expect(screen.queryByRole("textbox", { name: "Search threads" })).not.toBeInTheDocument();
    const workspaceSearchToggle = within(sidebar).getByRole("button", { name: "Search threads" });
    expect(workspaceSearchToggle).toHaveAttribute("aria-controls", "workspace-thread-search");
    expect(workspaceSearchToggle).toHaveAttribute("aria-expanded", "false");
    expect(workspaceSearchToggle.querySelector("svg")).not.toBeNull();
    fireEvent.click(workspaceSearchToggle);
    expect(workspaceSearchToggle).toHaveAttribute("aria-expanded", "true");
    const workspaceSearch = screen.getByRole("textbox", { name: "Search threads" });
    expect(workspaceSearch).toHaveAttribute("placeholder", "Search threads");
    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeInTheDocument();
    expect(createButton.querySelector(".workspace-create-icon")).not.toBeNull();
    expect(createButton.querySelector(".workspace-create-icon svg")).not.toBeNull();
    const removedWorkspaceRuleClass = ".workspace" + "-di" + "vider";
    expect(document.querySelector(removedWorkspaceRuleClass)).toBeNull();
    expect(screen.queryByText("Purpose spaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Local Alpha Workspace")).not.toBeInTheDocument();
    const activeChannelButton = within(spaces).getByRole("button", { name: "Draft" });
    expect(activeChannelButton).toHaveAttribute("aria-pressed", "true");
    expect(activeChannelButton.querySelector("svg")).toBeNull();
    expect(activeChannelButton.closest(".workspace-row")).toHaveClass("workspace-row-active");
    expect(within(spaces).queryByRole("button", { name: "Marketing" })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: "Research" })).not.toBeInTheDocument();
    expect(within(spaces).getByRole("button", { name: "Thread options for Draft" })).toBeInTheDocument();
    expect(within(spaces).queryByText("Repository fixes, tests, and implementation runs.")).not.toBeInTheDocument();
    expect(within(spaces).queryByText("46")).not.toBeInTheDocument();
    fireEvent.change(workspaceSearch, { target: { value: "Draft" } });
    expect(within(spaces).getByRole("button", { name: "Draft" })).toBeInTheDocument();
    fireEvent.change(workspaceSearch, { target: { value: "Marketing" } });
    expect(within(spaces).queryByRole("button", { name: "Draft" })).not.toBeInTheDocument();
    fireEvent.change(workspaceSearch, { target: { value: "" } });
    expect(within(spaces).getByRole("button", { name: "Draft" })).toBeInTheDocument();
    fireEvent.click(workspaceSearchToggle);
    expect(workspaceSearchToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Search threads" })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Inbox/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Approvals/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Memory/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Skills/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Archive/ })).not.toBeInTheDocument();

    expect(screen.queryByRole("navigation", { name: "Cockpit sections" })).not.toBeInTheDocument();

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    expect(within(thread).getByRole("heading", { name: "Draft" })).toBeInTheDocument();
    expect(within(thread).getByText("Draft thread.")).toBeInTheDocument();
    expect(within(thread).getByRole("button", { name: "Edit thread name and description" })).toBeInTheDocument();
    expect(within(thread).queryByText("Operator")).not.toBeInTheDocument();
    expect(within(thread).queryByText("CodePawl")).not.toBeInTheDocument();
    expect(within(thread).queryByText("System notice · Runtime policy")).not.toBeInTheDocument();
    expect(within(thread).queryByText("System notice · Verifier handoff")).not.toBeInTheDocument();
    const agentDetails = within(thread).getByText("Agent details").closest("details");
    if (!agentDetails) {
      throw new Error("Agent details should render as a details element.");
    }
    expect(agentDetails).toHaveClass("agent-details");
    expect(agentDetails).toHaveAttribute("open");
    expect(within(agentDetails).getByText("2 notices")).toBeInTheDocument();
    expect(agentDetails.querySelector(".agent-details-node")).toBeNull();
    expect(agentDetails.querySelector(".agent-details-row")).not.toBeNull();
    const runtimeNotice = within(thread).getByText("Controlled repository runtime only. Browser automation is unavailable in this private beta.");
    const verifierNotice = within(thread).getByText("Verifier evidence stays separate from result import.");
    const runtimeNoticeRow = runtimeNotice.closest("li");
    if (!runtimeNoticeRow) {
      throw new Error("Runtime notice should render inside an agent details row.");
    }
    expect(runtimeNotice.closest(".agent-details-row")).not.toBeNull();
    const subtaskList = within(runtimeNoticeRow).getByRole("list", { name: "Mock subtasks" });
    const connectorSubtask = within(subtaskList).getByText("Inspect connector approval");
    const verifierSubtask = within(subtaskList).getByText("Confirm verifier evidence");
    const importSubtask = within(subtaskList).getByText("Keep result import separate");
    [connectorSubtask, verifierSubtask, importSubtask].forEach((subtask) => {
      expect(subtask.closest(".agent-details-subtask-row")).not.toBeNull();
      expect(subtask.closest(".agent-details")).toBe(agentDetails);
      expect(subtask.closest(".chat-bubble")).toBeNull();
      expect(subtask.closest(".message-block")).toBeNull();
    });
    expect(runtimeNotice.closest(".agent-details")).toBe(agentDetails);
    expect(runtimeNotice.closest(".agent-details-list")).not.toBeNull();
    expect(runtimeNotice.closest(".chat-bubble")).toBeNull();
    expect(runtimeNotice.closest(".message-block")).toBeNull();
    expect(verifierNotice.closest(".agent-details")).toBe(agentDetails);
    expect(verifierNotice.closest(".chat-bubble")).toBeNull();
    expect(verifierNotice.closest(".message-block")).toBeNull();
    expect(within(thread).queryByText("Run chat")).not.toBeInTheDocument();
    expect(within(thread).queryByRole("heading", { name: "Runs" })).not.toBeInTheDocument();
    const agentResponse = within(thread).getByRole("article", { name: "Agent response" });
    expect(agentDetails.compareDocumentPosition(agentResponse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(agentResponse.closest(".agent-run-block")).toBe(agentDetails.closest(".agent-run-block"));
    expect(within(thread).queryByText("Agent response")).not.toBeInTheDocument();
    expect(within(agentResponse).getByText("Candidate repository rule from verified correction")).toBeInTheDocument();
    expect(within(agentResponse).queryByRole("group", { name: "Agent response context" })).not.toBeInTheDocument();
    expect(within(agentResponse).queryByText("Succeeded")).not.toBeInTheDocument();
    expect(within(agentResponse).queryByText("$0.00")).not.toBeInTheDocument();
    expect(within(agentResponse).queryByText("46 events / 8 artifacts")).not.toBeInTheDocument();
    expect(within(agentResponse).queryByRole("button", { name: "Open run info" })).not.toBeInTheDocument();
    expect(within(thread).queryByText("Approval request")).not.toBeInTheDocument();
    const approvalBubble = within(thread).getByRole("article", { name: "Approval request" });
    expect(approvalBubble).toBeInTheDocument();
    expect(within(approvalBubble).queryByText("Manual review")).not.toBeInTheDocument();
    const approvalActions = approvalBubble.querySelector(".chat-bubble-actions");
    expect(approvalActions).not.toBeNull();
    expect(
      within(approvalActions as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Deny step", "Approve step"]);
    expect(within(thread).getByText("Protected action approval")).toBeInTheDocument();
    const threadComposer = within(thread).getByRole("form", { name: "Thread composer" });
    const threadComposerField = threadComposer.querySelector(".composer-field");
    const threadComposerScale = within(threadComposer).getByRole("button", { name: "Expand composer" });
    expect(threadComposerField).not.toBeNull();
    expect(threadComposerScale.closest(".composer-field")).toBe(threadComposerField);
    expect(threadComposerScale.closest(".composer-actions")).toBeNull();
    expect(within(threadComposer).getByRole("textbox", { name: "Repository task message" })).toHaveAttribute("placeholder", "Message Draft thread...");
    expect(within(threadComposer).getByRole("button", { name: "Send task" })).toBeDisabled();
    expect(within(thread).queryByText("Info")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Run timeline" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full timeline view")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Controlled Codex execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mock event stream" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open run info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    fireEvent.click(within(accountMenu).getByRole("menuitem", { name: "Settings" }));
    expect(accountToggle).toHaveAttribute("aria-expanded", "false");
    const settingsDialog = screen.getByRole("dialog", { name: "Settings" });
    expect(settingsDialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Modal backdrop")).toBeInTheDocument();
    expect(settingsDialog).toHaveTextContent("Settings");
    expect(settingsDialog).not.toHaveTextContent("Workspace controls");
    expect(within(settingsDialog).getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(within(settingsDialog).queryByRole("button", { name: "Setup" })).not.toBeInTheDocument();
    expect(within(settingsDialog).queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(settingsDialog).getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(within(settingsDialog).queryByText("Local Alpha Workspace")).not.toBeInTheDocument();
    expect(within(settingsDialog).queryByText("Fix a failing unit test")).not.toBeInTheDocument();
    expect(within(settingsDialog).queryByRole("button", { name: "Run task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Workspace and run inspector" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Run inspector" })).not.toBeInTheDocument();

    const settings = screen.getByRole("dialog", { name: "Settings" });
    expect(settings.querySelector(".eyebrow")).toBeNull();
    const settingsSections = within(settings).getByRole("navigation", { name: "Settings sections" });
    fireEvent.click(within(settingsSections).getByRole("button", { name: "Billing" }));
    expect(within(settings).getByRole("heading", { name: "Free plan" })).toBeInTheDocument();
    expect(within(settings).getByRole("table", { name: "Invoices" })).toBeInTheDocument();
    fireEvent.click(within(settingsSections).getByRole("button", { name: "Account" }));
    expect(within(settings).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(within(settings).getByRole("table", { name: "Active sessions" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Modal backdrop")).not.toBeInTheDocument();
  });

  it("uses a closed mobile thread drawer that opens, closes, and yields the viewport to chat", () => {
    mockMobileViewport();
    render(<App />);

    const shell = screen.getByRole("main");
    const sidebar = screen.getByRole("complementary");
    expect(shell).toHaveClass("app-shell-mobile-workspace-closed");
    expect(sidebar.querySelector(".workspace-drawer")).toHaveAttribute("hidden");

    const drawerButton = within(sidebar).getByRole("button", { name: "Open threads" });
    expect(drawerButton).toHaveAttribute("aria-controls", "workspace-drawer");
    expect(drawerButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(drawerButton);
    expect(shell).toHaveClass("app-shell-mobile-workspace-open");
    expect(within(sidebar).getByRole("button", { name: "Close threads" })).toHaveAttribute("aria-expanded", "true");
    expect(sidebar.querySelector(".workspace-drawer")).not.toHaveAttribute("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(shell).toHaveClass("app-shell-mobile-workspace-closed");
    expect(within(sidebar).getByRole("button", { name: "Open threads" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(within(sidebar).getByRole("button", { name: "Open threads" }));
    fireEvent.click(within(sidebar).getByRole("button", { name: "Draft" }));
    expect(shell).toHaveClass("app-shell-mobile-workspace-closed");
  });

  it("keeps empty-thread setup content separate from the composer so narrow screens can scroll the guide", () => {
    render(<App />);
    const styles = readFileSync("src/styles.css", "utf8");

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    const setupPane = thread.querySelector<HTMLElement>(".thread-start");
    const composer = thread.querySelector<HTMLElement>(".composer-start");

    expect(setupPane).toBeInTheDocument();
    expect(composer).toBeInTheDocument();
    expect(setupPane).not.toContainElement(composer);
    expect(setupPane).not.toContainElement(within(thread).getByRole("textbox", { name: "Repository task message" }));
    expect(styles).toContain("width: min(100%, 1040px);");
    expect(styles).toContain("width: min(100%, 1120px);");
    expect(styles).toContain("max-height: 28px;");
    expect(styles).not.toContain("width: min(100%, 720px);");
    expect(styles).toContain("overflow-x: auto;");
  });

  it("renders the cockpit chat surface directly and keeps settings action in the sidebar", () => {
    render(<App />);
    const styles = readFileSync("src/styles.css", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const packageManifest = readFileSync("package.json", "utf8");
    const removedWorkspaceRuleClass = ".workspace" + "-di" + "vider";
    const shellClasses = Array.from(screen.getByRole("main").children).map((child) => child.className);

    expect(packageManifest).toContain('"lucide-react": "^1.21.0"');
    expect(appSource).toContain('from "lucide-react"');
    expect(appSource).not.toContain("function NavIcon");
    expect(shellClasses).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    openSettings();
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(styles).toContain(".app-shell-settings-open");
    expect(styles).not.toContain(".app-shell-dashboard");
    expect(styles).not.toContain(".app-shell-dashboard.app-shell-settings-open");
    expect(styles).not.toContain(".app-shell-dashboard .thread");
    expect(styles).toContain("grid-template-columns: 240px minmax(520px, 1fr);");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(styles).not.toContain("grid-template-columns: 240px minmax(520px, 1fr) minmax(320px, 380px);");
    expect(styles).not.toContain("grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);");
    expect(styles).toContain(".workspace-panel");
    expect(styles).toContain(".workspace-panel-header");
    expect(styles).toContain(".workspace-panel-toggle");
    expect(styles).toContain(".app-shell-workspace-collapsed");
    expect(appSource).toContain("app-shell-workspace-open");
    expect(styles).toContain(".workspace-controls");
    expect(styles).toContain(".workspace-search");
    expect(styles).toContain(".workspace-create-button");
    expect(styles).not.toContain(removedWorkspaceRuleClass);
    expect(styles).toContain("--space-micro: 4px;");
    expect(styles).toContain("--space-control: 8px;");
    expect(styles).toContain("--space-row: 10px;");
    expect(styles).toContain("--space-content: 14px;");
    expect(styles).toContain("--space-panel: 18px;");
    expect(styles).toContain("--space-stage: 24px;");
    expect(styles).toContain("--scrollbar-size: 10px;");
    expect(styles).toContain("--scrollbar-radius: 999px;");
    expect(styles).toContain("--scrollbar-track: rgba(241, 241, 241, 0.025);");
    expect(styles).toContain("--scrollbar-thumb: rgba(241, 241, 241, 0.18);");
    expect(styles).toContain("--scrollbar-thumb-hover: rgba(143, 182, 232, 0.42);");
    expect(styles).toContain("--scrollbar-thumb-active: rgba(241, 241, 241, 0.42);");
    expect(styles).toContain("--scrollbar-corner: transparent;");
    expect(styles).toMatch(
      /\.workspace-panel nav,[\s\S]*?\.shell-modal-body,[\s\S]*?\.message-list,[\s\S]*?\.composer textarea \{[\s\S]*?scrollbar-color: var\(--scrollbar-thumb\) var\(--scrollbar-track\);[\s\S]*?scrollbar-width: thin;/,
    );
    expect(styles).toMatch(
      /\.workspace-panel nav::-webkit-scrollbar,[\s\S]*?\.shell-modal-body::-webkit-scrollbar,[\s\S]*?\.message-list::-webkit-scrollbar,[\s\S]*?\.composer textarea::-webkit-scrollbar \{[\s\S]*?width: var\(--scrollbar-size\);[\s\S]*?height: var\(--scrollbar-size\);/,
    );
    expect(styles).toMatch(
      /\.workspace-panel nav::-webkit-scrollbar-thumb,[\s\S]*?\.shell-modal-body::-webkit-scrollbar-thumb,[\s\S]*?\.message-list::-webkit-scrollbar-thumb,[\s\S]*?\.composer textarea::-webkit-scrollbar-thumb \{[\s\S]*?min-height: 48px;[\s\S]*?border: 2px solid transparent;[\s\S]*?border-radius: var\(--scrollbar-radius\);[\s\S]*?background: var\(--scrollbar-thumb\);[\s\S]*?background-clip: content-box;/,
    );
    expect(styles).toContain("::-webkit-scrollbar-thumb:hover");
    expect(styles).toContain("::-webkit-scrollbar-thumb:active");
    expect(styles).toContain("::-webkit-scrollbar-corner");
    const appShellStyles = styles.match(/\.app-shell \{[\s\S]*?\}/)?.[0] ?? "";
    const workspacePanelStyles = styles.match(/\.workspace-panel \{[\s\S]*?\}/)?.[0] ?? "";
    expect(appShellStyles).toContain("background: var(--mono-950);");
    expect(appShellStyles).not.toContain("linear-gradient(90deg");
    expect(appShellStyles).not.toContain("linear-gradient(180deg");
    expect(appShellStyles).not.toContain("background-size:");
    expect(workspacePanelStyles).toContain("gap: var(--space-panel);");
    expect(workspacePanelStyles).toContain("padding: 16px 12px 0;");
    expect(workspacePanelStyles).not.toContain("padding-bottom");
    expect(styles).toMatch(/\.app-shell \{[\s\S]*?transition: grid-template-columns 180ms ease;/);
    expect(styles).toMatch(/\.app-shell-workspace-collapsed,[\s\S]*?\.app-shell-workspace-collapsed\.app-shell-settings-open \{[\s\S]*?grid-template-columns: 48px minmax\(520px, 1fr\);/);
    expect(styles).toMatch(/\.workspace-panel-header \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 34px 34px;[\s\S]*?gap: var\(--space-control\);/);
    expect(styles).toMatch(/\.workspace-panel-toggle \{[\s\S]*?place-items: center;[\s\S]*?width: 34px;[\s\S]*?min-width: 34px;[\s\S]*?height: 34px;[\s\S]*?min-height: 34px;[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?padding: 0;/);
    expect(styles).toMatch(/\.app-shell-workspace-collapsed \.workspace-panel \{[\s\S]*?gap: 0;[\s\S]*?padding-inline: 7px;/);
    expect(styles).toMatch(/\.app-shell-workspace-collapsed \.workspace-brand,[\s\S]*?\.app-shell-workspace-collapsed \.workspace-footer \{[\s\S]*?display: none;/);
    expect(styles).toMatch(/\.workspace-controls \{[\s\S]*?gap: var\(--space-control\);/);
    expect(styles).toMatch(/\.workspace-panel nav \{[\s\S]*?--scrollbar-size: 8px;[\s\S]*?--scrollbar-track: transparent;[\s\S]*?margin-top: 6px;[\s\S]*?overflow-y: auto;/);
    expect(styles).toContain(".workspace-brand");
    expect(styles).toContain(".workspace-footer");
    const workspaceFooterStyles = styles.match(/\n\.workspace-footer \{[\s\S]*?\}/)?.[0] ?? "";
    expect(workspaceFooterStyles).toContain("margin-top: 18px;");
    expect(workspaceFooterStyles).not.toMatch(/padding(?:-bottom)?:/);
    expect(styles).toContain(".workspace-profile");
    expect(styles).toContain(".workspace-account");
    expect(styles).toContain(".workspace-account-trigger");
    expect(styles).toContain(".account-menu");
    expect(styles).toContain(".workspace-row:hover");
    expect(styles).toContain(".workspace-row:focus-within");
    expect(styles).toContain(".workspace-row-active");
    expect(styles).toContain(".workspace-row-button");
    expect(styles).toContain(".workspace-options");
    const workspaceRowStyles = styles.match(/\.workspace-row \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceRowInteractiveStyles = styles.match(/\.workspace-row:hover,[\s\S]*?\.workspace-row-menu-open \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceRowActiveStyles = styles.match(/\.workspace-row-active \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceRowButtonStyles = styles.match(/\.workspace-row-button \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceCreateButtonStyles = styles.match(/\.workspace-create-button \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceCreateInteractiveStyles = styles.match(/\.workspace-create-button:hover,[\s\S]*?\.workspace-create-button:focus-visible \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceCreateInteractiveIconStyles =
      styles.match(/\.workspace-create-button:hover \.workspace-create-icon,[\s\S]*?\.workspace-create-button:focus-visible \.workspace-create-icon \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceCreateIconStyles = styles.match(/\.workspace-create-icon \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceSearchToggleStyles = styles.match(/\.workspace-search-toggle \{[\s\S]*?\}/)?.[0] ?? "";
    expect(workspaceRowStyles).toContain("border-radius: 8px;");
    expect(workspaceRowStyles).not.toContain("border:");
    expect(workspaceRowStyles).not.toContain("background:");
    expect(workspaceRowInteractiveStyles).toContain("background: rgba(241, 241, 241, 0.055);");
    expect(workspaceRowInteractiveStyles).not.toContain("border-color:");
    expect(workspaceRowActiveStyles).toContain("color: var(--mono-100);");
    expect(workspaceRowActiveStyles).not.toContain("background:");
    expect(workspaceRowActiveStyles).not.toContain("border-color:");
    expect(workspaceRowButtonStyles).toContain("min-height: 34px;");
    expect(workspaceRowButtonStyles).toContain("padding: 5px 10px;");
    expect(workspaceCreateButtonStyles).toContain("justify-content: flex-start;");
    expect(workspaceCreateButtonStyles).toContain("border-color: transparent;");
    expect(workspaceCreateButtonStyles).toContain("background: transparent;");
    expect(workspaceCreateButtonStyles).toContain("border-radius: 8px;");
    expect(workspaceCreateButtonStyles).toContain("padding: 0 10px;");
    expect(workspaceCreateButtonStyles).toContain("transition:");
    expect(workspaceCreateInteractiveStyles).toContain("background: rgba(241, 241, 241, 0.055);");
    expect(workspaceCreateInteractiveStyles).not.toContain("var(--accent-info)");
    expect(workspaceCreateInteractiveStyles).not.toContain("border-color:");
    expect(workspaceCreateIconStyles).toContain("width: 20px;");
    expect(workspaceCreateIconStyles).toContain("min-width: 20px;");
    expect(workspaceCreateIconStyles).toContain("height: 20px;");
    expect(workspaceCreateIconStyles).toContain("border-radius: 999px;");
    expect(workspaceCreateIconStyles).toContain("background: var(--mono-100);");
    expect(workspaceCreateIconStyles).toContain("color: var(--mono-950);");
    expect(workspaceCreateIconStyles).toContain("transition:");
    expect(workspaceCreateInteractiveIconStyles).toContain("background: var(--mono-300);");
    expect(workspaceCreateInteractiveIconStyles).toContain("color: var(--mono-950);");
    expect(workspaceSearchToggleStyles).toContain("width: 34px;");
    expect(styles).toContain(".workspace-search-toggle");
    const workspaceMenuStyles = styles.match(/\.workspace-menu \{[\s\S]*?\}/)?.[0] ?? "";
    expect(workspaceMenuStyles).toContain("position: static;");
    expect(workspaceMenuStyles).toContain("gap: var(--space-micro);");
    expect(workspaceMenuStyles).toContain("margin: 0 0 4px;");
    expect(workspaceMenuStyles).toContain("padding: 0 var(--space-control) var(--space-control);");
    expect(styles).toMatch(/\.workspace-menu button \{[\s\S]*?padding: 0 10px;/);
    expect(styles).not.toContain(".purpose-");
    expect(workspaceMenuStyles).not.toContain("position: absolute;");
    expect(styles).toContain(".ui-icon");
    expect(styles).toContain(".shell-modal-backdrop");
    expect(styles).toContain(".shell-modal");
    expect(styles).toContain(".shell-modal-body");
    expect(styles).toMatch(/\.shell-modal-close \{[\s\S]*?width: 38px;[\s\S]*?border-color: var\(--border\);[\s\S]*?background: rgba\(241, 241, 241, 0\.035\);/);
    expect(styles).toMatch(/\.shell-modal-close:hover,[\s\S]*?\.shell-modal-close:focus-visible \{[\s\S]*?border-color: rgba\(143, 182, 232, 0\.55\);[\s\S]*?background: rgba\(143, 182, 232, 0\.12\);[\s\S]*?color: var\(--accent-info\);/);
    const shellModalBackdropStyles = styles.match(/\.shell-modal-backdrop \{[\s\S]*?\}/)?.[0] ?? "";
    expect(shellModalBackdropStyles).toContain("backdrop-filter: blur(30px) saturate(0.9);");
    expect(shellModalBackdropStyles).toContain("rgba(18, 18, 18, 0.36)");
    expect(styles).toContain("repeating-radial-gradient");
    expect(shellModalBackdropStyles).toContain("14px 14px");
    expect(shellModalBackdropStyles).toContain("22px 22px");
    expect(shellModalBackdropStyles).not.toContain("radial-gradient(circle at 50% 18%");
    expect(styles).toContain(".shell-modal-atmospheric::before");
    expect(styles).toContain(".shell-modal-atmospheric::after");
    expect(styles).toContain("../../../assets/pictures/academic-ascii-glitch-background.webp");
    expect(styles).toContain(".settings-dialog");
    expect(styles).toContain(".settings-modal");
    expect(styles).toContain(".settings-shell");
    expect(styles).toContain(".settings-rail");
    expect(styles).toContain(".settings-search");
    expect(styles).toContain(".settings-nav-button");
    const settingsNavButtonStyles = styles.match(/\.settings-nav-button \{[\s\S]*?\}/)?.[0] ?? "";
    const workspaceAccountTriggerStyles = styles.match(/\.workspace-account-trigger \{[\s\S]*?\}/)?.[0] ?? "";
    const accountMenuStyles = styles.match(/\.account-menu \{[\s\S]*?\}/)?.[0] ?? "";
    const accountMenuItemStyles = styles.match(/\.account-menu-item \{[\s\S]*?\}/)?.[0] ?? "";
    const accountMenuDisabledItemStyles = styles.match(/\.account-menu-item\[aria-disabled="true"\] \{[\s\S]*?\}/)?.[0] ?? "";
    expect(styles).toContain(".settings-content");
    expect(styles).toContain(".settings-row");
    expect(workspaceAccountTriggerStyles).toContain("grid-template-columns: 28px minmax(0, 1fr) 18px;");
    expect(workspaceAccountTriggerStyles).toContain("min-height: 42px;");
    expect(workspaceAccountTriggerStyles).toContain("background: transparent;");
    expect(accountMenuStyles).toContain("position: absolute;");
    expect(accountMenuStyles).toContain("bottom: calc(100% + var(--space-control));");
    expect(accountMenuStyles).toContain("border-radius: 8px;");
    expect(accountMenuItemStyles).toContain("grid-template-columns: 18px minmax(0, 1fr) auto;");
    expect(accountMenuItemStyles).toContain("min-height: 34px;");
    expect(settingsNavButtonStyles).toContain("padding: 0 10px;");
    expect(styles).not.toContain(".workspace-panel-action");
    expect(styles).not.toContain(".workspace-panel-action-label");
    expect(accountMenuDisabledItemStyles).not.toContain("pointer-events: none;");
    expect(styles).toContain("--workspace-brand-size: 20px;");
    expect(styles).toContain(".workspace-brand-wordmark");
    const brandWordmarkStyles = styles.match(/\.workspace-brand-wordmark \{[\s\S]*?\}/)?.[0] ?? "";
    expect(brandWordmarkStyles).toContain(`font-family: var(--${"font-title"});`);
    expect(styles).not.toContain(".workspace-brand-logo");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain(".dashboard-summary");
    expect(styles).not.toContain(".dashboard-dialog");
    expect(styles).not.toContain(".dashboard-surface");
    expect(styles).not.toContain(".dashboard-thread-header");
    expect(styles).not.toContain(".dashboard-message-list");
    expect(styles).not.toContain(".dashboard-metrics-thread");
    expect(styles).not.toContain(".dashboard-intro-bubble");
    expect(appSource).not.toContain("<" + "hr");
    expect(styles).not.toContain("border" + "-top");
    expect(styles).not.toContain("border" + "-bottom");
    expect(styles).toContain(".settings-control");
    expect(styles).toContain(".settings-metric");
    expect(styles).toContain(".surface-switch");
    expect(styles).toContain(".surface-switch-toggle");
    expect(styles).toContain(".surface-switch-thumb");
    expect(styles).not.toContain(".surface-switch-icon");
    expect(appSource).not.toContain("surfaceIcons");
    expect(appSource).not.toContain('className="surface-switch-icon"');
    expect(styles).not.toContain("repeat(auto-fit, minmax(136px, 1fr))");
    expect(styles).not.toMatch(/\.surface-switcher h2,[\s\S]*?\.settings-queue h2 \{[\s\S]*?grid-column: 1 \/ -1;/);
    expect(styles).toMatch(/\.surface-switcher \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
    expect(styles).toMatch(/\.surface-switch \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 38px;/);
    expect(styles).toMatch(/\.surface-switch \{[\s\S]*?min-height: 44px;/);
    expect(styles).toMatch(/\.surface-switch \{[\s\S]*?border: 0;/);
    expect(styles).toMatch(/\.surface-switch \{[\s\S]*?background: transparent;/);
    expect(styles).toMatch(/\.surface-switch \{[\s\S]*?box-shadow: inset 0 -1px 0 rgba\(241, 241, 241, 0.1\);/);
    expect(styles).toMatch(/\.surface-switch-copy small \{[\s\S]*?color: var\(--text-muted\);/);
    expect(styles).toMatch(/\.surface-switch\[aria-checked="true"\] \.surface-switch-toggle \{[\s\S]*?background: var\(--accent-info\);/);
    expect(styles).toMatch(/\.surface-switch\[aria-checked="true"\] \.surface-switch-thumb \{[\s\S]*?transform: translateX\(16px\);/);
    expect(styles).not.toContain(".thread::before");
    expect(styles).not.toContain(".thread::after");
    expect(styles).not.toContain("../../../assets/pictures/thread-bound-study-halftone.webp");
    expect(styles).not.toContain("../../../assets/pictures/thread-bound-study-background.jpg");
    expect(styles).not.toContain("../../../assets/pictures/thread-fallen-angel-halftone.png");
    expect(styles).not.toContain("radial-gradient(circle, rgba(241, 241, 241, 0.24) 0 1px");
    expect(styles).not.toContain("background-size:\n    6px 6px,\n    13px 13px;");
    expect(styles).toContain(".thread-header");
    const threadStyles =
      Array.from(styles.matchAll(/\.thread \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("gap: var(--space-content);")) ?? "";
    const messageListStyles =
      Array.from(styles.matchAll(/\.message-list \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("width: min(100%, 1040px);")) ?? "";
    expect(threadStyles).toContain("gap: var(--space-content);");
    expect(threadStyles).not.toContain("border-radius:");
    expect(messageListStyles).toContain("width: min(100%, 1040px);");
    expect(styles).toMatch(/\.thread-header-title \{[\s\S]*?display: flex;[\s\S]*?align-items: baseline;[\s\S]*?gap: var\(--space-row\);/);
    expect(styles).toContain(".thread-header-title-editable");
    expect(styles).toContain(".thread-header-title-editing");
    expect(styles).toContain(".thread-header-field-shell");
    expect(styles).toContain(".thread-header-field-label");
    expect(styles).toContain(".thread-header-field");
    expect(styles).toMatch(/\.thread-header-title-editable \{[\s\S]*?cursor: text;/);
    expect(styles).toMatch(/\.input-focus-shell:focus-within,[\s\S]*?\.input-focus-standalone:focus-visible \{[\s\S]*?border-color: rgba\(143, 182, 232, 0\.55\);/);
    expect(styles).toMatch(/\.thread-header-title > span \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-width: 0;[\s\S]*?text-overflow: ellipsis;/);
    expect(styles).toContain(".message-list");
    expect(styles).toMatch(/\.message-list \{[\s\S]*?--scrollbar-size: 11px;[\s\S]*?--scrollbar-track: transparent;[\s\S]*?align-content: start;[\s\S]*?gap: var\(--space-row\);[\s\S]*?justify-self: center;[\s\S]*?width: min\(100%, 1040px\);[\s\S]*?overflow-y: auto;/);
    expect(messageListStyles).toContain("max-width: 100%;");
    expect(messageListStyles).toContain("overflow-x: hidden;");
    expect(styles).toContain("scrollbar-gutter: stable;");
    expect(styles).toContain(".composer");
    expect(styles).not.toContain(".context-panel");
    expect(styles).not.toContain(".context-value");
    expect(styles).not.toContain(".context-value-status");
    expect(styles).not.toContain(".context-value-spend");
    expect(styles).not.toContain(".context-value-trace");
    expect(styles).not.toContain(".run-info-toggle");
    expect(styles).not.toContain(".run-info-panel");
    expect(styles).not.toContain("border: 1px solid rgba(120, 201, 155, 0.22);");
    expect(styles).not.toContain("border-radius: 999px;\n  background: rgba(241, 241, 241, 0.04);");
    expect(styles).toContain(".agent-response-selection-popover");
    expect(styles).toContain(".agent-response-content");
    expect(styles).toMatch(/\.agent-response-selection-popover \{[\s\S]*?position: absolute;[\s\S]*?z-index: 13;/);
    expect(styles).toContain("pointer-events: none;");
    expect(styles).toContain("mix-blend-mode: screen;");
    expect(appSource).toContain('variant="atmospheric"');
    expect(appSource).not.toContain('<ShellModal id="run-info-panel"');
    expect(styles).toMatch(/\.app-shell \{[\s\S]*?height: 100vh;[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/);
    expect(styles).toMatch(/\.shell-modal-header \{[\s\S]*?padding: var\(--space-panel\) var\(--space-panel\) calc\(var\(--space-control\) - 2px\);/);
    expect(styles).toMatch(/\.shell-modal-body \{[\s\S]*?--scrollbar-track: rgba\(241, 241, 241, 0\.035\);[\s\S]*?--scrollbar-thumb: rgba\(241, 241, 241, 0\.22\);[\s\S]*?gap: calc\(var\(--space-content\) \+ 2px\);[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;[\s\S]*?padding: var\(--space-row\) var\(--space-panel\) var\(--space-panel\);/);
    expect(styles).not.toMatch(/\.settings-dialog \{[\s\S]*?max-height: 100vh;/);
    expect(styles).toContain("grid-template-rows: auto minmax(0, 1fr) auto;");
    expect(styles).toContain("min-height: calc(100vh - 107px);");
    expect(styles).toContain("overflow-y: auto;");
    expect(styles).toContain("--font-body: Outfit, ui-sans-serif, system-ui, sans-serif;");
    expect(styles).toContain("--font-title: Lora, Georgia, serif;");
    expect(styles).toContain("../../../assets/fonts/Outfit/Outfit-VariableFont_wght.ttf");
    expect(styles).toContain("../../../assets/fonts/Lora/Lora-VariableFont_wght.ttf");
    expect(styles).not.toContain(`${"Ro"}boto`);
    expect(styles).not.toContain(`${"Ro"}boto_Slab`);
    expect(styles).not.toContain(`../../../assets/fonts/${"La"}to/`);
    expect(styles).not.toContain(`../../../assets/fonts/${"Nu"}nito/`);
    expect(styles).toContain("font-synthesis: none;");
    expect(styles).toContain("--thread-surface: #232323;");
    expect(styles).toContain("--message-bubble: #2a2a2a;");
    expect(styles).toContain("--message-bubble-agent: #303030;");
    expect(styles).toContain("--message-bubble-user: #243044;");
    expect(styles).toContain("--approval-surface: #303030;");
    expect(styles).toContain(".thread");
    expect(appSource).toContain("function ChatBubble");
    expect(appSource).toContain("function MessageBlock");
    expect(appSource).toContain("function AgentDetails");
    expect(appSource).toContain("renderThreadMessages");
    expect(appSource).toContain("pendingSystemMessages");
    expect(appSource).toContain("handleStartThreadHeaderEdit");
    expect(appSource).toContain('aria-label="Edit thread name and description"');
    expect(appSource).not.toContain("Workspace 4");
    expect(appSource).not.toContain("Custom workspace.");
    expect(appSource).toContain('align = "start"');
    expect(appSource).toContain('width = "full"');
    expect(appSource).toContain('<ChatBubble tone="user" align="end" width="compact"');
    expect(appSource).not.toContain('<ChatBubble tone="system"');
    expect(appSource).toContain('className="agent-details"');
    expect(appSource).toContain('className="agent-run-block"');
    expect(appSource).toContain('tone="agent"');
    expect(appSource).toContain('width="full"');
    expect(appSource).toContain('tone="approval"');
    expect(appSource).not.toContain("chat-bubble-label");
    expect(appSource).not.toContain("label={message.label");
    expect(appSource).not.toContain('label="Approval request"');
    expect(styles).toContain(".chat-bubble");
    expect(styles).toContain(".message-block");
    expect(styles).toContain(".message-block-meta");
    expect(styles).toContain(".message-block-user + .message-block-system");
    expect(styles).not.toContain(".message-block-system + .message-block-agent");
    expect(styles).toContain(".agent-run-block");
    expect(styles).not.toContain(".agent-run-block::before");
    expect(styles).toContain(".agent-details");
    expect(styles).toContain(".agent-details-list");
    expect(styles).not.toContain(".agent-details[open] .agent-details-list::before");
    expect(appSource).not.toContain('className="agent-details-node"');
    expect(styles).not.toContain(".agent-details-node");
    expect(appSource).toContain('className="agent-details-row"');
    expect(appSource).toContain('className="agent-details-subtask-row"');
    expect(styles).toContain(".agent-details-row");
    expect(styles).toContain(".agent-details-subtask-row");
    expect(styles).toContain(".agent-details-subtask-item::before");
    expect(styles).toContain(".chat-bubble-align-start");
    expect(styles).toContain(".chat-bubble-align-center");
    expect(styles).toContain(".chat-bubble-align-end");
    expect(styles).toContain(".chat-bubble-width-full");
    expect(styles).toContain(".chat-bubble-width-compact");
    const chatBubbleStyles = styles.match(/\.chat-bubble \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleUserStyles = styles.match(/\.chat-bubble-user \{[\s\S]*?\}/)?.[0] ?? "";
    const systemNoticeTextStyles = styles.match(/\.system-notice-text \{[\s\S]*?\}/)?.[0] ?? "";
    const agentRunBlockStyles = styles.match(/\.agent-run-block \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsStyles = styles.match(/^\.agent-details \{[\s\S]*?\}/m)?.[0] ?? "";
    const agentDetailsListStyles = styles.match(/\.agent-details-list \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsListItemStyles = styles.match(/\.agent-details-list li \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsRowStyles = styles.match(/\.agent-details-row \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsSubtaskListStyles = styles.match(/\.agent-details-subtask-list \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsSubtaskGuideStyles = styles.match(/\.agent-details-subtask-list::before \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsSubtaskItemStyles = styles.match(/\.agent-details-subtask-item \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsSubtaskBranchStyles = styles.match(/\.agent-details-subtask-item::before \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsSubtaskRowStyles =
      Array.from(styles.matchAll(/\.agent-details-subtask-row \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("background: rgba(241, 241, 241, 0.035);")) ?? "";
    const messageBlockUserStyles = styles.match(/\.message-block-user \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleAgentStyles = styles.match(/\.chat-bubble-agent \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleApprovalStyles = styles.match(/\.chat-bubble-approval \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleMetricStyles = styles.match(/\.chat-bubble-metric \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubblePanelStyles = styles.match(/\.chat-bubble-panel \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleHeaderStyles = styles.match(/\.chat-bubble-header \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleBodyStyles = styles.match(/\.chat-bubble-body \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleParagraphStyles = styles.match(/\.chat-bubble p \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleCenterAlignStyles = styles.match(/\.chat-bubble-align-center \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleFullWidthStyles = styles.match(/\.chat-bubble-width-full \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleCompactWidthStyles = styles.match(/\.chat-bubble-width-compact \{[\s\S]*?\}/)?.[0] ?? "";
    const chatBubbleAgentChildStyles = styles.match(/\.chat-bubble-agent > \* \{[\s\S]*?\}/)?.[0] ?? "";
    const paddingValue = (block: string) => block.match(/padding: ([^;]+);/)?.[1] ?? "";
    expect(chatBubbleStyles).toContain("align-items: center;");
    expect(chatBubbleStyles).toContain("line-height: 1.35;");
    expect(chatBubbleStyles).toContain("gap: var(--space-control);");
    expect(chatBubbleStyles).not.toContain("width: fit-content;");
    expect(chatBubbleStyles).not.toContain("max-width: min(760px, 92%);");
    expect(chatBubbleStyles).not.toContain("border:");
    expect(chatBubbleStyles).not.toContain("padding:");
    expect(chatBubbleStyles).not.toContain("justify-self: center");
    expect(chatBubbleStyles).not.toContain("justify-items: center");
    expect(chatBubbleStyles).not.toContain("text-align: center");
    expect(styles).not.toContain(".chat-bubble-label");
    expect(chatBubbleHeaderStyles).toContain("align-items: center;");
    expect(chatBubbleBodyStyles).toContain("align-items: center;");
    expect(chatBubbleBodyStyles).toContain("max-width: 100%;");
    expect(chatBubbleBodyStyles).toContain("overflow-wrap: anywhere;");
    expect(chatBubbleParagraphStyles).toContain("max-width: 100%;");
    expect(chatBubbleParagraphStyles).toContain("overflow-wrap: anywhere;");
    expect(chatBubbleParagraphStyles).toContain("white-space: normal;");
    expect(chatBubbleUserStyles).toContain("padding: calc(var(--space-row) + 2px) var(--space-content);");
    expect(styles).not.toContain(".chat-bubble-system");
    expect(systemNoticeTextStyles).toContain("font-size: 12px;");
    expect(systemNoticeTextStyles).toContain("line-height: 1.4;");
    expect(systemNoticeTextStyles).not.toContain("max-width:");
    expect(systemNoticeTextStyles).not.toContain("background:");
    expect(systemNoticeTextStyles).not.toContain("border:");
    expect(agentRunBlockStyles).toContain("width: 100%;");
    expect(agentRunBlockStyles).toContain("gap: var(--space-control);");
    expect(agentRunBlockStyles).not.toContain("grid-template-columns:");
    expect(styles).not.toContain(".agent-run-block::before");
    expect(agentDetailsStyles).toContain("width: 100%;");
    expect(agentDetailsStyles).toContain("padding-block: var(--space-row);");
    expect(agentDetailsStyles).not.toContain("padding-left:");
    expect(agentDetailsListStyles).toContain("width: 100%;");
    expect(agentDetailsListItemStyles).toContain("position: relative;");
    expect(agentDetailsListItemStyles).not.toContain("grid-template-columns: 16px minmax(0, 1fr);");
    expect(agentDetailsRowStyles).toContain("border-radius: 8px;");
    expect(agentDetailsRowStyles).toContain("background: rgba(241, 241, 241, 0.045);");
    expect(agentDetailsRowStyles).toContain("padding: calc(var(--space-control) - 1px) var(--space-row);");
    expect(styles).not.toContain(".agent-details-list li::before");
    expect(styles).not.toContain(".agent-details-list li::after");
    expect(styles).not.toContain(".agent-details-list li:last-child::before");
    expect(styles).not.toContain('content: "├──";');
    expect(styles).not.toContain('content: "└──";');
    [agentDetailsRowStyles, agentDetailsSubtaskGuideStyles, agentDetailsSubtaskBranchStyles, agentDetailsSubtaskRowStyles].forEach((treeRowStyles) => {
      expect(treeRowStyles).not.toContain(["font-family", "ui-monospace"].join(": "));
    });
    expect(agentDetailsSubtaskListStyles).toContain("position: relative;");
    expect(agentDetailsSubtaskListStyles).toContain("width: auto;");
    expect(agentDetailsSubtaskListStyles).toContain("max-width: 100%;");
    expect(agentDetailsSubtaskListStyles).toContain("margin: calc(var(--space-control) - 2px) 0 0;");
    expect(agentDetailsSubtaskListStyles).toContain("padding: 0;");
    expect(agentDetailsSubtaskListStyles).not.toContain("\n  width: 100%;");
    expect(agentDetailsSubtaskListStyles).not.toContain("margin: calc(var(--space-control) - 2px) 0 0 var(--space-panel);");
    expect(agentDetailsSubtaskGuideStyles).toContain('content: "";');
    expect(agentDetailsSubtaskGuideStyles).toContain("width: 1px;");
    expect(agentDetailsSubtaskGuideStyles).toContain("background: rgba(241, 241, 241, 0.18);");
    expect(agentDetailsSubtaskItemStyles).toContain("grid-template-columns: var(--agent-tree-gutter) minmax(0, 1fr);");
    expect(agentDetailsSubtaskItemStyles).toContain("align-items: center;");
    expect(agentDetailsSubtaskBranchStyles).toContain('content: "";');
    expect(agentDetailsSubtaskBranchStyles).toContain("grid-column: 1;");
    expect(agentDetailsSubtaskBranchStyles).toContain("height: 1px;");
    expect(agentDetailsSubtaskBranchStyles).toContain("background: rgba(241, 241, 241, 0.18);");
    expect(agentDetailsSubtaskRowStyles).toContain("grid-column: 2;");
    expect(agentDetailsSubtaskRowStyles).toContain("max-width: 100%;");
    expect(agentDetailsSubtaskRowStyles).toContain("overflow: hidden;");
    expect(agentDetailsSubtaskRowStyles).toContain("background: rgba(241, 241, 241, 0.035);");
    expect(agentDetailsSubtaskRowStyles).toContain("color: rgba(241, 241, 241, 0.58);");
    expect(chatBubbleAgentStyles).toContain("padding: var(--space-panel) var(--space-panel) 0;");
    expect(chatBubbleAgentStyles).toContain("position: relative;");
    expect(chatBubbleAgentStyles).toContain("overflow: visible;");
    expect(chatBubbleAgentStyles).toContain("background: transparent;");
    expect(chatBubbleAgentStyles).not.toContain("isolation: isolate;");
    expect(chatBubbleAgentStyles).not.toContain("background: var(--message-bubble-agent);");
    expect(chatBubbleAgentStyles).not.toMatch(/background:\s*#[0-9a-f]{3,6};/i);
    expect(chatBubbleAgentStyles).not.toContain("linear-gradient");
    expect(chatBubbleAgentStyles).not.toContain("academic-ascii-glitch-background");
    expect(styles).not.toContain("background: rgba(120, 201, 155, 0.08);");
    expect(styles).not.toContain(".chat-bubble-agent::before");
    expect(styles).not.toContain(".chat-bubble-agent::after");
    expect(chatBubbleAgentChildStyles).toContain("z-index: 1;");
    expect(styles).toContain(".chat-bubble-agent .chat-bubble-footer");
    expect(styles).toContain("margin: var(--space-micro) calc(var(--space-panel) * -1) 0;");
    expect(styles).toContain(".agent-response-actions");
    expect(styles).toContain(".agent-response-action-button");
    expect(styles).toContain(".agent-response-more-action");
    expect(styles).toContain(".agent-response-more-menu");
    expect(styles).not.toContain(".agent-response-sources-popover");
    expect(styles).toContain(".agent-response-sources-panel");
    expect(styles).toContain(".agent-response-source-link");
    const agentResponseActionsStyles = styles.match(/\.agent-response-actions \{[\s\S]*?\}/)?.[0] ?? "";
    const agentResponseActionButtonStyles = styles.match(/\.agent-response-action-button \{[\s\S]*?\}/)?.[0] ?? "";
    const agentResponseMoreActionStyles = styles.match(/\.agent-response-more-action \{[\s\S]*?\}/)?.[0] ?? "";
    const agentResponseMoreMenuStyles = styles.match(/\.agent-response-more-menu \{[\s\S]*?\}/)?.[0] ?? "";
    const agentResponseSourcesPanelStyles =
      Array.from(styles.matchAll(/\.agent-response-sources-panel \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("grid-column: 3;")) ?? "";
    const appShellSourcesOpenStyles = styles.match(/\.app-shell-sources-open \{[\s\S]*?\}/)?.[0] ?? "";
    const appShellWorkspaceCollapsedSourcesOpenStyles =
      styles.match(/\.app-shell-workspace-collapsed\.app-shell-sources-open \{[\s\S]*?\}/)?.[0] ?? "";
    const mobileSourcesPanelStyles =
      Array.from(styles.matchAll(/\.agent-response-sources-panel \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("grid-row: 3;")) ?? "";
    expect(agentResponseActionsStyles).toContain("justify-content: flex-start;");
    expect(agentResponseActionsStyles).toContain("position: relative;");
    expect(agentResponseActionsStyles).toContain("z-index: 2;");
    expect(agentResponseActionButtonStyles).toContain("width: 30px;");
    expect(agentResponseActionButtonStyles).toContain("height: 30px;");
    expect(agentResponseActionButtonStyles).toContain("padding: 0;");
    expect(agentResponseMoreActionStyles).toContain("position: relative;");
    expect(agentResponseMoreActionStyles).toContain("display: inline-flex;");
    expect(agentResponseMoreMenuStyles).toContain("position: absolute;");
    expect(agentResponseMoreMenuStyles).toContain("right: 0;");
    expect(agentResponseMoreMenuStyles).not.toContain("left: 0;");
    expect(agentResponseMoreMenuStyles).toContain("z-index:");
    expect(styles).toContain(".app-shell-sources-closed");
    expect(appShellSourcesOpenStyles).toContain("grid-template-columns: 240px minmax(0, 1fr) minmax(320px, 360px);");
    expect(appShellWorkspaceCollapsedSourcesOpenStyles).toContain("grid-template-columns: 48px minmax(0, 1fr) minmax(320px, 360px);");
    expect(agentResponseSourcesPanelStyles).toContain("position: relative;");
    expect(agentResponseSourcesPanelStyles).toContain("grid-column: 3;");
    expect(agentResponseSourcesPanelStyles).toContain("grid-row: 1;");
    expect(agentResponseSourcesPanelStyles).not.toContain("position: fixed;");
    expect(agentResponseSourcesPanelStyles).not.toContain("right: var(--space-panel);");
    expect(agentResponseSourcesPanelStyles).not.toContain("z-index: var(--z-shell-side-panel);");
    expect(styles).not.toContain("--z-shell-side-panel:");
    expect(agentResponseSourcesPanelStyles).toContain("width: 100%;");
    expect(agentResponseSourcesPanelStyles).toContain("height: 100%;");
    expect(agentResponseSourcesPanelStyles).toContain("max-width: none;");
    expect(agentResponseSourcesPanelStyles).toContain("margin: 0;");
    expect(agentResponseSourcesPanelStyles).not.toContain("border-radius:");
    expect(mobileSourcesPanelStyles).toContain("grid-column: 1;");
    expect(mobileSourcesPanelStyles).toContain("grid-row: 3;");
    expect(mobileSourcesPanelStyles).toContain("width: 100%;");
    expect(mobileSourcesPanelStyles).toContain("max-width: none;");
    expect(mobileSourcesPanelStyles).toContain("margin: 0;");
    expect(chatBubbleApprovalStyles).toContain("padding: calc(var(--space-row) + 2px) var(--space-content);");
    const chatBubbleActionsStyles = styles.match(/\.chat-bubble-actions \{[\s\S]*?\}/)?.[0] ?? "";
    expect(chatBubbleActionsStyles).toContain("justify-content: flex-end;");
    expect(chatBubbleActionsStyles).toContain("width: 100%;");
    expect(chatBubbleActionsStyles).not.toContain("justify-content: space-between;");
    expect(chatBubbleMetricStyles).toContain("padding: var(--space-content);");
    expect(chatBubblePanelStyles).toContain("padding: var(--space-panel);");
    expect(
      new Set([
        paddingValue(chatBubbleUserStyles),
        paddingValue(systemNoticeTextStyles),
        paddingValue(chatBubbleAgentStyles),
        paddingValue(chatBubbleApprovalStyles),
        paddingValue(chatBubbleMetricStyles),
        paddingValue(chatBubblePanelStyles),
      ]).size,
    ).toBeGreaterThan(1);
    expect(chatBubbleCenterAlignStyles).toContain("justify-self: center;");
    expect(chatBubbleFullWidthStyles).toContain("width: 100%;");
    expect(chatBubbleFullWidthStyles).toContain("max-width: 100%;");
    expect(chatBubbleFullWidthStyles).toContain("justify-self: stretch;");
    expect(messageBlockUserStyles).toContain("justify-self: end;");
    expect(messageBlockUserStyles).toContain("width: fit-content;");
    expect(messageBlockUserStyles).toContain("max-width: min(560px, calc(100% - var(--space-row)));");
    expect(chatBubbleCompactWidthStyles).toContain("width: fit-content;");
    expect(chatBubbleCompactWidthStyles).toContain("max-width: min(560px, calc(100% - var(--space-row)));");
    expect(appSource).not.toContain('className="message-bubble');
    expect(styles).not.toContain(".message-bubble");
    expect(styles).not.toContain(".run-info-panel");
    expect(styles).not.toContain(".verifier-evidence-panel");
    expect(styles).not.toContain(".verifier-evidence-grid");
    expect(styles).toContain(".chat-bubble-agent");
    expect(styles).not.toContain(".context-panel");
    expect(styles).toContain(".settings-queue");
    expect(styles).not.toContain(".execution-control");
    expect(styles).toContain("position: sticky;");
    expect(styles).toContain("bottom: var(--space-content);");
    expect(appSource).toContain("Maximize2");
    expect(appSource).toContain("Minimize2");
    expect(appSource).toContain("composerScaleMode");
    expect(appSource).toContain('className={`composer composer-${variant} composer-scale-${composerScaleMode}`}');
    expect(appSource).toContain('className="composer-field input-focus-shell"');
    expect(appSource).toContain('className="thread-start"');
    expect(appSource).toContain('className="composer-toolbar"');
    expect(appSource).toContain('className="composer-scale-button"');
    expect(appSource).toContain('className="composer-meta-button"');
    expect(styles).toContain(".composer-field");
    expect(styles).toContain(".composer textarea");
    expect(styles).toContain(".composer-scale-normal");
    expect(styles).toContain(".composer-scale-full");
    expect(styles).toContain(".composer-scale-button");
    expect(styles).toContain(".thread-empty");
    expect(styles).toContain(".thread-start");
    expect(styles).toContain(".composer-toolbar");
    const composerStyles = styles.match(/\.composer \{[\s\S]*?\}/)?.[0] ?? "";
    expect(composerStyles).not.toContain("border:");
    expect(composerStyles).toContain("display: grid;");
    expect(composerStyles).not.toContain("grid-template-columns:");
    expect(composerStyles).toContain("gap: calc(var(--space-control) + 2px);");
    expect(composerStyles).toContain("justify-self: center;");
    expect(composerStyles).toContain("width: min(100%, 1040px);");
    expect(composerStyles).toContain("min-height: 0;");
    expect(composerStyles).toContain("padding-inline: 0;");
    expect(composerStyles).not.toContain("padding-top");
    expect(composerStyles).not.toContain("padding-right");
    expect(composerStyles).not.toContain("padding-left");
    expect(composerStyles).not.toContain("padding-bottom");
    expect(composerStyles).not.toMatch(/padding:\s/);
    const composerFieldStyles = styles.match(/\.composer-field \{[\s\S]*?\}/)?.[0] ?? "";
    const composerTextareaStyles =
      Array.from(styles.matchAll(/\.composer textarea \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("min-height: 84px;")) ?? "";
    const composerScaleNormalStyles = styles.match(/\.composer-scale-normal \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleFullStyles = styles.match(/\.composer-scale-full \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleFullFieldStyles = styles.match(/\.composer-scale-full \.composer-field \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleFullTextareaStyles = styles.match(/\.composer-scale-full textarea \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleButtonStyles = styles.match(/\.composer-scale-button \{[\s\S]*?\}/)?.[0] ?? "";
    expect(composerFieldStyles).toContain("display: grid;");
    expect(composerFieldStyles).toContain("position: relative;");
    expect(composerFieldStyles).toContain("grid-template-rows: auto minmax(84px, auto) auto auto;");
    expect(composerFieldStyles).toContain("gap: var(--space-row);");
    expect(composerFieldStyles).toContain("width: 100%;");
    expect(composerFieldStyles).toContain("min-height: 154px;");
    expect(composerFieldStyles).not.toContain("border:");
    expect(composerFieldStyles).not.toContain("box-shadow:");
    expect(composerFieldStyles).not.toContain("transition:");
    expect(styles).toMatch(/\.input-focus-shell:focus-within,[\s\S]*?\.input-focus-standalone:focus-visible \{[\s\S]*?border-color: rgba\(143, 182, 232, 0\.55\);[\s\S]*?0 0 10px rgba\(143, 182, 232, 0\.12\);/);
    expect(styles).toMatch(
      /\.composer textarea \{[\s\S]*?min-height: 84px;[\s\S]*?resize: none;[\s\S]*?padding: 0 calc\(var\(--space-stage\) \+ var\(--space-content\)\) 0 var\(--space-content\);/,
    );
    expect(composerTextareaStyles).toContain("--scrollbar-size: 8px;");
    expect(composerTextareaStyles).toContain("overflow-y: auto;");
    expect(composerTextareaStyles).toContain("scrollbar-gutter: stable;");
    expect(composerScaleNormalStyles).toContain("width: min(100%, 1040px);");
    expect(composerScaleFullStyles).toContain("width: min(100%, 1120px);");
    expect(composerScaleFullStyles).toContain("min-height: 0;");
    expect(composerScaleFullFieldStyles).toContain("min-height: 252px;");
    expect(composerScaleFullTextareaStyles).toContain("height: min(34vh, 220px);");
    expect(composerScaleFullTextareaStyles).toContain("min-height: 180px;");
    expect(styles).toMatch(/\.input-focus-control:focus-visible \{[\s\S]*?outline: 0;/);
    expect(styles).toMatch(/\.composer-toolbar \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: space-between;/);
    expect(composerScaleButtonStyles).toContain("display: inline-grid;");
    expect(composerScaleButtonStyles).toContain("position: absolute;");
    expect(composerScaleButtonStyles).toContain("top: var(--space-control);");
    expect(composerScaleButtonStyles).toContain("right: var(--space-control);");
    expect(composerScaleButtonStyles).toContain("place-items: center;");
    expect(composerScaleButtonStyles).toContain("width: 32px;");
    expect(composerScaleButtonStyles).toContain("border: 0;");
    expect(composerScaleButtonStyles).toContain("background: transparent;");
    expect(composerScaleButtonStyles).toContain("padding: 0;");
    expect(styles).not.toMatch(/\.composer-scale-button:hover,[\s\S]*?background: rgba\(143, 182, 232, 0\.1\);/);
    expect(styles).toMatch(/\.composer-send-button \{[\s\S]*?display: inline-grid;[\s\S]*?place-items: center;[\s\S]*?width: 32px;[\s\S]*?height: 32px;[\s\S]*?padding: 0;/);
    expect(appSource).toContain('aria-label="Send task"');
    expect(appSource).toContain('aria-label={composerScaleMode === "full" ? "Collapse composer" : "Expand composer"}');
    expect(appSource).toContain('aria-label="Permission mode"');
    expect(appSource).not.toContain('aria-label="Open settings from composer"');
    expect(appSource).toContain('aria-label="Add content"');
    expect(appSource).not.toContain('className="composer-capability"');
    expect(appSource).not.toContain("Coding Apprentice</span>");
    expect(styles).toContain(".composer-attachment");
    expect(styles).toContain(".composer-attachment-button");
    expect(styles).toContain(".composer-attachment-menu");
    expect(styles).toContain(".composer-attachment-menu-dropdown");
    expect(styles).toContain(".composer-attachment-menu-dropup");
    expect(styles).toContain(".composer-attachment-menu-item");
    expect(styles).toContain(".composer-meta-menu");
    expect(styles).toContain(".composer-meta-menu-dropdown");
    expect(styles).toContain(".composer-meta-menu-dropup");
    expect(styles).toContain(".composer-meta-menu-item");
    expect(appSource).not.toContain("<span>Send task</span>");
    expect(styles).toContain(".input-focus-shell:focus-within");
    expect(styles).toContain(".send-icon");
    const sendIconStyles =
      Array.from(styles.matchAll(/\.send-icon \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("width: 15px;")) ?? "";
    expect(sendIconStyles).toContain("width: 15px;");
    expect(sendIconStyles).toContain("height: 15px;");
    expect(sendIconStyles).toContain("transform: translate(1px, -1px);");
    expect(styles).toContain("stroke: currentColor;");
    expect(styles).toContain("fill: none;");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) 32px;");
    expect(styles).toContain("background: var(--thread-surface);");
    expect(styles).toContain("background: var(--message-bubble);");
    expect(styles).toContain("background: var(--message-bubble-user);");
    expect(styles).toContain("background: var(--approval-surface);");
    expect(styles).toMatch(/\.chat-bubble-approval \{[\s\S]*?justify-self: start;[\s\S]*?width: min\(520px, 82%\);[\s\S]*?max-width: 100%;[\s\S]*?padding: calc\(var\(--space-row\) \+ 2px\) var\(--space-content\);/);
    const approvalTitleStyles = styles.match(/\.chat-bubble-approval \.chat-bubble-title \{[\s\S]*?\}/)?.[0] ?? "";
    expect(approvalTitleStyles).toContain(`font-family: var(--${"font-title"});`);
    expect(approvalTitleStyles).toContain("font-size: 20px;");
    expect(approvalTitleStyles).toContain("font-weight: 800;");
    expect(styles).toMatch(/\.chat-bubble-approval p \{[\s\S]*?font-size: 13px;[\s\S]*?font-weight: 400;[\s\S]*?line-height: 1\.35;/);
    expect(styles).toContain("background: var(--message-bubble);");
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
    expect(styles).toContain(".chat-bubble-approval");
    expect(styles).not.toContain("width: min(620px, 100%);");
    expect(styles).not.toContain("max-width: min(620px, 92%);");
    expect(styles).not.toContain(".event-log");
    expect(styles).not.toContain(".execution-panel");
    expect(styles).not.toContain(".safety-status");
    expect(styles).not.toContain(".run-flow");
    expect(styles).not.toContain(".cockpit-tabs");
    expect(styles).not.toContain(".cockpit-tab");
    expect(styles).not.toContain(".run-status-chip-warning");
    expect(styles).not.toContain(".run-status-chip-success");
    expect(styles).not.toContain(".overview-header");
    expect(styles).not.toContain(".overview-surface");
    expect(styles).not.toContain(".overview-chat-header");
    expect(styles).not.toContain(".run-surface-cockpit");
    expect(styles).not.toContain(".channel-button");
    expect(styles).not.toContain("minmax(280px, 360px)");
  });

  it("keeps the Impeccable project setup available for UI changes", () => {
    const hooks = readFileSync("../../.codex/hooks.json", "utf8");
    const design = readFileSync("../../.impeccable/design.json", "utf8");
    const ignoreRules = readFileSync("../../.gitignore", "utf8");

    expect(hooks).toContain("/home/nxank4/.agents/skills/impeccable/scripts/hook.mjs");
    expect(design).toContain('"schemaVersion": 2');
    expect(design).toContain("Outfit, ui-sans-serif, system-ui, sans-serif");
    expect(design).toContain("Lora, Georgia, serif");
    expect(design).not.toContain(`${"Ro"}boto Slab`);
    expect(design).toContain('"spacingMeta"');
    expect(design).toContain("The Purpose Spacing Rule");
    expect(design).not.toContain(`font-family: ${"La"}to`);
    expect(design).not.toContain(`${"Nu"}nito`);
    expect(ignoreRules).toContain(".impeccable/config.local.json");
    expect(ignoreRules).toContain(".impeccable/hook.cache.json");
    expect(ignoreRules).toContain(".impeccable/audit/");
    expect(ignoreRules).toContain(".impeccable/critique/");
  });

  it("globalizes the chat composer focus treatment across text inputs", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(styles).toContain(".input-focus-shell");
    expect(styles).toContain(".input-focus-control");
    expect(styles).toContain(".input-focus-standalone");
    expect(styles).toMatch(/\.input-focus-shell,[\s\S]*?\.input-focus-standalone \{[\s\S]*?border: 1px solid rgba\(241, 241, 241, 0\.24\);[\s\S]*?border-radius: 8px;[\s\S]*?box-shadow: 0 0 0 rgba\(143, 182, 232, 0\);[\s\S]*?transition:/);
    expect(styles).toMatch(/\.input-focus-shell:focus-within,[\s\S]*?\.input-focus-standalone:focus-visible \{[\s\S]*?border-color: rgba\(143, 182, 232, 0\.55\);[\s\S]*?0 0 10px rgba\(143, 182, 232, 0\.12\);/);
    expect(styles).toMatch(/\.input-focus-control \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?outline: 0;/);
    expect(styles).toMatch(/\.input-focus-shell:focus-within,[\s\S]*?\.input-focus-standalone:focus-visible \{[\s\S]*?border-color: rgba\(143, 182, 232, 0\.55\);[\s\S]*?0 0 10px rgba\(143, 182, 232, 0\.12\);/);

    expect(appSource).toContain('className="composer-field input-focus-shell"');
    expect(appSource).toContain('className="input-focus-control"');
    expect(appSource).toContain('className="workspace-search input-focus-shell input-focus-shell-compact"');
    expect(appSource).toContain('className="settings-search input-focus-shell input-focus-shell-compact"');
    expect(appSource).toContain('className="workspace-rename-input input-focus-standalone"');
    expect(appSource).toContain('className="thread-header-field-shell thread-header-name-shell input-focus-shell input-focus-shell-labeled"');
    expect(appSource).toContain('className="thread-header-field thread-header-name-field input-focus-control"');
    expect(appSource).toContain('className="thread-header-field-shell thread-header-description-shell input-focus-shell input-focus-shell-labeled"');
    expect(appSource).toContain('className="thread-header-field thread-header-description-field input-focus-control"');
    expect(appSource).toMatch(/<input[\s\S]*?className="input-focus-standalone"[\s\S]*?value=\{operatorFullName\}/);
    expect(appSource).toMatch(/<input[\s\S]*?className="input-focus-standalone"[\s\S]*?value=\{operatorCallSign\}/);
    expect(appSource).toMatch(/<select[\s\S]*?className="input-focus-standalone settings-select"[\s\S]*?aria-label="Permission mode"/);
  });

  it("adds new threads at the top and scopes the thread composer", () => {
    render(<App />);

    const spaces = screen.getByRole("navigation", { name: "Threads" });
    expect(within(spaces).getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(within(spaces).getByRole("button", { name: "Draft" })).toHaveAttribute("aria-pressed", "true");
    expect(within(spaces).queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const created = within(spaces).getByRole("button", { name: "New thread" });
    expect(within(spaces).getAllByRole("button").findIndex((button) => button.textContent === "New thread")).toBe(0);
    expect(created).toHaveAttribute("aria-pressed", "true");
    expect(created.querySelector("svg")).toBeNull();
    expect(created).not.toHaveTextContent("Custom cockpit workspace.");
    expect(within(spaces).getByRole("button", { name: "Thread options for New thread" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Repository task message" })).toHaveAttribute("placeholder", "Message New thread...");
    expect(screen.getByRole("heading", { level: 1, name: "New thread" })).toBeInTheDocument();
    expect(screen.getAllByText("Draft thread.")).toHaveLength(1);

    fireEvent.click(within(spaces).getByRole("button", { name: "Draft" }));

    expect(within(spaces).getByRole("button", { name: "Draft" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("navigation", { name: "Cockpit sections" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Draft" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Thread conversation" })).queryByText("Candidate repository rule from verified correction")).not.toBeInTheDocument();
  });

  it("edits the active thread header title and description inline", () => {
    render(<App />);

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    fireEvent.click(within(thread).getByRole("button", { name: "Edit thread name and description" }));

    const titleFieldShell = within(thread).getByText("Title").closest(".thread-header-field-shell");
    const descriptionFieldShell = within(thread).getByText("Description").closest(".thread-header-field-shell");
    expect(titleFieldShell).not.toBeNull();
    expect(descriptionFieldShell).not.toBeNull();
    expect(titleFieldShell?.querySelector(".thread-header-field-label")).toHaveTextContent("Title");
    expect(descriptionFieldShell?.querySelector(".thread-header-field-label")).toHaveTextContent("Description");

    const titleInput = within(thread).getByRole("textbox", { name: "Thread name" });
    const descriptionInput = within(thread).getByRole("textbox", { name: "Thread description" });
    expect(titleInput).toHaveValue("Draft");
    expect(descriptionInput).toHaveValue("Draft thread.");

    fireEvent.change(titleInput, { target: { value: "Engineering" } });
    fireEvent.change(descriptionInput, { target: { value: "Repository implementation tasks." } });
    fireEvent.keyDown(descriptionInput, { key: "Enter" });

    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();
    expect(within(thread).getByText("Repository implementation tasks.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Engineering" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Repository task message" })).toHaveAttribute("placeholder", "Message Engineering thread...");

    fireEvent.click(within(thread).getByRole("button", { name: "Edit thread name and description" }));
    const cancelTitleInput = within(thread).getByRole("textbox", { name: "Thread name" });
    const cancelDescriptionInput = within(thread).getByRole("textbox", { name: "Thread description" });
    fireEvent.change(cancelTitleInput, { target: { value: "Discarded" } });
    fireEvent.change(cancelDescriptionInput, { target: { value: "Discarded description." } });
    fireEvent.keyDown(cancelTitleInput, { key: "Escape" });
    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();
    expect(within(thread).queryByText("Discarded description.")).not.toBeInTheDocument();

    fireEvent.click(within(thread).getByRole("button", { name: "Edit thread name and description" }));
    const emptyTitleInput = within(thread).getByRole("textbox", { name: "Thread name" });
    const emptyDescriptionInput = within(thread).getByRole("textbox", { name: "Thread description" });
    fireEvent.change(emptyTitleInput, { target: { value: "   " } });
    fireEvent.change(emptyDescriptionInput, { target: { value: "Description survives empty title." } });
    fireEvent.keyDown(emptyDescriptionInput, { key: "Enter" });
    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();
    expect(within(thread).getByText("Description survives empty title.")).toBeInTheDocument();
  });

  it("keeps each thread conversation separate and chronological", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);
    fillRepositoryPath();

    const spaces = screen.getByRole("navigation", { name: "Threads" });
    const draftThread = screen.getByRole("region", { name: "Thread conversation" });

    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), { target: { value: "First draft message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), { target: { value: "Second draft message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await within(draftThread).findByText("Second draft message")).toBeInTheDocument();
    const codeTexts = getArticleTexts(draftThread);
    expect(codeTexts.findIndex((text) => text.includes("First draft message"))).toBeLessThan(
      codeTexts.findIndex((text) => text.includes("Second draft message")),
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    const newThread = screen.getByRole("region", { name: "Thread conversation" });
    expect(within(newThread).queryByText("First draft message")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), { target: { value: "New thread note" } });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    expect(await screen.findByText("New thread note")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Thread conversation" })).not.toHaveClass("thread-empty");

    fireEvent.click(within(spaces).getByRole("button", { name: "Draft" }));
    const restoredDraftThread = screen.getByRole("region", { name: "Thread conversation" });
    expect(within(restoredDraftThread).getByText("First draft message")).toBeInTheDocument();
    expect(within(restoredDraftThread).getByText("Second draft message")).toBeInTheDocument();
    expect(within(restoredDraftThread).queryByText("New thread note")).not.toBeInTheDocument();
  });

  it("scopes created runs to the selected repository workspace instead of the active chat thread", async () => {
    const runState = createMockRunState();
    const createRunSpy = vi.spyOn(codepawl, "createRun");
    dismissPrivateBetaOnboarding();
    render(<App initialRunState={runState} />);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Repository path" }), {
      target: { value: "/home/operator/project" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), {
      target: { value: "Run from a created thread" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Run from a created thread")).toBeInTheDocument();
    expect(createRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Run from a created thread",
        workspaceId: runState.workspace.id,
      }),
    );
    expect(createRunSpy).not.toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "thread-2" }));
  });

  it("submits the selected repository path with a local repository run", async () => {
    const runState = createMockRunState();
    const createRunSpy = vi.spyOn(codepawl, "createRun");
    dismissPrivateBetaOnboarding();
    render(<App initialRunState={runState} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Repository path" }), {
      target: { value: "/home/operator/project" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), {
      target: { value: "Run a real repository-scoped beta smoke" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Run a real repository-scoped beta smoke")).toBeInTheDocument();
    expect(createRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Run a real repository-scoped beta smoke",
        repositoryPath: "/home/operator/project",
        workspaceId: runState.workspace.id,
      }),
    );
  });

  it("lists persisted repository runs after restart and reopens one with events and artifacts", async () => {
    vi.spyOn(codepawl, "listPersistedRuns").mockResolvedValue([
      {
        runId: "run-persisted-1",
        taskId: "task-persisted",
        workspaceId: "workspace-local-alpha",
        goal: "Reload durable repository run",
        repositoryPath: "/home/operator/project",
        status: "pass",
        artifactManifestPath: "/app-data/artifacts/run-persisted-1/artifact-manifest.json",
        eventCount: 2,
        artifactCount: 1,
        memoryCandidateCount: 1,
        skillCount: 1,
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    ]);
    vi.spyOn(codepawl, "openPersistedRun").mockResolvedValue({
      runId: "run-persisted-1",
      taskId: "task-persisted",
      workspaceId: "workspace-local-alpha",
      goal: "Reload durable repository run",
      repositoryPath: "/home/operator/project",
      status: "pass",
      artifactRoot: "/app-data/artifacts/run-persisted-1",
      artifactManifestPath: "/app-data/artifacts/run-persisted-1/artifact-manifest.json",
      events: [
        {
          id: "run-persisted-1-event-1",
          runId: "run-persisted-1",
          sequence: 1,
          type: "run_started",
          timestamp: "2026-07-04T00:00:00.000Z",
          actor: { kind: "runtime", id: "tauri-host" },
          payload: { summary: "Persisted run started" },
          redaction: { applied: false, redactedPaths: [] },
          artifacts: [],
        },
        {
          id: "run-persisted-1-event-2",
          runId: "run-persisted-1",
          sequence: 2,
          type: "run_finished",
          timestamp: "2026-07-04T00:00:01.000Z",
          actor: { kind: "runtime", id: "tauri-host" },
          payload: { summary: "Persisted run finished" },
          redaction: { applied: false, redactedPaths: [] },
          artifacts: [],
        },
      ],
      artifacts: [
        {
          id: "contract",
          kind: "codex_contract",
          uri: "file:///app-data/artifacts/run-persisted-1/codex-contract.md",
          label: "Codex contract",
        },
      ],
      usageSummary: { runCount: 1, artifactCount: 1, gatewayActionCount: 1 },
      memoryCandidates: [{ id: "candidate-rule-1", status: "candidate" }],
      skills: [{ id: "skill-1", status: "candidate" }],
      skillReplayPlan: { id: "skill-replay-plan-1", dryRunOnly: true },
      modelConnection: null,
      codexConnection: null,
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:01.000Z",
    });
    vi.spyOn(codepawl, "listArtifactEvidence").mockResolvedValue([
      {
        artifactId: "contract",
        label: "Codex contract",
        kind: "contract",
        status: "verified",
        byteSize: 512,
        contentType: "text/markdown",
      },
    ]);

    render(<App />);
    const settings = openSettings();
    const settingsNav = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(settingsNav).queryByRole("button", { name: "CodePawl Code" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Repository run history" })).not.toBeInTheDocument();
    expect(within(settings).queryByText("Reload durable repository run")).not.toBeInTheDocument();
  });

  it("opens persisted run artifacts through the hardened evidence viewer", async () => {
    vi.spyOn(codepawl, "listPersistedRuns").mockResolvedValue([
      {
        runId: "run-persisted-evidence",
        taskId: "task-persisted",
        workspaceId: "workspace-local-alpha",
        goal: "Inspect durable evidence",
        repositoryPath: "/repo/codepawl",
        status: "pass",
        artifactManifestPath: "/app-data/artifacts/run-persisted-evidence/artifact-manifest.json",
        eventCount: 1,
        artifactCount: 4,
        memoryCandidateCount: 1,
        skillCount: 1,
        updatedAt: "2026-07-04T00:00:01.000Z",
      },
    ]);
    vi.spyOn(codepawl, "openPersistedRun").mockResolvedValue({
      runId: "run-persisted-evidence",
      taskId: "task-persisted",
      workspaceId: "workspace-local-alpha",
      goal: "Inspect durable evidence",
      repositoryPath: "/repo/codepawl",
      status: "pass",
      artifactRoot: "/app-data/artifacts/run-persisted-evidence",
      artifactManifestPath: "/app-data/artifacts/run-persisted-evidence/artifact-manifest.json",
      events: [],
      artifacts: [],
      usageSummary: { runCount: 1, artifactCount: 4, gatewayActionCount: 1 },
      memoryCandidates: [{ id: "candidate-rule-1", status: "candidate" }],
      skills: [{ id: "skill-1", status: "candidate" }],
      skillReplayPlan: { id: "skill-replay-plan-1", dryRunOnly: true },
      modelConnection: null,
      codexConnection: null,
      createdAt: "2026-07-04T00:00:00.000Z",
      updatedAt: "2026-07-04T00:00:01.000Z",
    });
    vi.spyOn(codepawl, "listArtifactEvidence").mockResolvedValue([
      {
        artifactId: "artifactManifest",
        label: "Artifact manifest",
        kind: "artifact_manifest",
        status: "verified",
        byteSize: 280,
        contentType: "application/json",
      },
      {
        artifactId: "contract",
        label: "Contract",
        kind: "contract",
        status: "verified",
        byteSize: 640,
        contentType: "text/markdown",
      },
      {
        artifactId: "verifierInput",
        label: "Verifier input",
        kind: "verifier_input",
        status: "unavailable",
        reason: "artifact file is missing",
      },
      {
        artifactId: "replayPlan",
        label: "Replay plan",
        kind: "replay_plan",
        status: "corrupted",
        reason: "artifact manifest entry is unsafe",
      },
    ]);
    vi.spyOn(codepawl, "readArtifactEvidence").mockResolvedValue({
      artifactId: "contract",
      label: "Contract",
      kind: "contract",
      status: "verified",
      contentType: "text/markdown",
      byteSize: 640,
      content: "Repository contract\n[REDACTED_SECRET]\n",
    });

    render(<App />);
    const settings = openSettings();
    const settingsNav = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(settingsNav).queryByRole("button", { name: "CodePawl Code" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Artifact evidence viewer" })).not.toBeInTheDocument();
    expect(within(settings).queryByText("[REDACTED_SECRET]")).not.toBeInTheDocument();
  });

  it("connects and preflights the private-beta local Codex connection", async () => {
    const readyConnection = {
      connectionId: "codex-cli",
      label: "Local Codex CLI",
      status: "ready" as const,
      lastPreflight: {
        checkedConnectionId: "codex-cli",
        status: "ready" as const,
        ready: true,
        checkedAt: "2026-07-04T00:00:00.000Z",
        executablePath: "/usr/local/bin/codex",
        authMode: "chatgpt",
        reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
        warnings: [],
      },
    };
    const initialSettings = withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    });
    const readySettings = withPreferenceSettings({
      ...initialSettings,
      codexConnection: readyConnection,
      modelConnection: {
        providerId: "codex-cli",
        providerLabel: "Codex CLI",
        modelId: "gpt-5.5",
        modelLabel: "GPT-5.5",
        authMethod: "chatgptOAuth",
        status: "ready",
        lastPreflight: {
          checkedProviderId: "codex-cli",
          checkedModelId: "gpt-5.5",
          status: "ready",
          ready: true,
          checkedAt: "2026-07-04T00:00:00.000Z",
          executablePath: "/usr/local/bin/codex",
          authMode: "chatgptOAuth",
          reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
          warnings: [],
        },
      },
    });
    vi.spyOn(codepawl, "getSettings").mockResolvedValueOnce(initialSettings).mockResolvedValue(readySettings);
    const loginSpy = vi.spyOn(codepawl, "loginCodexConnection").mockResolvedValue({
      ...readyConnection,
      status: "authRequired",
      lastPreflight: null,
    });
    const saveModelConnectionSpy = vi.spyOn(codepawl, "saveModelConnection").mockResolvedValue({
      providerId: "codex-cli",
      providerLabel: "Codex CLI",
      modelId: "gpt-5.5",
      modelLabel: "GPT-5.5",
      authMethod: "chatgptOAuth",
      status: "authRequired",
      lastPreflight: null,
    });
    vi.spyOn(codepawl, "preflightModelConnection").mockResolvedValue({
      checkedProviderId: "codex-cli",
      checkedModelId: "gpt-5.5",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-04T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgptOAuth",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });

    render(<App />);
    const setupDialog = screen.getByRole("dialog", { name: "Set up CodePawl" });

    expect(within(setupDialog).queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("region", { name: "Setup model provider" })).toBeInTheDocument();
    expect(within(setupDialog).getByText("Select a provider, model, and authentication method before the first repository run.")).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    fireEvent.click(within(setupDialog).getByRole("option", { name: /Codex CLI/ }));
    expect(within(setupDialog).queryByLabelText("Codex access token")).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use access token" })).not.toBeInTheDocument();
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Connect with ChatGPT" }));

    expect(saveModelConnectionSpy).toHaveBeenCalledWith({
      providerId: "codex-cli",
      modelId: "gpt-5.5",
      authMethod: "chatgptOAuth",
      envKey: null,
    });
    await waitFor(() =>
      expect(loginSpy).toHaveBeenCalledWith({
        method: "chatgpt",
      }),
    );

    expect((await within(setupDialog).findAllByText("Codex CLI is installed and authenticated with ChatGPT.")).length).toBeGreaterThan(0);
    expect(within(setupDialog).getByText("Ready")).toBeInTheDocument();
  });

  it("keeps access-token login out of the default Codex setup UI", () => {
    vi.spyOn(codepawl, "getSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    }));

    render(<App />);
    const setupDialog = screen.getByRole("dialog", { name: "Set up CodePawl" });
    fireEvent.click(within(setupDialog).getByRole("option", { name: /Codex CLI/ }));

    expect(within(setupDialog).queryByLabelText("Codex access token")).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use access token" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByText("ChatGPT OAuth")).toBeInTheDocument();
  });

  it("shows first-run setup dialog and persists completion", async () => {
    const updateSettingsSpy = vi.spyOn(codepawl, "updateSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: true,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    }));
    const { unmount } = render(<App />);

    const onboarding = screen.getByRole("dialog", { name: "Set up CodePawl" });
    expect(within(onboarding).queryByRole("heading", { name: "Set up CodePawl" })).not.toBeInTheDocument();
    expect(onboarding.querySelectorAll("#setup-dialog-title")).toHaveLength(1);
    expect(within(onboarding).getByText(/Repository-only beta/i)).toBeInTheDocument();
    expect(within(onboarding).getByText(/Choose a repository/i)).toBeInTheDocument();
    expect(within(onboarding).getByText(/Choose model provider/i)).toBeInTheDocument();
    expect(within(onboarding).getByText(/Review advanced defaults/i)).toBeInTheDocument();
    expect(within(onboarding).getByText(/browser, desktop, files, terminal, cloud, and billing remain unavailable/i)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Thread conversation" })).queryByRole("region", { name: "Setup guide" })).not.toBeInTheDocument();

    fireEvent.click(within(onboarding).getByRole("button", { name: "Complete setup" }));

    expect(updateSettingsSpy).toHaveBeenCalledWith({ welcomeCompleted: true });
    expect(window.localStorage.getItem(privateBetaOnboardingStorageKey)).toBe("dismissed");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set up CodePawl" })).not.toBeInTheDocument());

    unmount();
    render(<App />);

    expect(screen.queryByRole("dialog", { name: "Set up CodePawl" })).not.toBeInTheDocument();
  });

  it("keeps setup and private-beta status out of settings", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);

    const settings = openSettings();

    expect(within(settings).queryByRole("region", { name: "Private beta status checklist" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("button", { name: "Setup" })).not.toBeInTheDocument();
    expect(within(settings).queryByText("Codex connection readiness")).not.toBeInTheDocument();
    expect(within(settings).queryByText("Browser, desktop, files, terminal, cloud, and billing unavailable")).not.toBeInTheDocument();
  });

  it("renders local-beta billing without fake paid invoices", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);

    const settings = openSettings();
    const settingsNav = within(settings).getByRole("navigation", { name: "Settings sections" });
    fireEvent.click(within(settingsNav).getByRole("button", { name: "Billing" }));

    expect(within(settings).getByRole("heading", { name: "Free plan" })).toBeInTheDocument();
    expect(within(settings).getByText("Local beta access")).toBeInTheDocument();
    expect(within(settings).getByText("No invoices yet.")).toBeInTheDocument();
    expect(within(settings).queryByText("Paid")).not.toBeInTheDocument();
  });

  it("blocks repository submission until onboarding and repository path are ready", async () => {
    const createRunSpy = vi.spyOn(codepawl, "createRun");
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss set up CodePawl/i }));

    fireEvent.change(screen.getByRole("textbox", { name: "Repository path" }), {
      target: { value: "/home/operator/project" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), {
      target: { value: "Run before onboarding" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Finish private beta onboarding before starting a repository run.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Repository task message" })).toHaveValue("Run before onboarding");
    expect(screen.queryByText("Run before onboarding", { selector: ".chat-bubble p" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Set up CodePawl" })).toBeInTheDocument();
    expect(createRunSpy).not.toHaveBeenCalled();

    unmount();
    dismissPrivateBetaOnboarding();
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), {
      target: { value: "Run without repository path" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Repository path" }), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Select a local git repository path before starting a repository run.")).toBeInTheDocument();
    expect(createRunSpy).not.toHaveBeenCalled();
  });

  it("blocks real repository submission when Codex connection setup is missing", async () => {
    const createRunSpy = vi.spyOn(codepawl, "createRun");
    dismissPrivateBetaOnboarding();
    vi.spyOn(codepawl, "getSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "",
      welcomeCompleted: true,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    }));

    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Repository path" }), {
      target: { value: "/home/operator/project" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Repository task message" }), {
      target: { value: "Run without Codex connection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Choose a provider and run the provider check before real repository runs.")).toBeInTheDocument();
    expect(createRunSpy).not.toHaveBeenCalled();
  });

  it("does not reuse deleted thread ids or overwrite an existing thread conversation", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);
    fillRepositoryPath();

    const spaces = screen.getByRole("navigation", { name: "Threads" });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const threadThreeComposer = screen.getByRole("form", { name: "Thread composer" });
    fireEvent.change(within(threadThreeComposer).getByRole("textbox", { name: "Repository task message" }), {
      target: { value: "Thread three preserved message" },
    });
    fireEvent.click(within(threadThreeComposer).getByRole("button", { name: "Send task" }));
    expect(await screen.findByText("Thread three preserved message")).toBeInTheDocument();

    const newThreadButtons = within(spaces).getAllByRole("button", { name: "New thread" });
    fireEvent.click(newThreadButtons[1]);
    fireEvent.click(within(spaces).getAllByRole("button", { name: "Thread options for New thread" })[1]);
    fireEvent.click(within(screen.getByRole("menu", { name: "Thread options for New thread" })).getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete thread" })).getByRole("button", { name: "Delete thread" }));

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.queryByText("Thread three preserved message")).not.toBeInTheDocument();

    const restoredThreadThreeButton = within(spaces).getAllByRole("button", { name: "New thread" })[1];
    fireEvent.click(restoredThreadThreeButton);
    expect(await screen.findByText("Thread three preserved message")).toBeInTheDocument();
  });

  it("keeps long user input inside the compact user bubble", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);
    fillRepositoryPath();

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    const composer = screen.getByRole("form", { name: "Thread composer" });
    const input = within(composer).getByRole("textbox", { name: "Repository task message" });
    const send = within(composer).getByRole("button", { name: "Send task" });
    const longMessage = "kjhiyoyuoohou".repeat(12);

    fireEvent.change(input, { target: { value: longMessage } });
    fireEvent.click(send);

    const messageText = await within(thread).findByText(longMessage, { selector: ".chat-bubble p" });
    const bubble = messageText.closest("article");
    expect(bubble).toHaveClass("chat-bubble-user");
    expect(bubble).toHaveClass("chat-bubble-width-compact");
    expect(bubble?.closest(".message-block")).toHaveClass("message-block-user");
    expect(screen.getByRole("region", { name: "Thread conversation" })).toBe(thread);
  });

  it("renders local-only mocked agent response actions and cited sources", async () => {
    render(<App seedDemoThread />);

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    const agentResponse = within(thread).getByRole("article", { name: "Agent response" });
    const actionRail = within(agentResponse).getByRole("toolbar", { name: "Agent response actions" });

    expect(within(actionRail).getByRole("button", { name: "Copy response" })).toBeInTheDocument();
    expect(within(actionRail).queryByRole("button", { name: "Reply to response" })).not.toBeInTheDocument();
    expect(within(actionRail).getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "false");
    expect(within(actionRail).getByRole("button", { name: "Share response" })).toBeInTheDocument();
    expect(within(actionRail).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(within(actionRail).getByRole("button", { name: "Show sources" })).toHaveAttribute("aria-expanded", "false");
    expect(within(actionRail).getByRole("button", { name: "More response actions" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(within(actionRail).getByRole("button", { name: "Copy response" }));
    expect(within(actionRail).getByRole("button", { name: "Copied response" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(actionRail).getByRole("button", { name: "Good response" }));
    expect(within(actionRail).getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(actionRail).getByRole("button", { name: "Bad response" }));
    expect(within(actionRail).getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(actionRail).getByRole("button", { name: "Share response" }));
    expect(within(actionRail).getByRole("button", { name: "Shared response" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(actionRail).getByRole("button", { name: "Show sources" }));
    expect(within(actionRail).getByRole("button", { name: "Hide sources" })).toHaveAttribute("aria-expanded", "true");
    expect(within(actionRail).getByRole("button", { name: "Hide sources" })).toHaveAttribute("aria-controls", "agent-response-sources-panel");
    expect(screen.getByRole("main")).toHaveClass("app-shell-sources-open");
    expect(screen.getByRole("main")).not.toHaveClass("app-shell-sources-closed");
    const sources = screen.getByRole("region", { name: "Sources" });
    expect(sources).toHaveClass("agent-response-sources-panel");
    expect(sources).toHaveAttribute("id", "agent-response-sources-panel");
    expect(agentResponse).not.toContainElement(sources);
    expect(sources.closest(".app-shell")).not.toBeNull();
    expect(sources.closest('[role="toolbar"]')).toBeNull();
    expect(within(sources).getByText("OpenAI Docs")).toBeInTheDocument();
    expect(within(sources).getByText("Model behavior reference")).toBeInTheDocument();
    const openAiSourceLink = within(sources).getByRole("link", { name: "Open OpenAI Docs source" });
    expect(openAiSourceLink).toHaveAttribute("href", "https://platform.openai.com/docs");
    expect(openAiSourceLink).toHaveAttribute("target", "_blank");
    expect(openAiSourceLink).toHaveAttribute("rel", "noreferrer");
    fireEvent.click(within(sources).getByRole("button", { name: "Close sources" }));
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("app-shell-sources-closed");
    expect(screen.getByRole("main")).not.toHaveClass("app-shell-sources-open");
    fireEvent.click(within(actionRail).getByRole("button", { name: "Show sources" }));

    fireEvent.click(within(actionRail).getByRole("button", { name: "More response actions" }));
    const menu = within(agentResponse).getByRole("menu", { name: "More response actions" });
    const moreAction = menu.closest(".agent-response-more-action");
    expect(moreAction).not.toBeNull();
    expect(moreAction).toContainElement(within(actionRail).getByRole("button", { name: "More response actions" }));
    expect(menu.parentElement).toBe(moreAction);
    expect(menu.parentElement).not.toBe(actionRail);
    expect(within(menu).getByRole("menuitem", { name: "Branch in new thread" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Read aloud" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Read aloud" }));
    fireEvent.click(within(actionRail).getByRole("button", { name: "More response actions" }));
    expect(within(agentResponse).getByRole("menuitem", { name: "Stop reading aloud" })).toHaveAttribute("aria-pressed", "true");
  });

  it("quotes selected agent response text from the floating reply action", () => {
    render(<App seedDemoThread />);

    const agentResponse = screen.getByRole("article", { name: "Agent response" });
    const responseText = within(agentResponse).getByText("Candidate repository rule from verified correction");
    const threadHeading = screen.getByRole("heading", { level: 1, name: "Draft" });

    expect(within(agentResponse).queryByRole("toolbar", { name: "Selected text actions" })).not.toBeInTheDocument();

    selectTextInside(threadHeading, 0, 5);
    fireEvent.mouseUp(threadHeading);
    expect(within(agentResponse).queryByRole("toolbar", { name: "Selected text actions" })).not.toBeInTheDocument();

    selectTextInside(responseText, 0, "Candidate repository".length);
    fireEvent.mouseUp(responseText);
    const selectionActions = within(agentResponse).getByRole("toolbar", { name: "Selected text actions" });
    fireEvent.click(within(selectionActions).getByRole("button", { name: "Reply to selected text" }));

    const composer = screen.getByRole("form", { name: "Thread composer" });
    expect(within(composer).getByRole("textbox", { name: "Repository task message" })).toHaveValue('Replying to Agent response: "Candidate repository"');
    expect(within(agentResponse).queryByRole("toolbar", { name: "Selected text actions" })).not.toBeInTheDocument();
  });

  it("keeps retry and branch response actions local to the mock thread UI", async () => {
    render(<App seedDemoThread />);

    let agentResponse = screen.getByRole("article", { name: "Agent response" });
    let actionRail = within(agentResponse).getByRole("toolbar", { name: "Agent response actions" });

    fireEvent.click(within(actionRail).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Regenerated mock response for Candidate repository rule from verified correction")).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: "Agent response" })).toHaveLength(2);

    agentResponse = screen.getAllByRole("article", { name: "Agent response" })[0];
    actionRail = within(agentResponse).getByRole("toolbar", { name: "Agent response actions" });
    fireEvent.click(within(actionRail).getByRole("button", { name: "More response actions" }));
    fireEvent.click(within(agentResponse).getByRole("menuitem", { name: "Branch in new thread" }));

    expect(screen.getByRole("heading", { level: 1, name: "Branch 2" })).toBeInTheDocument();
    expect(screen.getByText("Branched from Candidate repository rule from verified correction")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Threads" })).getByRole("button", { name: "Branch 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("centers the empty thread start composer and keeps its controls real", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    expect(thread).toHaveClass("thread-empty");
    expect(within(thread).getByRole("status", { name: "Setup required" })).toBeInTheDocument();
    expect(within(thread).getByText("Select a local git repository path before starting a repository run.")).toBeInTheDocument();
    expect(within(thread).getByRole("button", { name: "Open setup" })).toBeInTheDocument();
    expect(within(thread).getAllByText("Draft thread.")).toHaveLength(1);

    const composer = within(thread).getByRole("form", { name: "Thread composer" });
    expect(composer).toHaveClass("composer-start");
    expect(composer).toHaveClass("composer-scale-normal");
    expect(composer.querySelector(".composer-toolbar")).not.toBeNull();
    expect(within(composer).queryByText("Coding Apprentice")).not.toBeInTheDocument();
    const addContent = within(composer).getByRole("button", { name: "Add content" });
    expect(addContent.querySelector("svg")).not.toBeNull();
    const expandComposer = within(composer).getByRole("button", { name: "Expand composer" });
    expect(expandComposer).toHaveAttribute("aria-pressed", "false");
    expect(expandComposer.querySelector("svg")).not.toBeNull();
    fireEvent.click(expandComposer);
    expect(composer).toHaveClass("composer-scale-full");
    const collapseComposer = within(composer).getByRole("button", { name: "Collapse composer" });
    expect(collapseComposer).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(collapseComposer);
    expect(composer).toHaveClass("composer-scale-normal");
    expect(within(composer).getByRole("button", { name: "Permission mode" })).toHaveTextContent("Safe");
    expect(within(composer).queryByRole("button", { name: /microphone/i })).not.toBeInTheDocument();

    fireEvent.click(addContent);
    const contentMenu = within(composer).getByRole("menu", { name: "Add content options" });
    expect(contentMenu).toHaveClass("composer-attachment-menu-dropdown");
    expect(within(contentMenu).getByRole("menuitem", { name: "Add files or photos" })).toBeDisabled();
    expect(within(contentMenu).queryByText("Ctrl+U")).not.toBeInTheDocument();
    expect(within(contentMenu).getByRole("menuitem", { name: "Take a screenshot" })).toBeDisabled();
    expect(within(contentMenu).getByRole("menuitem", { name: "Add to project" })).toHaveAttribute("aria-haspopup", "menu");
    expect(within(contentMenu).getByRole("menuitem", { name: "Add from GitHub" })).toBeDisabled();
    expect(within(contentMenu).getByRole("menuitem", { name: "Skills" })).toHaveAttribute("aria-haspopup", "menu");
    expect(within(contentMenu).getByRole("menuitem", { name: "Connectors" })).toHaveAttribute("aria-haspopup", "menu");
    expect(within(contentMenu).getByRole("menuitem", { name: "Add plugins..." })).toBeInTheDocument();
    expect(within(contentMenu).getByRole("menuitemcheckbox", { name: "Web search" })).toHaveAttribute("aria-checked", "false");
    expect(within(contentMenu).getByRole("menuitemcheckbox", { name: "Web search" })).toBeDisabled();
    expect(within(contentMenu).getAllByText("Unavailable in beta")).toHaveLength(4);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(composer).queryByRole("menu", { name: "Add content options" })).not.toBeInTheDocument();

    fireEvent.click(within(composer).getByRole("button", { name: "Permission mode" }));
    const modeMenu = within(composer).getByRole("menu", { name: "Permission mode options" });
    expect(modeMenu).toHaveClass("composer-meta-menu-dropdown");
    expect(within(modeMenu).getByRole("menuitemradio", { name: "Safe" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(modeMenu).getByRole("menuitemradio", { name: "Ask first" }));
    expect(within(composer).getByRole("button", { name: "Permission mode" })).toHaveTextContent("Ask first");
    expect(within(composer).queryByRole("menu", { name: "Permission mode options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    fillRepositoryPath();
    const textarea = within(composer).getByRole("textbox", { name: "Repository task message" });
    const send = within(composer).getByRole("button", { name: "Send task" });
    fireEvent.change(textarea, { target: { value: "Plan a focused test pass" } });
    expect(send).not.toBeDisabled();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(textarea).toHaveValue("Plan a focused test pass\n");
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(await screen.findByText("Plan a focused test pass")).toBeInTheDocument();
    const activeThread = screen.getByRole("region", { name: "Thread conversation" });
    expect(activeThread).not.toHaveClass("thread-empty");
    expect(screen.queryByText("Ready for the next run")).not.toBeInTheDocument();
    expect(within(activeThread).getByRole("button", { name: "Send task" })).toBeDisabled();
  });

  it("places the composer permission menu as a dropdown or dropup from viewport space", () => {
    render(<App />);

    const composer = screen.getByRole("form", { name: "Thread composer" });
    const metaButton = within(composer).getByRole("button", { name: "Permission mode" });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 760 });

    mockElementRect(metaButton, { top: 80, bottom: 112, left: 520, right: 600, width: 80, height: 32 });
    fireEvent.click(metaButton);
    expect(within(composer).getByRole("menu", { name: "Permission mode options" })).toHaveClass("composer-meta-menu-dropdown");

    fireEvent.click(metaButton);
    mockElementRect(metaButton, { top: 710, bottom: 742, left: 520, right: 600, width: 80, height: 32 });
    fireEvent.click(metaButton);
    expect(within(composer).getByRole("menu", { name: "Permission mode options" })).toHaveClass("composer-meta-menu-dropup");
  });

  it("places the composer attachment menu as a dropdown or dropup from viewport space", () => {
    render(<App />);

    const composer = screen.getByRole("form", { name: "Thread composer" });
    const addContent = within(composer).getByRole("button", { name: "Add content" });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 760 });

    mockElementRect(addContent, { top: 80, bottom: 112, left: 80, right: 112, width: 32, height: 32 });
    fireEvent.click(addContent);
    expect(within(composer).getByRole("menu", { name: "Add content options" })).toHaveClass("composer-attachment-menu-dropdown");

    fireEvent.click(addContent);
    mockElementRect(addContent, { top: 710, bottom: 742, left: 80, right: 112, width: 32, height: 32 });
    fireEvent.click(addContent);
    expect(within(composer).getByRole("menu", { name: "Add content options" })).toHaveClass("composer-attachment-menu-dropup");
  });

  it("closes the composer permission menu from Escape and outside clicks", () => {
    render(<App />);

    const composer = screen.getByRole("form", { name: "Thread composer" });
    const metaButton = within(composer).getByRole("button", { name: "Permission mode" });
    fireEvent.click(metaButton);
    expect(within(composer).getByRole("menu", { name: "Permission mode options" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(composer).queryByRole("menu", { name: "Permission mode options" })).not.toBeInTheDocument();

    fireEvent.click(metaButton);
    fireEvent.pointerDown(screen.getByRole("region", { name: "Thread conversation" }));
    expect(within(composer).queryByRole("menu", { name: "Permission mode options" })).not.toBeInTheDocument();
  });

  it("closes the composer attachment menu from Escape, outside clicks, and permission menu changes", () => {
    render(<App />);

    const composer = screen.getByRole("form", { name: "Thread composer" });
    const addContent = within(composer).getByRole("button", { name: "Add content" });
    const metaButton = within(composer).getByRole("button", { name: "Permission mode" });
    fireEvent.click(addContent);
    expect(within(composer).getByRole("menu", { name: "Add content options" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(composer).queryByRole("menu", { name: "Add content options" })).not.toBeInTheDocument();

    fireEvent.click(addContent);
    fireEvent.pointerDown(screen.getByRole("region", { name: "Thread conversation" }));
    expect(within(composer).queryByRole("menu", { name: "Add content options" })).not.toBeInTheDocument();

    fireEvent.click(addContent);
    fireEvent.click(metaButton);
    expect(within(composer).queryByRole("menu", { name: "Add content options" })).not.toBeInTheDocument();
    expect(within(composer).getByRole("menu", { name: "Permission mode options" })).toBeInTheDocument();

    fireEvent.click(metaButton);
    fireEvent.click(addContent);
    expect(within(composer).queryByRole("menu", { name: "Permission mode options" })).not.toBeInTheDocument();
    expect(within(composer).getByRole("menu", { name: "Add content options" })).toBeInTheDocument();
  });

  it("opens thread actions for rename, archive restore, and delete confirmation", () => {
    render(<App />);

    const spaces = screen.getByRole("navigation", { name: "Threads" });
    const draftRow = within(spaces).getByRole("button", { name: "Draft" }).closest(".workspace-row");
    expect(draftRow).toBeInstanceOf(HTMLElement);
    fireEvent.doubleClick(draftRow as HTMLElement);
    const doubleClickRenameInput = screen.getByRole("textbox", { name: "Rename Draft thread" });
    fireEvent.change(doubleClickRenameInput, { target: { value: "Engineering" } });
    fireEvent.keyDown(doubleClickRenameInput, { key: "Enter" });
    expect(within(spaces).getByRole("button", { name: "Engineering" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();

    fireEvent.click(within(spaces).getByRole("button", { name: "Thread options for Engineering" }));
    const engineeringMenu = screen.getByRole("menu", { name: "Thread options for Engineering" });
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(within(engineeringMenu).queryByRole("menuitem", { name: "Workspace settings" })).not.toBeInTheDocument();
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Archive" })).toBeDisabled();
    fireEvent.click(within(spaces).getByRole("button", { name: "Thread options for Engineering" }));

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(within(spaces).getByRole("button", { name: "New thread" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(spaces).getByRole("button", { name: "Thread options for New thread" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Thread options for New thread" })).getByRole("menuitem", { name: "Archive" }));
    expect(within(spaces).queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Search threads" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search threads" }), { target: { value: "New thread" } });
    expect(within(spaces).queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search threads" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Open archive" }));
    const archiveDialog = screen.getByRole("dialog", { name: "Archive" });
    expect(within(archiveDialog).getByText("New thread")).toBeInTheDocument();
    fireEvent.click(within(archiveDialog).getByRole("button", { name: "Restore" }));
    expect(screen.queryByRole("dialog", { name: "Archive" })).not.toBeInTheDocument();
    expect(within(spaces).getByRole("button", { name: "New thread" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(spaces).getByRole("button", { name: "Thread options for New thread" }));
    const newThreadMenu = screen.getByRole("menu", { name: "Thread options for New thread" });
    fireEvent.click(within(newThreadMenu).getByRole("menuitem", { name: "Delete" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Delete thread" });
    expect(deleteDialog).toHaveTextContent("New thread");
    expect(screen.queryByRole("menu", { name: "Thread options for New thread" })).not.toBeInTheDocument();
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Cancel" }));
    expect(within(spaces).getByRole("button", { name: "New thread" })).toBeInTheDocument();

    fireEvent.click(within(spaces).getByRole("button", { name: "Thread options for New thread" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Thread options for New thread" })).getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete thread" })).getByRole("button", { name: "Delete thread" }));
    expect(within(spaces).queryByRole("button", { name: "New thread" })).not.toBeInTheDocument();

    fireEvent.click(within(spaces).getByRole("button", { name: "Thread options for Engineering" }));
    expect(within(screen.getByRole("menu", { name: "Thread options for Engineering" })).getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  it("keeps the cockpit mounted while settings only exposes preference tabs", () => {
    render(<App />);

    expect(screen.queryByRole("navigation", { name: "Primary app navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();

    openSettings();
    expect(screen.getByRole("main")).toHaveClass("app-shell-cockpit");
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    expect(screen.getByRole("navigation", { name: "Threads" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Thread conversation" })).toBeInTheDocument();
    const settings = screen.getByRole("dialog", { name: "Settings" });
    const settingsSections = within(settings).getByRole("navigation", { name: "Settings sections" });
    expect(within(settingsSections).getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(within(settingsSections).getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(within(settingsSections).getByRole("button", { name: "Billing" })).toBeInTheDocument();
    expect(within(settingsSections).queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(settings).getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(within(settings).queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Dashboard summary" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.getByRole("main")).toHaveClass("app-shell-cockpit");
    expect(screen.getByRole("region", { name: "Thread conversation" })).toBeInTheDocument();

    openSettings();
    expect(screen.queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("app-shell-cockpit", "app-shell-settings-open");
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Settings" })).toHaveClass("shell-modal-atmospheric");
    expect(screen.getByLabelText("Modal backdrop")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Threads" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Thread conversation" })).toBeInTheDocument();
  });

  it("opens settings from the account menu and closes from the dialog", () => {
    render(<App />);

    const accountToggle = screen.getByRole("button", { name: "Open account menu" });
    fireEvent.click(accountToggle);
    expect(accountToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(screen.getByRole("menu", { name: "Account menu" })).getByRole("menuitem", { name: "Settings" }));
    expect(accountToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    openSettings();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("closes the account menu from Escape, outside pointer, and exposes a configurable logout landing link", () => {
    vi.stubEnv("VITE_CODEPAWL_LANDING_URL", "http://127.0.0.1:5176/");

    expect(getLandingUrl()).toBe("http://127.0.0.1:5176/");

    render(<App />);

    const accountToggle = screen.getByRole("button", { name: "Open account menu" });
    fireEvent.click(accountToggle);
    let accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(within(accountMenu).getByRole("menuitem", { name: "Log out" })).toHaveAttribute("href", "http://127.0.0.1:5176/");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument();
    expect(accountToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(accountToggle);
    accountMenu = screen.getByRole("menu", { name: "Account menu" });
    expect(accountMenu).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("region", { name: "Thread conversation" }));
    expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument();
  });

  it("renders settings as preference rows with account and billing tabs", () => {
    render(<App />);

    const settings = openSettings();
    const search = within(settings).getByRole("textbox", { name: "Search settings" });
    const sections = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(sections).getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");
    expect(within(sections).getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(within(sections).getByRole("button", { name: "Billing" })).toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Setup" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Capabilities" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Connectors" })).not.toBeInTheDocument();

    expect(within(settings).getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(within(settings).getByText("Avatar")).toBeInTheDocument();
    expect(within(settings).getByRole("textbox", { name: "Full name" })).toHaveValue("Operator");
    expect(within(settings).getByRole("textbox", { name: "What should CodePawl call you?" })).toHaveValue("Operator");
    expect(within(settings).getByRole("combobox", { name: "What best describes your work?" })).toHaveDisplayValue("Engineering");
    expect(within(settings).getByRole("group", { name: "Appearance" })).toHaveTextContent("Dark");
    expect(within(settings).getByRole("group", { name: "Appearance" }).querySelectorAll("svg")).toHaveLength(3);
    expect(within(settings).getByRole("combobox", { name: "Chat font" })).toHaveDisplayValue("CodePawl Sans");
    expect(within(settings).getByRole("group", { name: "Motion" })).toHaveTextContent("System");
    expect(within(settings).getByRole("combobox", { name: "Language" })).toHaveDisplayValue("English");
    expect(within(settings).getByRole("combobox", { name: "Style" })).toHaveDisplayValue("Buttery");
    expect(within(settings).getByRole("combobox", { name: "Speed" })).toHaveDisplayValue("Normal");
    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toHaveDisplayValue("Safe");
    const messageLabelsSwitch = within(settings).getByRole("switch", { name: /Show message labels/ });
    expect(messageLabelsSwitch).toHaveAttribute("aria-checked", "false");
    expect(within(messageLabelsSwitch).getByText("Show or hide compact block labels above agent and approval messages.")).toBeInTheDocument();
    expect(within(messageLabelsSwitch).queryByText("hidden")).not.toBeInTheDocument();
    expect(messageLabelsSwitch.querySelector(".surface-switch-icon")).toBeNull();

    fireEvent.click(within(sections).getByRole("button", { name: "Account" }));
    expect(within(settings).getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(within(settings).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(within(settings).getByRole("button", { name: "Delete account" })).toBeDisabled();
    expect(within(settings).getByText("workspace-local-alpha")).toBeInTheDocument();
    expect(within(settings).getByRole("table", { name: "Trusted devices" })).toBeInTheDocument();
    expect(within(settings).getByText("No trusted devices.")).toBeInTheDocument();
    expect(within(settings).getByRole("table", { name: "Active sessions" })).toBeInTheDocument();
    expect(within(settings).getByText("Current")).toBeInTheDocument();

    fireEvent.click(within(sections).getByRole("button", { name: "Billing" }));
    expect(within(settings).getByRole("heading", { name: "Free plan" })).toBeInTheDocument();
    expect(within(settings).getByRole("button", { name: "Upgrade plan" })).toBeDisabled();
    expect(within(settings).getByRole("table", { name: "Invoices" })).toBeInTheDocument();
    expect(within(settings).getByText("No invoices yet.")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "code" } });

    expect(within(sections).queryByRole("button", { name: "General" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Billing" })).not.toBeInTheDocument();
  });

  it("persists editable profile, UI, and voice preferences from settings rows", async () => {
    dismissPrivateBetaOnboarding();
    const updatedSettings = {
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe" as const,
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/project",
      welcomeCompleted: true,
      modelConnection: null,
      codexConnection: null,
      operatorProfile: {
        fullName: "Xuan An",
        callSign: "An",
        workType: "data-science" as const,
      },
      uiPreferences: {
        appearance: "system" as const,
        chatFont: "codepawl-serif" as const,
        motion: "reduced" as const,
        showMessageBlockMeta: true,
      },
      voicePreferences: {
        language: "english" as const,
        style: "buttery" as const,
        speed: "slow" as const,
      },
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    };
    vi.spyOn(codepawl, "getSettings").mockResolvedValue({
      ...updatedSettings,
      operatorProfile: {
        fullName: "Operator",
        callSign: "Operator",
        workType: "engineering",
      },
      uiPreferences: {
        appearance: "dark",
        chatFont: "codepawl-sans",
        motion: "system",
        showMessageBlockMeta: false,
      },
      voicePreferences: {
        language: "english",
        style: "buttery",
        speed: "normal",
      },
    });
    const updateSettingsSpy = vi.spyOn(codepawl, "updateSettings").mockResolvedValue(updatedSettings);

    render(<App />);

    const settings = openSettings();
    fireEvent.change(await within(settings).findByRole("textbox", { name: "Full name" }), { target: { value: "Xuan An" } });
    fireEvent.change(within(settings).getByRole("textbox", { name: "What should CodePawl call you?" }), { target: { value: "An" } });
    fireEvent.change(within(settings).getByRole("combobox", { name: "What best describes your work?" }), { target: { value: "data-science" } });
    fireEvent.click(within(settings).getByRole("button", { name: "Use system appearance" }));
    fireEvent.change(within(settings).getByRole("combobox", { name: "Chat font" }), { target: { value: "codepawl-serif" } });
    fireEvent.click(within(settings).getByRole("button", { name: "Use reduced motion" }));
    fireEvent.change(within(settings).getByRole("combobox", { name: "Speed" }), { target: { value: "slow" } });

    expect(updateSettingsSpy).toHaveBeenCalledWith({ operatorProfile: { fullName: "Xuan An" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ operatorProfile: { callSign: "An" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ operatorProfile: { workType: "data-science" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ uiPreferences: { appearance: "system" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ uiPreferences: { chatFont: "codepawl-serif" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ uiPreferences: { motion: "reduced" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ voicePreferences: { speed: "slow" } });
  });

  it("keeps message block labels hidden by default and restores them from settings", () => {
    render(<App seedDemoThread />);

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    expect(within(thread).queryByText("Agent response")).not.toBeInTheDocument();
    expect(within(thread).queryByText("Approval request")).not.toBeInTheDocument();

    const settings = openSettings();
    const labelSwitch = within(settings).getByRole("switch", { name: /Show message labels/ });
    expect(labelSwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.click(labelSwitch);

    expect(labelSwitch).toHaveAttribute("aria-checked", "true");
    const agentMeta = within(thread).getByText("Agent response");
    const approvalMeta = within(thread).getByText("Approval request");
    expect(agentMeta).toHaveClass("message-block-meta");
    expect(agentMeta.closest(".chat-bubble")).toBeNull();
    expect(agentMeta.closest(".message-block")).toHaveClass("message-block-agent");
    expect(approvalMeta).toHaveClass("message-block-meta");
    expect(approvalMeta.closest(".chat-bubble")).toBeNull();
    expect(approvalMeta.closest(".message-block")).toHaveClass("message-block-approval");
    expect(window.localStorage.getItem("codepawl:message-block-meta-visible:v1")).toBe("true");
  });

  it("persists the message block label display preference", () => {
    window.localStorage.setItem("codepawl:message-block-meta-visible:v1", "true");

    render(<App seedDemoThread />);

    const thread = screen.getByRole("region", { name: "Thread conversation" });
    expect(within(thread).getByText("Agent response")).toHaveClass("message-block-meta");
    expect(within(thread).getByText("Approval request")).toHaveClass("message-block-meta");
    const settings = openSettings();
    expect(within(settings).getByRole("switch", { name: /Show message labels/ })).toHaveAttribute("aria-checked", "true");
  });

  it("navigates the preference-only settings sections", () => {
    render(<App />);

    const settings = openSettings();
    const sections = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(sections).getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");
    expect(within(sections).queryByRole("button", { name: "Capabilities" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "CodePawl Code" })).not.toBeInTheDocument();
    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toHaveDisplayValue("Safe");
    expect(within(settings).queryByRole("region", { name: "Allowed surfaces" })).not.toBeInTheDocument();

    fireEvent.click(within(sections).getByRole("button", { name: "Billing" }));
    expect(within(settings).getByRole("heading", { name: "Free plan" })).toBeInTheDocument();
    expect(within(settings).getByRole("table", { name: "Invoices" })).toBeInTheDocument();

    fireEvent.click(within(sections).getByRole("button", { name: "Account" }));
    expect(within(settings).getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(within(settings).getByRole("table", { name: "Active sessions" })).toBeInTheDocument();
  });

  it("renders run lifecycle events streamed through the client", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);

    const input = screen.getByRole("textbox", { name: "Repository task message" });
    fireEvent.change(screen.getByRole("textbox", { name: "Repository path" }), {
      target: { value: "/home/operator/project" },
    });
    fireEvent.change(input, {
      target: { value: "Fix a failing unit test in the selected repository" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findAllByText("Fix a failing unit test in the selected repository")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Repository task message" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Open run info" })).not.toBeInTheDocument();
    expect(await screen.findByText(/run_event: run_finished/i)).toBeInTheDocument();
  });

  it("sends typed cockpit tasks as unlabeled user chat bubbles", async () => {
    dismissPrivateBetaOnboarding();
    render(<App />);
    fillRepositoryPath();

    const conversation = screen.getByRole("region", { name: "Thread conversation" });
    const composer = screen.getByRole("form", { name: "Thread composer" });
    const input = within(composer).getByRole("textbox", { name: "Repository task message" });
    const send = within(composer).getByRole("button", { name: "Send task" });

    expect(send).toBeDisabled();
    expect(within(conversation).queryByText("Operator")).not.toBeInTheDocument();

    fireEvent.submit(composer);
    expect(within(conversation).queryByText("Operator")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Add validation coverage for repository rules" } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);

    expect(await within(conversation).findByText("Add validation coverage for repository rules")).toBeInTheDocument();
    expect(within(conversation).getByRole("textbox", { name: "Repository task message" })).toHaveValue("");
    expect(within(conversation).queryByText("Operator")).not.toBeInTheDocument();
  });

  it("keeps onboarding and trial cards out of the compact cockpit", () => {
    render(<App seedDemoThread />);

    expect(screen.queryByRole("region", { name: "Product onboarding" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Trial status" })).not.toBeInTheDocument();
    expect(screen.queryByText(/trial runs left/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Local trial/i)).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Agent response" })).queryByText("Succeeded")).not.toBeInTheDocument();
    expect(screen.queryByText(/Local MVP/i)).not.toBeInTheDocument();
  });

  it("lets the general settings pane change permission mode locally", () => {
    render(<App />);

    const settings = openSettings();
    const modeSelector = within(settings).getByRole("combobox", { name: "Permission mode" });

    expect(modeSelector).toHaveDisplayValue("Safe");

    fireEvent.change(modeSelector, { target: { value: "ask-first" } });

    expect(modeSelector).toHaveDisplayValue("Ask first");
  });

  it("keeps executable surfaces out of user preferences settings", () => {
    render(<App />);

    const settings = openSettings();
    expect(within(settings).queryByRole("region", { name: "Allowed surfaces" })).not.toBeInTheDocument();
    expect(within(settings).queryByText("Unavailable in private beta; no browser automation runs from this app.")).not.toBeInTheDocument();
    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toBeInTheDocument();
  });

  it("records approval decisions in the mock cockpit state", async () => {
    render(<App seedDemoThread />);

    fireEvent.click(screen.getByRole("button", { name: "Approve step" }));

    expect(await screen.findByText("Approval approved for approval-submit-1")).toBeInTheDocument();
  });

  it("keeps run info and execution panels out of the compact thread UI", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "Open run info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Run info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Controlled Codex execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mock event stream" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Verifier evidence" })).not.toBeInTheDocument();
  });

  it("closes compact settings modal from Escape and backdrop interactions", () => {
    render(<App />);

    const settings = openSettings();
    fireEvent.keyDown(settings, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    openSettings();
    fireEvent.click(screen.getByLabelText("Modal backdrop"));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Modal backdrop")).not.toBeInTheDocument();
  });

  it("renders a no-run-selected empty state without showing execution controls", () => {
    render(<App initialSelectedRunId={null} />);

    const emptyRun = screen.getByRole("region", { name: "No run selected" });
    expect(within(emptyRun).getByText(/Select a local repository task or start the fake Codex walkthrough/)).toBeInTheDocument();
    expect(within(emptyRun).getByText(/No Codex process runs until an execution plan is approved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Codex execution" })).not.toBeInTheDocument();
  });

  it("keeps queue summaries out of preferences settings", () => {
    render(<App initialRunState={createEmptyMockRunState()} />);
    const settings = openSettings();

    expect(screen.queryByRole("navigation", { name: "Cockpit sections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Memory review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Skill registry" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Thread queues" })).not.toBeInTheDocument();
  });

  it("does not expose memory rule and skill queues from settings", async () => {
    const runState = createMockRunState();
    const updateRuleSpy = vi.spyOn(codepawl, "updateCandidateRuleStatus").mockResolvedValue({
      ...runState.memoryReview.candidateRules[0],
      status: "accepted",
    });
    const promoteSkillSpy = vi.spyOn(codepawl, "promoteSkillManually").mockResolvedValue({
      ...runState.skillRegistry.skills[0],
      status: "active",
    });
    render(<App initialRunState={runState} />);

    const settings = openSettings();
    expect(within(settings).queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Memory review" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Skill registry" })).not.toBeInTheDocument();
    expect(updateRuleSpy).not.toHaveBeenCalled();
    expect(promoteSkillSpy).not.toHaveBeenCalled();
  });
});
