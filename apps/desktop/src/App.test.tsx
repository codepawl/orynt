/// <reference types="node" />
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "bun:test";
import type { ReactElement } from "react";
import {
  createMockRunState,
  type MockRunState,
  type RunEvent,
} from "@codepawl/shared";

import App, { OryntDropdown } from "./App";
import { orynt } from "./oryntClient";
import type { CodexConnectionPreflightResult, ModelCatalogResult, ModelConnectionReference, PersistedRunRecord, SettingsSnapshot } from "./oryntClient";

const privateBetaOnboardingStorageKey = "orynt:private-beta-onboarding:v1";
const legacyPrivateBetaOnboardingStorageKey = "codepawl:private-beta-onboarding:v1";
const messageBlockMetaStorageKey = "orynt:message-block-meta-visible:v1";
const legacyMessageBlockMetaStorageKey = "codepawl:message-block-meta-visible:v1";
const modelsDevProviderCatalogStoragePrefix = "orynt:models-dev-provider-catalog:v1:";

async function flushApp(): Promise<void> {
  await act(async () => {
    for (let pass = 0; pass < 8; pass += 1) {
      await Bun.sleep(0);
    }
  });
}

async function renderApp(element: ReactElement = <App />) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(element);
    for (let pass = 0; pass < 8; pass += 1) {
      await Bun.sleep(0);
    }
  });
  return result!;
}

function withPreferenceSettings(
  settings: Omit<SettingsSnapshot, "thinkingEffort" | "operatorProfile" | "uiPreferences" | "voicePreferences" | "modelConnection"> &
    Partial<Pick<SettingsSnapshot, "thinkingEffort" | "operatorProfile" | "uiPreferences" | "voicePreferences" | "modelConnection">>,
): SettingsSnapshot {
  return {
    ...settings,
    thinkingEffort: settings.thinkingEffort ?? "medium",
    modelConnection: settings.modelConnection ?? null,
    operatorProfile: settings.operatorProfile ?? {
      fullName: "Operator",
      callSign: "Operator",
      workType: "engineering",
    },
    uiPreferences: settings.uiPreferences ?? {
      appearance: "dark",
      chatFont: "orynt-sans",
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

function readyModelSettings(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return withPreferenceSettings({
    workspaceId: "workspace-local-alpha",
    permissionMode: "safe",
    executableSurfaces: ["repository"],
    blockedSurfaces: ["browser", "desktop", "files", "terminal"],
    defaultRepositoryPath: "",
    welcomeCompleted: true,
    codexConnection: {
      connectionId: "codex-cli",
      label: "Local Codex CLI",
      status: "ready",
      lastPreflight: {
        checkedConnectionId: "codex-cli",
        status: "ready",
        ready: true,
        checkedAt: "2026-07-05T00:00:00.000Z",
        executablePath: "/usr/local/bin/codex",
        authMode: "chatgpt",
        reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
        warnings: [],
      },
    },
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
      status: "ready",
      lastPreflight: {
        checkedProviderId: "codex-cli",
        checkedModelId: "gpt-5.5",
        status: "ready",
        ready: true,
        checkedAt: "2026-07-05T00:00:00.000Z",
        executablePath: "/usr/local/bin/codex",
        authMode: "chatgptOAuth",
        reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
        warnings: [],
      },
    },
    ...overrides,
  });
}

function mockReadyModelSettings(overrides: Partial<SettingsSnapshot> = {}) {
  vi.spyOn(orynt, "getSettings").mockResolvedValue(readyModelSettings(overrides));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectSetupDropdownOption(scope: HTMLElement, label: string, optionLabel: string) {
  const dropdown = within(scope).getByRole("combobox", { name: label });
  fireEvent.click(dropdown);
  const listbox = within(scope).getByRole("listbox", { name: `${label} options` });
  fireEvent.click(within(listbox).getByRole("option", { name: new RegExp(`^${escapeRegExp(optionLabel)}`) }));
  return within(scope).getByRole("combobox", { name: label });
}

function pointerSelectSetupDropdownOption(scope: HTMLElement, label: string, optionLabel: string) {
  const dropdown = within(scope).getByRole("combobox", { name: label });
  fireEvent.click(dropdown);
  const listbox = within(scope).getByRole("listbox", { name: `${label} options` });
  fireEvent.pointerDown(within(listbox).getByRole("option", { name: new RegExp(`^${escapeRegExp(optionLabel)}`) }));
  return within(scope).getByRole("combobox", { name: label });
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
  fireEvent.click(screen.getByRole("button", { name: "Open local settings" }));
  return screen.getByRole("dialog", { name: "Settings" });
}

function dismissPrivateBetaOnboarding() {
  window.localStorage.setItem(privateBetaOnboardingStorageKey, "dismissed");
}

async function fillRepositoryPath(path = "/home/operator/project") {
  vi.spyOn(orynt, "browseRepositoryPath").mockResolvedValueOnce({ status: "selected", path });
  const changeDirectoryButton = screen.getAllByRole("button", { name: "Change directory" })[0];
  fireEvent.click(changeDirectoryButton);
  await waitFor(() => expect(screen.getByLabelText("Directory path")).toHaveTextContent(path));
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("Orynt desktop shell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMobileViewport(false);
    installLocalStorageMock();
    window.localStorage.clear();
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("Network disabled in tests."),
    ) as unknown as typeof fetch;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue(readyModelSettings().modelConnection!.lastPreflight!);
  });

  it("starts the first supervised task blank with setup in a popup and keeps repository scope as a beta limitation", async () => {
    await renderApp(<App />);

    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(thread).getByRole("heading", { name: "New task" })).toBeInTheDocument();
    expect(within(thread).queryByText("Controlled repository runtime only. Browser automation is unavailable in this private beta.")).not.toBeInTheDocument();
    expect(within(thread).queryByText("Verifier evidence stays separate from result import.")).not.toBeInTheDocument();
    expect(within(thread).queryByRole("article", { name: "Agent response" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("article", { name: "Approval request" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("region", { name: "Setup guide" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("heading", { name: "Set up Orynt" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("status", { name: "Setup required" })).not.toBeInTheDocument();
    expect(within(thread).queryByRole("button", { name: "Open setup" })).not.toBeInTheDocument();
    const setupDialog = screen.getByRole("dialog", { name: "Set up Orynt" });
    expect(within(setupDialog).queryByRole("heading", { name: "Set up Orynt" })).not.toBeInTheDocument();
    expect(setupDialog.querySelectorAll("#setup-dialog-title")).toHaveLength(1);
    expect(within(setupDialog).queryByRole("heading", { name: "Setup controls" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("region", { name: "Setup controls" })).toBeInTheDocument();
    expect(within(setupDialog).getByRole("button", { name: "Complete setup" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Save setup settings" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByText(/Choose where Orynt may act, choose a model provider/i)).toBeInTheDocument();
    expect(within(setupDialog).getByText(/This beta is limited to the selected local directory/i)).toBeInTheDocument();
    expect(within(thread).getByRole("form", { name: "Task composer" })).toBeInTheDocument();
    expect(within(thread).getByRole("textbox", { name: "Task for Orynt" })).toHaveValue("");
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
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(updatedSettings);

    await renderApp(<App />);

    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    expect(within(setupDialog).queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("heading", { name: "Set up Orynt" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("heading", { name: "Setup controls" })).not.toBeInTheDocument();
    const repositoryPath = within(setupDialog).getByRole("textbox", { name: "Default local directory" });
    fireEvent.change(repositoryPath, { target: { value: "/home/operator/project" } });
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Complete setup" }));

    expect(updateSettingsSpy).toHaveBeenCalledWith({ defaultRepositoryPath: "/home/operator/project" });
    await waitFor(() => expect(screen.getByLabelText("Directory path")).toHaveTextContent("/home/operator/project"));
  });

  it("persists the current directory path when the setup directory field is empty", async () => {
    const updatedSettings = withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe" as const,
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/current-project",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    });
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
      ...updatedSettings,
      defaultRepositoryPath: "",
    }));
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(updatedSettings);

    await renderApp(<App />);

    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    const setupRepositoryPath = within(setupDialog).getByRole("textbox", { name: "Default local directory" });
    expect(setupRepositoryPath).toHaveValue("");

    await fillRepositoryPath("/home/operator/current-project");
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Complete setup" }));

    expect(updateSettingsSpy).toHaveBeenCalledWith({ defaultRepositoryPath: "/home/operator/current-project" });
    await waitFor(() => expect(setupRepositoryPath).toHaveValue("/home/operator/current-project"));
  });

  it("shows an inline setup save error when persistence fails", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "updateSettings").mockRejectedValue(new Error("Settings store is unavailable."));

    await renderApp(<App />);

    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    fireEvent.change(within(setupDialog).getByRole("textbox", { name: "Default local directory" }), {
      target: { value: "/home/operator/project" },
    });
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Complete setup" }));

    await waitFor(() => expect(within(setupDialog).getByText("Settings store is unavailable.")).toBeInTheDocument());
    expect(within(setupDialog).getByRole("button", { name: "Complete setup" })).not.toBeDisabled();
  });

  it("detects, persists, and browses local directories without silently replacing them", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    const detectRepositorySpy = vi.spyOn(orynt, "detectCurrentRepositoryPath").mockResolvedValue("/home/operator/detected-repo");
    const browseRepositorySpy = vi.spyOn(orynt, "browseRepositoryPath").mockResolvedValue({
      status: "selected",
      path: "/home/operator/browsed-repo",
    });
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockImplementation(async (input) =>
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

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    const repositoryPath = within(setupDialog).getByRole("textbox", { name: "Default local directory" });

    await waitFor(() => expect(repositoryPath).toHaveValue("/home/operator/detected-repo"));
    expect(detectRepositorySpy).toHaveBeenCalled();
    await waitFor(() => expect(updateSettingsSpy).toHaveBeenCalledWith({ defaultRepositoryPath: "/home/operator/detected-repo" }));

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(repositoryPath).toHaveValue("/home/operator/browsed-repo"));
    expect(browseRepositorySpy).toHaveBeenCalledWith("/home/operator/detected-repo");
    expect(updateSettingsSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Complete setup" }));
    await waitFor(() =>
      expect(updateSettingsSpy).toHaveBeenCalledWith({
        defaultRepositoryPath: "/home/operator/browsed-repo",
      }),
    );
    await flushApp();
  });

  it("shows a cancellation message when native directory browsing is cancelled", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/existing-repo",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
    }));
    vi.spyOn(orynt, "browseRepositoryPath").mockResolvedValue({ status: "cancelled" });
    const detectRepositorySpy = vi.spyOn(orynt, "detectCurrentRepositoryPath").mockResolvedValue("/home/operator/detected-repo");

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    const repositoryPath = within(setupDialog).getByRole("textbox", { name: "Default local directory" });

    await waitFor(() => expect(repositoryPath).toHaveValue("/home/operator/existing-repo"));
    expect(detectRepositorySpy).not.toHaveBeenCalled();
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Browse" }));

    await waitFor(() => expect(within(setupDialog).getByText("No local directory was selected.")).toBeInTheDocument());
    expect(repositoryPath).toHaveValue("/home/operator/existing-repo");
  });

  it("explains that native directory browsing is unavailable in web preview", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "browseRepositoryPath").mockResolvedValue({
      status: "unavailable",
      reason: "not-tauri",
      message: "Native folder picker is only available in the Orynt desktop app. Open the Tauri window or paste the local path manually.",
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    const repositoryPath = within(setupDialog).getByRole("textbox", { name: "Default local directory" });

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Browse" }));

    await waitFor(() =>
      expect(
        within(setupDialog).getByText("Native folder picker is only available in the Orynt desktop app. Open the Tauri window or paste the local path manually."),
      ).toBeInTheDocument(),
    );
    expect(repositoryPath).toHaveValue("");
  });

  it("renders an icon-only composer directory picker and updates the path without setup text", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const browseRepositorySpy = vi.spyOn(orynt, "browseRepositoryPath").mockResolvedValue({
      status: "selected",
      path: "/new/path",
    });

    await renderApp(<App />);
    await fillRepositoryPath("/current/path");

    const composer = screen.getByRole("form", { name: "Task composer" });
    await waitFor(() => expect(document.querySelector(".thread-start-copy h2")).toBeInTheDocument());
    const threadStart = document.querySelector(".thread-start") as HTMLElement | null;
    if (!threadStart) {
      throw new Error("Expected the empty task setup copy to render.");
    }
    const startHeading = threadStart.querySelector(".thread-start-copy h2");
    const startDescription = threadStart.querySelector(".thread-start-copy p");
    expect([
      "Start a supervised task",
      "Tell Orynt what to do",
      "Plan, act, verify",
      "Keep actions reviewable",
      "Use the current surface",
    ]).toContain(startHeading?.textContent?.trim());
    expect(startDescription?.textContent).toMatch(/task|surface|directory|evidence|approval|verify/);

    const repositoryPathControl = composer.querySelector(".composer-repository-path");
    if (!(repositoryPathControl instanceof HTMLElement)) {
      throw new Error("Expected the composer directory control to render.");
    }
    const changeDirectoryButton = within(repositoryPathControl).getByRole("button", { name: "Change directory" });
    expect(within(repositoryPathControl).queryByText(/^Directory$/)).not.toBeInTheDocument();
    expect(repositoryPathControl.querySelector("label")).toBeNull();
    expect(changeDirectoryButton).toHaveAttribute("title", "Change directory");
    expect(changeDirectoryButton.textContent).toBe("");
    expect(changeDirectoryButton.querySelector(".ui-icon")).not.toBeNull();

    fireEvent.click(changeDirectoryButton);

    expect(browseRepositorySpy).toHaveBeenCalledWith("/current/path");
    await waitFor(() => expect(within(composer).getByLabelText("Directory path")).toHaveTextContent("/new/path"));
    expect(within(repositoryPathControl).queryByRole("textbox", { name: "Directory path" })).not.toBeInTheDocument();
    expect(within(threadStart).queryByText("Setup blocked")).not.toBeInTheDocument();
    expect(within(threadStart).queryByText("Directory updated.")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Setup required" })).not.toBeInTheDocument();
  });

  it("opens compact quick dropdowns and auto-saves changed model and thinking effort choices", async () => {
    const initialSettings = readyModelSettings();
    const initialConnection = initialSettings.modelConnection!;
    const savedConnection: ModelConnectionReference = {
      ...initialConnection,
      modelId: "gpt-5.5-turbo",
      modelLabel: "GPT-5.5 Turbo",
    };
    const savedSettings = readyModelSettings({ modelConnection: savedConnection });
    vi.spyOn(orynt, "getSettings").mockResolvedValueOnce(initialSettings).mockResolvedValueOnce(initialSettings).mockResolvedValue(savedSettings);
    dismissPrivateBetaOnboarding();
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(readyModelSettings({ thinkingEffort: "high" }));
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue(initialSettings.codexConnection!.lastPreflight!);
    window.localStorage.setItem(
      `${modelsDevProviderCatalogStoragePrefix}codex-cli`,
      JSON.stringify({
        providerId: "codex-cli",
        fetchedAt: new Date().toISOString(),
        models: [
          { id: "gpt-5.5", label: "GPT-5.5", source: "codex-cli" },
          { id: "gpt-5.5-turbo", label: "GPT-5.5 Turbo", source: "codex-cli" },
        ],
      }),
    );
    const saveModelConnectionSpy = vi.spyOn(orynt, "saveModelConnection").mockResolvedValue(savedConnection);
    vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue({
      ...initialConnection.lastPreflight!,
      checkedModelId: "gpt-5.5-turbo",
    });

    await renderApp(<App />);

    const composer = screen.getByRole("form", { name: "Task composer" });
    const modelButton = within(composer).getByRole("button", { name: /Change model/ });
    const effortButton = within(composer).getByRole("button", { name: /Change thinking effort/ });
    await flushApp();
    expect(modelButton).toHaveTextContent("GPT-5.5");
    expect(effortButton).toHaveTextContent("Medium");
    expect(modelButton.querySelector("small")).toBeNull();
    expect(effortButton.querySelector("small")).toBeNull();

    fireEvent.click(modelButton);
    let modelMenu = await screen.findByRole("menu", { name: "Choose model" });
    expect(modelButton).toHaveAttribute("aria-expanded", "true");
    expect(within(modelMenu).queryByRole("button", { name: "Refresh available models" })).not.toBeInTheDocument();
    expect(within(modelMenu).queryByText(/^Model$/)).not.toBeInTheDocument();
    expect(within(modelMenu).queryByText(/available(?: - (?:live|cached))?$/)).not.toBeInTheDocument();
    expect(modelMenu.querySelector(".composer-option-icon")).toBeNull();
    expect(within(modelMenu).queryByText("gpt-5.5", { exact: true })).not.toBeInTheDocument();
    const selectedModelOption = within(modelMenu).getByRole("menuitemradio", { name: "GPT-5.5" });
    const turboModelOption = within(modelMenu).getByRole("menuitemradio", { name: "GPT-5.5 Turbo" });
    expect(within(modelMenu).getAllByRole("menuitemradio")).toHaveLength(2);
    expect(selectedModelOption).toHaveAttribute("aria-checked", "true");
    expect(selectedModelOption.querySelectorAll(".composer-option-check")).toHaveLength(1);
    expect(turboModelOption).toHaveAttribute("aria-checked", "false");
    expect(turboModelOption.querySelector(".composer-option-check")).toBeNull();
    expect(selectedModelOption.querySelector("strong, small")).toBeNull();
    expect(turboModelOption.querySelector("strong, small")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await flushApp();
    expect(screen.queryByRole("menu", { name: "Choose model" })).not.toBeInTheDocument();
    expect(modelButton).toHaveFocus();
    fireEvent.click(modelButton);
    modelMenu = await screen.findByRole("menu", { name: "Choose model" });
    fireEvent.click(within(modelMenu).getByRole("menuitemradio", { name: "GPT-5.5 Turbo" }));
    await flushApp();
    expect(saveModelConnectionSpy).toHaveBeenCalledWith({
      providerId: "codex-cli",
      modelId: "gpt-5.5-turbo",
      modelLabel: "GPT-5.5 Turbo",
      authMethod: "codexCliSession",
      envKey: null,
      thinkingEffort: null,
      supportedThinkingEfforts: null,
      defaultThinkingEffort: null,
    });
    expect(screen.queryByRole("menu", { name: "Choose model" })).not.toBeInTheDocument();

    fireEvent.click(effortButton);
    const effortMenu = await screen.findByRole("menu", { name: "Change thinking effort" });
    expect(effortButton).toHaveAttribute("aria-expanded", "true");
    expect(within(effortMenu).queryByText("Reasoning")).not.toBeInTheDocument();
    expect(within(effortMenu).queryByRole("heading", { name: "Thinking effort" })).not.toBeInTheDocument();
    expect(within(effortMenu).queryByRole("radiogroup", { name: "Thinking effort" })).not.toBeInTheDocument();
    const effortOptions = within(effortMenu).getAllByRole("menuitemradio");
    expect(effortOptions).toHaveLength(6);
    expect(within(effortMenu).getByRole("menuitemradio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
    expect(within(effortMenu).getByRole("menuitemradio", { name: "High" })).toHaveAttribute("aria-checked", "false");
    expect(within(effortMenu).getByRole("menuitemradio", { name: "Medium" }).querySelector(".composer-option-check")).not.toBeNull();
    expect(within(effortMenu).getByRole("menuitemradio", { name: "High" }).querySelector(".composer-option-check")).toBeNull();
    expect(within(effortMenu).queryByText("Deeper planning for complex or risky changes.")).not.toBeInTheDocument();
    expect(effortMenu.querySelector(".composer-effort-select")).toBeNull();
    expect(effortMenu.querySelector(".composer-effort-slider")).toBeNull();
    fireEvent.click(within(effortMenu).getByRole("menuitemradio", { name: "High" }));

    expect(updateSettingsSpy).toHaveBeenCalledWith({ thinkingEffort: "high" });
    await flushApp();
    expect(screen.queryByRole("menu", { name: "Change thinking effort" })).not.toBeInTheDocument();
  });

  it("retains the persisted model when a live catalog is empty", async () => {
    const settings = readyModelSettings();
    vi.spyOn(orynt, "getSettings").mockResolvedValue(settings);
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue(settings.codexConnection!.lastPreflight!);
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      source: "live",
      warnings: ["The provider returned no selectable models."],
      models: [],
    });

    await renderApp(<App />);

    const composer = screen.getByRole("form", { name: "Task composer" });
    const modelButton = within(composer).getByRole("button", { name: /Change model/ });
    fireEvent.click(modelButton);
    const modelPicker = await screen.findByRole("menu", { name: "Choose model" });

    expect(await within(modelPicker).findByRole("menuitemradio", { name: /GPT-5\.5/ })).toHaveAttribute("aria-checked", "true");
  });

  it("persists the current composer thinking effort when switching to another supported model", async () => {
    const initialConnection = readyModelSettings().modelConnection!;
    const initialSettings = readyModelSettings({
      thinkingEffort: "medium",
      modelConnection: {
        ...initialConnection,
        supportedThinkingEfforts: ["low", "medium", "high"],
        defaultThinkingEffort: "medium",
      },
    });
    const updatedEffortSettings = readyModelSettings({
      thinkingEffort: "high",
      modelConnection: initialSettings.modelConnection,
    });
    vi.spyOn(orynt, "getSettings").mockResolvedValue(initialSettings);
    dismissPrivateBetaOnboarding();
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(updatedEffortSettings);
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue(initialSettings.codexConnection!.lastPreflight!);
    window.localStorage.setItem(
      `${modelsDevProviderCatalogStoragePrefix}codex-cli`,
      JSON.stringify({
        providerId: "codex-cli",
        fetchedAt: new Date().toISOString(),
        models: [
          { id: "gpt-5.5", label: "GPT-5.5", source: "codex-cli", supportedThinkingEfforts: ["low", "medium", "high"], defaultThinkingEffort: "medium" },
          { id: "gpt-5.5-deep", label: "GPT-5.5 Deep", source: "codex-cli", supportedThinkingEfforts: ["low", "medium", "high"], defaultThinkingEffort: "medium" },
        ],
      }),
    );
    const saveModelConnectionSpy = vi.spyOn(orynt, "saveModelConnection").mockResolvedValue({
      ...initialConnection,
      modelId: "gpt-5.5-deep",
      modelLabel: "GPT-5.5 Deep",
      supportedThinkingEfforts: ["low", "medium", "high"],
      defaultThinkingEffort: "medium",
    });
    vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue({
      ...initialConnection.lastPreflight!,
      checkedModelId: "gpt-5.5-deep",
    });

    await renderApp(<App />);

    const composer = screen.getByRole("form", { name: "Task composer" });
    const effortButton = within(composer).getByRole("button", { name: /Change thinking effort/ });
    await waitFor(() => expect(effortButton).toHaveTextContent("Medium"));
    fireEvent.click(effortButton);
    const effortMenu = await screen.findByRole("menu", { name: "Change thinking effort" });
    const effortOptions = within(effortMenu).getAllByRole("menuitemradio");
    expect(effortOptions).toHaveLength(3);
    expect(within(effortMenu).getByRole("menuitemradio", { name: "Low" })).toHaveAttribute("aria-checked", "false");
    expect(within(effortMenu).getByRole("menuitemradio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
    expect(within(effortMenu).getByRole("menuitemradio", { name: "High" })).toHaveAttribute("aria-checked", "false");
    expect(within(effortMenu).queryByRole("menuitemradio", { name: "Minimal" })).not.toBeInTheDocument();
    expect(within(effortMenu).queryByRole("menuitemradio", { name: "None" })).not.toBeInTheDocument();
    expect(within(effortMenu).queryByRole("menuitemradio", { name: "X High" })).not.toBeInTheDocument();
    fireEvent.click(within(effortMenu).getByRole("menuitemradio", { name: "High" }));

    expect(updateSettingsSpy).toHaveBeenCalledWith({ thinkingEffort: "high" });
    await waitFor(() => expect(effortButton).toHaveTextContent("High"));

    const modelButton = within(composer).getByRole("button", { name: /Change model/ });
    fireEvent.click(modelButton);
    const modelMenu = await screen.findByRole("menu", { name: "Choose model" });
    fireEvent.click(await within(modelMenu).findByRole("menuitemradio", { name: "GPT-5.5 Deep" }));

    await waitFor(() =>
      expect(saveModelConnectionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: "gpt-5.5-deep",
          thinkingEffort: "high",
          supportedThinkingEfforts: ["low", "medium", "high"],
          defaultThinkingEffort: "medium",
        }),
      ),
    );
  });

  it("renders dropdown option titles separately from descriptions", async () => {
    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    fireEvent.click(within(setupDialog).getByRole("combobox", { name: "Permission mode" }));
    const options = within(setupDialog).getByRole("listbox", { name: "Permission mode options" });
    const safeOption = within(options).getByRole("option", { name: /^Safe/ });
    const safeTitle = within(safeOption).getByText("Safe");
    const safeDescription = within(safeOption).getByText("Ask before protected paths, destructive commands, network access, and secret access.");

    expect(safeTitle).toHaveClass("orynt-dropdown-option-title");
    expect(safeTitle).not.toHaveTextContent("Ask before protected paths");
    expect(safeDescription).toHaveClass("orynt-dropdown-option-description");
    expect(safeOption.querySelector(".orynt-dropdown-check")).not.toBeNull();
    expect(within(options).getByRole("option", { name: /^Ask first/ }).querySelector(".orynt-dropdown-check")).toBeNull();
    const selectedOptionStyles = readFileSync("src/styles.css", "utf8").match(/\.orynt-dropdown-option-selected \{[\s\S]*?\}/)?.[0] ?? "";
    expect(selectedOptionStyles).not.toContain("background: var(--message-bubble-user)");
  });

  it("applies custom dropdown root classes and density", async () => {
    render(
      <OryntDropdown
        ariaLabel="Custom dropdown"
        className="custom-dropdown-layout"
        density="comfortable"
        id="custom-dropdown"
        onChange={vi.fn()}
        options={[{ label: "Option", value: "option" }]}
        placeholder="Choose option"
        value=""
      />,
    );

    expect(screen.getByRole("combobox", { name: "Custom dropdown" }).parentElement).toHaveClass(
      "orynt-dropdown",
      "orynt-dropdown-density-comfortable",
      "custom-dropdown-layout",
    );
  });

  it("keeps disabled dropdowns closed without selecting", async () => {
    const onChange = vi.fn();
    render(
      <OryntDropdown
        ariaLabel="Disabled dropdown"
        disabled
        id="disabled-dropdown"
        onChange={onChange}
        options={[{ label: "Option", value: "option" }]}
        placeholder="Choose option"
        value=""
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Disabled dropdown" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", { name: "Disabled dropdown options" })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses index-based option IDs for raw values", async () => {
    render(
      <OryntDropdown
        ariaLabel="Safe ID dropdown"
        id="safe-id-dropdown"
        onChange={vi.fn()}
        options={[
          { label: "Model with punctuation", value: "gpt 5.5 / special?" },
          { label: "Second model", value: "second:model" },
        ]}
        placeholder="Choose model"
        value=""
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Safe ID dropdown" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-activedescendant", "safe-id-dropdown-option-0");
    expect(screen.getByRole("option", { name: "Model with punctuation" })).toHaveAttribute("id", "safe-id-dropdown-option-0");
    expect(screen.getByRole("option", { name: "Second model" })).toHaveAttribute("id", "safe-id-dropdown-option-1");
  });

  it("closes dropdowns on Escape while retaining trigger focus", async () => {
    render(
      <OryntDropdown
        ariaLabel="Escape dropdown"
        id="escape-dropdown"
        onChange={vi.fn()}
        options={[{ label: "Option", value: "option" }]}
        placeholder="Choose option"
        value=""
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Escape dropdown" });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Escape dropdown options" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not select from an empty dropdown", async () => {
    const onChange = vi.fn();
    render(
      <OryntDropdown
        ariaLabel="Empty dropdown"
        id="empty-dropdown"
        onChange={onChange}
        options={[]}
        placeholder="Choose option"
        value=""
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Empty dropdown" });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox", { name: "Empty dropdown options" })).toBeEmptyDOMElement();
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("places setup dropdowns away from clipped viewport space and updates placement on scroll", async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("orynt-dropdown-menu") ? 180 : 0;
      },
    });
    try {
      await renderApp(<App />);
      const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
      const dropdown = within(setupDialog).getByRole("combobox", { name: "Permission mode" });
      let triggerTop = 710;
      let triggerBottom = 744;
      vi.spyOn(dropdown, "getBoundingClientRect").mockImplementation(() => ({
        x: 0,
        y: triggerTop,
        width: 260,
        height: 34,
        top: triggerTop,
        right: 260,
        bottom: triggerBottom,
        left: 0,
        toJSON: () => ({}),
      }) as DOMRect);

      fireEvent.click(dropdown);
      const listbox = within(setupDialog).getByRole("listbox", { name: "Permission mode options" });
      await waitFor(() => expect(listbox).toHaveClass("orynt-dropdown-menu-dropup"));

      triggerTop = 20;
      triggerBottom = 54;
      fireEvent.scroll(window);

      await waitFor(() => expect(listbox).toHaveClass("orynt-dropdown-menu-dropdown"));
      expect(listbox.style.maxHeight).toBe("180px");
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollHeight",
          originalScrollHeight,
        );
      }
    }
  });

  it("reports native directory browsing unavailable outside the Tauri runtime", async () => {
    await expect(orynt.browseRepositoryPath()).resolves.toEqual({
      status: "unavailable",
      reason: "not-tauri",
      message: "Native folder picker is only available in the Orynt desktop app. Open the Tauri window or paste the local path manually.",
    });
  });

  it("does not mock provider connections outside the Tauri runtime", async () => {
    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");

    expect(
      (
        await within(setupDialog).findAllByText(
          "Provider connections are only available in the Orynt desktop app. Open the Tauri app to authenticate providers and fetch live models.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(within(setupDialog).queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("keeps each setup checklist item next to its related controls in one readable flow", async () => {
    await renderApp(<App />);

    const setupDialog = screen.getByRole("dialog", { name: "Set up Orynt" });
    const setupFlow = within(setupDialog).getByRole("list", { name: "Setup flow" });
    const steps = within(setupFlow).getAllByRole("listitem");

    expect(steps).toHaveLength(3);
    expect(within(steps[0]).getByText("Choose a local directory")).toBeInTheDocument();
    expect(within(steps[0]).getByText("Pick the repo folder.")).toBeInTheDocument();
    const localDirectoryInput = within(steps[0]).getByRole("textbox", { name: "Default local directory" });
    expect(localDirectoryInput).toBeInTheDocument();
    expect(localDirectoryInput).toHaveAttribute("placeholder", "/path/to/local/directory");
    expect(within(steps[0]).getByRole("button", { name: "Detect current" })).toBeInTheDocument();
    expect(within(steps[0]).getByRole("button", { name: "Browse" })).toBeInTheDocument();
    expect(within(steps[1]).getByText("Choose model provider")).toBeInTheDocument();
    expect(within(steps[1]).getByRole("combobox", { name: "Provider" })).toBeInTheDocument();
    expect(within(steps[1]).queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    expect(within(steps[1]).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(steps[1]).queryByRole("combobox", { name: "Thinking effort" })).not.toBeInTheDocument();
    expect(within(steps[2]).getByText("Review advanced defaults")).toBeInTheDocument();
    expect(within(steps[2]).getByRole("combobox", { name: "Permission mode" })).toBeInTheDocument();
    expect(within(steps[2]).queryByRole("combobox", { name: "Thinking effort" })).not.toBeInTheDocument();
    expect(setupDialog.querySelector(".setup-status-list")).toBeNull();
  });

  it("shows model-specific thinking effort after model selection and persists the chosen effort", async () => {
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockImplementation(async () =>
      withPreferenceSettings({
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
      }),
    );
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "openai-api",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [
        {
          id: "gpt-5.5",
          label: "GPT-5.5",
          ownedBy: "openai",
          source: "openai-api",
          supportedThinkingEfforts: ["none", "low", "medium", "high", "xhigh"],
          defaultThinkingEffort: "medium",
        },
        {
          id: "legacy-text-model",
          label: "Legacy text model",
          ownedBy: "team",
          source: "openai-api",
        },
      ],
    });

    await renderApp(<App />);

    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    expect(within(setupDialog).queryByRole("combobox", { name: "Thinking effort" })).not.toBeInTheDocument();

    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");
    const modelSelect = await within(setupDialog).findByRole("combobox", { name: "Model" });
    expect(modelSelect).toHaveTextContent("Choose model");
    expect(within(setupDialog).queryByRole("combobox", { name: "Thinking effort" })).not.toBeInTheDocument();

    selectSetupDropdownOption(setupDialog, "Model", "GPT-5.5");
    const thinkingEffort = within(setupDialog).getByRole("combobox", { name: "Thinking effort" });
    expect(thinkingEffort).toHaveTextContent("Medium");

    fireEvent.click(thinkingEffort);
    const effortOptions = within(setupDialog).getByRole("listbox", { name: "Thinking effort options" });
    expect(within(effortOptions).getByRole("option", { name: /None/ })).toBeInTheDocument();
    expect(within(effortOptions).getByRole("option", { name: /X High/ })).toBeInTheDocument();
    fireEvent.click(within(effortOptions).getByRole("option", { name: /X High/ }));

    expect(within(setupDialog).getByRole("combobox", { name: "Thinking effort" })).toHaveTextContent("X High");
    expect(updateSettingsSpy).toHaveBeenCalledWith({ thinkingEffort: "xhigh" });

    selectSetupDropdownOption(setupDialog, "Model", "Legacy text model");
    await flushApp();
    expect(within(setupDialog).queryByRole("combobox", { name: "Thinking effort" })).not.toBeInTheDocument();
  });

  it("shows cached Models.dev choices while live model availability refreshes", async () => {
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    const liveCatalog = createDeferred<ModelCatalogResult>();
    vi.spyOn(orynt, "listProviderModels").mockReturnValue(liveCatalog.promise);
    window.localStorage.setItem(
      `${modelsDevProviderCatalogStoragePrefix}openai-api`,
      JSON.stringify({
        providerId: "openai-api",
        fetchedAt: new Date().toISOString(),
        models: [
          {
            id: "gpt-5.5",
            label: "GPT-5.5",
            description: "Cached via Models.dev.",
            ownedBy: "openai",
            source: "openai-api",
            supportedThinkingEfforts: ["none", "low", "medium", "high", "xhigh"],
            defaultThinkingEffort: "medium",
          },
        ],
      }),
    );

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");

    const cachedModelSelect = await within(setupDialog).findByRole("combobox", { name: "Model" });
    expect(cachedModelSelect).toHaveTextContent("Choose model");
    expect(within(setupDialog).getByText("Cached models shown. Refreshing live availability.")).toBeInTheDocument();
    fireEvent.click(cachedModelSelect);
    expect(within(setupDialog).getByRole("option", { name: /GPT-5\.5/ })).toBeInTheDocument();
    fireEvent.click(cachedModelSelect);

    await act(async () => {
      liveCatalog.resolve({
        providerId: "openai-api",
        fetchedAt: "2026-07-05T00:00:00.000Z",
        warnings: [],
        models: [{ id: "gpt-5.5-live", label: "GPT-5.5 Live", ownedBy: "openai", source: "openai-api" }],
      });
      await liveCatalog.promise;
    });

    await waitFor(() => expect(within(setupDialog).queryByText("Cached models shown. Refreshing live availability.")).not.toBeInTheDocument());
    expect(within(setupDialog).queryByText("Live models loaded.")).not.toBeInTheDocument();
    fireEvent.click(within(setupDialog).getByRole("combobox", { name: "Model" }));
    expect(within(setupDialog).getByRole("option", { name: /GPT-5\.5 Live/ })).toBeInTheDocument();
  });

  it("detects an existing Codex CLI login before showing live model choices", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    const preflightCodexConnectionSpy = vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [
        { id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" },
        { id: "gpt-5.4-mini", label: "GPT-5.4 mini", description: "Live Codex model.", source: "codex-cli" },
      ],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    const providerSelect = within(setupDialog).getByRole("combobox", { name: "Provider" });
    expect(providerSelect).toHaveTextContent("Choose provider");
    expect(within(setupDialog).queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use device code" })).not.toBeInTheDocument();

    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");

    expect(within(setupDialog).queryByRole("listbox", { name: "Provider options" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Open browser login" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Open Codex login" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use device code" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("button", { name: "Skip auto check" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Check Codex CLI" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Delete provider connection" })).not.toBeInTheDocument();

    await waitFor(() => expect(preflightCodexConnectionSpy).toHaveBeenCalledTimes(1));
    const modelSelect = await within(setupDialog).findByRole("combobox", { name: "Model" });
    expect(modelSelect).toHaveTextContent("Choose model");
    expect(within(setupDialog).queryByText("Live models loaded.")).not.toBeInTheDocument();
    expect(setupDialog.querySelector(".setup-provider-panel .settings-review-card > .candidate-rule-actions")).not.toBeInTheDocument();

    const selectedModel = selectSetupDropdownOption(setupDialog, "Model", "GPT-5.5");
    expect(selectedModel).toHaveTextContent("GPT-5.5");
    expect(within(setupDialog).queryByRole("listbox", { name: "Model options" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("button", { name: "Save provider setup" })).toBeInTheDocument();
  });

  it("hides Codex login actions during auto-check until the operator skips it", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    const preflight = createDeferred<CodexConnectionPreflightResult>();
    const preflightCodexConnectionSpy = vi.spyOn(orynt, "preflightCodexConnection").mockReturnValue(preflight.promise);
    const listProviderModelsSpy = vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" }],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");

    await waitFor(() => expect(preflightCodexConnectionSpy).toHaveBeenCalledTimes(1));
    expect(setupDialog).toHaveTextContent(/checking local Codex CLI identity/i);
    expect(within(setupDialog).getByRole("button", { name: "Skip auto check" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Open Codex login" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use device code" })).not.toBeInTheDocument();
    expect(setupDialog.querySelector(".probability-loader")).toBeInTheDocument();

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Skip auto check" }));
    expect(within(setupDialog).getByRole("button", { name: "Open Codex login" })).toBeInTheDocument();
    expect(within(setupDialog).getByRole("button", { name: "Use device code" })).toBeInTheDocument();
    expect(setupDialog).toHaveTextContent(/Auto-check skipped/i);
    expect(setupDialog.querySelector(".probability-loader")).not.toBeInTheDocument();

    await act(async () => {
      preflight.resolve({
        checkedConnectionId: "codex-cli",
        status: "ready",
        ready: true,
        checkedAt: "2026-07-05T00:00:00.000Z",
        executablePath: "/usr/local/bin/codex",
        authMode: "chatgpt",
        reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
        warnings: [],
      });
      await preflight.promise;
    });
    expect(listProviderModelsSpy).not.toHaveBeenCalled();
    expect(setupDialog).toHaveTextContent(/Auto-check skipped/i);
  });

  it("completes selected Codex provider setup without clearing selectors", async () => {
    const initialSettings = withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/project",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
      modelConnection: null,
    });
    vi.spyOn(orynt, "getSettings").mockResolvedValue(initialSettings);
    vi.spyOn(orynt, "updateSettings").mockImplementation(async (input) =>
      withPreferenceSettings({
        ...initialSettings,
        defaultRepositoryPath: input.defaultRepositoryPath ?? initialSettings.defaultRepositoryPath,
        modelConnection: null,
      }),
    );
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" }],
    });
    const saveModelConnectionSpy = vi.spyOn(orynt, "saveModelConnection").mockImplementation(async (input) => ({
      providerId: input.providerId,
      providerLabel: "Codex CLI",
      modelId: input.modelId,
      modelLabel: input.modelLabel ?? "GPT-5.5",
      authMethod: "codexCliSession",
      status: "authRequired",
      lastPreflight: null,
    }));
    vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue({
      checkedProviderId: "codex-cli",
      checkedModelId: "gpt-5.5",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "codexCliSession",
      reasons: ["Codex CLI with GPT-5.5 is ready."],
      warnings: [],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");
    await within(setupDialog).findByRole("combobox", { name: "Model" });
    selectSetupDropdownOption(setupDialog, "Model", "GPT-5.5");
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Complete setup" }));

    await waitFor(() => expect(saveModelConnectionSpy).toHaveBeenCalledWith({
      providerId: "codex-cli",
      modelId: "gpt-5.5",
      modelLabel: "GPT-5.5",
      authMethod: "codexCliSession",
      envKey: null,
      thinkingEffort: null,
      supportedThinkingEfforts: null,
      defaultThinkingEffort: null,
    }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set up Orynt" })).not.toBeInTheDocument());
    expect(screen.getByRole("status", { name: "Orynt notifications" })).toHaveTextContent("Setup complete. Orynt is ready for supervised tasks.");
  });

  it("checks Codex without closing setup or showing the background setup warning", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/project",
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
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings");
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" }],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");

    await within(setupDialog).findByRole("combobox", { name: "Model" });

    expect(screen.getByRole("dialog", { name: "Set up Orynt" })).toBeInTheDocument();
    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(thread).queryByRole("status", { name: "Setup required" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Orynt notifications" })).toHaveTextContent("Codex CLI is installed and authenticated with ChatGPT.");
    expect(updateSettingsSpy).not.toHaveBeenCalledWith({ welcomeCompleted: true });
  });

  it("keeps setup open while checking Codex after onboarding was already completed", async () => {
    dismissPrivateBetaOnboarding();
    const settings = withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/project",
      welcomeCompleted: true,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
      modelConnection: null,
    });
    vi.spyOn(orynt, "getSettings").mockResolvedValue(settings);
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(settings);
    const preflightCodexConnectionSpy = vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" }],
    });

    await renderApp(<App />);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set up Orynt" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open setup" }));
    const setupDialog = screen.getByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");

    await waitFor(() => expect(preflightCodexConnectionSpy).toHaveBeenCalledTimes(1));
    const openSetupDialog = screen.getByRole("dialog", { name: "Set up Orynt" });
    expect(within(openSetupDialog).getByRole("combobox", { name: "Provider" })).toHaveTextContent("Codex CLI");
    expect(await within(openSetupDialog).findByRole("combobox", { name: "Model" })).toHaveTextContent("Choose model");
    expect(updateSettingsSpy).not.toHaveBeenCalledWith({ welcomeCompleted: true });
  });

  it("shows animated loading feedback while fetching live provider models", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    const modelCatalog = createDeferred<ModelCatalogResult>();
    vi.spyOn(orynt, "listProviderModels").mockReturnValue(modelCatalog.promise);

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");

    expect(await within(setupDialog).findByText("Fetching live models from the selected provider.")).toBeInTheDocument();
    expect(setupDialog.querySelector(".probability-loader")).not.toBeNull();
    expect(setupDialog.querySelectorAll(".loading-skeleton-row")).toHaveLength(2);
    expect(within(setupDialog).queryByRole("button", { name: "Save provider setup" })).not.toBeInTheDocument();

    await act(async () => {
      modelCatalog.resolve({
        providerId: "openai-api",
        fetchedAt: "2026-07-05T00:00:00.000Z",
        warnings: [],
        models: [{ id: "gpt-5.5", label: "GPT-5.5", ownedBy: "openai", source: "openai-api" }],
      });
      await modelCatalog.promise;
    });
    expect(await within(setupDialog).findByRole("combobox", { name: "Model" })).toHaveTextContent("Choose model");
    expect(within(setupDialog).queryByRole("button", { name: "Save provider setup" })).not.toBeInTheDocument();
  });

  it("closes setup dropdowns after pointer-selecting an option", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" }],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    expect(pointerSelectSetupDropdownOption(setupDialog, "Provider", "Codex CLI")).toHaveTextContent("Codex CLI");
    await flushApp();
    expect(within(setupDialog).queryByRole("listbox", { name: "Provider options" })).not.toBeInTheDocument();

    const modelDropdown = await within(setupDialog).findByRole("combobox", { name: "Model" });
    expect(modelDropdown).toHaveTextContent("Choose model");

    expect(pointerSelectSetupDropdownOption(setupDialog, "Model", "GPT-5.5")).toHaveTextContent("GPT-5.5");
    expect(within(setupDialog).queryByRole("listbox", { name: "Model options" })).not.toBeInTheDocument();
  });

  it("closes setup dropdowns after pointer-selecting the already selected option", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(readyModelSettings({ welcomeCompleted: false }));

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    expect(pointerSelectSetupDropdownOption(setupDialog, "Provider", "Codex CLI")).toHaveTextContent("Codex CLI");
    await flushApp();
    expect(within(setupDialog).queryByRole("listbox", { name: "Provider options" })).not.toBeInTheDocument();
  });

  it("auto-checks a stale hydrated Codex model without a manual check button", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(readyModelSettings({ welcomeCompleted: false }));
    const preflightCodexConnectionSpy = vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    const listProviderModelsSpy = vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", source: "codex-cli" }],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    expect(await within(setupDialog).findByRole("combobox", { name: "Provider" })).toHaveTextContent("Codex CLI");
    expect(await within(setupDialog).findByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-5.5");
    await waitFor(() => expect(preflightCodexConnectionSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listProviderModelsSpy).toHaveBeenCalledWith({ providerId: "codex-cli", envKey: null }));
    expect(within(setupDialog).getByRole("button", { name: "Save provider setup" })).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Check Codex CLI" })).not.toBeInTheDocument();
  });

  it("supports keyboard selection in the setup dropdowns", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [
        { id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" },
        { id: "gpt-5.4-mini", label: "GPT-5.4 mini", description: "Live Codex model.", source: "codex-cli" },
      ],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    const providerDropdown = within(setupDialog).getByRole("combobox", { name: "Provider" });

    fireEvent.keyDown(providerDropdown, { key: "ArrowDown" });
    const providerOptions = within(setupDialog).getByRole("listbox", { name: "Provider options" });
    expect(providerOptions).toBeInTheDocument();
    fireEvent.click(within(providerOptions).getByRole("option", { name: /Codex CLI/ }));
    expect(within(setupDialog).getByRole("combobox", { name: "Provider" })).toHaveTextContent("Codex CLI");
    expect(within(setupDialog).queryByRole("listbox", { name: "Provider options" })).not.toBeInTheDocument();

    const modelDropdown = await within(setupDialog).findByRole("combobox", { name: "Model" });
    fireEvent.keyDown(modelDropdown, { key: "ArrowDown" });
    fireEvent.keyDown(modelDropdown, { key: "ArrowDown" });
    fireEvent.keyDown(modelDropdown, { key: "Enter" });

    expect(within(setupDialog).getByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-5.5");
    expect(within(setupDialog).queryByRole("listbox", { name: "Model options" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Check Codex CLI" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("button", { name: "Save provider setup" })).toBeInTheDocument();
  });

  it("hydrates provider and model dropdowns and clears the model when provider changes", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
        status: "ready",
        lastPreflight: null,
      },
    } as Parameters<typeof withPreferenceSettings>[0]));
    vi.spyOn(orynt, "listProviderModels").mockImplementation(async (input) => ({
      providerId: input.providerId,
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [
        input.providerId === "openai-api"
          ? { id: "gpt-5.5", label: "GPT-5.5", ownedBy: "openai", source: "openai-api" }
          : { id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" },
      ],
    }));
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    const providerSelect = await within(setupDialog).findByRole("combobox", { name: "Provider" });
    const modelSelect = await within(setupDialog).findByRole("combobox", { name: "Model" });

    expect(providerSelect).toHaveTextContent("Codex CLI");
    expect(modelSelect).toHaveTextContent("GPT-5.5");
    expect(modelSelect).not.toBeDisabled();

    const selectedProvider = selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");

    expect(selectedProvider).toHaveTextContent("OpenAI API");
    expect(within(setupDialog).getByRole("textbox", { name: "API key environment variable" })).toHaveValue("OPENAI_API_KEY");
    await within(setupDialog).findByRole("combobox", { name: "Model" });
    selectSetupDropdownOption(setupDialog, "Model", "GPT-5.5");
    expect(within(setupDialog).getByRole("textbox", { name: "API key environment variable" })).toHaveValue("OPENAI_API_KEY");
  });

  it("uses dropdown provider and model choices and shows env-var auth for OpenAI API only", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
      .spyOn(orynt, "saveModelConnection")
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
    const preflightModelConnectionSpy = vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "gpt-5.5",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "openai-api",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [
        { id: "gpt-5.5", label: "GPT-5.5", ownedBy: "openai", source: "openai-api" },
        { id: "gpt-5.4-mini", label: "GPT-5.4 mini", ownedBy: "openai", source: "openai-api" },
      ],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    const providerSelect = within(setupDialog).getByRole("combobox", { name: "Provider" });

    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");

    expect(providerSelect).toHaveTextContent("OpenAI API");
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use device code" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("textbox", { name: "API key environment variable" })).toHaveValue("OPENAI_API_KEY");

    const modelSelect = await within(setupDialog).findByRole("combobox", { name: "Model" });
    fireEvent.click(modelSelect);
    expect(within(setupDialog).getByRole("option", { name: /GPT-5\.4 mini/ })).toBeInTheDocument();
    fireEvent.click(modelSelect);
    selectSetupDropdownOption(setupDialog, "Model", "GPT-5.5");
    expect(await within(setupDialog).findByRole("textbox", { name: "API key environment variable" })).toHaveValue("OPENAI_API_KEY");
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Save provider setup" }));

    expect(saveModelConnectionSpy).toHaveBeenCalledWith({
      providerId: "openai-api",
      modelId: "gpt-5.5",
      modelLabel: "GPT-5.5",
      authMethod: "apiKeyEnv",
      envKey: "OPENAI_API_KEY",
      thinkingEffort: null,
      supportedThinkingEfforts: null,
      defaultThinkingEffort: null,
    });
    await waitFor(() => expect(preflightModelConnectionSpy).toHaveBeenCalledTimes(1));
    expect((await within(setupDialog).findAllByText("OPENAI_API_KEY is available for OpenAI API.")).length).toBeGreaterThan(0);
    expect(within(setupDialog).getByRole("combobox", { name: "Provider" })).toHaveTextContent("OpenAI API");
    expect(within(setupDialog).getByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-5.5");
    expect(within(setupDialog).getByText("Ready")).toBeInTheDocument();
  });

  it("requires explicit setup completion after the saved model connection is ready", async () => {
    const initialSettings = withPreferenceSettings({
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe",
      executableSurfaces: ["repository"],
      blockedSurfaces: ["browser", "desktop", "files", "terminal"],
      defaultRepositoryPath: "/home/operator/project",
      welcomeCompleted: false,
      codexConnection: null,
      retentionPolicy: {
        runHistoryDays: 30,
        artifactRetentionDays: 30,
        cleanupEnabled: false,
        summary: "Cleanup is manual for private beta; automatic retention is planned.",
      },
      modelConnection: null,
    });
    const readySettings = withPreferenceSettings({
      ...initialSettings,
      welcomeCompleted: false,
      modelConnection: {
        providerId: "openai-api",
        providerLabel: "OpenAI API",
        modelId: "gpt-5.5",
        modelLabel: "GPT-5.5",
        authMethod: "apiKeyEnv",
        envKey: "OPENAI_API_KEY",
        status: "ready",
        lastPreflight: {
          checkedProviderId: "openai-api",
          checkedModelId: "gpt-5.5",
          status: "ready",
          ready: true,
          checkedAt: "2026-07-05T00:00:00.000Z",
          authMode: "apiKeyEnv",
          reasons: ["OPENAI_API_KEY is available for OpenAI API."],
          warnings: [],
        },
      },
    });
    const completedSettings = withPreferenceSettings({
      ...readySettings,
      welcomeCompleted: true,
    });
    vi.spyOn(orynt, "getSettings").mockResolvedValueOnce(initialSettings).mockResolvedValue(readySettings);
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(completedSettings);
    vi.spyOn(orynt, "saveModelConnection").mockImplementation(async (input) => ({
      providerId: input.providerId,
      providerLabel: "OpenAI API",
      modelId: input.modelId,
      modelLabel: "GPT-5.5",
      authMethod: "apiKeyEnv",
      envKey: input.envKey,
      status: "authRequired",
      lastPreflight: null,
    }));
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "gpt-5.5",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "openai-api",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", ownedBy: "openai", source: "openai-api" }],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");
    await within(setupDialog).findByRole("combobox", { name: "Model" });
    selectSetupDropdownOption(setupDialog, "Model", "GPT-5.5");
    fireEvent.click(within(setupDialog).getByRole("button", { name: "Save provider setup" }));

    await waitFor(() => expect(within(setupDialog).getAllByText("OPENAI_API_KEY is available for OpenAI API.").length).toBeGreaterThan(0));
    expect(updateSettingsSpy).not.toHaveBeenCalledWith({ welcomeCompleted: true });
    expect(screen.getByRole("dialog", { name: "Set up Orynt" })).toBeInTheDocument();

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Complete setup" }));

    await waitFor(() => expect(updateSettingsSpy).toHaveBeenCalledWith({ welcomeCompleted: true }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set up Orynt" })).not.toBeInTheDocument());
    expect(screen.queryByRole("status", { name: "Setup required" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Orynt notifications" })).toHaveTextContent("Setup complete. Orynt is ready for supervised tasks.");
  });

  it("shows a busy state while saving provider setup", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "openai-api",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", ownedBy: "openai", source: "openai-api" }],
    });
    const saveProviderSetup = createDeferred<ModelConnectionReference>();
    vi.spyOn(orynt, "saveModelConnection").mockReturnValue(saveProviderSetup.promise);
    vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "gpt-5.5",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");
    await within(setupDialog).findByRole("combobox", { name: "Model" });
    selectSetupDropdownOption(setupDialog, "Model", "GPT-5.5");

    const saveButton = within(setupDialog).getByRole("button", { name: "Save provider setup" });
    fireEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute("aria-busy", "true");
    expect(saveButton).toHaveTextContent("Saving");
    expect(saveButton.querySelector(".probability-loader")).not.toBeNull();
  });

  it("ignores stale live model results after the selected provider changes", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightModelProvider").mockResolvedValue({
      checkedProviderId: "openai-api",
      checkedModelId: "",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      authMode: "apiKeyEnv",
      reasons: ["OPENAI_API_KEY is available for OpenAI API."],
      warnings: [],
    });
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "authRequired",
      ready: false,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: null,
      reasons: ["No authenticated Codex CLI session was detected."],
      warnings: [],
    });
    let resolveOpenAiModels: (catalog: ModelCatalogResult) => void = () => {};
    vi.spyOn(orynt, "listProviderModels").mockImplementation(
      () =>
        new Promise<ModelCatalogResult>((resolve) => {
          resolveOpenAiModels = resolve;
        }),
    );

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });

    selectSetupDropdownOption(setupDialog, "Provider", "OpenAI API");
    expect(await within(setupDialog).findByText("Fetching live models from the selected provider.")).toBeInTheDocument();

    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");
    resolveOpenAiModels({
      providerId: "openai-api",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-live-only", label: "GPT live only", ownedBy: "openai", source: "openai-api" }],
    });

    await waitFor(() => {
      expect(within(setupDialog).getByRole("combobox", { name: "Provider" })).toHaveTextContent("Codex CLI");
      expect(within(setupDialog).queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
      expect(within(setupDialog).getByText(/Open Codex login here to run `codex login`/i)).toBeInTheDocument();
      expect(within(setupDialog).queryByText("Choose a live model to finish provider setup.")).not.toBeInTheDocument();
    });
  });

  it("renders the repository cockpit with sidebar shell actions and core control primitives", async () => {
    await renderApp(<App seedDemoThread />);

    const sidebar = screen.getByRole("complementary");
    const brandButton = within(sidebar).getByRole("button", { name: "Open Cockpit" });
    const brandLockup = brandButton.querySelector(".workspace-brand-lockup");
    expect(brandLockup?.tagName.toLowerCase()).toBe("img");
    expect(brandLockup).toHaveAttribute("alt", "Orynt");
    expect(brandLockup).toHaveAttribute("src", expect.stringContaining("orynt-lockup.svg"));
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
    expect(screen.getByRole("heading", { level: 1, name: "New task" })).toBeInTheDocument();
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
    const settingsButton = within(sidebar).getByRole("button", { name: "Open local settings" });
    expect(settingsButton).toHaveAttribute("title", "Local settings");
    expect(settingsButton).toHaveTextContent("Local settings");
    expect(within(sidebar).queryByRole("button", { name: "Open dashboard" })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("menu", { name: /account/i })).not.toBeInTheDocument();

    expect(screen.queryByRole("navigation", { name: "Purpose spaces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Channel space" })).not.toBeInTheDocument();
    const spaces = screen.getByRole("navigation", { name: "Tasks" });
    expect(screen.queryByRole("textbox", { name: "Search tasks" })).not.toBeInTheDocument();
    const workspaceSearchToggle = within(sidebar).getByRole("button", { name: "Search tasks" });
    expect(workspaceSearchToggle).toHaveAttribute("aria-controls", "workspace-thread-search");
    expect(workspaceSearchToggle).toHaveAttribute("aria-expanded", "false");
    expect(workspaceSearchToggle.querySelector("svg")).not.toBeNull();
    fireEvent.click(workspaceSearchToggle);
    expect(workspaceSearchToggle).toHaveAttribute("aria-expanded", "true");
    const workspaceSearch = screen.getByRole("textbox", { name: "Search tasks" });
    expect(workspaceSearch).toHaveAttribute("placeholder", "Search tasks");
    const createButton = screen.getByRole("button", { name: "Create new task" });
    expect(createButton).toBeInTheDocument();
    expect(createButton.querySelector(".workspace-create-icon")).not.toBeNull();
    expect(createButton.querySelector(".workspace-create-icon svg")).not.toBeNull();
    const removedWorkspaceRuleClass = ".workspace" + "-di" + "vider";
    expect(document.querySelector(removedWorkspaceRuleClass)).toBeNull();
    expect(screen.queryByText("Purpose spaces")).not.toBeInTheDocument();
    expect(screen.queryByText("Local Alpha Workspace")).not.toBeInTheDocument();
    const activeChannelButton = within(spaces).getByRole("button", { name: "New task" });
    expect(activeChannelButton).toHaveAttribute("aria-pressed", "true");
    expect(activeChannelButton.querySelector("svg")).toBeNull();
    expect(activeChannelButton.closest(".workspace-row")).toHaveClass("workspace-row-active");
    expect(within(spaces).queryByRole("button", { name: "Marketing" })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: "Research" })).not.toBeInTheDocument();
    expect(within(spaces).getByRole("button", { name: "Task options for New task" })).toBeInTheDocument();
    expect(within(spaces).queryByText("Repository fixes, tests, and implementation runs.")).not.toBeInTheDocument();
    expect(within(spaces).queryByText("46")).not.toBeInTheDocument();
    fireEvent.change(workspaceSearch, { target: { value: "New" } });
    expect(within(spaces).getByRole("button", { name: "New task" })).toBeInTheDocument();
    fireEvent.change(workspaceSearch, { target: { value: "Marketing" } });
    expect(within(spaces).queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    fireEvent.change(workspaceSearch, { target: { value: "" } });
    expect(within(spaces).getByRole("button", { name: "New task" })).toBeInTheDocument();
    fireEvent.click(workspaceSearchToggle);
    expect(workspaceSearchToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Search tasks" })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Inbox/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Approvals/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Memory/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Skills/ })).not.toBeInTheDocument();
    expect(within(spaces).queryByRole("button", { name: /Archive/ })).not.toBeInTheDocument();

    expect(screen.queryByRole("navigation", { name: "Cockpit sections" })).not.toBeInTheDocument();

    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(thread).getByRole("heading", { name: "New task" })).toBeInTheDocument();
    expect(within(thread).queryByText("Draft thread.")).not.toBeInTheDocument();
    expect(within(thread).getByRole("button", { name: "Edit task name and description" })).toBeInTheDocument();
    expect(within(thread).queryByText("Operator")).not.toBeInTheDocument();
    expect(within(thread).queryByText("Orynt")).not.toBeInTheDocument();
    expect(within(thread).queryByText("System notice · Runtime policy")).not.toBeInTheDocument();
    expect(within(thread).queryByText("System notice · Verifier handoff")).not.toBeInTheDocument();
    const agentDetails = within(thread).getByText("Agent details").closest("details");
    if (!agentDetails) {
      throw new Error("Agent details should render as a details element.");
    }
    expect(agentDetails).toHaveClass("agent-details");
    expect(agentDetails).not.toHaveAttribute("open");
    const agentDetailsSummaryTitle = agentDetails.querySelector(".agent-details-summary-title");
    if (!(agentDetailsSummaryTitle instanceof HTMLElement)) {
      throw new Error("Agent details should render an inline summary title row.");
    }
    expect(within(agentDetailsSummaryTitle).getByText("Agent details")).toBeInTheDocument();
    expect(within(agentDetailsSummaryTitle).getByText("2 trace events")).toBeInTheDocument();
    expect(agentDetails.querySelector(".agent-details-node")).toBeNull();
    expect(agentDetails.querySelector(".agent-details-row")).not.toBeNull();
    const runtimeNotice = within(thread).getByText("Controlled repository runtime only. Browser automation is unavailable in this private beta.");
    const verifierNotice = within(thread).getByText("Verifier evidence stays separate from result import.");
    const runtimeNoticeRow = runtimeNotice.closest("li");
    if (!runtimeNoticeRow) {
      throw new Error("Runtime notice should render inside an agent details row.");
    }
    expect(runtimeNotice.closest(".agent-details-row")).not.toBeNull();
    expect(within(runtimeNoticeRow).queryByRole("list")).not.toBeInTheDocument();
    expect(within(runtimeNoticeRow).queryByText("Inspect connector approval")).not.toBeInTheDocument();
    expect(within(runtimeNoticeRow).queryByText("Confirm verifier evidence")).not.toBeInTheDocument();
    expect(within(runtimeNoticeRow).queryByText("Keep result import separate")).not.toBeInTheDocument();
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
    const threadComposer = within(thread).getByRole("form", { name: "Task composer" });
    const threadComposerField = threadComposer.querySelector(".composer-field");
    const threadComposerScale = within(threadComposer).getByRole("button", { name: "Expand composer" });
    expect(threadComposerField).not.toBeNull();
    expect(threadComposerScale.closest(".composer-field")).toBe(threadComposerField);
    expect(threadComposerScale.closest(".composer-actions")).toBeNull();
    expect(within(threadComposer).getByRole("textbox", { name: "Task for Orynt" })).toHaveAttribute("placeholder", "Describe what Orynt should do...");
    expect(within(threadComposer).getByRole("button", { name: "Send task" })).toBeDisabled();
    expect(within(thread).queryByText("Info")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Run timeline" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full timeline view")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Controlled Codex execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mock event stream" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open run info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    fireEvent.click(settingsButton);
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
    expect(within(settingsSections).queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(within(settingsSections).queryByRole("button", { name: "Billing" })).not.toBeInTheDocument();
    expect(within(settingsSections).queryByRole("button", { name: "Intelligence" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Modal backdrop")).not.toBeInTheDocument();
  });

  it("uses a closed mobile thread drawer that opens, closes, and yields the viewport to chat", async () => {
    mockMobileViewport();
    await renderApp(<App />);

    const shell = screen.getByRole("main");
    const sidebar = screen.getByRole("complementary");
    expect(shell).toHaveClass("app-shell-mobile-workspace-closed");
    expect(sidebar.querySelector(".workspace-drawer")).toHaveAttribute("hidden");

    const drawerButton = within(sidebar).getByRole("button", { name: "Open tasks" });
    expect(drawerButton).toHaveAttribute("aria-controls", "workspace-drawer");
    expect(drawerButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(drawerButton);
    expect(shell).toHaveClass("app-shell-mobile-workspace-open");
    expect(within(sidebar).getByRole("button", { name: "Close tasks" })).toHaveAttribute("aria-expanded", "true");
    expect(sidebar.querySelector(".workspace-drawer")).not.toHaveAttribute("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(shell).toHaveClass("app-shell-mobile-workspace-closed");
    expect(within(sidebar).getByRole("button", { name: "Open tasks" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(within(sidebar).getByRole("button", { name: "Open tasks" }));
    fireEvent.click(within(sidebar).getByRole("button", { name: "New task" }));
    expect(shell).toHaveClass("app-shell-mobile-workspace-closed");
  });

  it("keeps empty-thread setup content separate from the composer so narrow screens can scroll the guide", async () => {
    await renderApp(<App />);
    const styles = readFileSync("src/styles.css", "utf8");

    const thread = screen.getByRole("region", { name: "Task conversation" });
    const setupPane = thread.querySelector<HTMLElement>(".thread-start");
    const composer = thread.querySelector<HTMLElement>(".composer-start");

    expect(setupPane).toBeInTheDocument();
    expect(composer).toBeInTheDocument();
    expect(setupPane).not.toContainElement(composer);
    expect(setupPane).not.toContainElement(within(thread).getByRole("textbox", { name: "Task for Orynt" }));
    expect(styles).toContain("width: min(100%, 1040px);");
    expect(styles).toContain("width: min(100%, 1120px);");
    expect(styles).toContain(".settings-surface-status-list");
    expect(styles).not.toContain(".composer-beta-unavailable");
    expect(styles).not.toContain("width: min(100%, 720px);");
  });

  it("defines loading animation and reduced-motion fallbacks", async () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toContain("@keyframes orynt-probability-loader-frame");
    expect(styles).toContain(".probability-loader-frame");
    expect(styles).toContain("1000ms linear infinite");
    expect(styles).not.toContain(".loading-spinner");
    expect(styles).not.toContain("@keyframes orynt-spin");
    expect(styles).toContain(".loading-skeleton-row");
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.probability-loader-frame[\s\S]*?animation: none;[\s\S]*?\.probability-loader-frame:first-child[\s\S]*?opacity: 1;/);
  });

  it("renders the cockpit chat surface directly and keeps settings action in the sidebar", async () => {
    await renderApp(<App />);
    const styles = readFileSync("src/styles.css", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const packageManifest = readFileSync("package.json", "utf8");
    const removedWorkspaceRuleClass = ".workspace" + "-di" + "vider";
    const shellClasses = Array.from(screen.getByRole("main").children).map((child) => child.className);

    expect(packageManifest).toContain('"lucide-react": "^1.21.0"');
    expect(appSource).toContain('from "lucide-react"');
    expect(appSource).not.toContain("function NavIcon");
    expect(screen.getByRole("main")).toHaveClass("app-shell-modal-open");
    expect(shellClasses).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    openSettings();
    expect(screen.getByRole("main")).toHaveClass("app-shell-modal-open");
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(styles).toContain(".app-shell-settings-open");
    expect(styles).toContain(".app-shell-modal-open");
    expect(styles).toMatch(/\.app-shell-modal-open > :not\(\.shell-modal-backdrop\) \{[\s\S]*?filter: blur\(8px\) saturate\(0\.72\);[\s\S]*?transform: scale\(1\.01\);/);
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
    expect(workspacePanelStyles).toContain("--workspace-panel-inset-x: 12px;");
    expect(workspacePanelStyles).toContain("--workspace-panel-inset-y: 14px;");
    expect(workspacePanelStyles).toContain("--workspace-panel-gap: 14px;");
    expect(workspacePanelStyles).toContain("--workspace-control-size: 40px;");
    expect(workspacePanelStyles).toContain("--workspace-row-padding-x: 10px;");
    expect(workspacePanelStyles).toContain("--workspace-row-padding-y: 0;");
    expect(workspacePanelStyles).toContain("gap: var(--workspace-panel-gap);");
    expect(workspacePanelStyles).toContain("padding: var(--workspace-panel-inset-y) var(--workspace-panel-inset-x);");
    expect(workspacePanelStyles).not.toContain("padding: 16px 12px 0;");
    expect(workspacePanelStyles).not.toContain("padding-bottom");
    expect(styles).toMatch(/\.app-shell \{[\s\S]*?transition: grid-template-columns 180ms ease;/);
    expect(styles).toMatch(/\.app-shell-workspace-collapsed,[\s\S]*?\.app-shell-workspace-collapsed\.app-shell-settings-open \{[\s\S]*?grid-template-columns: 48px minmax\(520px, 1fr\);/);
    expect(styles).toMatch(/\.workspace-panel-header \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) var\(--workspace-control-size\) var\(--workspace-control-size\);[\s\S]*?gap: var\(--space-control\);/);
    expect(styles).toMatch(/\.workspace-panel-toggle \{[\s\S]*?place-items: center;[\s\S]*?width: var\(--workspace-control-size\);[\s\S]*?min-width: var\(--workspace-control-size\);[\s\S]*?height: var\(--workspace-control-size\);[\s\S]*?min-height: var\(--workspace-control-size\);[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?padding: 0;/);
    expect(styles).toMatch(/\.app-shell-workspace-collapsed \.workspace-panel \{[\s\S]*?--workspace-panel-inset-x: 4px;[\s\S]*?--workspace-panel-inset-y: 8px;[\s\S]*?gap: 0;/);
    expect(styles).toMatch(/\.app-shell-workspace-collapsed \.workspace-brand,[\s\S]*?\.app-shell-workspace-collapsed \.workspace-footer \{[\s\S]*?display: none;/);
    expect(styles).toMatch(/\.workspace-controls \{[\s\S]*?gap: var\(--space-control\);/);
    expect(styles).toMatch(/\.workspace-panel nav \{[\s\S]*?--scrollbar-size: 8px;[\s\S]*?--scrollbar-track: transparent;[\s\S]*?overflow-y: auto;/);
    expect(styles.match(/\.workspace-panel nav \{[\s\S]*?\}/)?.[0] ?? "").not.toContain("margin-top:");
    expect(styles).toContain(".workspace-brand");
    expect(styles).toContain(".workspace-footer");
    const workspaceFooterStyles = styles.match(/\n\.workspace-footer \{[\s\S]*?\}/)?.[0] ?? "";
    expect(workspaceFooterStyles).not.toContain("margin-top:");
    expect(workspaceFooterStyles).not.toMatch(/padding(?:-bottom)?:/);
    expect(styles).toContain(".workspace-settings-trigger");
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
    expect(workspaceRowButtonStyles).toContain("min-height: var(--workspace-control-size);");
    expect(workspaceRowButtonStyles).toContain("padding: var(--workspace-row-padding-y) var(--workspace-row-padding-x);");
    expect(workspaceCreateButtonStyles).toContain("justify-content: flex-start;");
    expect(workspaceCreateButtonStyles).toContain("border-color: transparent;");
    expect(workspaceCreateButtonStyles).toContain("background: transparent;");
    expect(workspaceCreateButtonStyles).toContain("border-radius: 8px;");
    expect(workspaceCreateButtonStyles).toContain("min-height: var(--workspace-control-size);");
    expect(workspaceCreateButtonStyles).toContain("padding: var(--workspace-row-padding-y) var(--workspace-row-padding-x);");
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
    expect(workspaceSearchToggleStyles).toContain("width: var(--workspace-control-size);");
    expect(styles).toContain(".workspace-search-toggle");
    const workspaceMenuStyles = styles.match(/\.workspace-menu \{[\s\S]*?\}/)?.[0] ?? "";
    expect(workspaceMenuStyles).toContain("position: static;");
    expect(workspaceMenuStyles).toContain("gap: var(--dropdown-panel-gap);");
    expect(workspaceMenuStyles).toContain("margin: 0;");
    expect(workspaceMenuStyles).toContain("padding: var(--dropdown-panel-padding);");
    expect(styles).toMatch(/\.workspace-menu button \{[\s\S]*?min-height: var\(--dropdown-item-height\);[\s\S]*?border-radius: var\(--dropdown-item-radius\);/);
    expect(styles).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.workspace-panel \{[\s\S]*?--workspace-panel-inset-x: 14px;[\s\S]*?--workspace-panel-inset-y: 8px;[\s\S]*?padding: var\(--workspace-panel-inset-y\) var\(--workspace-panel-inset-x\);/);
    expect(styles).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.workspace-drawer \{[\s\S]*?--workspace-panel-inset-x: var\(--space-content\);[\s\S]*?--workspace-panel-inset-y: var\(--space-content\);[\s\S]*?padding: var\(--workspace-panel-inset-y\) var\(--workspace-panel-inset-x\);/);
    expect(styles).not.toContain(".purpose-");
    expect(workspaceMenuStyles).not.toContain("position: absolute;");
    expect(styles).toContain(".ui-icon");
    expect(styles).toContain(".shell-modal-backdrop");
    expect(styles).toContain(".shell-modal");
    expect(styles).toContain(".shell-modal-body");
    expect(styles).toMatch(/\.shell-modal-close \{[\s\S]*?width: 44px;[\s\S]*?border-color: var\(--border\);[\s\S]*?background: rgba\(241, 241, 241, 0\.035\);/);
    expect(styles).toMatch(/\.shell-modal-close:hover,[\s\S]*?\.shell-modal-close:focus-visible \{[\s\S]*?border-color: rgba\(143, 182, 232, 0\.55\);[\s\S]*?background: rgba\(143, 182, 232, 0\.12\);[\s\S]*?color: var\(--accent-info\);/);
    const shellModalBackdropStyles = styles.match(/\.shell-modal-backdrop \{[\s\S]*?\}/)?.[0] ?? "";
    expect(shellModalBackdropStyles).toContain("-webkit-backdrop-filter: blur(30px) saturate(0.9);");
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
    const workspaceSettingsTriggerStyles = styles.match(/\.workspace-settings-trigger \{[\s\S]*?\}/)?.[0] ?? "";
    expect(styles).toContain(".settings-content");
    expect(styles).toContain(".settings-row");
    expect(workspaceSettingsTriggerStyles).toContain("display: flex;");
    expect(workspaceSettingsTriggerStyles).toContain("min-height: 42px;");
    expect(workspaceSettingsTriggerStyles).toContain("background: transparent;");
    expect(settingsNavButtonStyles).toContain("padding: 0 10px;");
    expect(styles).not.toContain(".workspace-panel-action");
    expect(styles).not.toContain(".workspace-panel-action-label");
    expect(styles).toContain("--workspace-brand-size: 20px;");
    expect(styles).toContain(".workspace-brand-lockup");
    const brandLockupStyles = styles.match(/\.workspace-brand-lockup \{[\s\S]*?\}/)?.[0] ?? "";
    expect(brandLockupStyles).toContain("width: 112px;");
    const indexHtml = readFileSync("index.html", "utf8");
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(indexHtml).toContain('href="/favicon-light.svg"');
    expect(indexHtml).toContain('href="/favicon-dark.svg"');
    expect(indexHtml).toContain('media="(prefers-color-scheme: light)"');
    expect(indexHtml).toContain('media="(prefers-color-scheme: dark)"');
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
    expect(styles).toContain(".settings-surface-status-list");
    expect(styles).toContain(".settings-surface-status-item");
    expect(styles).not.toContain(".composer-beta-unavailable");
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
    expect(styles).toMatch(/\.setup-modal \{[\s\S]*?width: 100%;[\s\S]*?max-width: 1120px;/);
    expect(styles).toMatch(/\.setup-modal-body \{[\s\S]*?overflow-x: hidden;[\s\S]*?padding: clamp\(14px, 2\.8vw, var\(--space-panel\)\);/);
    expect(styles).toMatch(/\.setup-dialog \{[\s\S]*?box-sizing: border-box;[\s\S]*?gap: clamp\(var\(--space-control\), 2vw, var\(--space-content\)\);[\s\S]*?width: 100%;[\s\S]*?padding: 0;/);
    expect(styles).toMatch(/\.setup-flow-step \{[\s\S]*?padding: clamp\(var\(--space-control\), 1\.7vw, var\(--space-row\)\);/);
    expect(styles).toMatch(/\.setup-picker-section \{[\s\S]*?display: grid;[\s\S]*?gap: clamp\(var\(--space-control\), 1\.4vw, var\(--space-row\)\);[\s\S]*?padding: clamp\(var\(--space-control\), 1\.6vw, var\(--space-row\)\);/);
    expect(styles).toMatch(/\.setup-dialog-form\.settings-section \{[\s\S]*?max-width: none;/);
    expect(styles).toMatch(/\.setup-dialog-form \.settings-field \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?min-height: 0;/);
    expect(styles).toMatch(/\.setup-dialog-form \.settings-field-stacked \{[\s\S]*?padding-block: 0;/);
    expect(styles).toMatch(/\.setup-dialog-form \.settings-field input,[\s\S]*?\.setup-dialog-form \.settings-select \{[\s\S]*?justify-self: stretch;[\s\S]*?max-width: none;/);
    expect(styles).toMatch(/\.setup-dialog-form \.settings-field small \{[\s\S]*?grid-column: 1;/);
    expect(styles).toMatch(/\.setup-dialog-form \.settings-input-action-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto auto;/);
    expect(styles).toContain("--dropdown-control-height: 36px;");
    expect(styles).toContain("--dropdown-item-height: 36px;");
    expect(styles).toContain("--dropdown-item-height-comfortable: 44px;");
    expect(styles).toContain("--dropdown-panel-padding: 4px;");
    expect(styles).toContain("--dropdown-panel-radius: 8px;");
    expect(styles).toContain("--dropdown-item-radius: 6px;");
    expect(styles).toContain("--dropdown-panel-gap: 4px;");
    expect(styles).toContain("--dropdown-panel-border: var(--border);");
    expect(styles).toContain("--dropdown-panel-background: var(--thread-surface);");
    expect(styles).toContain("--dropdown-panel-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);");
    expect(styles).toMatch(/\.orynt-dropdown \{[\s\S]*?position: relative;[\s\S]*?width: 100%;/);
    expect(styles).toMatch(/\.orynt-dropdown-trigger \{[\s\S]*?min-height: var\(--dropdown-control-height\);/);
    expect(styles).toMatch(/\.orynt-dropdown-menu \{[\s\S]*?position: absolute;[\s\S]*?gap: var\(--dropdown-panel-gap\);[\s\S]*?border-radius: var\(--dropdown-panel-radius\);[\s\S]*?background: var\(--dropdown-panel-background\);[\s\S]*?box-shadow: var\(--dropdown-panel-shadow\);[\s\S]*?padding: var\(--dropdown-panel-padding\);/);
    expect(styles).toMatch(/\.orynt-dropdown-option \{[\s\S]*?min-height: var\(--dropdown-item-height\);[\s\S]*?border-radius: var\(--dropdown-item-radius\);/);
    expect(styles).toMatch(/\.orynt-dropdown-density-comfortable \.orynt-dropdown-option \{[\s\S]*?min-height: var\(--dropdown-item-height-comfortable\);/);
    expect(styles).toMatch(/\.orynt-dropdown-menu-dropdown \{[\s\S]*?top: calc\(100% \+ var\(--space-micro\)\);[\s\S]*?bottom: auto;/);
    expect(styles).toMatch(/\.orynt-dropdown-menu-dropup \{[\s\S]*?top: auto;[\s\S]*?bottom: calc\(100% \+ var\(--space-micro\)\);/);
    expect(styles).toMatch(/\.orynt-dropdown-option-title \{[\s\S]*?white-space: nowrap;[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/);
    expect(styles).toMatch(/\.orynt-dropdown-option-description \{[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/);
    expect(styles).toMatch(/\.orynt-dropdown-option-highlighted \{[\s\S]*?background: var\(--message-bubble-agent\);/);
    const selectedMenuStyleSelectors = [
      ".composer-model-menu-option[aria-checked=\"true\"]",
      ".composer-effort-menu-option[aria-checked=\"true\"]",
      ".composer-attachment-menu-item[aria-checked=\"true\"]",
      ".composer-meta-menu-item[aria-checked=\"true\"]",
    ];
    selectedMenuStyleSelectors.forEach((selector) => {
      const selectedStyles = styles.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[\\s\\S]*?\\}`))?.[0] ?? "";
      expect(selectedStyles).not.toContain("background: var(--message-bubble-user)");
    });
    [".composer-model-menu-option[aria-checked=\"true\"]", ".composer-effort-menu-option[aria-checked=\"true\"]"].forEach((selector) => {
      const selectedStyles = styles.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[\\s\\S]*?\\}`))?.[0] ?? "";
      expect(selectedStyles).not.toContain("border-color: rgba(143, 182, 232, 0.42)");
    });
    expect(appSource).toContain('role="menuitemradio"');
    expect(appSource).toContain('aria-checked={isSelectedModel}');
    expect(appSource).not.toContain('role="dialog"\n        aria-label="Choose model"');
    expect(styles).toMatch(/\.composer-model-menu \{[\s\S]*?width: min\(240px, calc\(100vw - 24px\)\);[\s\S]*?max-height: min\(44vh, 320px\);[\s\S]*?border-radius: var\(--dropdown-panel-radius\);[\s\S]*?box-shadow: var\(--dropdown-panel-shadow\);/);
    expect(styles).toMatch(/\.composer-model-menu-dropdown \{[\s\S]*?top: calc\(100% \+ var\(--space-control\)\);/);
    expect(styles).toMatch(/\.composer-model-menu-dropup \{[\s\S]*?bottom: calc\(100% \+ var\(--space-control\)\);/);
    expect(styles).toMatch(/\.composer-model-menu-option \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?min-height: var\(--dropdown-item-height\);/);
    expect(styles).toMatch(/\.composer-model-menu-option:hover:not\(:disabled\) \{[\s\S]*?background: var\(--message-bubble-agent\);/);
    expect(styles).toMatch(/\.composer-model-menu-option:focus-visible \{[\s\S]*?background: var\(--message-bubble-agent\);[\s\S]*?outline: 2px solid var\(--accent-info\);/);
    expect(styles).toMatch(/\.composer-meta-menu \{[\s\S]*?border-radius: var\(--dropdown-panel-radius\);[\s\S]*?box-shadow: var\(--dropdown-panel-shadow\);/);
    expect(styles).toMatch(/\.composer-effort-popover \{[\s\S]*?border-radius: var\(--dropdown-panel-radius\);[\s\S]*?box-shadow: var\(--dropdown-panel-shadow\);/);
    expect(styles).toMatch(/\.agent-response-more-menu \{[\s\S]*?border-radius: var\(--dropdown-panel-radius\);[\s\S]*?box-shadow: var\(--dropdown-panel-shadow\);/);
    expect(styles).not.toMatch(/\.orynt-dropdown-option span,\s*\.orynt-dropdown-option small \{[\s\S]*?overflow-wrap: anywhere;/);
    expect(styles).toMatch(/@media \(max-width: 720px\) \{[\s\S]*?\.setup-dialog-form \.settings-input-action-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
    expect(styles).not.toContain(".orynt-dropdown-grid");
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
    expect(styles).toContain("--thread-surface: #2d2722;");
    expect(styles).toContain("--message-bubble: #352e28;");
    expect(styles).toContain("--message-bubble-agent: #3b332c;");
    expect(styles).toContain("--message-bubble-user: #303947;");
    expect(styles).toContain("--approval-surface: #3b332c;");
    expect(styles).toContain('.app-shell[data-appearance="light"]');
    expect(styles).toContain(".thread");
    expect(appSource).toContain("function ChatBubble");
    expect(appSource).toContain("function MessageBlock");
    expect(appSource).toContain("function AgentDetails");
    expect(appSource).toContain("renderThreadMessages");
    expect(appSource).toContain("pendingSystemMessages");
    expect(appSource).toContain("handleStartThreadHeaderEdit");
    expect(appSource).toContain('aria-label="Edit task name and description"');
    expect(appSource).not.toMatch(/type ThreadMessage = \{[\s\S]*?\bsources\?:/);
    ["Current thread", "Orynt run store", "Repository runner", "User request", "renderAgentResponseSourcesPanel"].forEach((sourceMetadata) => {
      expect(appSource).not.toContain(sourceMetadata);
    });
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
    expect(appSource).toContain('className="agent-details-summary-title"');
    expect(styles).toContain(".agent-details-summary-title");
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
    const agentDetailsSummaryTitleStyles = styles.match(/\.agent-details-summary-title \{[\s\S]*?\}/)?.[0] ?? "";
    const agentDetailsSummaryCountStyles = styles.match(/\.agent-details-summary-title > strong \{[\s\S]*?\}/)?.[0] ?? "";
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
    expect(agentDetailsSummaryTitleStyles).toContain("display: inline-flex;");
    expect(agentDetailsSummaryTitleStyles).toContain("align-items: baseline;");
    expect(agentDetailsSummaryCountStyles).toContain("white-space: nowrap;");
    expect(agentDetailsSummaryCountStyles).toContain("color: rgba(241, 241, 241, 0.42);");
    expect(agentDetailsListStyles).toContain("width: 100%;");
    expect(agentDetailsListStyles).toContain("gap: var(--space-row);");
    expect(agentDetailsListStyles).toContain("margin: var(--space-row) 0 0;");
    expect(agentDetailsListItemStyles).toContain("gap: var(--space-control);");
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
    expect(agentDetailsSubtaskListStyles).toContain("gap: var(--space-control);");
    expect(agentDetailsSubtaskListStyles).toContain("margin: var(--space-control) 0 0;");
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
    expect(styles).not.toContain(".agent-response-sources-button");
    expect(styles).not.toContain(".agent-response-sources-panel");
    expect(styles).not.toContain(".agent-response-source-citation");
    expect(styles).not.toContain(".agent-response-source-link");
    expect(styles).not.toContain(".app-shell-sources-open");
    expect(styles).not.toContain(".app-shell-sources-closed");
    const agentResponseActionsStyles = styles.match(/\.agent-response-actions \{[\s\S]*?\}/)?.[0] ?? "";
    const agentResponseActionButtonStyles = styles.match(/\.agent-response-action-button \{[\s\S]*?\}/)?.[0] ?? "";
    const agentResponseMoreActionStyles = styles.match(/\.agent-response-more-action \{[\s\S]*?\}/)?.[0] ?? "";
    const agentResponseMoreMenuStyles = styles.match(/\.agent-response-more-menu \{[\s\S]*?\}/)?.[0] ?? "";
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
    expect(styles).not.toContain("--z-shell-side-panel:");
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
    expect(messageBlockUserStyles).toContain("width: min(560px, calc(100% - var(--space-row)));");
    expect(messageBlockUserStyles).toContain("max-width: min(560px, calc(100% - var(--space-row)));");
    expect(chatBubbleCompactWidthStyles).toContain("width: fit-content;");
    expect(chatBubbleCompactWidthStyles).toContain("max-width: 100%;");
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
    expect(styles).toMatch(/\.app-notification \{[\s\S]*?background: #202020;/);
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
        .find((block) => block.includes("min-height: 24px;")) ?? "";
    const composerTextareaPlaceholderStyles = styles.match(/\.composer textarea::placeholder \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleNormalStyles = styles.match(/\.composer-scale-normal \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleFullStyles = styles.match(/\.composer-scale-full \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleFullFieldStyles = styles.match(/\.composer-scale-full \.composer-field \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleFullTextareaStyles = styles.match(/\.composer-scale-full textarea \{[\s\S]*?\}/)?.[0] ?? "";
    const composerRepositoryPathStyles = styles.match(/\.composer-repository-path \{[\s\S]*?\}/)?.[0] ?? "";
    const agentGeneratingCheckpointStyles = styles.match(/\.agent-generating-checkpoint \{[\s\S]*?\}/)?.[0] ?? "";
    const agentGeneratingTimerStyles = styles.match(/\.agent-generating-timer \{[\s\S]*?\}/)?.[0] ?? "";
    const composerDirectoryButtonStyles = styles.match(/\.composer-directory-button \{[\s\S]*?\}/)?.[0] ?? "";
    const composerDirectoryButtonHoverStyles = styles.match(/\.composer-directory-button:hover:not\(:disabled\),[\s\S]*?\.composer-directory-button:focus-visible \{[\s\S]*?\}/)?.[0] ?? "";
    const composerDirectoryPathViewStyles = styles.match(/\.composer-directory-path-view \{[\s\S]*?\}/)?.[0] ?? "";
    const composerMetaButtonStyles = styles.match(/\.composer-meta-button \{[\s\S]*?\}/)?.[0] ?? "";
    const composerModelButtonStyles = styles.match(/\.composer-model-button \{[\s\S]*?\}/)?.[0] ?? "";
    const composerEffortPopoverStyles = styles.match(/\.composer-effort-popover \{[\s\S]*?\}/)?.[0] ?? "";
    const composerEffortMenuOptionsStyles = styles.match(/\.composer-effort-menu-options \{[\s\S]*?\}/)?.[0] ?? "";
    const composerEffortMenuOptionStyles = styles.match(/\.composer-effort-menu-option \{[\s\S]*?\}/)?.[0] ?? "";
    const composerMetaButtonIconStyles = styles.match(/\.composer-meta-button \.ui-icon \{[\s\S]*?\}/)?.[0] ?? "";
    const composerToolbarStyles = styles.match(/\.composer-toolbar \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleButtonStyles = styles.match(/\.composer-scale-button \{[\s\S]*?\}/)?.[0] ?? "";
    const composerScaleButtonInteractiveStyles = styles.match(/\.composer-scale-button:hover,[\s\S]*?\.composer-scale-button\[aria-pressed="true"\] \{[\s\S]*?\}/)?.[0] ?? "";
    expect(composerFieldStyles).toContain("display: grid;");
    expect(composerFieldStyles).toContain("position: relative;");
    expect(composerFieldStyles).toContain("--composer-control-size: 32px;");
    expect(composerFieldStyles).toContain("--composer-icon-button-size: var(--composer-control-size);");
    expect(composerFieldStyles).toContain("--composer-inset-x: 12px;");
    expect(composerFieldStyles).toContain("--composer-inset-y: 10px;");
    expect(composerFieldStyles).toContain("--composer-row-gap: 8px;");
    expect(composerFieldStyles).toContain("--composer-control-gap: 8px;");
    expect(composerFieldStyles).toContain("grid-template-rows: auto auto auto auto;");
    expect(composerFieldStyles).toContain("gap: var(--composer-row-gap);");
    expect(composerFieldStyles).toContain("width: 100%;");
    expect(composerFieldStyles).toContain("min-height: 0;");
    expect(composerFieldStyles).toContain("padding: var(--composer-inset-y) var(--composer-inset-x);");
    expect(composerFieldStyles).not.toContain("border:");
    expect(composerFieldStyles).not.toContain("box-shadow:");
    expect(composerFieldStyles).not.toContain("transition:");
    expect(styles).toMatch(/\.input-focus-shell:focus-within,[\s\S]*?\.input-focus-standalone:focus-visible \{[\s\S]*?border-color: rgba\(143, 182, 232, 0\.55\);[\s\S]*?0 0 10px rgba\(143, 182, 232, 0\.12\);/);
    expect(composerTextareaStyles).toContain("padding: 0;");
    expect(composerTextareaStyles).toContain("--scrollbar-size: 8px;");
    expect(composerTextareaStyles).toContain("overflow-y: auto;");
    expect(composerTextareaStyles).toContain("scrollbar-gutter: stable;");
    expect(composerTextareaStyles).toContain("font-weight: 400;");
    expect(composerTextareaStyles).toContain("color: var(--mono-100);");
    expect(composerTextareaPlaceholderStyles).toContain("color: rgba(241, 241, 241, 0.36);");
    expect(composerTextareaPlaceholderStyles).toContain("opacity: 1;");
    expect(composerScaleNormalStyles).toContain("width: min(100%, 1040px);");
    expect(composerScaleFullStyles).toContain("width: min(100%, 1120px);");
    expect(composerScaleFullStyles).toContain("min-height: 0;");
    expect(composerScaleFullFieldStyles).toContain("min-height: 252px;");
    expect(composerScaleFullTextareaStyles).toContain("height: min(34vh, 220px);");
    expect(composerScaleFullTextareaStyles).toContain("min-height: 180px;");
    expect(appSource).toContain('className="composer-repository-path"');
    expect(appSource).toContain('aria-label="Change directory"');
    expect(composerRepositoryPathStyles).toContain("display: grid;");
    expect(composerRepositoryPathStyles).toContain("grid-template-columns: auto minmax(0, 1fr);");
    expect(composerRepositoryPathStyles).toContain("align-items: center;");
    expect(composerRepositoryPathStyles).toContain("gap: var(--composer-control-gap);");
    expect(composerRepositoryPathStyles).toContain("min-height: var(--composer-control-size);");
    expect(composerRepositoryPathStyles).toContain("padding: 0 calc(var(--composer-control-size) + var(--composer-control-gap)) 0 0;");
    expect(styles).not.toContain(".composer-repository-path label");
    expect(composerDirectoryButtonStyles).toContain("display: inline-flex;");
    expect(composerDirectoryButtonStyles).toContain("gap: 0;");
    expect(composerDirectoryButtonStyles).toContain("width: var(--composer-control-size);");
    expect(composerDirectoryButtonStyles).toContain("height: var(--composer-control-size);");
    expect(composerDirectoryButtonStyles).toContain("min-height: var(--composer-control-size);");
    expect(composerDirectoryButtonStyles).toContain("border: 0;");
    expect(composerDirectoryButtonStyles).toContain("background: transparent;");
    expect(composerDirectoryButtonStyles).toContain("cursor: pointer;");
    expect(composerDirectoryButtonStyles).toContain("transition:");
    expect(composerDirectoryButtonHoverStyles).not.toContain("background:");
    expect(composerDirectoryButtonHoverStyles).not.toContain("border-color:");
    expect(composerDirectoryButtonHoverStyles).toContain("transform: translateY(-1px);");
    expect(agentGeneratingCheckpointStyles).toContain("text-overflow: ellipsis;");
    expect(agentGeneratingTimerStyles).toContain("font-variant-numeric: tabular-nums;");
    expect(agentGeneratingTimerStyles).toContain("padding: 0;");
    expect(agentGeneratingTimerStyles).not.toContain("border:");
    expect(agentGeneratingTimerStyles).not.toContain("background:");
    expect(agentGeneratingTimerStyles).not.toContain("border-radius:");
    expect(composerDirectoryPathViewStyles).toContain("color: rgba(241, 241, 241, 0.46);");
    expect(composerDirectoryPathViewStyles).toContain("font-weight: 450;");
    expect(composerDirectoryPathViewStyles).toContain("text-overflow: ellipsis;");
    expect(composerMetaButtonStyles).toContain("display: inline-flex;");
    expect(composerMetaButtonStyles).toContain("justify-content: center;");
    expect(composerMetaButtonStyles).toContain("min-height: var(--composer-control-size);");
    expect(composerMetaButtonStyles).toContain("padding: 0 var(--composer-control-gap);");
    expect(composerModelButtonStyles).toContain("min-height: var(--composer-control-size);");
    expect(composerModelButtonStyles).toContain("padding: 0 var(--composer-control-gap);");
    expect(appSource).toContain("composer-effort-popover composer-effort-popover-${composerQuickMenuPlacement}");
    expect(appSource).toContain('className="composer-effort-menu-options"');
    expect(appSource).toContain('className="composer-effort-menu-option"');
    expect(appSource).toContain('role="menuitemradio"');
    expect(appSource).not.toContain("<select");
    expect(appSource).not.toContain('type="range"');
    expect(composerEffortPopoverStyles).toContain("overflow: visible;");
    expect(composerEffortPopoverStyles).toContain("left: var(--composer-effort-anchor-x, 50%);");
    expect(composerEffortPopoverStyles).toContain("transform: translateX(-50%);");
    expect(composerEffortPopoverStyles).toContain("width: min(240px, calc(100vw - 24px));");
    expect(composerEffortMenuOptionsStyles).toContain("display: grid;");
    expect(composerEffortMenuOptionsStyles).toContain("gap: var(--dropdown-panel-gap);");
    expect(composerEffortMenuOptionStyles).toContain("width: 100%;");
    expect(composerEffortMenuOptionStyles).toContain("min-height: var(--dropdown-item-height);");
    expect(composerEffortMenuOptionStyles).toContain("text-align: left;");
    expect(composerEffortMenuOptionStyles).toContain("cursor: pointer;");
    expect(styles).not.toContain(".composer-effort-select");
    expect(styles).not.toContain(".composer-effort-slider");
    expect(styles).not.toContain("--composer-effort-count");
    expect(composerMetaButtonStyles).toContain("gap: calc(var(--composer-control-gap) - 2px);");
    expect(composerMetaButtonIconStyles).toContain("width: 14px;");
    expect(appSource).toContain('<Shield className="ui-icon" aria-hidden="true" strokeWidth={2} />');
    expect(styles).toMatch(/\.input-focus-control:focus-visible \{[\s\S]*?outline: 0;/);
    expect(styles).toMatch(/\.composer-toolbar \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: space-between;/);
    expect(composerToolbarStyles).toContain("gap: var(--composer-control-gap);");
    expect(composerToolbarStyles).toContain("padding: 0;");
    expect(composerScaleButtonStyles).toContain("display: inline-grid;");
    expect(composerScaleButtonStyles).toContain("position: absolute;");
    expect(composerScaleButtonStyles).toContain("top: var(--composer-inset-y);");
    expect(composerScaleButtonStyles).toContain("right: var(--composer-inset-x);");
    expect(composerScaleButtonStyles).toContain("place-items: center;");
    expect(composerScaleButtonStyles).toContain("width: var(--composer-control-size);");
    expect(composerScaleButtonStyles).toContain("height: var(--composer-control-size);");
    expect(composerScaleButtonStyles).toContain("border: 0;");
    expect(composerScaleButtonStyles).toContain("background: transparent;");
    expect(composerScaleButtonStyles).toContain("padding: 0;");
    expect(composerScaleButtonInteractiveStyles).not.toContain("background: rgba(143, 182, 232, 0.1);");
    expect(styles).toMatch(/\.composer-send-button \{[\s\S]*?display: inline-grid;[\s\S]*?place-items: center;[\s\S]*?width: var\(--composer-control-size\);[\s\S]*?height: var\(--composer-control-size\);[\s\S]*?padding: 0;/);
    expect(appSource).toContain('aria-label="Send task"');
    expect(appSource).toContain('aria-label={composerScaleMode === "full" ? "Collapse composer" : "Expand composer"}');
    expect(appSource).toContain('aria-label="Permission mode"');
    expect(appSource).not.toContain('aria-label="Open settings from composer"');
    expect(appSource).toContain('aria-label="Add content"');
    expect(appSource).not.toContain('className="composer-capability"');
    expect(appSource).not.toContain("Coding Apprentice</span>");
    expect(styles).toContain(".composer-attachment");
    expect(styles).toContain(".composer-attachment-button");
    const composerAttachmentButtonStyles = styles.match(/\.composer-attachment-button \{[\s\S]*?\}/)?.[0] ?? "";
    expect(composerAttachmentButtonStyles).toContain("width: var(--composer-control-size);");
    expect(composerAttachmentButtonStyles).toContain("height: var(--composer-control-size);");
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
    expect(sendIconStyles).toContain("transform: none;");
    expect(styles).toContain("stroke: currentColor;");
    expect(styles).toContain("fill: none;");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) var(--workspace-control-size);");
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

  it("globalizes the chat composer focus treatment across text inputs", async () => {
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
    expect(appSource).toContain("<OryntDropdown");
    expect(appSource).toContain('ariaLabel="Permission mode"');
  });

  it("keeps the launch thread unsaved until the operator writes a prompt", async () => {
    await renderApp(<App />);

    const spaces = screen.getByRole("navigation", { name: "Tasks" });
    expect(within(spaces).getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(within(spaces).getByRole("button", { name: "New task" })).toHaveAttribute("aria-pressed", "true");
    expect(within(spaces).queryByRole("button", { name: "Draft" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create new task" }));

    expect(within(spaces).getAllByRole("button", { name: "New task" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Task for Orynt" })).toHaveAttribute("placeholder", "Describe what Orynt should do...");
    expect(screen.getByRole("heading", { level: 1, name: "New task" })).toBeInTheDocument();
    expect(screen.queryByText("Draft thread.")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("orynt:thread-state:v1")).toBeNull();
  });

  it("edits the active thread header title and description inline", async () => {
    await renderApp(<App />);

    const thread = screen.getByRole("region", { name: "Task conversation" });
    fireEvent.click(within(thread).getByRole("button", { name: "Edit task name and description" }));

    const titleFieldShell = within(thread).getByText("Title").closest(".thread-header-field-shell");
    const descriptionFieldShell = within(thread).getByText("Description").closest(".thread-header-field-shell");
    expect(titleFieldShell).not.toBeNull();
    expect(descriptionFieldShell).not.toBeNull();
    expect(titleFieldShell?.querySelector(".thread-header-field-label")).toHaveTextContent("Title");
    expect(descriptionFieldShell?.querySelector(".thread-header-field-label")).toHaveTextContent("Description");

    const titleInput = within(thread).getByRole("textbox", { name: "Task name" });
    const descriptionInput = within(thread).getByRole("textbox", { name: "Task description" });
    expect(titleInput).toHaveValue("New task");
    expect(descriptionInput).toHaveValue("");

    fireEvent.change(titleInput, { target: { value: "Engineering" } });
    fireEvent.change(descriptionInput, { target: { value: "Repository implementation tasks." } });
    fireEvent.keyDown(descriptionInput, { key: "Enter" });

    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();
    expect(within(thread).getAllByText("Repository implementation tasks.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Engineering" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Task for Orynt" })).toHaveAttribute("placeholder", "Describe the next task for Engineering...");
    fireEvent.click(within(thread).getByRole("button", { name: "Edit task name and description" }));
    const cancelTitleInput = within(thread).getByRole("textbox", { name: "Task name" });
    const cancelDescriptionInput = within(thread).getByRole("textbox", { name: "Task description" });
    fireEvent.change(cancelTitleInput, { target: { value: "Discarded" } });
    fireEvent.change(cancelDescriptionInput, { target: { value: "Discarded description." } });
    fireEvent.keyDown(cancelTitleInput, { key: "Escape" });
    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();
    expect(within(thread).queryByText("Discarded description.")).not.toBeInTheDocument();

    fireEvent.click(within(thread).getByRole("button", { name: "Edit task name and description" }));
    const emptyTitleInput = within(thread).getByRole("textbox", { name: "Task name" });
    const emptyDescriptionInput = within(thread).getByRole("textbox", { name: "Task description" });
    fireEvent.change(emptyTitleInput, { target: { value: "   " } });
    fireEvent.change(emptyDescriptionInput, { target: { value: "Description survives empty title." } });
    fireEvent.keyDown(emptyDescriptionInput, { key: "Enter" });
    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();
    expect(within(thread).getAllByText("Description survives empty title.")).toHaveLength(1);
  });

  it("keeps each thread conversation separate and chronological", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);
    await fillRepositoryPath();

    const spaces = screen.getByRole("navigation", { name: "Tasks" });
    const firstThread = screen.getByRole("region", { name: "Task conversation" });

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), { target: { value: "First thread message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    await waitFor(() => expect(within(firstThread).getAllByText("First thread message").length).toBeGreaterThan(0));
    expect(within(spaces).getByRole("button", { name: "First thread message" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), { target: { value: "Second thread message" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send task" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    await waitFor(() => expect(within(firstThread).getAllByText("Second thread message").length).toBeGreaterThan(0));
    const codeTexts = getArticleTexts(firstThread);
    expect(codeTexts.findIndex((text) => text.includes("First thread message"))).toBeLessThan(
      codeTexts.findIndex((text) => text.includes("Second thread message")),
    );

    fireEvent.click(screen.getByRole("button", { name: "Create new task" }));
    const newThread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(newThread).queryByText("First thread message")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "New task" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), { target: { value: "New thread note" } });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    expect(screen.getAllByText("New thread note").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Task conversation" })).not.toHaveClass("thread-empty");

    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollCalls: Array<{ element: HTMLElement; options: ScrollIntoViewOptions }> = [];
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement, options: ScrollIntoViewOptions) {
        scrollCalls.push({ element: this, options });
      },
    });

    try {
      fireEvent.click(within(spaces).getByRole("button", { name: "First thread message" }));
      const restoredFirstThread = screen.getByRole("region", { name: "Task conversation" });
      expect(within(restoredFirstThread).getAllByText("First thread message").length).toBeGreaterThan(0);
      expect(within(restoredFirstThread).getAllByText("Second thread message").length).toBeGreaterThan(0);
      expect(within(restoredFirstThread).queryByText("New thread note")).not.toBeInTheDocument();
      const latestMessage = Array.from(restoredFirstThread.querySelectorAll<HTMLElement>("[data-message-id]")).at(-1);
      expect(latestMessage).toBeDefined();
      expect(scrollCalls).toContainEqual({
        element: latestMessage,
        options: { block: "end", inline: "nearest", behavior: "auto" },
      });
      const duplicateKeyWarnings = consoleErrorSpy.mock.calls.filter((args) =>
        args.some((arg) => String(arg).includes("Encountered two children with the same key")),
      );
      expect(duplicateKeyWarnings).toHaveLength(0);
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
          configurable: true,
          writable: true,
          value: originalScrollIntoView,
        });
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("persists real threads after the first prompt and restores them on reload", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const firstRender = await renderApp(<App />);
    await fillRepositoryPath();

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), { target: { value: "Persist this thread" } });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    await waitFor(() => expect(screen.getAllByText("Persist this thread").length).toBeGreaterThan(0));
    await waitFor(() => expect(window.localStorage.getItem("orynt:thread-state:v1")).toContain("Persist this thread"));

    firstRender.unmount();
    await renderApp(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Persist this thread" })).toBeInTheDocument();
    expect(screen.getAllByText("Persist this thread").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("navigation", { name: "Tasks" })).queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
  });

  it("scopes created runs to the selected repository workspace instead of the active chat thread", async () => {
    const runState = createMockRunState();
    mockReadyModelSettings();
    const createRunSpy = vi.spyOn(orynt, "createRun");
    dismissPrivateBetaOnboarding();
    await renderApp(<App initialRunState={runState} />);
    await fillRepositoryPath();

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
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

  it("submits the selected local directory with a local repository run", async () => {
    const runState = createMockRunState();
    mockReadyModelSettings();
    const createRunSpy = vi.spyOn(orynt, "createRun");
    const scrollIntoViewSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewSpy,
    });
    dismissPrivateBetaOnboarding();
    await renderApp(<App initialRunState={runState} />);

    await fillRepositoryPath("/home/operator/project");
    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Run a real repository-scoped beta smoke" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Run a real repository-scoped beta smoke", { selector: "p" })).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "start", inline: "nearest", behavior: "smooth" });
    });
    const userMessage = screen.getByText("Run a real repository-scoped beta smoke", { selector: "p" }).closest(".message-block");
    expect(userMessage).toHaveAttribute("data-message-id");
    expect(userMessage?.getAttribute("data-message-id")).toMatch(/-user-\d+$/);
    expect(createRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Run a real repository-scoped beta smoke",
        repositoryPath: "/home/operator/project",
        workspaceId: runState.workspace.id,
      }),
    );
  });

  it("shows send-task loading feedback with an elapsed timer while creating a repository run", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const createRun = createDeferred<{ id: string }>();
    vi.spyOn(orynt, "createRun").mockReturnValue(createRun.promise);
    await renderApp(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set up Orynt" })).not.toBeInTheDocument());
    await fillRepositoryPath();

    vi.useFakeTimers();
    try {
      const composer = screen.getByRole("form", { name: "Task composer" });
      fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
        target: { value: "Run with loading feedback" },
      });
      const send = within(composer).getByRole("button", { name: "Send task" });
      fireEvent.click(send);

      await act(async () => {
        await Promise.resolve();
      });

      expect(send).toBeDisabled();
      expect(send).toHaveAttribute("aria-busy", "true");
      expect(send.querySelector(".probability-loader")).not.toBeNull();
      expect(screen.getAllByText("Run with loading feedback").length).toBeGreaterThan(0);
      const generating = screen.getByRole("status", { name: "Agent is generating response" });
      expect(generating).toHaveClass("agent-thinking-status");
      expect(generating).toHaveTextContent("Generating response");
      expect(generating.querySelector(".probability-loader")).not.toBeNull();
      expect(within(generating).getByText("Checkpoint 0: waiting for run log")).toHaveClass("agent-generating-checkpoint");
      expect(within(generating).getByText("0:00")).toHaveAttribute("aria-label", "Elapsed 0:00");

      await act(async () => {
        vi.advanceTimersByTime(65_000);
      });

      expect(within(generating).getByText("1:05")).toHaveAttribute("aria-label", "Elapsed 1:05");

      await act(async () => {
        createRun.resolve({ id: "run-loading-feedback" });
        await createRun.promise;
        await Promise.resolve();
        await Promise.resolve();
      });
      const outcome = screen.getByRole("article", { name: "Agent response" });
      expect(outcome).toHaveTextContent("did not return a final model response");
      const agentDetails = screen.getByText("Agent details").closest("details");
      if (!agentDetails) {
        throw new Error("Completed repository run status should render as Agent details.");
      }
      expect(agentDetails).toHaveTextContent("run-loading-feedback");
      expect(screen.queryByRole("article", { name: "Agent is generating response" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps streamed run checkpoints inside the generating state until an agent outcome exists", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const createRun = createDeferred<{ id: string }>();
    let runEventHandler: ((event: RunEvent) => void) | undefined;
    vi.spyOn(orynt, "onRunEvent").mockImplementation(async (handler) => {
      runEventHandler = handler;
      return () => {};
    });
    vi.spyOn(orynt, "createRun").mockReturnValue(createRun.promise);
    await renderApp(<App />);
    await fillRepositoryPath();

    await waitFor(() => expect(runEventHandler).toBeDefined());
    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Hide event flood while running" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    await act(async () => {
      runEventHandler?.({
        id: "run-hidden-checkpoint-1",
        runId: "run-hidden-checkpoint",
        sequence: 1,
        type: "codex_execution_started",
        timestamp: "2026-07-07T00:00:01.000Z",
        actor: { kind: "runtime", id: "codex-cli", displayName: "Codex CLI" },
        payload: { summary: "Controlled Codex execution started" },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      } satisfies RunEvent);
      runEventHandler?.({
        id: "run-hidden-checkpoint-2",
        runId: "run-hidden-checkpoint",
        sequence: 2,
        type: "codex_reasoning_summary",
        timestamp: "2026-07-07T00:00:02.000Z",
        actor: { kind: "runtime", id: "codex-cli", displayName: "Codex CLI" },
        payload: { summary: "Checking failure tests" },
        redaction: { applied: false, redactedPaths: [] },
        artifacts: [],
      } satisfies RunEvent);
      await Promise.resolve();
    });

    const generating = screen.getByRole("status", { name: "Agent is generating response" });
    expect(within(generating).getByText(/Checkpoint 2:/)).toHaveTextContent("Act: codex reasoning summary — Checking failure tests");
    expect(document.querySelectorAll(".system-notice-text")).toHaveLength(0);
    expect(screen.queryByText("Act: codex execution started — Controlled Codex execution started")).not.toBeInTheDocument();
  });

  it("keeps the normal composer compact and auto-growing while full mode remains expanded", async () => {
    await renderApp(<App />);
    const styles = readFileSync("src/styles.css", "utf8");
    const appSource = readFileSync("src/App.tsx", "utf8");
    const composer = screen.getByRole("form", { name: "Task composer" });
    const textarea = within(composer).getByRole("textbox", { name: "Task for Orynt" }) as HTMLTextAreaElement;

    expect(composer).toHaveClass("composer-scale-normal");
    expect(textarea).toHaveAttribute("rows", "1");
    await waitFor(() => expect(textarea.style.height).toBe("24px"));

    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 96 });
    fireEvent.change(textarea, { target: { value: "First compact line\nSecond compact line" } });
    await waitFor(() => expect(textarea.style.height).toBe("96px"));

    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 240 });
    fireEvent.change(textarea, { target: { value: "First compact line\nSecond compact line\nThird compact line" } });
    await waitFor(() => expect(textarea.style.height).toBe("144px"));

    const expand = within(composer).getByRole("button", { name: "Expand composer" });
    expect(expand).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(expand);
    expect(composer).toHaveClass("composer-scale-full");
    expect(within(composer).getByRole("button", { name: "Collapse composer" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(textarea.style.height).toBe(""));

    const composerFieldStyles = styles.match(/\.composer-field \{[\s\S]*?\}/)?.[0] ?? "";
    const composerTextareaStyles =
      Array.from(styles.matchAll(/\.composer textarea \{[\s\S]*?\}/g))
        .map((match) => match[0])
        .find((block) => block.includes("min-height: 24px;")) ?? "";
    const composerScaleFullTextareaStyles = styles.match(/\.composer-scale-full textarea \{[\s\S]*?\}/)?.[0] ?? "";
    expect(appSource).toContain("const composerTextareaRef = useRef<HTMLTextAreaElement>(null);");
    expect(appSource).toContain("ref={composerTextareaRef}");
    expect(appSource).toContain("rows={1}");
    expect(composerFieldStyles).toContain("grid-template-rows: auto auto auto auto;");
    expect(composerTextareaStyles).toContain("min-height: 24px;");
    expect(composerTextareaStyles).toContain("max-height: 144px;");
    expect(composerScaleFullTextareaStyles).toContain("height: min(34vh, 220px);");
    expect(composerScaleFullTextareaStyles).toContain("min-height: 180px;");
  });

  it("renders streamed command and model run events as human Agent details", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const createRun = createDeferred<{ id: string }>();
    let runEventHandler: ((event: RunEvent) => void) | undefined;
    vi.spyOn(orynt, "onRunEvent").mockImplementation(async (handler) => {
      runEventHandler = handler;
      return () => {};
    });
    vi.spyOn(orynt, "createRun").mockReturnValue(createRun.promise);
    await renderApp(<App />);
    await fillRepositoryPath();

    await waitFor(() => expect(runEventHandler).toBeDefined());
    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Render rich run events" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    const commandEvent = {
      id: "run-rich-details-event-command",
      runId: "run-rich-details",
      sequence: 1,
      type: "verification_command_finished",
      timestamp: "2026-07-07T00:00:01.000Z",
      actor: { kind: "verifier", id: "deterministic-verifier", displayName: "Deterministic Verifier" },
      payload: {
        summary: "Finished verification command: bun test -- App.test.tsx",
        command: "bun test -- App.test.tsx",
        stdoutSummary: "PASS App.test.tsx\nstdout sentinel",
        exitCode: 0,
        durationMs: 1500,
      },
      redaction: { applied: false, redactedPaths: [] },
      artifacts: [],
    } satisfies RunEvent;
    const modelEvent = {
      id: "run-rich-details-event-model",
      runId: "run-rich-details",
      sequence: 2,
      type: "codex_execution_output_recorded",
      timestamp: "2026-07-07T00:00:02.000Z",
      actor: { kind: "runtime", id: "codex-cli", displayName: "Codex CLI" },
      payload: {
        summary: "Controlled Codex execution output recorded and redacted",
        status: "finished",
        stdoutSummary: "Changed two repository files",
        exitCode: 0,
        lastMessagePreview: "Implemented the command runner fix and verified targeted tests.",
      },
      redaction: { applied: false, redactedPaths: [] },
      artifacts: [
        {
          id: "codex-final-model-response",
          kind: "summary",
          uri: "file:///tmp/codex-execution-last-message.redacted.md",
          label: "Codex final model response",
        },
      ],
    } satisfies RunEvent;
    const reasoningEvent = {
      id: "run-rich-details-event-reasoning",
      runId: "run-rich-details",
      sequence: 3,
      type: "codex_reasoning_summary",
      timestamp: "2026-07-07T00:00:03.000Z",
      actor: { kind: "runtime", id: "codex-cli", displayName: "Codex CLI" },
      payload: {
        summary: "Inspected repository context and selected the minimal patch.",
        text: "Inspected repository context and selected the minimal patch.",
        status: "completed",
      },
      redaction: { applied: false, redactedPaths: [] },
      artifacts: [],
    } satisfies RunEvent;
    const streamedAgentDraftEvent = {
      id: "run-rich-details-event-agent-message-draft",
      runId: "run-rich-details",
      sequence: 4,
      type: "codex_agent_message",
      timestamp: "2026-07-07T00:00:03.500Z",
      actor: { kind: "runtime", id: "codex-cli", displayName: "Codex CLI" },
      payload: {
        summary: "Codex agent response streamed",
        message: "Draft response that should stay in agent details.",
        status: "updated",
      },
      redaction: { applied: false, redactedPaths: [] },
      artifacts: [],
    } satisfies RunEvent;

    const agentMessageEvent = {
      id: "run-rich-details-event-agent-message",
      runId: "run-rich-details",
      sequence: 5,
      type: "codex_agent_message",
      timestamp: "2026-07-07T00:00:04.000Z",
      actor: { kind: "runtime", id: "codex-cli", displayName: "Codex CLI" },
      payload: {
        summary: "Codex agent response streamed",
        message: "Changed packages/fake-codex.txt and verified the focused tests.",
        status: "completed",
      },
      redaction: { applied: false, redactedPaths: [] },
      artifacts: [],
    } satisfies RunEvent;
    vi.spyOn(orynt, "openPersistedRun").mockResolvedValue({
      runId: "run-rich-details",
      taskId: "task-rich-details",
      workspaceId: "workspace-local-alpha",
      goal: "Render rich run events",
      repositoryPath: "/home/operator/project",
      status: "pass",
      artifactRoot: "/tmp/artifacts",
      artifactManifestPath: "/tmp/artifacts/artifact-manifest.json",
      events: [commandEvent, modelEvent, reasoningEvent, streamedAgentDraftEvent, agentMessageEvent],
      artifacts: [],
      usageSummary: {},
      memoryCandidates: [],
      skills: [],
      skillReplayPlan: null,
      modelConnection: null,
      codexConnection: null,
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:04.000Z",
    } satisfies PersistedRunRecord);


    await act(async () => {
      runEventHandler?.(commandEvent);
      runEventHandler?.(modelEvent);
      runEventHandler?.(reasoningEvent);
      runEventHandler?.(streamedAgentDraftEvent);
      runEventHandler?.(agentMessageEvent);
      createRun.resolve({ id: "run-rich-details" });
      await createRun.promise;
    });

    const outcome = await screen.findByRole("article", { name: "Agent response" });
    expect(outcome).toHaveTextContent("Implemented the command runner fix and verified targeted tests.");
    expect(outcome).not.toHaveTextContent("Changed packages/fake-codex.txt and verified the focused tests.");
    const agentDetails = screen.getByText("Agent details").closest("details");
    if (!agentDetails) {
      throw new Error("Agent details should render streamed run events before the agent outcome.");
    }
    expect(agentDetails.closest(".agent-run-block")).toBe(outcome.closest(".agent-run-block"));
    expect(within(agentDetails).getByText("5 trace events")).toBeInTheDocument();
    expect(within(agentDetails).getByText("Command")).toBeInTheDocument();
    expect(within(agentDetails).getByText("Verify: verification command finished — Finished verification command: bun test -- App.test.tsx")).toBeInTheDocument();
    expect(within(agentDetails).getByText("Command: bun test -- App.test.tsx")).toBeInTheDocument();
    expect(within(agentDetails).getAllByText("Exit code: 0")).toHaveLength(2);
    expect(within(agentDetails).getByText(/stdout: PASS App\.test\.tsx\s+stdout sentinel/)).toBeInTheDocument();
    expect(within(agentDetails).getByText("Duration: 1.5s")).toBeInTheDocument();
    expect(within(agentDetails).getAllByText("Model")).toHaveLength(3);
    expect(within(agentDetails).getByText("Act: codex execution output recorded — Controlled Codex execution output recorded and redacted")).toBeInTheDocument();
    expect(within(agentDetails).getByText("stdout: Changed two repository files")).toBeInTheDocument();
    expect(within(agentDetails).getByText("Model response: Implemented the command runner fix and verified targeted tests.")).toBeInTheDocument();
    expect(within(agentDetails).getByText("Act: codex reasoning summary — Inspected repository context and selected the minimal patch.")).toBeInTheDocument();
    expect(within(agentDetails).getAllByText("Act: codex agent message — Codex agent response streamed")).toHaveLength(2);
    expect(screen.queryByText("Draft response that should stay in agent details.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Repository harness run completed for Render rich run events/)).not.toBeInTheDocument();
    expect(within(agentDetails).getByText("Artifacts: Codex final model response")).toBeInTheDocument();
    expect(within(agentDetails).queryByText(/run_event/)).not.toBeInTheDocument();
  });

  it("renders a UXRay preview fixture with a final agent response instead of the blank task state", async () => {
    await renderApp(<App seedUxrayAgentResponse />);

    expect(screen.queryByRole("dialog", { name: "Set up Orynt" })).not.toBeInTheDocument();
    const outcome = screen.getByRole("article", { name: "Agent response" });
    expect(outcome).toHaveTextContent("Implemented the response rendering repair");
    expect(within(outcome).getByRole("heading", { name: "Verification" })).toBeInTheDocument();
    expect(within(outcome).getAllByRole("listitem")).toHaveLength(5);
    expect(outcome.querySelector(".agent-response-content > ol")).not.toBeNull();
  });

  it("renders final agent responses as markdown instead of raw markdown text", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "createRun").mockResolvedValue({ id: "run-markdown-response" });
    vi.spyOn(orynt, "openPersistedRun").mockResolvedValue({
      runId: "run-markdown-response",
      taskId: "task-markdown-response",
      workspaceId: "workspace-local-alpha",
      goal: "Render markdown response",
      repositoryPath: "/home/operator/project",
      status: "pass",
      artifactRoot: "/tmp/artifacts",
      artifactManifestPath: "/tmp/artifacts/artifact-manifest.json",
      events: [
        {
          id: "run-markdown-response-event",
          runId: "run-markdown-response",
          sequence: 1,
          type: "codex_execution_output_recorded",
          timestamp: "2026-07-07T00:00:01.000Z",
          actor: { kind: "runtime", id: "codex-cli", displayName: "Codex CLI" },
          payload: {
            summary: "Controlled Codex execution output recorded",
            lastMessagePreview:
              "## Done\n\n**Bold result** with `inline code`.\n\n- First item\n- Second item\n\n" +
              "1. Install workspace dependencies.\n2. Run contract tests:\n   - `bun test:contracts`\n   - `bun --filter @codepawl/coding-apprentice test`\n4. Run the full local smoke walkthrough.\n\n" +
              "[Docs](https://example.com)\n\nLocal file: [`oryntClient.ts`](/home/operator/project/apps/desktop/src/oryntClient.ts)\n\n" +
              "Full final response line. ".repeat(100) +
              "Tail after former truncation sentinel.",
          },
          redaction: { applied: false, redactedPaths: [] },
          artifacts: [],
        },
      ],
      artifacts: [],
      usageSummary: {},
      memoryCandidates: [],
      skills: [],
      skillReplayPlan: null,
      modelConnection: null,
      codexConnection: null,
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:01.000Z",
    } satisfies PersistedRunRecord);
    await renderApp(<App />);
    await fillRepositoryPath();

    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Render markdown response" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    const outcome = await screen.findByRole("article", { name: "Agent response" });
    expect(within(outcome).getByRole("heading", { name: "Done" })).toBeInTheDocument();
    expect(within(outcome).getByText("Bold result").tagName).toBe("STRONG");
    expect(within(outcome).getByText("inline code").tagName).toBe("CODE");
    expect(within(outcome).getAllByRole("listitem")).toHaveLength(7);
    const orderedSteps = outcome.querySelector(".agent-response-content > ol");
    expect(orderedSteps).not.toBeNull();
    expect(orderedSteps?.children).toHaveLength(3);
    expect(orderedSteps?.children[1]?.querySelector(":scope > ul")).not.toBeNull();
    expect(orderedSteps?.children[2]).toHaveProperty("value", 4);
    expect(within(outcome).getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://example.com");
    const localFileReference = within(outcome).getByText("oryntClient.ts");
    expect(localFileReference.tagName).toBe("CODE");
    expect(localFileReference.closest("a")).toBeNull();
    expect(outcome).not.toHaveTextContent("/home/operator/project/apps/desktop/src/oryntClient.ts");
    expect(outcome).toHaveTextContent("Tail after former truncation sentinel.");
    expect(outcome).not.toHaveTextContent("[TRUNCATED]");
    expect(outcome).not.toHaveTextContent("**Bold result**");
  });

  it("answers simple greetings and smoke-test prompts locally instead of launching a repository run", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const createRunSpy = vi.spyOn(orynt, "createRun").mockResolvedValue({ id: "run-should-not-start" });
    await renderApp(<App />);
    await fillRepositoryPath();

    const composer = screen.getByRole("form", { name: "Task composer" });
    const textbox = within(composer).getByRole("textbox", { name: "Task for Orynt" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "say hello" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    fireEvent.change(textbox, {
      target: { value: "test" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    fireEvent.change(textbox, {
      target: { value: "test nè" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    const outcomes = await screen.findAllByRole("article", { name: "Agent response" });
    expect(outcomes[0]).toHaveTextContent("Hi — send a repository task");
    expect(outcomes[1]).toHaveTextContent("Test received — send a repository task");
    expect(outcomes[2]).toHaveTextContent("Test received — send a repository task");
    expect(screen.queryByText("Repository harness run completed")).not.toBeInTheDocument();
    expect(createRunSpy).not.toHaveBeenCalled();
  });

  it("renders repository harness completion metadata in Agent details while still showing a no-final-answer response", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "createRun").mockResolvedValue({ id: "run-harness-pass" });
    await renderApp(<App />);
    await fillRepositoryPath();

    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Verify harness output is visible" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    const outcome = await screen.findByRole("article", { name: "Agent response" });
    expect(outcome).toHaveTextContent("finished the repository run");
    expect(outcome).toHaveTextContent("did not return a final model response");
    expect(outcome).not.toHaveTextContent("Repository harness run completed");
    const agentDetails = screen.getByText("Agent details").closest("details");
    if (!agentDetails) {
      throw new Error("Repository harness completion fallback should render as Agent details.");
    }
    expect(agentDetails).toHaveTextContent("Repository harness run completed");
    expect(agentDetails).toHaveTextContent("run-harness-pass");
    expect(agentDetails).toHaveTextContent("Open persisted evidence");
    expect(agentDetails).not.toHaveTextContent("did not return a final model response");
    expect(screen.queryByRole("article", { name: "Agent is generating response" })).not.toBeInTheDocument();
  });

  it("renders legacy persisted repository completion fallbacks as details plus a no-final-answer response", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    window.localStorage.setItem(
      "orynt:thread-state:v1",
      JSON.stringify({
        workspaces: [{ id: "legacy-thread", label: "say hello", description: "", badge: "saved" }],
        threadMessagesByWorkspace: {
          "legacy-thread": [
            { id: "legacy-thread-user-1", role: "user", content: "say hello" },
            {
              id: "legacy-thread-agent-run-complete-run-desktop-ea5d79823d-1-2",
              runId: "run-desktop-ea5d79823d-1",
              role: "agent",
              label: "Agent response",
              content:
                "Repository harness run completed for say hello. Run ID: run-desktop-ea5d79823d-1. Open persisted evidence from the run list to inspect events, artifacts, verification, memory, and replay outputs.",
            },
          ],
        },
        nextWorkspaceThreadIndex: 2,
        activeWorkspaceId: "legacy-thread",
      }),
    );

    await renderApp(<App />);

    const outcome = screen.getByRole("article", { name: "Agent response" });
    expect(outcome).toHaveTextContent("finished the repository run");
    expect(outcome).toHaveTextContent("did not return a final model response");
    expect(outcome).not.toHaveTextContent("Repository harness run completed");
    const agentDetails = screen.getByText("Agent details").closest("details");
    if (!agentDetails) {
      throw new Error("Legacy repository completion fallback should render as Agent details.");
    }
    expect(agentDetails).toHaveTextContent("Repository harness run completed for say hello");
    expect(agentDetails).toHaveTextContent("run-desktop-ea5d79823d-1");
  });

  it("renders controlled Codex execution evidence when the selected model path actually ran", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "createRun").mockResolvedValue({ id: "run-codex-pass" });
    vi.spyOn(orynt, "openPersistedRun").mockResolvedValue({
      runId: "run-codex-pass",
      taskId: "task-1",
      workspaceId: "workspace-local-alpha",
      goal: "Verify selected model path is visible",
      repositoryPath: "/home/operator/project",
      status: "pass",
      artifactRoot: "/tmp/artifacts",
      artifactManifestPath: "/tmp/artifacts/artifact-manifest.json",
      events: [
        {
          id: "run-codex-pass-event-started",
          runId: "run-codex-pass",
          sequence: 1,
          type: "run_started",
          timestamp: "2026-07-07T00:00:00.000Z",
          actor: { kind: "runtime", id: "tauri-host" },
          payload: { summary: "Run started" },
          redaction: { applied: false, redactedPaths: [] },
          artifacts: [],
        },
        {
          id: "run-codex-pass-event-codex-started",
          runId: "run-codex-pass",
          sequence: 2,
          type: "codex_execution_started",
          timestamp: "2026-07-07T00:00:01.000Z",
          actor: { kind: "runtime", id: "codex-cli" },
          payload: { summary: "Controlled Codex execution started" },
          redaction: { applied: false, redactedPaths: [] },
          artifacts: [],
        },
        {
          id: "run-codex-pass-event-codex-finished",
          runId: "run-codex-pass",
          sequence: 3,
          type: "codex_execution_finished",
          timestamp: "2026-07-07T00:00:02.000Z",
          actor: { kind: "runtime", id: "codex-cli" },
          payload: { summary: "Controlled Codex execution finished", exitCode: 0 },
          redaction: { applied: false, redactedPaths: [] },
          artifacts: [],
        },
      ],
      artifacts: [],
      usageSummary: {},
      memoryCandidates: [],
      skills: [],
      skillReplayPlan: null,
      modelConnection: null,
      codexConnection: null,
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
    } satisfies PersistedRunRecord);
    await renderApp(<App />);
    await fillRepositoryPath();

    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Verify selected model path is visible" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    const outcome = await screen.findByRole("article", { name: "Agent response" });
    expect(outcome).toHaveTextContent("finished the repository run");
    expect(outcome).toHaveTextContent("did not return a final model response");
    expect(outcome).not.toHaveTextContent("Codex CLI execution ran under the selected model connection");
    const agentDetails = screen.getByText("Agent details").closest("details");
    if (!agentDetails) {
      throw new Error("Controlled Codex execution evidence should render as Agent details until a final model response exists.");
    }
    expect(agentDetails).toHaveTextContent("Codex CLI execution ran under the selected model connection");
    expect(agentDetails).toHaveTextContent("execution log");
  });

  it("renders a visible agent error when repository harness run creation fails", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const runnerError = new Error("repository run failed: Error: Controlled Codex execution failed: execution_failed. at LocalCodingApprenticeDemoOrchestrator.runDemo (file:///dist/index.js:512:23)");
    vi.spyOn(orynt, "createRun").mockRejectedValue(runnerError);
    await renderApp(<App />);
    await fillRepositoryPath();

    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Verify harness error is visible" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    const outcome = await screen.findByRole("article", { name: "Agent response" });
    expect(outcome).toHaveTextContent("No execution plan was created");
    expect(outcome).toHaveTextContent("task draft was preserved");
    expect(outcome).toHaveTextContent("Controlled Codex execution failed: execution_failed.");
    expect(outcome).not.toHaveTextContent("LocalCodingApprenticeDemoOrchestrator.runDemo");
    expect(outcome).not.toHaveTextContent("file:///dist/index.js");
    const agentDetails = screen.getByText("Agent details").closest("details");
    if (!agentDetails) {
      throw new Error("Repository failure should render as Agent details.");
    }
    expect(agentDetails).toHaveTextContent("Latest: Error: repository run failed");
    expect(agentDetails).toHaveTextContent("Controlled Codex execution failed: execution_failed.");
    expect(screen.queryByRole("article", { name: "Agent is generating response" })).not.toBeInTheDocument();
  });

  it("renders string repository runner errors returned by Tauri", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "createRun").mockRejectedValue("repository run failed: Git repository root is outside the allowed repository scope.");
    await renderApp(<App />);
    await fillRepositoryPath();

    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Verify Tauri string errors are visible" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));

    const outcome = await screen.findByRole("article", { name: "Agent response" });
    expect(outcome).toHaveTextContent("No execution plan was created");
    expect(outcome).toHaveTextContent("task draft was preserved");
    expect(outcome).toHaveTextContent("Git repository root is outside the allowed repository scope");
    expect(outcome).not.toHaveTextContent("Unknown repository runner error");
  });

  it("lists persisted repository runs after restart and reopens one with events and artifacts", async () => {
    vi.spyOn(orynt, "listPersistedRuns").mockResolvedValue([
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
    vi.spyOn(orynt, "openPersistedRun").mockResolvedValue({
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
    vi.spyOn(orynt, "listArtifactEvidence").mockResolvedValue([
      {
        artifactId: "contract",
        label: "Codex contract",
        kind: "contract",
        status: "verified",
        byteSize: 512,
        contentType: "text/markdown",
      },
    ]);

    await renderApp(<App />);
    const settings = openSettings();
    const settingsNav = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(settingsNav).queryByRole("button", { name: "Orynt Code" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Repository run history" })).not.toBeInTheDocument();
    expect(within(settings).queryByText("Reload durable repository run")).not.toBeInTheDocument();
  });

  it("opens persisted run artifacts through the hardened evidence viewer", async () => {
    vi.spyOn(orynt, "listPersistedRuns").mockResolvedValue([
      {
        runId: "run-persisted-evidence",
        taskId: "task-persisted",
        workspaceId: "workspace-local-alpha",
        goal: "Inspect durable evidence",
        repositoryPath: "/repo/orynt",
        status: "pass",
        artifactManifestPath: "/app-data/artifacts/run-persisted-evidence/artifact-manifest.json",
        eventCount: 1,
        artifactCount: 4,
        memoryCandidateCount: 1,
        skillCount: 1,
        updatedAt: "2026-07-04T00:00:01.000Z",
      },
    ]);
    vi.spyOn(orynt, "openPersistedRun").mockResolvedValue({
      runId: "run-persisted-evidence",
      taskId: "task-persisted",
      workspaceId: "workspace-local-alpha",
      goal: "Inspect durable evidence",
      repositoryPath: "/repo/orynt",
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
    vi.spyOn(orynt, "listArtifactEvidence").mockResolvedValue([
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
    vi.spyOn(orynt, "readArtifactEvidence").mockResolvedValue({
      artifactId: "contract",
      label: "Contract",
      kind: "contract",
      status: "verified",
      contentType: "text/markdown",
      byteSize: 640,
      content: "Repository contract\n[REDACTED_SECRET]\n",
    });

    await renderApp(<App />);
    const settings = openSettings();
    const settingsNav = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(settingsNav).queryByRole("button", { name: "Orynt Code" })).not.toBeInTheDocument();
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
        authMethod: "codexCliSession",
        status: "ready",
        lastPreflight: {
          checkedProviderId: "codex-cli",
          checkedModelId: "gpt-5.5",
          status: "ready",
          ready: true,
          checkedAt: "2026-07-04T00:00:00.000Z",
          executablePath: "/usr/local/bin/codex",
          authMode: "codexCliSession",
          reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
          warnings: [],
        },
      },
    });
    vi.spyOn(orynt, "getSettings").mockResolvedValueOnce(initialSettings).mockResolvedValue(readySettings);
    const preflightCodexConnectionSpy = vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue(readyConnection.lastPreflight);
    const saveModelConnectionSpy = vi.spyOn(orynt, "saveModelConnection").mockResolvedValue({
      providerId: "codex-cli",
      providerLabel: "Codex CLI",
      modelId: "gpt-5.5",
      modelLabel: "GPT-5.5",
      authMethod: "codexCliSession",
      status: "authRequired",
      lastPreflight: null,
    });
    const listProviderModelsSpy = vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-04T00:00:00.000Z",
      warnings: [],
      models: [
        { id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" },
      ],
    });

    await renderApp(<App />);
    const setupDialog = screen.getByRole("dialog", { name: "Set up Orynt" });

    expect(within(setupDialog).queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("region", { name: "Setup model provider" })).toBeInTheDocument();
    expect(within(setupDialog).getByText("Select provider and model.")).toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByLabelText("Codex access token")).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use access token" })).not.toBeInTheDocument();

    expect(saveModelConnectionSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(preflightCodexConnectionSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listProviderModelsSpy).toHaveBeenCalledWith({ providerId: "codex-cli", envKey: null }));

    expect((await within(setupDialog).findAllByText("Codex CLI is installed and authenticated with ChatGPT.")).length).toBeGreaterThan(0);
    expect(await within(setupDialog).findByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-5.5");
    expect(within(setupDialog).getByText("Ready")).toBeInTheDocument();
  });

  it("keeps access-token login out of the default Codex setup UI", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightCodexConnection").mockReturnValue(
      new Promise(() => {}),
    );

    await renderApp(<App />);
    const setupDialog = screen.getByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");
    await flushApp();

    expect(within(setupDialog).queryByLabelText("Codex access token")).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use access token" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Open browser login" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Open Codex login" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use device code" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("button", { name: "Skip auto check" })).toBeInTheDocument();
    expect(within(setupDialog).getByText("Existing Codex CLI session")).toBeInTheDocument();
    expect(setupDialog).toHaveTextContent(/run `codex login` in a terminal/i);
  });

  it("opens Codex CLI login terminals from setup without backup OAuth links", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "authRequired",
      ready: false,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: null,
      reasons: ["No authenticated Codex CLI session was detected."],
      warnings: [],
    });
    const launchCodexLoginSpy = vi.spyOn(orynt, "launchCodexLogin").mockImplementation(async (input) => ({
      method: input.method,
      command: input.method === "deviceCode" ? "codex login --device-auth" : "codex login",
      message: input.method === "deviceCode" ? "Opened Codex device-code login in a terminal." : "Opened Codex login in a terminal.",
      loginUrl: null,
    }));

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Skip auto check" }));

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Open Codex login" }));
    await waitFor(() => expect(launchCodexLoginSpy).toHaveBeenCalledWith({ method: "browser" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "Orynt notifications" })).toHaveTextContent(/Opened Codex login in a terminal/i));
    expect(within(setupDialog).queryByText(/Backup link:/i)).not.toBeInTheDocument();

    fireEvent.click(within(setupDialog).getByRole("button", { name: "Use device code" }));
    await waitFor(() => expect(launchCodexLoginSpy).toHaveBeenCalledWith({ method: "deviceCode" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "Orynt notifications" })).toHaveTextContent(/Opened Codex device-code login in a terminal/i));
  });

  it("checks Codex CLI without starting browser login", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    const preflightCodexConnectionSpy = vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "ready",
      ready: true,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgpt",
      reasons: ["Codex CLI is installed and authenticated with ChatGPT."],
      warnings: [],
    });
    vi.spyOn(orynt, "listProviderModels").mockResolvedValue({
      providerId: "codex-cli",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      warnings: [],
      models: [{ id: "gpt-5.5", label: "GPT-5.5", description: "Live Codex model.", source: "codex-cli" }],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");
    expect(within(setupDialog).queryByRole("button", { name: "Connect with ChatGPT" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Open Codex login" })).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("button", { name: "Use device code" })).not.toBeInTheDocument();
    expect(within(setupDialog).getByRole("button", { name: "Skip auto check" })).toBeInTheDocument();

    await waitFor(() => expect(preflightCodexConnectionSpy).toHaveBeenCalledTimes(1));
    const readyMessages = await within(setupDialog).findAllByText(/Codex CLI is installed and authenticated with ChatGPT/i);
    expect(readyMessages.some((message) => message.classList.contains("setup-log-text-success"))).toBe(true);
  });

  it("shows external terminal guidance when Codex CLI is not authenticated", async () => {
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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
    vi.spyOn(orynt, "preflightCodexConnection").mockResolvedValue({
      checkedConnectionId: "codex-cli",
      status: "authRequired",
      ready: false,
      checkedAt: "2026-07-05T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: null,
      reasons: ["No authenticated Codex CLI session was detected."],
      warnings: [],
    });

    await renderApp(<App />);
    const setupDialog = await screen.findByRole("dialog", { name: "Set up Orynt" });
    selectSetupDropdownOption(setupDialog, "Provider", "Codex CLI");

    await waitFor(() => {
      const authMessages = within(setupDialog).getAllByText(/Open Codex login here to run `codex login`/i);
      expect(authMessages.some((message) => message.classList.contains("setup-log-text-warning"))).toBe(true);
    });
    expect(within(setupDialog).queryByText(/Codex login failed/i)).not.toBeInTheDocument();
    expect(within(setupDialog).queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows first-run setup dialog and blocks completion until setup is ready", async () => {
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(withPreferenceSettings({
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
    const { unmount } = await renderApp(<App />);

    const onboarding = screen.getByRole("dialog", { name: "Set up Orynt" });
    expect(within(onboarding).queryByRole("heading", { name: "Set up Orynt" })).not.toBeInTheDocument();
    expect(onboarding.querySelectorAll("#setup-dialog-title")).toHaveLength(1);
    expect(within(onboarding).getByText(/Repository-only beta/i)).toBeInTheDocument();
    expect(within(onboarding).getByText("Choose a local directory", { selector: "strong" })).toBeInTheDocument();
    expect(within(onboarding).getByText(/Choose model provider/i)).toBeInTheDocument();
    expect(within(onboarding).getByText(/Review advanced defaults/i)).toBeInTheDocument();
    expect(within(onboarding).getByText("Repository-only execution.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Task conversation" })).queryByRole("region", { name: "Setup guide" })).not.toBeInTheDocument();

    fireEvent.click(within(onboarding).getByRole("button", { name: "Complete setup" }));

    expect(updateSettingsSpy).not.toHaveBeenCalledWith({ welcomeCompleted: true });
    expect(window.localStorage.getItem(privateBetaOnboardingStorageKey)).toBeNull();
    expect(await within(onboarding).findByText("Select a local directory before completing setup.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Set up Orynt" })).toBeInTheDocument();

    unmount();
    expect(window.localStorage.getItem(privateBetaOnboardingStorageKey)).toBeNull();
  });

  it("honors legacy CodePawl onboarding dismissal state", async () => {
    window.localStorage.setItem(legacyPrivateBetaOnboardingStorageKey, "dismissed");

    await renderApp(<App />);

    expect(screen.queryByRole("dialog", { name: "Set up Orynt" })).not.toBeInTheDocument();
  });

  it("moves unavailable beta surfaces from the composer into settings status", async () => {
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);

    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(thread).queryByLabelText("Unavailable beta surfaces")).not.toBeInTheDocument();

    const settings = openSettings();
    const settingsSections = within(settings).getByRole("navigation", { name: "Settings sections" });
    expect(within(settingsSections).getByRole("button", { name: "Status" })).toBeInTheDocument();
    fireEvent.click(within(settingsSections).getByRole("button", { name: "Status" }));

    expect(within(settings).getByRole("heading", { name: "Status" })).toBeInTheDocument();
    const betaSurfaces = within(settings).getByRole("region", { name: "Unavailable beta surfaces" });
    expect(within(betaSurfaces).getByText("Repository")).toBeInTheDocument();
    expect(within(betaSurfaces).getByText("Available")).toBeInTheDocument();
    for (const surface of ["Browser", "Desktop", "Files", "Terminal", "Cloud"]) {
      expect(within(betaSurfaces).getByText(`${surface} unavailable`)).toBeInTheDocument();
    }
    expect(within(settings).queryByRole("button", { name: "Setup" })).not.toBeInTheDocument();
    expect(within(settings).queryByText("Codex connection readiness")).not.toBeInTheDocument();
  });

  it("blocks repository submission until onboarding and directory path are ready", async () => {
    const createRunSpy = vi.spyOn(orynt, "createRun");
    const { unmount } = await renderApp(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss set up Orynt/i }));

    await fillRepositoryPath("/home/operator/project");
    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Run before onboarding" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Finish private beta onboarding before starting a task.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Task for Orynt" })).toHaveValue("Run before onboarding");
    expect(screen.queryByText("Run before onboarding", { selector: ".chat-bubble p" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Set up Orynt" })).toBeInTheDocument();
    expect(createRunSpy).not.toHaveBeenCalled();

    unmount();
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Run without directory path" },
    });
    expect(screen.getByRole("button", { name: "Send task" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Task composer" }));

    expect(await screen.findByText("Select a local directory before starting a run.")).toBeInTheDocument();
    expect(createRunSpy).not.toHaveBeenCalled();
  });

  it("treats backend repository path validation as setup blocked instead of a harness failure", async () => {
    mockReadyModelSettings({ defaultRepositoryPath: "/home/operator/project" });
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "createRun").mockRejectedValue(new Error("repositoryPath must point to a selected local directory"));

    await renderApp(<App />);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Set up Orynt" })).not.toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Run with a stale repository selection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Select a local directory before starting a run.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Set up Orynt" })).toBeInTheDocument();
    expect(screen.queryByText(/Repository harness run failed before Orynt received usable output/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error: repository run failed/i)).not.toBeInTheDocument();
  });

  it("blocks real repository submission when Codex connection setup is missing", async () => {
    const createRunSpy = vi.spyOn(orynt, "createRun");
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "getSettings").mockResolvedValue(withPreferenceSettings({
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

    await renderApp(<App />);
    await fillRepositoryPath("/home/operator/project");
    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Run without Codex connection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Choose a provider and run the provider check before real supervised tasks.")).toBeInTheDocument();
    expect(createRunSpy).not.toHaveBeenCalled();
  });

  it("preflights the saved model connection before repository submission and blocks stale Codex auth", async () => {
    const createRunSpy = vi.spyOn(orynt, "createRun").mockResolvedValue({ id: "run-should-not-start" });
    const readySettings = readyModelSettings();
    dismissPrivateBetaOnboarding();
    vi.spyOn(orynt, "getSettings").mockResolvedValue(readySettings);
    const preflightModelConnectionSpy = vi.spyOn(orynt, "preflightModelConnection").mockResolvedValue({
      checkedProviderId: "codex-cli",
      checkedModelId: "gpt-5.5",
      status: "authRequired",
      ready: false,
      checkedAt: "2026-07-09T00:00:00.000Z",
      executablePath: "/usr/local/bin/codex",
      authMode: "chatgptOAuth",
      reasons: ["No authenticated Codex CLI session was detected."],
      warnings: [],
    });

    await renderApp(<App />);
    await fillRepositoryPath("/home/operator/project");
    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "read the codebase and tell me what is it for" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findAllByText("No authenticated Codex CLI session was detected.")).not.toHaveLength(0);
    expect(screen.getByRole("textbox", { name: "Task for Orynt" })).toHaveValue(
      "read the codebase and tell me what is it for",
    );
    expect(screen.getByText("read the codebase and tell me what is it for", { selector: ".chat-bubble p" })).toBeInTheDocument();
    expect(screen.getAllByText(/Provider check failed before starting the repository run/i)).not.toHaveLength(0);
    expect(preflightModelConnectionSpy).toHaveBeenCalledTimes(1);
    expect(createRunSpy).not.toHaveBeenCalled();
  });

  it("surfaces one clarification question and binds its selected option to the original goal", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const understandPromptSpy = vi
      .spyOn(orynt, "understandPrompt")
      .mockResolvedValueOnce({
        schemaVersion: 1,
        promptId: "prompt-scope",
        outcome: "repository_action",
        readiness: "clarification_required",
        reply: "Choose the first material scope.",
        conversationSummary: "The operator is selecting the target surface.",
        refinedBrief: null,
        questions: [
          {
            id: "surface",
            prompt: "Which surface should change?",
            rationale: "The target changes file ownership.",
            kind: "constraint",
            options: [
              {
                id: "desktop",
                label: "Desktop",
                description: "Change only the desktop surface.",
                recommended: true,
              },
              {
                id: "cli",
                label: "CLI",
                description: "Change only the terminal surface.",
                recommended: false,
              },
            ],
          },
          {
            id: "validation",
            prompt: "Which validation should run?",
            rationale: "The acceptance gate is material.",
            kind: "validation",
            options: [],
          },
        ],
        assumptions: [],
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        promptId: "prompt-ready",
        outcome: "repository_action",
        readiness: "ready",
        reply: "The desktop request is ready.",
        conversationSummary: "The operator selected the desktop surface.",
        refinedBrief: {
          goal: "Harden prompt understanding.",
          deliverables: [],
          constraints: ["Desktop only."],
          acceptanceCriteria: [],
          nonGoals: [],
        },
        questions: [],
        assumptions: [],
      });
    const createRunSpy = vi.spyOn(orynt, "createRun").mockResolvedValue({
      id: "run-prompt-ready",
      status: "waiting_for_approval",
      summary: "Review the bound plan.",
    });
    await renderApp(<App />);
    await fillRepositoryPath();

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Harden prompt understanding" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Which surface should change?")).toBeInTheDocument();
    expect(screen.queryByText("Which validation should run?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Desktop/u }));
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    await waitFor(() => expect(understandPromptSpy).toHaveBeenCalledTimes(2));
    expect(understandPromptSpy.mock.calls[1]?.[0]).toMatchObject({
      basis: {
        rawPrompt: "Harden prompt understanding",
        clarificationAnswers: [
          {
            questionId: "surface",
            answer: "Desktop",
            selectedOptionId: "desktop",
          },
        ],
      },
    });
    expect(createRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Harden prompt understanding",
        promptBasis: expect.objectContaining({
          rawPrompt: "Harden prompt understanding",
        }),
      }),
    );
  });

  it("never treats typed text as assumption confirmation and restores the raw prompt on rejection", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const understandPromptSpy = vi.spyOn(orynt, "understandPrompt").mockResolvedValue({
      schemaVersion: 1,
      promptId: "prompt-assumption",
      outcome: "repository_action",
      readiness: "assumption_confirmation_required",
      reply: "Confirm the material scope assumption.",
      conversationSummary: "A desktop default is awaiting confirmation.",
      refinedBrief: {
        goal: "Use the selected repository.",
        deliverables: [],
        constraints: [],
        acceptanceCriteria: [],
        nonGoals: [],
      },
      questions: [],
      assumptions: [
        { id: "desktop-default", text: "Use desktop defaults.", affectsScope: true },
      ],
    });
    const createRunSpy = vi.spyOn(orynt, "createRun");
    await renderApp(<App />);
    await fillRepositoryPath();

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Improve the prompt gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findByText("Use desktop defaults.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "No" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    expect(understandPromptSpy).toHaveBeenCalledTimes(1);
    expect(createRunSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reject and edit" }));
    expect(screen.getByRole("textbox", { name: "Task for Orynt" })).toHaveValue(
      "Improve the prompt gate",
    );
    expect(createRunSpy).not.toHaveBeenCalled();
  });

  it("appends explicitly confirmed assumptions and keeps the original run goal", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const understandPromptSpy = vi
      .spyOn(orynt, "understandPrompt")
      .mockResolvedValueOnce({
        schemaVersion: 1,
        promptId: "prompt-assumption",
        outcome: "repository_action",
        readiness: "assumption_confirmation_required",
        reply: "Confirm the scope assumption.",
        conversationSummary: "One scope assumption is pending.",
        refinedBrief: {
          goal: "Improve the prompt gate.",
          deliverables: [],
          constraints: [],
          acceptanceCriteria: [],
          nonGoals: [],
        },
        questions: [],
        assumptions: [
          { id: "keep-cli", text: "Keep CLI behavior aligned.", affectsScope: true },
        ],
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        promptId: "prompt-ready",
        outcome: "repository_action",
        readiness: "ready",
        reply: "The confirmed request is ready.",
        conversationSummary: "CLI alignment was explicitly confirmed.",
        refinedBrief: {
          goal: "Improve the prompt gate.",
          deliverables: [],
          constraints: ["Keep CLI behavior aligned."],
          acceptanceCriteria: [],
          nonGoals: [],
        },
        questions: [],
        assumptions: [],
      });
    const createRunSpy = vi.spyOn(orynt, "createRun").mockResolvedValue({
      id: "run-confirmed-assumption",
      status: "waiting_for_approval",
      summary: "Review the confirmed plan.",
    });
    await renderApp(<App />);
    await fillRepositoryPath();

    fireEvent.change(screen.getByRole("textbox", { name: "Task for Orynt" }), {
      target: { value: "Improve the prompt gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm and continue" }));

    await waitFor(() => expect(understandPromptSpy).toHaveBeenCalledTimes(2));
    expect(understandPromptSpy.mock.calls[1]?.[0]).toMatchObject({
      basis: {
        rawPrompt: "Improve the prompt gate",
        confirmedAssumptions: [
          {
            assumptionId: "keep-cli",
            text: "Keep CLI behavior aligned.",
          },
        ],
      },
    });
    expect(createRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({ goal: "Improve the prompt gate" }),
    );
  });

  it("does not reuse deleted thread ids or overwrite an existing thread conversation", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);
    await fillRepositoryPath();

    const spaces = screen.getByRole("navigation", { name: "Tasks" });

    const submitCurrentThread = async (message: string) => {
      const composer = screen.getByRole("form", { name: "Task composer" });
      fireEvent.change(within(composer).getByRole("textbox", { name: "Task for Orynt" }), {
        target: { value: message },
      });
      fireEvent.click(within(composer).getByRole("button", { name: "Send task" }));
      expect(await screen.findAllByText(message)).not.toHaveLength(0);
      await waitFor(() => expect(screen.queryByRole("article", { name: "Agent is generating response" })).not.toBeInTheDocument());
    };

    await submitCurrentThread("Thread one seed message");
    fireEvent.click(screen.getByRole("button", { name: "Create new task" }));
    await submitCurrentThread("Thread two deleted message");
    fireEvent.click(screen.getByRole("button", { name: "Create new task" }));
    await submitCurrentThread("Thread three preserved message");

    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for Thread two deleted message" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Task options for Thread two deleted message" })).getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete thread" })).getByRole("button", { name: "Delete thread" }));

    fireEvent.click(screen.getByRole("button", { name: "Create new task" }));
    expect(within(screen.getByRole("region", { name: "Task conversation" })).queryByText("Thread three preserved message")).not.toBeInTheDocument();

    fireEvent.click(within(spaces).getByRole("button", { name: "Thread three preserved message" }));
    expect(await screen.findAllByText("Thread three preserved message")).not.toHaveLength(0);
  });

  it("keeps long user input inside the compact user bubble", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);
    await fillRepositoryPath();

    const thread = screen.getByRole("region", { name: "Task conversation" });
    const composer = screen.getByRole("form", { name: "Task composer" });
    const input = within(composer).getByRole("textbox", { name: "Task for Orynt" });
    const send = within(composer).getByRole("button", { name: "Send task" });
    const longMessage = "kjhiyoyuoohou".repeat(12);

    fireEvent.change(input, { target: { value: longMessage } });
    fireEvent.click(send);

    const messageText = await within(thread).findByText(longMessage, { selector: ".chat-bubble p" });
    const bubble = messageText.closest("article");
    expect(bubble).toHaveClass("chat-bubble-user");
    expect(bubble).toHaveClass("chat-bubble-width-compact");
    expect(bubble?.closest(".message-block")).toHaveClass("message-block-user");
    expect(screen.getByRole("region", { name: "Task conversation" })).toBe(thread);

    const styles = readFileSync("src/styles.css", "utf8");
    expect(styles).toMatch(/\.message-block-user \{[\s\S]*?width: min\(560px, calc\(100% - var\(--space-row\)\)\);/);
    expect(styles).toMatch(/\.chat-bubble-user p \{[\s\S]*?word-break: break-word;/);
  });

  it("copies, rates, shares by clipboard fallback, omits sources, and keeps more actions anchored", async () => {
    await renderApp(<App seedDemoThread />);

    const clipboardWrite = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    const expectedResponseText = "Candidate repository rule from verified correction";
    const thread = screen.getByRole("region", { name: "Task conversation" });
    const agentResponse = within(thread).getByRole("article", { name: "Agent response" });
    const actionRail = within(agentResponse).getByRole("toolbar", { name: "Agent response actions" });

    expect(within(actionRail).getByRole("button", { name: "Copy response" })).toBeInTheDocument();
    expect(within(actionRail).queryByRole("button", { name: "Reply to response" })).not.toBeInTheDocument();
    expect(within(actionRail).getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "false");
    expect(within(actionRail).getByRole("button", { name: "Share response" })).toBeInTheDocument();
    expect(within(actionRail).getByRole("button", { name: "Resend task" })).toBeInTheDocument();
    expect(within(actionRail).queryByRole("button", { name: /^(Show|Hide) sources$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
    expect(within(actionRail).getByRole("button", { name: "More response actions" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(within(actionRail).getByRole("button", { name: "Copy response" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(expectedResponseText));
    expect(within(actionRail).getByRole("button", { name: "Copied response" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(actionRail).getByRole("button", { name: "Good response" }));
    expect(within(actionRail).getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(actionRail).getByRole("button", { name: "Good response" }));
    expect(within(actionRail).getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(actionRail).getByRole("button", { name: "Bad response" }));
    expect(within(actionRail).getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "false");
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(actionRail).getByRole("button", { name: "Bad response" }));
    expect(within(actionRail).getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "false");

    clipboardWrite.mockClear();
    fireEvent.click(within(actionRail).getByRole("button", { name: "Share response" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(expectedResponseText));
    expect(within(actionRail).getByRole("button", { name: "Shared response" })).toHaveAttribute("aria-pressed", "true");


    fireEvent.click(within(actionRail).getByRole("button", { name: "More response actions" }));
    const menu = within(agentResponse).getByRole("menu", { name: "More response actions" });
    const moreAction = menu.closest(".agent-response-more-action");
    expect(moreAction).not.toBeNull();
    expect(moreAction).toContainElement(within(actionRail).getByRole("button", { name: "More response actions" }));
    expect(menu.parentElement).toBe(moreAction);
    expect(menu.parentElement).not.toBe(actionRail);
    expect(within(menu).getByRole("menuitem", { name: "Branch in new thread" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Read aloud" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shares agent responses through the native share sheet when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    await renderApp(<App seedDemoThread />);

    const clipboardWrite = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    const agentResponse = screen.getByRole("article", { name: "Agent response" });
    const actionRail = within(agentResponse).getByRole("toolbar", { name: "Agent response actions" });

    fireEvent.click(within(actionRail).getByRole("button", { name: "Share response" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Agent response",
        text: "Candidate repository rule from verified correction",
      }),
    );
    expect(clipboardWrite).not.toHaveBeenCalled();
    expect(within(actionRail).getByRole("button", { name: "Shared response" })).toHaveAttribute("aria-pressed", "true");
  });

  it("quotes selected agent response text from the floating reply action", async () => {
    await renderApp(<App seedDemoThread />);

    const agentResponse = screen.getByRole("article", { name: "Agent response" });
    const responseText = within(agentResponse).getByText("Candidate repository rule from verified correction");
    const threadHeading = screen.getByRole("heading", { level: 1, name: "New task" });

    expect(within(agentResponse).queryByRole("toolbar", { name: "Selected text actions" })).not.toBeInTheDocument();

    selectTextInside(threadHeading, 0, 5);
    fireEvent.mouseUp(threadHeading);
    expect(within(agentResponse).queryByRole("toolbar", { name: "Selected text actions" })).not.toBeInTheDocument();

    selectTextInside(responseText, 0, "Candidate repository".length);
    fireEvent.mouseUp(responseText);
    const selectionActions = within(agentResponse).getByRole("toolbar", { name: "Selected text actions" });
    fireEvent.click(within(selectionActions).getByRole("button", { name: "Reply to selected text" }));

    const composer = screen.getByRole("form", { name: "Task composer" });
    expect(within(composer).getByRole("textbox", { name: "Task for Orynt" })).toHaveValue('Replying to Agent response: "Candidate repository"');
    expect(within(agentResponse).queryByRole("toolbar", { name: "Selected text actions" })).not.toBeInTheDocument();
  });

  it("resends the previous user request and keeps branch response actions local", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    const createRunSpy = vi.spyOn(orynt, "createRun").mockResolvedValue({ id: "run-resend-previous-request" });
    await renderApp(<App seedDemoThread />);
    await fillRepositoryPath();

    let agentResponse = screen.getByRole("article", { name: "Agent response" });
    let actionRail = within(agentResponse).getByRole("toolbar", { name: "Agent response actions" });

    fireEvent.click(within(actionRail).getByRole("button", { name: "Resend task" }));

    await waitFor(() =>
      expect(createRunSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "Fix a failing unit test in the selected repository",
          repositoryPath: "/home/operator/project",
        }),
      ),
    );
    expect(screen.queryByText(/Regenerated mock response/)).not.toBeInTheDocument();
    expect((await screen.findAllByText(/Repository harness run completed for Fix a failing unit test in the selected repository/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("article", { name: "Agent response" })).toHaveLength(2);
    expect(screen.getAllByRole("article", { name: "Agent response" })[1]).toHaveTextContent("did not return a final model response");

    agentResponse = screen.getAllByRole("article", { name: "Agent response" })[0];
    actionRail = within(agentResponse).getByRole("toolbar", { name: "Agent response actions" });
    fireEvent.click(within(actionRail).getByRole("button", { name: "More response actions" }));
    fireEvent.click(within(agentResponse).getByRole("menuitem", { name: "Branch in new thread" }));

    expect(screen.getByRole("heading", { level: 1, name: "Branch 2" })).toBeInTheDocument();
    expect(screen.getByText(/Branched from response:/)).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Tasks" })).getByRole("button", { name: "Branch 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("centers the empty thread start composer and keeps its controls real", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Create new task" }));

    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(thread).toHaveClass("thread-empty");
    expect(within(thread).getByRole("status", { name: "Setup required" })).toBeInTheDocument();
    expect(within(thread).getByText("Select a local directory before starting a run.")).toBeInTheDocument();
    expect(within(thread).getByRole("button", { name: "Open setup" })).toBeInTheDocument();
    expect(within(thread).queryByText("Draft thread.")).not.toBeInTheDocument();

    const composer = within(thread).getByRole("form", { name: "Task composer" });
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
    expect(within(modeMenu).getByRole("menuitemradio", { name: "Safe" }).querySelector(".composer-option-check")).not.toBeNull();
    expect(within(modeMenu).getByRole("menuitemradio", { name: "Ask first" }).querySelector(".composer-option-check")).toBeNull();
    fireEvent.click(within(modeMenu).getByRole("menuitemradio", { name: "Ask first" }));
    expect(within(composer).getByRole("button", { name: "Permission mode" })).toHaveTextContent("Ask first");
    expect(within(composer).queryByRole("menu", { name: "Permission mode options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    await fillRepositoryPath();
    const textarea = within(composer).getByRole("textbox", { name: "Task for Orynt" });
    const send = within(composer).getByRole("button", { name: "Send task" });
    fireEvent.change(textarea, { target: { value: "Plan a focused test pass" } });
    expect(send).not.toBeDisabled();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(textarea).toHaveValue("Plan a focused test pass\n");
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(screen.getAllByText("Plan a focused test pass").length).toBeGreaterThan(0));
    const activeThread = screen.getByRole("region", { name: "Task conversation" });
    expect(activeThread).not.toHaveClass("thread-empty");
    expect(screen.queryByText("Ready for the next run")).not.toBeInTheDocument();
    expect(within(activeThread).getByRole("button", { name: "Send task" })).toBeDisabled();
  });

  it("places the composer permission menu as a dropdown or dropup from viewport space", async () => {
    await renderApp(<App />);

    const composer = screen.getByRole("form", { name: "Task composer" });
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

  it("places the composer attachment menu as a dropdown or dropup from viewport space", async () => {
    await renderApp(<App />);

    const composer = screen.getByRole("form", { name: "Task composer" });
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

  it("closes the composer permission menu from Escape and outside clicks", async () => {
    await renderApp(<App />);

    const composer = screen.getByRole("form", { name: "Task composer" });
    const metaButton = within(composer).getByRole("button", { name: "Permission mode" });
    fireEvent.click(metaButton);
    expect(within(composer).getByRole("menu", { name: "Permission mode options" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(composer).queryByRole("menu", { name: "Permission mode options" })).not.toBeInTheDocument();

    fireEvent.click(metaButton);
    fireEvent.pointerDown(screen.getByRole("region", { name: "Task conversation" }));
    expect(within(composer).queryByRole("menu", { name: "Permission mode options" })).not.toBeInTheDocument();
  });

  it("closes the composer attachment menu from Escape, outside clicks, and permission menu changes", async () => {
    await renderApp(<App />);

    const composer = screen.getByRole("form", { name: "Task composer" });
    const addContent = within(composer).getByRole("button", { name: "Add content" });
    const metaButton = within(composer).getByRole("button", { name: "Permission mode" });
    fireEvent.click(addContent);
    expect(within(composer).getByRole("menu", { name: "Add content options" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(composer).queryByRole("menu", { name: "Add content options" })).not.toBeInTheDocument();

    fireEvent.click(addContent);
    fireEvent.pointerDown(screen.getByRole("region", { name: "Task conversation" }));
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

  it("opens thread actions for rename, archive restore, and delete confirmation", async () => {
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);

    const spaces = screen.getByRole("navigation", { name: "Tasks" });
    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for New task" }));
    const initialNewThreadMenu = screen.getByRole("menu", { name: "Task options for New task" });
    expect(within(initialNewThreadMenu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(within(initialNewThreadMenu).queryByRole("menuitem", { name: "Workspace settings" })).not.toBeInTheDocument();
    expect(within(initialNewThreadMenu).getByRole("menuitem", { name: "Archive" })).toBeDisabled();
    expect(within(initialNewThreadMenu).getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for New task" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit task name and description" }));
    const titleInput = screen.getByRole("textbox", { name: "Task name" });
    fireEvent.change(titleInput, { target: { value: "Engineering" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    expect(within(spaces).getByRole("button", { name: "Engineering" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Engineering" })).toBeInTheDocument();

    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for Engineering" }));
    const engineeringMenu = screen.getByRole("menu", { name: "Task options for Engineering" });
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(within(engineeringMenu).queryByRole("menuitem", { name: "Workspace settings" })).not.toBeInTheDocument();
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    expect(within(engineeringMenu).getByRole("menuitem", { name: "Archive" })).toBeDisabled();
    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for Engineering" }));

    fireEvent.click(screen.getByRole("button", { name: "Create new task" }));
    expect(within(spaces).getByRole("button", { name: "New task" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for New task" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Task options for New task" })).getByRole("menuitem", { name: "Archive" }));
    expect(within(spaces).queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Search tasks" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search tasks" }), { target: { value: "New task" } });
    expect(within(spaces).queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search tasks" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Open archive" }));
    const archiveDialog = screen.getByRole("dialog", { name: "Archive" });
    expect(within(archiveDialog).getByText("New task")).toBeInTheDocument();
    expect(archiveDialog.querySelector(".shell-modal-header")?.textContent).toBe("Archive");
    expect(archiveDialog.querySelector(".shell-modal-header span")).toBeNull();
    fireEvent.click(within(archiveDialog).getByRole("button", { name: "Restore" }));
    expect(screen.queryByRole("dialog", { name: "Archive" })).not.toBeInTheDocument();
    expect(within(spaces).getByRole("button", { name: "New task" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for New task" }));
    const newThreadMenu = screen.getByRole("menu", { name: "Task options for New task" });
    fireEvent.click(within(newThreadMenu).getByRole("menuitem", { name: "Delete" }));
    const deleteDialog = screen.getByRole("dialog", { name: "Delete thread" });
    expect(deleteDialog).toHaveTextContent("New task");
    expect(deleteDialog.querySelector(".shell-modal-header")?.textContent).toBe("Delete thread");
    expect(deleteDialog.querySelector(".shell-modal-header span")).toBeNull();
    expect(screen.queryByRole("menu", { name: "Task options for New task" })).not.toBeInTheDocument();
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Cancel" }));
    expect(within(spaces).getByRole("button", { name: "New task" })).toBeInTheDocument();

    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for New task" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Task options for New task" })).getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete thread" })).getByRole("button", { name: "Delete thread" }));
    expect(within(spaces).queryByRole("button", { name: "New task" })).not.toBeInTheDocument();

    fireEvent.click(within(spaces).getByRole("button", { name: "Task options for Engineering" }));
    expect(within(screen.getByRole("menu", { name: "Task options for Engineering" })).getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  });

  it("keeps the cockpit mounted while settings only exposes preference tabs", async () => {
    await renderApp(<App />);

    expect(screen.queryByRole("navigation", { name: "Primary app navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();

    openSettings();
    expect(screen.getByRole("main")).toHaveClass("app-shell-cockpit");
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    expect(screen.getByRole("navigation", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Task conversation" })).toBeInTheDocument();
    const settings = screen.getByRole("dialog", { name: "Settings" });
    const settingsSections = within(settings).getByRole("navigation", { name: "Settings sections" });
    expect(within(settingsSections).getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(within(settingsSections).getByRole("button", { name: "Model" })).toBeInTheDocument();
    expect(within(settingsSections).getByRole("button", { name: "Status" })).toBeInTheDocument();
    expect(within(settingsSections).queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(within(settingsSections).queryByRole("button", { name: "Billing" })).not.toBeInTheDocument();
    expect(within(settingsSections).queryByRole("button", { name: "Intelligence" })).not.toBeInTheDocument();
    expect(within(settingsSections).queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(settings).getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(within(settings).queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Dashboard summary" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.getByRole("main")).toHaveClass("app-shell-cockpit");
    expect(screen.getByRole("region", { name: "Task conversation" })).toBeInTheDocument();

    openSettings();
    expect(screen.queryByRole("dialog", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("app-shell-cockpit", "app-shell-settings-open");
    expect(Array.from(screen.getByRole("main").children).map((child) => child.className)).toEqual(["workspace-panel", "thread thread-empty", "shell-modal-backdrop"]);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Settings" })).toHaveClass("shell-modal-atmospheric");
    expect(screen.getByLabelText("Modal backdrop")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Task conversation" })).toBeInTheDocument();
  });

  it("opens local settings directly and closes from the dialog", async () => {
    await renderApp(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open local settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    openSettings();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("renders local preference settings without account or billing surfaces", async () => {
    await renderApp(<App />);

    const settings = openSettings();
    const search = within(settings).getByRole("textbox", { name: "Search settings" });
    const sections = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(sections).getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");
    expect(within(sections).getByRole("button", { name: "Model" })).toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Billing" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Intelligence" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Setup" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Capabilities" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Connectors" })).not.toBeInTheDocument();

    expect(within(settings).getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(within(settings).getByText("Avatar")).toBeInTheDocument();
    expect(within(settings).getByRole("textbox", { name: "Full name" })).toHaveValue("Operator");
    expect(within(settings).getByRole("textbox", { name: "What should Orynt call you?" })).toHaveValue("Operator");
    expect(within(settings).getByRole("combobox", { name: "What best describes your work?" })).toHaveTextContent("Engineering");
    expect(within(settings).getByRole("group", { name: "Appearance" })).toHaveTextContent("Dark");
    expect(within(settings).getByRole("group", { name: "Appearance" }).querySelectorAll("svg")).toHaveLength(3);
    expect(within(settings).getByRole("combobox", { name: "Chat font" })).toHaveTextContent("Orynt Sans");
    expect(within(settings).getByRole("group", { name: "Motion" })).toHaveTextContent("System");
    expect(within(settings).getByRole("combobox", { name: "Language" })).toHaveTextContent("English");
    expect(within(settings).getByRole("combobox", { name: "Style" })).toHaveTextContent("Buttery");
    expect(within(settings).getByRole("combobox", { name: "Speed" })).toHaveTextContent("Normal");
    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toHaveTextContent("Safe");
    expect(within(settings).queryByRole("combobox", { name: "Thinking effort" })).not.toBeInTheDocument();
    const messageLabelsSwitch = within(settings).getByRole("switch", { name: /Show message labels/ });
    expect(messageLabelsSwitch).toHaveAttribute("aria-checked", "false");
    expect(within(messageLabelsSwitch).queryByText("Show or hide compact block labels above agent and approval messages.")).not.toBeInTheDocument();
    expect(within(messageLabelsSwitch).queryByText("hidden")).not.toBeInTheDocument();
    expect(messageLabelsSwitch.querySelector(".surface-switch-icon")).toBeNull();
    expect(within(settings).queryByText("Thinking tradeoff")).not.toBeInTheDocument();
    expect(within(settings).queryByText("Balanced reasoning for normal repository work.")).not.toBeInTheDocument();
    expect(within(settings).getByText("Retention")).toBeInTheDocument();
    expect(within(settings).getByText("Manual")).toBeInTheDocument();
    expect(within(settings).queryByText("Cleanup is manual for private beta; automatic retention is planned.")).not.toBeInTheDocument();

    fireEvent.focus(within(settings).getByRole("button", { name: "Retention info" }));
    expect(within(settings).getByRole("tooltip")).toHaveTextContent("Cleanup is manual for private beta; automatic retention is planned.");

    fireEvent.blur(within(settings).getByRole("button", { name: "Retention info" }));
    fireEvent.mouseEnter(within(settings).getByRole("button", { name: "Message labels info" }));
    expect(within(settings).getByRole("tooltip")).toHaveTextContent("Show or hide compact block labels above agent and approval messages.");

    fireEvent.click(within(sections).getByRole("button", { name: "Model" }));
    expect(within(settings).getByRole("heading", { name: "Model" })).toBeInTheDocument();
    expect(within(settings).getByRole("combobox", { name: "Provider" })).toHaveTextContent("Choose provider");
    expect(within(settings).queryByRole("combobox", { name: "Thinking effort" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "code" } });

    expect(within(sections).queryByRole("button", { name: "General" })).not.toBeInTheDocument();
    expect(within(sections).getByRole("button", { name: "Model" })).toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Billing" })).not.toBeInTheDocument();
  });

  it("persists editable profile, UI, and voice preferences from settings rows", async () => {
    dismissPrivateBetaOnboarding();
    const updatedSettings = {
      workspaceId: "workspace-local-alpha",
      permissionMode: "safe" as const,
      thinkingEffort: "medium" as const,
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
        chatFont: "orynt-serif" as const,
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
    vi.spyOn(orynt, "getSettings").mockResolvedValue({
      ...updatedSettings,
      operatorProfile: {
        fullName: "Operator",
        callSign: "Operator",
        workType: "engineering",
      },
      uiPreferences: {
        appearance: "dark",
        chatFont: "orynt-sans",
        motion: "system",
        showMessageBlockMeta: false,
      },
      voicePreferences: {
        language: "english",
        style: "buttery",
        speed: "normal",
      },
    });
    const updateSettingsSpy = vi.spyOn(orynt, "updateSettings").mockResolvedValue(updatedSettings);

    await renderApp(<App />);

    const settings = openSettings();
    fireEvent.change(await within(settings).findByRole("textbox", { name: "Full name" }), { target: { value: "Xuan An" } });
    fireEvent.change(within(settings).getByRole("textbox", { name: "What should Orynt call you?" }), { target: { value: "An" } });
    selectSetupDropdownOption(settings, "What best describes your work?", "Data science");
    fireEvent.click(within(settings).getByRole("button", { name: "Use system appearance" }));
    selectSetupDropdownOption(settings, "Chat font", "Orynt Serif");
    fireEvent.click(within(settings).getByRole("button", { name: "Use reduced motion" }));
    selectSetupDropdownOption(settings, "Speed", "Slow");
    selectSetupDropdownOption(settings, "Permission mode", "Ask first");
    await flushApp();

    expect(updateSettingsSpy).toHaveBeenCalledWith({ operatorProfile: { fullName: "Xuan An" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ operatorProfile: { callSign: "An" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ operatorProfile: { workType: "data-science" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ uiPreferences: { appearance: "system" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ uiPreferences: { chatFont: "orynt-serif" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ uiPreferences: { motion: "reduced" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ voicePreferences: { speed: "slow" } });
    expect(updateSettingsSpy).toHaveBeenCalledWith({ permissionMode: "manual" });
  });

  it("keeps message block labels hidden by default and restores them from settings", async () => {
    await renderApp(<App seedDemoThread />);

    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(thread).queryByText("Agent response")).not.toBeInTheDocument();
    expect(within(thread).queryByText("Approval request")).not.toBeInTheDocument();

    const settings = openSettings();
    const labelSwitch = within(settings).getByRole("switch", { name: /Show message labels/ });
    expect(labelSwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.click(labelSwitch);
    await flushApp();

    expect(labelSwitch).toHaveAttribute("aria-checked", "true");
    const agentMeta = within(thread).getByText("Agent response");
    const approvalMeta = within(thread).getByText("Approval request");
    expect(agentMeta).toHaveClass("message-block-meta");
    expect(agentMeta.closest(".chat-bubble")).toBeNull();
    expect(agentMeta.closest(".message-block")).toHaveClass("message-block-agent");
    expect(approvalMeta).toHaveClass("message-block-meta");
    expect(approvalMeta.closest(".chat-bubble")).toBeNull();
    expect(approvalMeta.closest(".message-block")).toHaveClass("message-block-approval");
    expect(window.localStorage.getItem(messageBlockMetaStorageKey)).toBe("true");
  });

  it("persists the message block label display preference", async () => {
    window.localStorage.setItem(messageBlockMetaStorageKey, "true");

    await renderApp(<App seedDemoThread />);

    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(thread).getByText("Agent response")).toHaveClass("message-block-meta");
    expect(within(thread).getByText("Approval request")).toHaveClass("message-block-meta");
    const settings = openSettings();
    expect(within(settings).getByRole("switch", { name: /Show message labels/ })).toHaveAttribute("aria-checked", "true");
  });

  it("restores legacy message block label preference from the CodePawl beta key", async () => {
    window.localStorage.setItem(legacyMessageBlockMetaStorageKey, "true");

    await renderApp(<App seedDemoThread />);

    const thread = screen.getByRole("region", { name: "Task conversation" });
    expect(within(thread).getByText("Agent response")).toHaveClass("message-block-meta");
    expect(within(thread).getByText("Approval request")).toHaveClass("message-block-meta");
  });

  it("navigates the preference-only settings sections", async () => {
    await renderApp(<App />);

    const settings = openSettings();
    const sections = within(settings).getByRole("navigation", { name: "Settings sections" });

    expect(within(sections).getByRole("button", { name: "General" })).toHaveAttribute("aria-current", "page");
    expect(within(sections).queryByRole("button", { name: "Capabilities" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Orynt Code" })).not.toBeInTheDocument();
    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toHaveTextContent("Safe");
    expect(within(settings).queryByRole("region", { name: "Allowed surfaces" })).not.toBeInTheDocument();
    expect(within(sections).getByRole("button", { name: "Memory" })).toBeInTheDocument();
    expect(within(sections).getByRole("button", { name: "Status" })).toBeInTheDocument();
    expect(within(sections).queryByRole("button", { name: "Intelligence" })).not.toBeInTheDocument();
  });

  it("renders run lifecycle events streamed through the client", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);

    await fillRepositoryPath("/home/operator/project");
    const input = screen.getByRole("textbox", { name: "Task for Orynt" });
    fireEvent.change(input, {
      target: { value: "Fix a failing unit test in the selected repository" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send task" }));

    expect(await screen.findAllByText("Fix a failing unit test in the selected repository")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Task for Orynt" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Open run info" })).not.toBeInTheDocument();
    expect(await screen.findByText("Summarize: run finished — Mock repository run finished with verifier evidence")).toBeInTheDocument();
  });

  it("sends typed cockpit tasks as unlabeled user chat bubbles", async () => {
    mockReadyModelSettings();
    dismissPrivateBetaOnboarding();
    await renderApp(<App />);
    await fillRepositoryPath();

    const conversation = screen.getByRole("region", { name: "Task conversation" });
    const composer = screen.getByRole("form", { name: "Task composer" });
    const input = within(composer).getByRole("textbox", { name: "Task for Orynt" });
    const send = within(composer).getByRole("button", { name: "Send task" });

    expect(send).toBeDisabled();
    expect(within(conversation).queryByText("Operator")).not.toBeInTheDocument();

    fireEvent.submit(composer);
    expect(within(conversation).queryByText("Operator")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Add validation coverage for repository rules" } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);

    await waitFor(() => expect(within(conversation).getAllByText("Add validation coverage for repository rules").length).toBeGreaterThan(0));
    expect(within(conversation).getByRole("textbox", { name: "Task for Orynt" })).toHaveValue("");
    expect(within(conversation).queryByText("Operator")).not.toBeInTheDocument();
  });

  it("keeps onboarding and trial cards out of the compact cockpit", async () => {
    await renderApp(<App seedDemoThread />);

    expect(screen.queryByRole("region", { name: "Product onboarding" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Trial status" })).not.toBeInTheDocument();
    expect(screen.queryByText(/trial runs left/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Local trial/i)).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Agent response" })).queryByText("Succeeded")).not.toBeInTheDocument();
    expect(screen.queryByText(/Local MVP/i)).not.toBeInTheDocument();
  });

  it("lets the general settings pane change permission mode locally", async () => {
    await renderApp(<App />);

    const settings = openSettings();
    const modeSelector = within(settings).getByRole("combobox", { name: "Permission mode" });

    expect(modeSelector).toHaveTextContent("Safe");

    selectSetupDropdownOption(settings, "Permission mode", "Ask first");
    await flushApp();

    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toHaveTextContent("Ask first");
  });

  it("keeps executable surfaces out of user preferences settings", async () => {
    await renderApp(<App />);

    const settings = openSettings();
    expect(within(settings).queryByRole("region", { name: "Allowed surfaces" })).not.toBeInTheDocument();
    expect(within(settings).queryByText("Unavailable in private beta; no browser automation runs from this app.")).not.toBeInTheDocument();
    expect(within(settings).getByRole("combobox", { name: "Permission mode" })).toBeInTheDocument();
  });

  it("records approval decisions in the mock cockpit state", async () => {
    await renderApp(<App seedDemoThread />);

    fireEvent.click(screen.getByRole("button", { name: "Approve step" }));

    expect(await screen.findByText("Approval approved for approval-submit-1")).toBeInTheDocument();
  });

  it("shows approval loading feedback and prevents duplicate approval decisions", async () => {
    const approval = createDeferred<void>();
    const approveSpy = vi.spyOn(orynt, "approve").mockReturnValue(approval.promise);
    await renderApp(<App seedDemoThread />);

    const approveButton = screen.getByRole("button", { name: "Approve step" });
    const denyButton = screen.getByRole("button", { name: "Deny step" });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    expect(approveSpy).toHaveBeenCalledTimes(1);
    expect(approveButton).toBeDisabled();
    expect(approveButton).toHaveAttribute("aria-busy", "true");
    expect(approveButton).toHaveTextContent("Approving");
    expect(approveButton.querySelector(".probability-loader")).not.toBeNull();
    expect(denyButton).toBeDisabled();
  });

  it("keeps run info and execution panels out of the compact thread UI", async () => {
    await renderApp(<App />);

    expect(screen.queryByRole("button", { name: "Open run info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Run info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Controlled Codex execution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mock event stream" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Verifier evidence" })).not.toBeInTheDocument();
  });

  it("closes compact settings modal from Escape and backdrop interactions", async () => {
    await renderApp(<App />);

    const settings = openSettings();
    fireEvent.keyDown(settings, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

    openSettings();
    fireEvent.click(screen.getByLabelText("Modal backdrop"));
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Modal backdrop")).not.toBeInTheDocument();
  });

  it("renders a no-run-selected empty state without showing execution controls", async () => {
    await renderApp(<App initialSelectedRunId={null} />);

    const emptyRun = screen.getByRole("region", { name: "No run selected" });
    expect(within(emptyRun).getByText(/Select a local repository task or start the fake Codex walkthrough/)).toBeInTheDocument();
    expect(within(emptyRun).getByText(/No Codex process runs until an execution plan is approved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve Codex execution" })).not.toBeInTheDocument();
  });

  it("keeps queue summaries out of preferences settings", async () => {
    await renderApp(<App initialRunState={createEmptyMockRunState()} />);
    const settings = openSettings();

    expect(screen.queryByRole("navigation", { name: "Cockpit sections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Memory review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Skill registry" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Thread queues" })).not.toBeInTheDocument();
  });

  it("does not expose memory rule and skill queues from settings", async () => {
    const runState = createMockRunState();
    const updateRuleSpy = vi.spyOn(orynt, "updateCandidateRuleStatus").mockResolvedValue({
      ...runState.memoryReview.candidateRules[0],
      status: "accepted",
    });
    const promoteSkillSpy = vi.spyOn(orynt, "promoteSkillManually").mockResolvedValue({
      ...runState.skillRegistry.skills[0],
      status: "active",
    });
    await renderApp(<App initialRunState={runState} />);

    const settings = openSettings();
    expect(within(settings).queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Memory review" })).not.toBeInTheDocument();
    expect(within(settings).queryByRole("region", { name: "Skill registry" })).not.toBeInTheDocument();
    expect(updateRuleSpy).not.toHaveBeenCalled();
    expect(promoteSkillSpy).not.toHaveBeenCalled();
  });

  it("opens Skills Manager from the composer skills submenu and attaches only eligible skills", async () => {
    await renderApp(<App />);
    const composer = screen.getByRole("form", { name: "Task composer" });
    fireEvent.click(within(composer).getByRole("button", { name: "Add content" }));
    fireEvent.click(within(composer).getByRole("menuitem", { name: "Skills" }));

    expect(within(composer).getByText("Eligible skills")).toBeInTheDocument();
    const skillOption = await within(composer).findByRole("menuitemcheckbox", { name: /skill-creator/i });
    fireEvent.click(skillOption);
    expect(skillOption).toHaveAttribute("aria-checked", "true");
    expect(within(composer).getByRole("button", { name: "Remove skill-creator skill" })).toBeInTheDocument();

    fireEvent.click(within(composer).getByRole("menuitem", { name: "Manage skills…" }));
    await flushApp();
    expect(screen.getByRole("dialog", { name: "Skills Manager" })).toBeInTheDocument();
  });

  it("lets the operator raise the next-request model-tier minimum", async () => {
    await renderApp(<App />);
    const composer = screen.getByRole("form", { name: "Task composer" });
    const tierButton = within(composer).getByRole("button", {
      name: /minimum model tier: auto/i,
    });

    fireEvent.click(tierButton);
    expect(
      within(composer).getByRole("button", {
        name: /minimum model tier: light/i,
      }),
    ).toHaveTextContent("Tier Light");
  });
});
