import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, stat, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "bun:test";

import {
  createDefaultCapabilityRuntimeSettings,
  hashPromptUnderstandingBasis,
  REPOSITORY_DIFF_ARTIFACT_MAX_BYTES,
} from "@codepawl/shared";

import {
  FileCliPreferencesStore,
  FileCliSessionStore,
  createSessionSnapshot,
  readRunSnapshot,
} from "./state";
import { DEFAULT_CLI_SHORTCUTS } from "./shortcuts";
import { DEFAULT_CLI_STATUSLINE } from "./statusline";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-state-"));
  roots.push(root);
  return root;
}

describe("CLI session state", () => {
  it("migrates v11 preferences to trusted auto-skill routing and persists the toggle", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    const current = await new FileCliPreferencesStore(root).load();
    await writeFile(
      preferencesPath,
      JSON.stringify({
        ...current,
        schemaVersion: 11,
        skillRouting: undefined,
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      skillRouting: "auto_trusted",
    });
    await store.saveSkillRouting("manual");
    await expect(store.load()).resolves.toMatchObject({
      skillRouting: "manual",
    });
  });

  it("persists explicit session-retention consent", async () => {
    const root = await tempRoot();
    const store = new FileCliPreferencesStore(root);
    await store.saveSessionRetention(
      "automatic_audited",
      "2026-08-04T00:00:00.000Z",
    );
    await expect(store.load()).resolves.toMatchObject({
      sessionRetention: {
        mode: "automatic_audited",
        consentedAt: "2026-08-04T00:00:00.000Z",
      },
    });
  });

  it("persists explicit startup update consent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-state-"));
    roots.push(root);
    const store = new FileCliPreferencesStore(root);

    expect((await store.load()).updateCheckConsent).toBeUndefined();
    await store.saveUpdateCheckConsent("enabled");
    expect((await store.load()).updateCheckConsent).toBe("enabled");
    await store.saveUpdateCheckConsent("disabled");
    expect((await store.load()).updateCheckConsent).toBe("disabled");
  });

  it("defaults copy-on-select off and persists an explicit clipboard preference", async () => {
    const root = await tempRoot();
    const store = new FileCliPreferencesStore(root);

    expect((await store.load()).clipboard).toEqual({
      copyOnSelect: false,
    });
    await store.saveClipboard({ copyOnSelect: true });
    expect((await store.load()).clipboard).toEqual({
      copyOnSelect: true,
    });
  });

  it("migrates v6 shortcuts to defaults and persists validated remaps", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 6,
        activityDetails: "important",
        appearance: { color: true, motion: true, richText: true },
        capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      shortcuts: DEFAULT_CLI_SHORTCUTS,
    });
    await store.saveShortcuts({
      clear: ["alt+c"],
      undo: ["alt+u"],
      redo: ["alt+r"],
    });
    await expect(store.load()).resolves.toMatchObject({
      shortcuts: {
        clear: ["alt+c"],
        undo: ["alt+u"],
        redo: ["alt+r"],
      },
    });
    await expect(
      store.saveShortcuts({
        clear: ["alt+c"],
        undo: ["alt+c"],
        redo: ["alt+r"],
      }),
    ).rejects.toThrow("assigned more than once");
  });

  it("migrates v7 appearance to Quiet Studio and persists a validated theme", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 7,
        activityDetails: "important",
        appearance: { color: true, motion: true, richText: true },
        shortcuts: DEFAULT_CLI_SHORTCUTS,
        capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      appearance: { themeId: "quiet-studio" },
    });
    await store.saveAppearance({ themeId: "monochrome" });
    await expect(store.load()).resolves.toMatchObject({
      appearance: { themeId: "monochrome" },
    });
    await expect(
      store.saveAppearance({ themeId: "unknown" as "quiet-studio" }),
    ).rejects.toThrow("Invalid Orynt CLI appearance preferences");
  });

  it("migrates v8 preferences to concise statusline defaults", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 8,
        activityDetails: "important",
        appearance: {
          color: true,
          motion: true,
          richText: true,
          themeId: "quiet-studio",
        },
        shortcuts: DEFAULT_CLI_SHORTCUTS,
        capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      statusline: DEFAULT_CLI_STATUSLINE,
    });
    await store.saveStatusline({
      ...DEFAULT_CLI_STATUSLINE,
      shortcuts: true,
    });
    await expect(store.load()).resolves.toMatchObject({
      statusline: { shortcuts: true },
    });
  });

  it("migrates v9 preferences to auto screen mode and persists an explicit mode", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 9,
        activityDetails: "important",
        appearance: {
          color: true,
          motion: true,
          richText: true,
          themeId: "quiet-studio",
        },
        shortcuts: DEFAULT_CLI_SHORTCUTS,
        statusline: DEFAULT_CLI_STATUSLINE,
        capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      appearance: { screenMode: "auto" },
    });
    await store.saveAppearance({ screenMode: "inline" });
    await expect(store.load()).resolves.toMatchObject({
      appearance: { screenMode: "inline" },
    });
  });

  it("persists the first-launch boundary acknowledgement separately from sessions", async () => {
    const root = await tempRoot();
    const store = new FileCliPreferencesStore(root);

    await expect(store.hasAcknowledgedStartupBoundary()).resolves.toBe(false);
    await store.acknowledgeStartupBoundary("2026-07-28T12:00:00.000Z");
    await expect(store.hasAcknowledgedStartupBoundary()).resolves.toBe(true);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: 12,
      activityDetails: "important",
      skillRouting: "auto_trusted",
      appearance: {
        color: true,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
        screenMode: "auto",
      },
      capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      clipboard: { copyOnSelect: false },
      shortcuts: DEFAULT_CLI_SHORTCUTS,
      statusline: DEFAULT_CLI_STATUSLINE,
      startupBoundaryAcknowledgedAt: "2026-07-28T12:00:00.000Z",
    });
    const preferencesPath = path.join(root, "preferences.json");
    expect((await readFile(preferencesPath, "utf8"))).not.toContain("goal");
    expect((await stat(preferencesPath)).mode & 0o777).toBe(0o600);
  });

  it("merges working config fields without erasing the boundary acknowledgement", async () => {
    const root = await tempRoot();
    const store = new FileCliPreferencesStore(root);

    await store.acknowledgeStartupBoundary("2026-07-28T12:00:00.000Z");
    await store.saveWorkingConfig({
      repositoryPath: "/work/project",
      modelId: "gpt-5.6-sol",
    });
    await store.saveWorkingConfig({ thinkingEffort: "xhigh" });
    await expect(store.load()).resolves.toEqual({
      schemaVersion: 12,
      activityDetails: "important",
      skillRouting: "auto_trusted",
      appearance: {
        color: true,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
        screenMode: "auto",
      },
      capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      clipboard: { copyOnSelect: false },
      shortcuts: DEFAULT_CLI_SHORTCUTS,
      statusline: DEFAULT_CLI_STATUSLINE,
      startupBoundaryAcknowledgedAt: "2026-07-28T12:00:00.000Z",
      workingConfig: {
        repositoryPath: "/work/project",
        modelId: "gpt-5.6-sol",
        thinkingEffort: "xhigh",
      },
    });

    await store.acknowledgeStartupBoundary("2026-07-29T12:00:00.000Z");
    await expect(store.load()).resolves.toMatchObject({
      startupBoundaryAcknowledgedAt: "2026-07-29T12:00:00.000Z",
      workingConfig: {
        repositoryPath: "/work/project",
        modelId: "gpt-5.6-sol",
        thinkingEffort: "xhigh",
      },
    });
  });

  it("persists bounded capability runtime settings and rejects authority expansion", async () => {
    const root = await tempRoot();
    const store = new FileCliPreferencesStore(root);
    const settings = {
      ...createDefaultCapabilityRuntimeSettings(),
      autoImproveMode: "shadow_review" as const,
      subagents: {
        mode: "read_only" as const,
        maxConcurrency: 2,
        maxDepth: 1 as const,
      },
    };

    await store.saveCapabilityRuntime(settings);
    await expect(store.load()).resolves.toMatchObject({
      capabilityRuntime: settings,
    });
    await expect(
      store.saveCapabilityRuntime({
        ...settings,
        subagents: {
          ...settings.subagents,
          maxConcurrency: 5,
        },
      }),
    ).rejects.toThrow("outside bounded v1 limits");
  });

  it("tightens permissions on an existing CLI state directory", async () => {
    const root = await tempRoot();
    await chmod(root, 0o777);
    const store = new FileCliPreferencesStore(root);

    await store.acknowledgeStartupBoundary("2026-07-28T12:00:00.000Z");

    expect((await stat(root)).mode & 0o777).toBe(0o700);
    await chmod(root, 0o777);
    await store.load();
    expect((await stat(root)).mode & 0o777).toBe(0o700);
  });

  it("rejects a symlinked CLI state directory", async () => {
    const parent = await tempRoot();
    const target = path.join(parent, "target");
    const linkedRoot = path.join(parent, "linked");
    await mkdir(target);
    await symlink(target, linkedRoot, "dir");

    const store = new FileCliPreferencesStore(linkedRoot);

    await expect(store.load()).rejects.toThrow("Unsafe Orynt state path");
  });

  it("fails closed on malformed acknowledgement timestamps", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({ schemaVersion: 1, startupBoundaryAcknowledgedAt: "sometime" }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.hasAcknowledgedStartupBoundary()).rejects.toThrow(
      "Invalid Orynt CLI preferences",
    );
    await expect(store.acknowledgeStartupBoundary("not-a-date")).rejects.toThrow(
      "Invalid startup boundary acknowledgement timestamp",
    );
  });

  it("fails closed on malformed working config", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    const store = new FileCliPreferencesStore(root);

    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 1,
        workingConfig: {
          repositoryPath: "relative/repository",
          modelId: "",
          thinkingEffort: "extreme",
        },
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    await expect(store.load()).rejects.toThrow("Invalid Orynt CLI preferences");
    await expect(
      store.saveWorkingConfig({ thinkingEffort: "extreme" as never }),
    ).rejects.toThrow("Invalid Orynt thinking effort preference");
  });

  it("atomically migrates v1 single-model preferences into a v6 custom profile", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 1,
        workingConfig: {
          repositoryPath: "/work/project",
          modelId: "gpt-legacy",
          thinkingEffort: "medium",
        },
      }),
      { encoding: "utf8", mode: 0o600 },
    );

    const preferences = await new FileCliPreferencesStore(root).load();

    expect(preferences).toMatchObject({
      schemaVersion: 12,
      activityDetails: "important",
      skillRouting: "auto_trusted",
      appearance: { color: true, motion: true, richText: true },
      workingConfig: {
        modelId: "gpt-legacy",
        thinkingEffort: "medium",
        orchestrationProfile: {
          preset: "custom",
          roles: {
            coordinator: {
              modelId: "gpt-legacy",
              thinkingEffort: "medium",
            },
            implementer: {
              modelId: "gpt-legacy",
              thinkingEffort: "medium",
            },
          },
        },
      },
    });
    expect(
      JSON.parse(await readFile(preferencesPath, "utf8")),
    ).toMatchObject({
      schemaVersion: 12,
      activityDetails: "important",
      appearance: { color: true, motion: true, richText: true },
    });
  });

  it("migrates v2 preferences and persists activity details independently of working config", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 2,
        startupBoundaryAcknowledgedAt: "2026-07-29T00:00:00.000Z",
        workingConfig: { repositoryPath: "/work/project" },
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      activityDetails: "important",
      appearance: { color: true, motion: true, richText: true },
      workingConfig: { repositoryPath: "/work/project" },
    });
    await store.saveActivityDetails("full");
    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      activityDetails: "full",
      startupBoundaryAcknowledgedAt: "2026-07-29T00:00:00.000Z",
      workingConfig: { repositoryPath: "/work/project" },
    });
    expect((await stat(preferencesPath)).mode & 0o777).toBe(0o600);
  });

  it("migrates v3 preferences and persists appearance independently", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 3,
        debugMode: true,
        workingConfig: { repositoryPath: "/work/project" },
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const store = new FileCliPreferencesStore(root);

    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      activityDetails: "full",
      appearance: { color: true, motion: true, richText: true },
      workingConfig: { repositoryPath: "/work/project" },
    });
    await store.saveAppearance({ color: false });
    await expect(store.load()).resolves.toMatchObject({
      schemaVersion: 12,
      activityDetails: "full",
      appearance: {
        color: false,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
        screenMode: "auto",
      },
      workingConfig: { repositoryPath: "/work/project" },
    });
    expect((await stat(preferencesPath)).mode & 0o777).toBe(0o600);
  });

  it("migrates v4 appearance with rich text enabled by default", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({
        schemaVersion: 4,
        debugMode: false,
        appearance: { color: false, motion: true },
      }),
      { encoding: "utf8", mode: 0o600 },
    );

    const store = new FileCliPreferencesStore(root);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: 12,
      activityDetails: "important",
      skillRouting: "auto_trusted",
      appearance: {
        color: false,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
        screenMode: "auto",
      },
      capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      clipboard: { copyOnSelect: false },
      shortcuts: DEFAULT_CLI_SHORTCUTS,
      statusline: DEFAULT_CLI_STATUSLINE,
    });
    expect(JSON.parse(await readFile(preferencesPath, "utf8"))).toEqual({
      schemaVersion: 12,
      activityDetails: "important",
      skillRouting: "auto_trusted",
      appearance: {
        color: false,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
        screenMode: "auto",
      },
      capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
      clipboard: { copyOnSelect: false },
      shortcuts: DEFAULT_CLI_SHORTCUTS,
      statusline: DEFAULT_CLI_STATUSLINE,
    });
  });

  it.each([
    [false, "important"],
    [true, "full"],
  ] as const)(
    "migrates v5 debug %s to v6 activity details %s",
    async (debugMode, activityDetails) => {
      const root = await tempRoot();
      const preferencesPath = path.join(root, "preferences.json");
      await writeFile(
        preferencesPath,
        JSON.stringify({
          schemaVersion: 5,
          debugMode,
          appearance: { color: true, motion: true, richText: true },
          capabilityRuntime: createDefaultCapabilityRuntimeSettings(),
        }),
        { encoding: "utf8", mode: 0o600 },
      );

      await expect(
        new FileCliPreferencesStore(root).load(),
      ).resolves.toMatchObject({
        schemaVersion: 12,
        activityDetails,
      });
      const persisted = JSON.parse(
        await readFile(preferencesPath, "utf8"),
      ) as Record<string, unknown>;
      expect(persisted).not.toHaveProperty("debugMode");
      expect(persisted).toMatchObject({
        schemaVersion: 12,
        activityDetails,
      });
    },
  );

  it("preserves partial v1 model preferences and rewrites v1 sessions once", async () => {
    const root = await tempRoot();
    await writeFile(
      path.join(root, "preferences.json"),
      JSON.stringify({
        schemaVersion: 1,
        workingConfig: { modelId: "gpt-partial" },
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const preferences = await new FileCliPreferencesStore(root).load();
    expect(
      preferences.workingConfig?.orchestrationProfile?.roles.coordinator,
    ).toMatchObject({
      modelId: "gpt-partial",
      thinkingEffort: "high",
    });

    const sessionsRoot = path.join(root, "sessions");
    await mkdir(sessionsRoot, { mode: 0o700 });
    await writeFile(
      path.join(sessionsRoot, "legacy-session.json"),
      JSON.stringify({
        schemaVersion: 1,
        sessionId: "legacy-session",
        repositoryPath: "/work/project",
        modelId: "gpt-old",
        thinkingEffort: "medium",
        mode: "plan",
        acceptanceCriteria: [],
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    const session = await new FileCliSessionStore(root).load("legacy-session");
    expect(session).toMatchObject({
      schemaVersion: 4,
      revision: 0,
      orchestrationProfile: {
        preset: "custom",
        roles: {
          implementer: {
            modelId: "gpt-old",
            thinkingEffort: "medium",
          },
        },
      },
    });
    expect(
      JSON.parse(
        await readFile(
          path.join(sessionsRoot, "legacy-session.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ schemaVersion: 4, revision: 0 });
  });

  it("persists a typed session and resolves latest without storing transcript noise", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const session = createSessionSnapshot({
      sessionId: "session-1",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-07-20T10:00:00.000Z",
    });
    session.goal = "verify the repository contract";
    session.acceptanceCriteria = ["tests pass", "evidence is persisted"];
    session.conversationSummary = "Discussed repository verification; no raw messages retained.";
    session.turnCount = 2;

    const saved = await store.save(session);

    await expect(store.load("session-1")).resolves.toEqual(saved);
    await expect(store.loadLatest()).resolves.toEqual(saved);
    const persisted = await readFile(path.join(root, "sessions", "session-1.json"), "utf8");
    expect(persisted).not.toContain("rawTranscript");
    expect(persisted).not.toContain("recentTurns");
    expect(persisted).toContain("conversationSummary");
  });

  it("stores a private redacted hash-chained transcript outside the bounded snapshot", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const session = createSessionSnapshot({
      sessionId: "session-transcript",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.6",
      thinkingEffort: "high",
      now: "2026-08-05T00:00:00.000Z",
    });
    await store.save(session);
    const summary = await store.appendTranscript(
      session.sessionId,
      "turn-1",
      [
        { role: "user", content: "Token sk-secret-value" },
        { role: "agent", content: "Handled safely." },
      ],
      "2026-08-05T00:01:00.000Z",
    );
    expect(summary).toMatchObject({
      entryCount: 2,
      lastSequence: 2,
    });
    const page = await store.readTranscript(session.sessionId);
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]?.content).not.toContain("sk-secret-value");
    expect(page.entries[1]?.previousHash).toBe(
      page.entries[0]?.contentHash,
    );
    const transcriptPath = path.join(
      root,
      "sessions",
      "session-transcript.transcript.jsonl",
    );
    expect((await stat(transcriptPath)).mode & 0o077).toBe(0);
    expect(await readFile(path.join(root, "sessions", "session-transcript.json"), "utf8"))
      .not.toContain("Handled safely.");
  });

  it("resolves latest to the most recently updated active session", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const olderPinned = createSessionSnapshot({
      sessionId: "session-older-pinned",
      repositoryPath: "/work/older",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-07-20T10:00:00.000Z",
    });
    olderPinned.pinned = true;
    const recent = createSessionSnapshot({
      sessionId: "session-recent",
      repositoryPath: "/work/recent",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-07-21T10:00:00.000Z",
    });
    const pointed = createSessionSnapshot({
      sessionId: "session-pointed",
      repositoryPath: "/work/pointed",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-07-22T10:00:00.000Z",
    });
    await store.save(olderPinned);
    await store.save(recent);
    await store.save(pointed);
    await store.trash(pointed.sessionId);

    await expect(store.loadLatest()).resolves.toMatchObject({
      sessionId: recent.sessionId,
    });

    await unlink(path.join(root, "sessions", "latest"));
    await expect(store.loadLatest()).resolves.toMatchObject({
      sessionId: recent.sessionId,
    });
  });

  it("returns no latest session when every saved session is in Trash", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const session = createSessionSnapshot({
      sessionId: "session-only-trash",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
    });
    await store.save(session);
    await store.trash(session.sessionId);

    await expect(store.loadLatest()).resolves.toBeUndefined();
  });

  it("fails closed when the latest pointer targets a corrupt snapshot", async () => {
    const root = await tempRoot();
    const sessionsRoot = path.join(root, "sessions");
    await mkdir(sessionsRoot, { mode: 0o700 });
    await writeFile(
      path.join(sessionsRoot, "corrupt.json"),
      "{not-json",
      { encoding: "utf8", mode: 0o600 },
    );
    await writeFile(
      path.join(sessionsRoot, "latest"),
      "corrupt\n",
      { encoding: "utf8", mode: 0o600 },
    );

    await expect(
      new FileCliSessionStore(root).loadLatest(),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it("rejects stale concurrent session writes and reports corrupt catalog entries", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const newSnapshot = createSessionSnapshot({
      sessionId: "session-create-race",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-07-20T10:00:00.000Z",
    });
    const createRace = await Promise.allSettled([
      store.save(structuredClone(newSnapshot)),
      new FileCliSessionStore(root).save(structuredClone(newSnapshot)),
    ]);
    expect(createRace.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(createRace.filter(({ status }) => status === "rejected")).toHaveLength(1);

    const initial = await store.save(createSessionSnapshot({
      sessionId: "session-cas",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-07-20T10:00:00.000Z",
    }));
    const firstWriter = structuredClone(initial);
    const staleWriter = structuredClone(initial);
    firstWriter.title = "first";
    staleWriter.title = "stale";
    await expect(store.save(firstWriter)).resolves.toMatchObject({ revision: 2 });
    await expect(store.save(staleWriter)).rejects.toMatchObject({
      code: "revision_conflict",
    });

    await writeFile(
      path.join(root, "sessions", "corrupt.json"),
      "{not-json",
      { encoding: "utf8", mode: 0o600 },
    );
    await expect(store.list()).resolves.toMatchObject({
      issues: [{
        sessionId: "corrupt",
        reason: "invalid_or_unreadable_snapshot",
      }],
    });
  });

  it("persists only a bounded redacted prompt draft and forces restart reconfirmation", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const session = createSessionSnapshot({
      sessionId: "session-prompt-draft",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
    });
    const basis = {
      rawPrompt: "Update the CLI with ghp_1234567890abcdef123456.",
      acceptanceCriteria: ["Focused tests pass."],
      clarificationAnswers: [],
      confirmedAssumptions: [],
    };
    session.promptUnderstandingDraft = {
      schemaVersion: 1,
      basis,
      understanding: {
        schemaVersion: 1,
        promptId: hashPromptUnderstandingBasis(basis),
        outcome: "repository_action",
        readiness: "clarification_required",
        reply: "Which CLI surface should change?",
        refinedBrief: null,
        questions: [{
          id: "surface",
          prompt: "Which CLI surface should change?",
          rationale: "It changes the implementation scope.",
          kind: "constraint",
          options: [{
            id: "terminal",
            label: "Terminal UI",
            description: "Update the ghp_1234567890abcdef123456 terminal surface.",
            recommended: true,
          }, {
            id: "runtime",
            label: "Runtime",
            description: "Update the shared runtime boundary.",
            recommended: false,
          }],
        }],
        assumptions: [{
          id: "compatibility",
          text: "Keep existing command compatibility.",
          affectsScope: false,
        }],
      },
      clarificationRounds: 1,
      requiresReconfirmation: false,
    };

    await store.save(session);

    const restored = await store.load("session-prompt-draft");
    expect(restored?.promptUnderstandingDraft).toMatchObject({
      clarificationRounds: 1,
      requiresReconfirmation: true,
      understanding: {
        questions: [{
          id: "surface",
          options: [{
            id: "terminal",
            label: "Terminal UI",
            description: "Update the [REDACTED] terminal surface.",
            recommended: true,
          }, {
            id: "runtime",
            label: "Runtime",
            description: "Update the shared runtime boundary.",
            recommended: false,
          }],
        }],
        assumptions: [{
          id: "compatibility",
          text: "Keep existing command compatibility.",
          affectsScope: false,
        }],
      },
    });
    const persisted = await readFile(
      path.join(root, "sessions", "session-prompt-draft.json"),
      "utf8",
    );
    expect(persisted).not.toContain("ghp_1234567890abcdef123456");
    expect(persisted).toContain("promptUnderstandingDraft");
  });

  it("rejects symlinked preference and session files", async () => {
    const root = await tempRoot();
    const sessionsRoot = path.join(root, "sessions");
    await mkdir(sessionsRoot, { mode: 0o700 });
    const outsidePreferences = path.join(root, "outside-preferences.json");
    const outsideSession = path.join(root, "outside-session.json");
    await writeFile(
      outsidePreferences,
      JSON.stringify({
        schemaVersion: 1,
        startupBoundaryAcknowledgedAt: "2026-07-29T00:00:00.000Z",
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    await writeFile(
      outsideSession,
      JSON.stringify(
        createSessionSnapshot({
          sessionId: "session-linked",
          repositoryPath: "/work/orynt",
          modelId: "gpt-5.5",
          thinkingEffort: "high",
        }),
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    await symlink(outsidePreferences, path.join(root, "preferences.json"));
    await symlink(
      outsideSession,
      path.join(sessionsRoot, "session-linked.json"),
    );

    await expect(new FileCliPreferencesStore(root).load()).rejects.toThrow(
      "Unsafe Orynt state file",
    );
    await expect(
      new FileCliSessionStore(root).load("session-linked"),
    ).rejects.toThrow("Unsafe Orynt state file");
  });

  it("atomically replaces a planted latest symlink without modifying its target", async () => {
    const root = await tempRoot();
    const sessionsRoot = path.join(root, "sessions");
    await mkdir(sessionsRoot, { mode: 0o700 });
    const outsideTarget = path.join(root, "outside-latest");
    await writeFile(outsideTarget, "outside-content\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    await symlink(outsideTarget, path.join(sessionsRoot, "latest"));
    const session = createSessionSnapshot({
      sessionId: "session-safe-latest",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
    });

    const store = new FileCliSessionStore(root);
    const saved = await store.save(session);

    expect(await readFile(outsideTarget, "utf8")).toBe("outside-content\n");
    await expect(store.loadLatest()).resolves.toEqual(saved);
  });

  it("rejects state files with broad permissions or a different owner", async () => {
    const root = await tempRoot();
    const preferencesPath = path.join(root, "preferences.json");
    await writeFile(
      preferencesPath,
      JSON.stringify({ schemaVersion: 1 }),
      { encoding: "utf8", mode: 0o644 },
    );
    const store = new FileCliPreferencesStore(root);
    await expect(store.load()).rejects.toThrow(
      "Orynt state file permissions are too broad",
    );

    await chmod(preferencesPath, 0o600);
    if (typeof process.getuid === "function") {
      const uid = process.getuid();
      const getuid = vi.spyOn(process, "getuid");
      getuid.mockReturnValueOnce(uid).mockReturnValue(uid + 1);
      await expect(store.load()).rejects.toThrow(
        "Orynt state file is not owned by the current user",
      );
      getuid.mockRestore();
    }
  });

  it("rejects session snapshots with unsafe working config values", async () => {
    const root = await tempRoot();
    const sessionsRoot = path.join(root, "sessions");
    await mkdir(sessionsRoot, { mode: 0o700 });
    const invalidSession = {
      ...createSessionSnapshot({
        sessionId: "session-invalid",
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
      }),
      repositoryPath: "relative/repository",
      modelId: " padded-model ",
    };
    await writeFile(
      path.join(sessionsRoot, "session-invalid.json"),
      JSON.stringify(invalidSession),
      { encoding: "utf8", mode: 0o600 },
    );

    await expect(
      new FileCliSessionStore(root).load("session-invalid"),
    ).rejects.toThrow("Invalid Orynt session snapshot");
  });

  it("rejects an invalid session before updating persisted state", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const invalidSession = {
      ...createSessionSnapshot({
        sessionId: "session-too-long",
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
      }),
      modelId: "m".repeat(201),
    };

    await expect(store.save(invalidSession)).rejects.toThrow(
      "Invalid Orynt session snapshot",
    );
    await expect(store.loadLatest()).resolves.toBeUndefined();
  });

  it("redacts secret-like values before writing a resumable session", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const session = createSessionSnapshot({
      sessionId: "session-redacted",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
    });
    session.goal = "debug with ghp_1234567890abcdef123456";

    await store.save(session);

    expect((await store.load("session-redacted"))?.goal).toBe("debug with [REDACTED]");
  });

  it("derives state, evidence, verification, and cost from a real artifact manifest shape", async () => {
    const root = await tempRoot();
    const manifestPath = path.join(root, "artifact-manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        runId: "run-1",
        status: "pass",
        summary: "Repository task completed and verified.",
        budgetedAgent: {
          mode: "DELIBERATE",
          needState: { status: "active", priority: 0.8 },
          compactWorkingState: { activeChunks: ["goal", "constraint"], hardConstraints: ["repository-only"] },
          selectedOptionId: "O2",
          cost: { estimatedTotalTokens: 1200, estimatedCostUsd: 0.08, costPerSuccessfulTask: 0.08 },
        },
        artifacts: {
          contract: "/artifacts/contract.md",
          verificationResult: "/artifacts/verification-result.json",
          eventLog: "/artifacts/run-events.json",
        },
        memory: { summary: "1 episode", episodeCount: 1, candidateRuleCount: 0 },
        eventTypes: ["run_started", "verification_passed", "run_finished"],
      }),
      "utf8",
    );

    await expect(readRunSnapshot(manifestPath)).resolves.toMatchObject({
      runId: "run-1",
      status: "pass",
      verification: "passed",
      evidenceCount: 3,
      estimatedCostUsd: 0.08,
      costPerSuccessfulTask: 0.08,
      workingState: {
        mode: "DELIBERATE",
        activeChunkCount: 2,
        hardConstraints: ["repository-only"],
      },
    });
  });

  it("loads and verifies a private repository diff artifact descriptor", async () => {
    const root = await tempRoot();
    const diffPath = path.join(root, "repository-diff.json");
    const diff = {
      schemaVersion: 1,
      runId: "run-diff",
      taskId: "task-diff",
      baseRef: "HEAD",
      redacted: true,
      redactionCount: 0,
      truncated: false,
      maxBytes: REPOSITORY_DIFF_ARTIFACT_MAX_BYTES,
      totals: { files: 1, additions: 1, deletions: 1, binaryFiles: 0 },
      files: [{
        path: "packages/value.txt",
        status: "modified",
        additions: 1,
        deletions: 1,
        binary: false,
        patch: "@@ -1 +1 @@\n-old\n+new",
        truncated: false,
      }],
      generatedAt: "2026-08-03T00:00:00.000Z",
    };
    const serialized = `${JSON.stringify(diff, null, 2)}\n`;
    await writeFile(diffPath, serialized, { mode: 0o600 });
    const manifestPath = path.join(root, "artifact-manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        runId: "run-diff",
        status: "pass",
        summary: "Verified.",
        eventTypes: ["verification_passed"],
        artifacts: {
          repositoryDiff: {
            kind: "repository_diff",
            path: diffPath,
            sha256: createHash("sha256").update(serialized).digest("hex"),
            byteLength: Buffer.byteLength(serialized),
            redaction: "redacted",
          },
        },
      }),
      { mode: 0o600 },
    );

    await expect(readRunSnapshot(manifestPath)).resolves.toMatchObject({
      evidenceCount: 1,
      repositoryDiff: {
        available: true,
        totals: { files: 1, additions: 1, deletions: 1 },
      },
    });

    await writeFile(diffPath, `${serialized}tampered`, { mode: 0o600 });
    await expect(readRunSnapshot(manifestPath)).resolves.toMatchObject({
      repositoryDiff: {
        available: false,
        reason: expect.stringMatching(/size does not match/u),
      },
    });

    await writeFile(diffPath, serialized, { mode: 0o600 });
    await chmod(diffPath, 0o644);
    await expect(readRunSnapshot(manifestPath)).resolves.toMatchObject({
      repositoryDiff: {
        available: false,
        reason: expect.stringMatching(/permissions are too broad/u),
      },
    });

    await writeFile(
      manifestPath,
      JSON.stringify({
        runId: "run-diff",
        status: "pass",
        artifacts: {
          repositoryDiff: {
            path: "/etc/hosts",
            sha256: "a".repeat(64),
            byteLength: 1,
          },
        },
      }),
      { mode: 0o600 },
    );
    await expect(readRunSnapshot(manifestPath)).resolves.toMatchObject({
      repositoryDiff: {
        available: false,
        reason: expect.stringMatching(/outside its managed run root/u),
      },
    });

    const outsideRoot = await tempRoot();
    const escapedPath = path.join(outsideRoot, "repository-diff.json");
    await writeFile(escapedPath, serialized, { mode: 0o600 });
    const linkedRoot = path.join(root, "linked-artifacts");
    await symlink(outsideRoot, linkedRoot);
    await writeFile(
      manifestPath,
      JSON.stringify({
        runId: "run-diff",
        status: "pass",
        artifacts: {
          repositoryDiff: {
            path: path.join(linkedRoot, "repository-diff.json"),
            sha256: createHash("sha256").update(serialized).digest("hex"),
            byteLength: Buffer.byteLength(serialized),
          },
        },
      }),
      { mode: 0o600 },
    );
    await expect(readRunSnapshot(manifestPath)).resolves.toMatchObject({
      repositoryDiff: {
        available: false,
        reason: expect.stringMatching(/resolves outside/u),
      },
    });
  });

  it("lists bounded redacted session context and protects modified worktrees from retention", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    const session = createSessionSnapshot({
      sessionId: "session-protected",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-01-01T00:00:00.000Z",
    });
    session.recentTurns = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "agent" as const,
      content: index === 19
        ? "token ghp_1234567890abcdef123456"
        : `turn-${index}-${"x".repeat(2_500)}`,
      recordedAt: "2026-01-01T00:00:00.000Z",
    }));
    session.lastRun = {
      runId: "run-protected",
      status: "pass",
      summary: "Completed with local changes.",
      verification: "passed",
      evidenceCount: 1,
      artifactManifestPath: "/state/runs/run-protected/manifest.json",
      artifacts: {},
      eventTypes: [],
      resources: {
        artifactRoot: "/state/runs/run-protected",
        sandboxWorktreePath: "/state/sandboxes/run-protected",
        sandboxChanged: true,
      },
    };
    await store.save(session);

    const restored = await store.load(session.sessionId);
    expect(restored?.recentTurns).toHaveLength(12);
    expect(restored?.recentTurns?.at(-1)?.content).not.toContain("ghp_");
    expect(restored?.recentTurns?.[0]?.content.length).toBeLessThanOrEqual(2_000);
    await expect(store.list({ repositoryPath: "/work/orynt" })).resolves.toMatchObject({
      entries: [{
        sessionId: "session-protected",
        modifiedWorktreeProtected: true,
      }],
    });
    await expect(
      store.maintain(new Date("2026-08-04T00:00:00.000Z"), false),
    ).resolves.toMatchObject({
      trashed: [],
      purged: [],
      skippedProtected: ["session-protected"],
    });
  });

  it("records bounded audit evidence when automatic retention changes a session", async () => {
    const root = await tempRoot();
    const store = new FileCliSessionStore(root);
    await store.save(createSessionSnapshot({
      sessionId: "session-expired",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      now: "2026-01-01T00:00:00.000Z",
    }));

    await expect(
      store.maintainIfDue(new Date("2026-08-04T00:00:00.000Z")),
    ).resolves.toMatchObject({ trashed: ["session-expired"] });
    await expect(store.load("session-expired")).resolves.toMatchObject({
      trashedAt: expect.any(String),
    });
    const audit = JSON.parse(
      await readFile(
        path.join(root, "sessions", "maintenance-audit.json"),
        "utf8",
      ),
    ) as unknown[];
    expect(audit).toEqual([
      expect.objectContaining({
        sessionId: "session-expired",
        action: "trash",
        status: "completed",
      }),
    ]);
  });
});
