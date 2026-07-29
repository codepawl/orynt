import { chmod, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FileCliPreferencesStore,
  FileCliSessionStore,
  createSessionSnapshot,
  readRunSnapshot,
} from "./state";

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
  it("persists the first-launch boundary acknowledgement separately from sessions", async () => {
    const root = await tempRoot();
    const store = new FileCliPreferencesStore(root);

    await expect(store.hasAcknowledgedStartupBoundary()).resolves.toBe(false);
    await store.acknowledgeStartupBoundary("2026-07-28T12:00:00.000Z");
    await expect(store.hasAcknowledgedStartupBoundary()).resolves.toBe(true);
    await expect(store.load()).resolves.toEqual({
      schemaVersion: 2,
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
      schemaVersion: 2,
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

  it("atomically migrates v1 single-model preferences into a v2 custom profile", async () => {
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
      schemaVersion: 2,
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
    ).toMatchObject({ schemaVersion: 2 });
  });

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
      schemaVersion: 2,
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
    ).toMatchObject({ schemaVersion: 2 });
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

    await store.save(session);

    await expect(store.load("session-1")).resolves.toEqual(session);
    await expect(store.loadLatest()).resolves.toEqual(session);
    const persisted = await readFile(path.join(root, "sessions", "session-1.json"), "utf8");
    expect(persisted).not.toContain("rawTranscript");
    expect(persisted).not.toContain("recentTurns");
    expect(persisted).toContain("conversationSummary");
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
    await store.save(session);

    expect(await readFile(outsideTarget, "utf8")).toBe("outside-content\n");
    await expect(store.loadLatest()).resolves.toEqual(session);
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
});
