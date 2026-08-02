import { describe, expect, it, vi } from "vitest";

import { runCliApplication } from "./app";
import { INTERRUPTED_INPUT } from "./composer";

const headlessTaskPlanner = vi.fn(async (request: { prompt: string }) => ({
  disposition: "action" as const,
  reply: "Ready to execute.",
  conversationSummary: "Prepared a bounded repository task plan.",
  action: {
    instruction: request.prompt,
    rationale: "Explicitly approved headless repository task.",
    operations: ["write" as const],
    estimatedPaths: ["README.md"],
    estimatedChangedFiles: 1,
    helperTasks: [],
    taskPlan: {
      summary: request.prompt,
      requirements: [{
        id: "headless-prompt",
        text: request.prompt,
        source: "user_prompt" as const,
        kind: "outcome" as const,
        required: true,
      }],
      tasks: [{
        id: "headless-change",
        title: "Execute the approved repository change",
        instruction: request.prompt,
        kind: "change" as const,
        dependencies: [],
        requirementIds: ["headless-prompt"],
        authority: "single_writer" as const,
        operations: ["write" as const],
        expectedPaths: ["README.md"],
        doneWhen: ["The approved repository task is complete."],
        evidence: [{
          id: "headless-diff",
          requirementIds: ["headless-prompt"],
          kind: "diff" as const,
          description: "Inspect the bounded repository diff.",
          path: "README.md",
        }],
      }],
      allowedOperations: ["read" as const, "write" as const],
    },
  },
}));

describe("Orynt CLI application", () => {
  it("prints help without probing provider state or opening an interactive session", async () => {
    const output: string[] = [];
    const probeProvider = vi.fn();
    const hasAcknowledgedStartupBoundary = vi.fn();

    const exitCode = await runCliApplication(["--help"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider,
      run: vi.fn(),
      hasAcknowledgedStartupBoundary,
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("Usage: orynt [options] [prompt]");
    expect(probeProvider).not.toHaveBeenCalled();
    expect(hasAcknowledgedStartupBoundary).not.toHaveBeenCalled();
  });

  it("returns a usage error for invalid options", async () => {
    const output: string[] = [];

    const exitCode = await runCliApplication(["--unsafe"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: vi.fn(),
      run: vi.fn(),
    });

    expect(exitCode).toBe(2);
    expect(output.join("\n")).toContain("Unknown option: --unsafe");
  });

  it("rejects piped conversational input instead of bypassing headless approval", async () => {
    const output: string[] = [];
    const turn = vi.fn();
    const run = vi.fn();

    const exitCode = await runCliApplication([], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: vi.fn(),
      turn,
      run,
    });

    expect(exitCode).toBe(2);
    expect(output.join("\n")).toContain("requires a TTY");
    expect(turn).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("runs one explicitly approved headless task and emits stable JSONL events", async () => {
    const output: string[] = [];
    const run = vi.fn(async (request) => {
      request.onEvent({ type: "run_started", payload: { summary: "started" } });
      return {
        runId: "run-jsonl-1",
        status: "pass",
        artifactRoot: "/artifacts/run-jsonl-1",
        artifactManifestPath: "/artifacts/run-jsonl-1/artifact-manifest.json",
        eventCount: 1,
        events: [],
      };
    });

    const exitCode = await runCliApplication(["run", "--jsonl", "--approve-once", "audit", "the", "repo"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: headlessTaskPlanner,
      run,
    });

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "audit the repo",
        authorization: expect.objectContaining({ source: "headless" }),
      }),
    );
    expect(output.map((line) => JSON.parse(line))).toEqual([
      expect.objectContaining({ schemaVersion: 1, kind: "event", event: expect.objectContaining({ type: "run_started" }) }),
      expect.objectContaining({ schemaVersion: 1, kind: "result", runId: "run-jsonl-1", status: "pass" }),
    ]);
  });

  it("renders the same final agent report and verified facts for human headless runs", async () => {
    const output: string[] = [];
    const exitCode = await runCliApplication(["run", "--approve-once", "audit"], {
      cwd: "/work/orynt",
      isTTY: true,
      color: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: headlessTaskPlanner,
      run: async (request) => {
        request.onEvent({ type: "run_started", payload: { summary: "started" } });
        request.onEvent({ type: "codex_execution_started", payload: { summary: "running" } });
        request.onEvent({
          type: "codex_execution_finished",
          payload: { lastMessagePreview: "Updated the CLI.\nTests pass." },
        });
        request.onEvent({
          type: "codex_sandbox_diff_inspected",
          payload: {
            changedFiles: [
              "packages/cli/src/ui.ts",
              ".codex/orynt-beta-verify.mjs",
            ],
          },
        });
        request.onEvent({ type: "verification_started", payload: { summary: "verifying" } });
        request.onEvent({ type: "verification_passed", payload: { summary: "All checks passed" } });
        return {
          runId: "run-human-1",
          status: "pass",
          artifactRoot: "/artifacts/run-human-1",
          artifactManifestPath: "/artifacts/run-human-1/artifact-manifest.json",
          eventCount: 6,
          events: [],
          cliSnapshot: {
            runId: "run-human-1",
            status: "pass",
            summary: "All checks passed",
            verification: "passed" as const,
            evidenceCount: 6,
            artifactManifestPath: "/artifacts/run-human-1/artifact-manifest.json",
            artifacts: {},
            eventTypes: [],
          },
        };
      },
    });

    const transcript = output.join("\n");
    expect(exitCode).toBe(0);
    expect(transcript).toContain("◇ Prepare");
    expect(transcript).toContain("◇ Run");
    expect(transcript).toContain("◇ Verify");
    expect(transcript).toContain("✓ Done");
    expect(transcript).toContain("Agent report");
    expect(transcript).toContain("  Updated the CLI.\n  Tests pass.");
    expect(transcript).toContain("Changes · 1 file");
    expect(transcript).toContain("packages/cli/src/ui.ts");
    expect(transcript).not.toContain(".codex/orynt-beta-verify.mjs");
    expect(transcript).toContain("6 artifacts");
    expect(transcript).not.toContain("\u001b");
  });

  it("surfaces headless failures as JSONL and returns a failing exit code", async () => {
    const output: string[] = [];
    const exitCode = await runCliApplication(["run", "--jsonl", "--approve-once", "audit"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: headlessTaskPlanner,
      run: async () => {
        throw new Error("Codex exited with status 1");
      },
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(output.at(-1) ?? "{}")).toMatchObject({
      schemaVersion: 1,
      kind: "error",
      classification: "model",
      message: "Codex exited with status 1",
    });
  });

  it("escapes controls in human headless output while preserving JSONL data", async () => {
    const malicious = "\u001b]52;c;owned\u0007\r\n\u202espoof";
    const humanOutput: string[] = [];
    const humanExitCode = await runCliApplication(["run", "--approve-once", "audit"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => humanOutput.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: headlessTaskPlanner,
      run: async () => {
        throw new Error(`failure-${malicious}`);
      },
    });

    expect(humanExitCode).toBe(1);
    expect(humanOutput.join("\n")).not.toContain("\u001b");
    expect(humanOutput.join("\n")).not.toContain("\u0007");
    expect(humanOutput.join("\n")).not.toContain("\r");
    expect(humanOutput.join("\n")).not.toContain("\u202e");
    expect(humanOutput.join("\n")).toContain(
      "failure-\\u001b]52;c;owned\\u0007\\r\\n\\u202espoof",
    );

    const jsonlOutput: string[] = [];
    await runCliApplication(["run", "--jsonl", "--approve-once", "audit"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => jsonlOutput.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: headlessTaskPlanner,
      run: async () => {
        throw new Error(`failure-${malicious}`);
      },
    });
    expect(JSON.parse(jsonlOutput.at(-1) ?? "{}")).toMatchObject({
      message: `failure-${malicious}`,
    });
  });

  it("applies saved working config to headless runs while keeping flags one-shot", async () => {
    const requests: Array<{
      repositoryPath: string;
      modelId: string;
      thinkingEffort: string;
    }> = [];
    const persistWorkingConfig = vi.fn();
    const dependencies = {
      cwd: "/work/current",
      isTTY: false,
      write: vi.fn(),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: headlessTaskPlanner,
      loadPreferences: async () => ({
        schemaVersion: 1 as const,
        workingConfig: {
          repositoryPath: "/work/saved",
          modelId: "gpt-saved",
          thinkingEffort: "xhigh" as const,
        },
      }),
      persistWorkingConfig,
      run: async (request: {
        repositoryPath: string;
        modelId: string;
        thinkingEffort: string;
      }) => {
        requests.push(request);
        return {
          runId: "run-config",
          status: "pass",
          artifactRoot: "/artifacts/run-config",
          artifactManifestPath: "/artifacts/run-config/manifest.json",
          eventCount: 0,
          events: [],
        };
      },
    };

    await runCliApplication(
      ["run", "--jsonl", "--approve-once", "inspect"],
      dependencies,
    );
    await runCliApplication(
      [
        "run",
        "--jsonl",
        "--approve-once",
        "--repo",
        "/work/flag",
        "--role-model",
        "implementer=gpt-flag",
        "--role-effort",
        "implementer=low",
        "inspect",
      ],
      dependencies,
    );

    expect(requests).toEqual([
      expect.objectContaining({
        repositoryPath: "/work/saved",
        modelId: "gpt-saved",
        thinkingEffort: "xhigh",
        orchestration: expect.objectContaining({
          profile: expect.objectContaining({ preset: "custom" }),
        }),
      }),
      expect.objectContaining({
        repositoryPath: "/work/flag",
        modelId: "gpt-flag",
        thinkingEffort: "low",
        orchestration: expect.objectContaining({
          profile: expect.objectContaining({ preset: "custom" }),
        }),
      }),
    ]);
    expect(persistWorkingConfig).not.toHaveBeenCalled();
  });

  it("uses saved config for a fresh TTY and explicit fields over a resumed session", async () => {
    const savedOutput: string[] = [];
    await runCliApplication([], {
      cwd: "/work/current",
      isTTY: true,
      color: false,
      write: (value) => savedOutput.push(value),
      ask: async () => "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      loadPreferences: async () => ({
        schemaVersion: 1,
        workingConfig: {
          repositoryPath: "/work/saved",
          modelId: "gpt-saved",
          thinkingEffort: "xhigh",
        },
      }),
      hasAcknowledgedStartupBoundary: async () => true,
    });
    expect(savedOutput.join("\n")).toContain("/work/saved");
    expect(savedOutput.join("\n")).toContain("custom · gpt-saved/gpt-saved");

    const resumedOutput: string[] = [];
    await runCliApplication(
      [
        "--resume",
        "session-1",
        "--role-model",
        "coordinator=gpt-flag",
      ],
      {
        cwd: "/work/current",
        isTTY: true,
        color: false,
        write: (value) => resumedOutput.push(value),
        ask: async () => "/exit",
        clear: vi.fn(),
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
        run: vi.fn(),
        loadPreferences: async () => ({
          schemaVersion: 1,
          workingConfig: {
            repositoryPath: "/work/saved",
            modelId: "gpt-saved",
            thinkingEffort: "low",
          },
        }),
        loadSession: async (sessionId) =>
          sessionId === "session-1"
            ? {
                schemaVersion: 1,
                sessionId,
                repositoryPath: "/work/resumed",
                modelId: "gpt-resumed",
                thinkingEffort: "medium",
                mode: "plan",
                acceptanceCriteria: [],
                createdAt: "2026-07-29T00:00:00.000Z",
                updatedAt: "2026-07-29T00:00:00.000Z",
              }
            : undefined,
        hasAcknowledgedStartupBoundary: async () => true,
      },
    );
    expect(resumedOutput.join("\n")).toContain("/work/resumed");
    expect(resumedOutput.join("\n")).toContain(
      "custom · gpt-flag/gpt-resumed",
    );
  });

  it("uses an interactively selected model on the next ordinary launch", async () => {
    let preferences: any = { schemaVersion: 2 };
    const persistWorkingConfig = vi.fn(async (patch) => {
      preferences = {
        ...preferences,
        workingConfig: {
          ...preferences.workingConfig,
          ...patch,
        },
      };
    });
    const firstAnswers = [
      "/model role coordinator gpt-persisted high",
      "/exit",
    ];
    let firstAnswer = 0;
    await runCliApplication([], {
      cwd: "/work/current",
      isTTY: true,
      color: false,
      write: vi.fn(),
      ask: async () => firstAnswers[firstAnswer++] ?? "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      loadPreferences: async () => preferences,
      persistWorkingConfig,
      hasAcknowledgedStartupBoundary: async () => true,
    });

    const reopenedOutput: string[] = [];
    await runCliApplication([], {
      cwd: "/work/current",
      isTTY: true,
      color: false,
      write: (value) => reopenedOutput.push(value),
      ask: async () => "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      loadPreferences: async () => preferences,
      persistWorkingConfig,
      hasAcknowledgedStartupBoundary: async () => true,
    });

    expect(persistWorkingConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orchestrationProfile: expect.objectContaining({
          roles: expect.objectContaining({
            coordinator: expect.objectContaining({
              modelId: "gpt-persisted",
            }),
          }),
        }),
      }),
    );
    expect(reopenedOutput.join("\n")).toContain(
      "custom · gpt-persisted/gpt-5.5",
    );
  });

  it("bootstraps working config once from the latest session without resuming it", async () => {
    const firstOutput: string[] = [];
    const secondOutput: string[] = [];
    let preferences: any = { schemaVersion: 2 };
    const persistWorkingConfig = vi.fn(async (patch) => {
      preferences = {
        ...preferences,
        workingConfig: {
          ...preferences.workingConfig,
          ...patch,
        },
      };
    });
    const latest = {
      schemaVersion: 1 as const,
      sessionId: "session-latest",
      repositoryPath: "/work/latest",
      modelId: "gpt-latest",
      thinkingEffort: "medium" as const,
      mode: "plan" as const,
      goal: "do not resume this goal",
      acceptanceCriteria: ["do not import"],
      conversationSummary: "do not resume this conversation",
      turnCount: 4,
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    };

    const loadSession = vi.fn(async (sessionId: string) =>
      sessionId === "latest" ? latest : undefined,
    );
    const dependencies = {
      cwd: "/work/current",
      isTTY: true,
      color: false,
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      loadPreferences: async () => preferences,
      loadSession,
      persistWorkingConfig,
      hasAcknowledgedStartupBoundary: async () => true,
    };

    await runCliApplication([], {
      ...dependencies,
      write: (value) => firstOutput.push(value),
      ask: async () => "/exit",
    });
    await runCliApplication([], {
      ...dependencies,
      write: (value) => secondOutput.push(value),
      ask: async () => "/exit",
    });

    expect(persistWorkingConfig).toHaveBeenCalledOnce();
    expect(persistWorkingConfig).toHaveBeenCalledWith({
      repositoryPath: "/work/latest",
      modelId: "gpt-latest",
      thinkingEffort: "medium",
    });
    expect(loadSession).toHaveBeenCalledOnce();
    expect(firstOutput.join("\n")).toContain("/work/latest");
    expect(firstOutput.join("\n")).toContain(
      "custom · gpt-latest/gpt-latest",
    );
    expect(firstOutput.join("\n")).not.toContain("do not resume");
    expect(secondOutput.join("\n")).toContain("/work/latest");
    expect(secondOutput.join("\n")).toContain(
      "custom · gpt-latest/gpt-latest",
    );
    expect(secondOutput.join("\n")).not.toContain("do not resume");
  });

  it("clears resumed repository context before the first turn when --repo overrides it", async () => {
    const turn = vi.fn(async () => ({
      disposition: "answer" as const,
      reply: "Fresh repository context.",
      conversationSummary: "Started fresh in the overridden repository.",
    }));

    await runCliApplication(
      [
        "--resume",
        "session-context",
        "--repo",
        "/work/other",
        "inspect",
      ],
      {
        cwd: "/work/current",
        isTTY: true,
        color: false,
        write: vi.fn(),
        ask: async () => "/exit",
        clear: vi.fn(),
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
        turn,
        run: vi.fn(),
        loadPreferences: async () => ({
          schemaVersion: 1,
          workingConfig: {
            repositoryPath: "/work/saved",
            modelId: "gpt-saved",
            thinkingEffort: "low",
          },
        }),
        loadSession: async (sessionId) =>
          sessionId === "session-context"
            ? {
                schemaVersion: 1,
                sessionId,
                repositoryPath: "/work/original",
                modelId: "gpt-resumed",
                thinkingEffort: "medium",
                mode: "bounded_execute",
                goal: "old repository goal",
                acceptanceCriteria: ["old repository criterion"],
                conversationSummary: "old repository conversation",
                turnCount: 8,
                createdAt: "2026-07-29T00:00:00.000Z",
                updatedAt: "2026-07-29T00:00:00.000Z",
              }
            : undefined,
        hasAcknowledgedStartupBoundary: async () => true,
      },
    );

    expect(turn).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryPath: "/work/other",
        prompt: "inspect",
        activeGoal: undefined,
        acceptanceCriteria: [],
        conversationSummary: undefined,
        recentTurns: [],
      }),
    );
  });

  it("runs doctor without opening a model session", async () => {
    const output: string[] = [];
    const run = vi.fn();
    const exitCode = await runCliApplication(["doctor"], {
      cwd: "/work/orynt",
      isTTY: true,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: vi.fn(),
      run,
      diagnose: async () => ["TTY: ready", "Repository: ready"],
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("TTY: ready");
    expect(run).not.toHaveBeenCalled();
  });

  it("loads and persists onboarding only for an interactive TTY session", async () => {
    const output: string[] = [];
    const hasAcknowledgedStartupBoundary = vi.fn(async () => false);
    const acknowledgeStartupBoundary = vi.fn(async () => undefined);
    const answers = ["yes", "/exit"];
    let answer = 0;

    const exitCode = await runCliApplication([], {
      cwd: "/work/orynt",
      isTTY: true,
      color: false,
      write: (value) => output.push(value),
      ask: async () => answers[answer++] ?? "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      hasAcknowledgedStartupBoundary,
      acknowledgeStartupBoundary,
    });

    expect(exitCode).toBe(0);
    expect(hasAcknowledgedStartupBoundary).toHaveBeenCalledOnce();
    expect(acknowledgeStartupBoundary).toHaveBeenCalledOnce();
    expect(output.join("\n")).toContain("Safety acknowledgement · shown once");
  });

  it("does not open onboarding or conversation for line-oriented non-TTY input", async () => {
    const hasAcknowledgedStartupBoundary = vi.fn();

    const exitCode = await runCliApplication([], {
      cwd: "/work/orynt",
      isTTY: false,
      write: vi.fn(),
      ask: async () => "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      hasAcknowledgedStartupBoundary,
    });

    expect(exitCode).toBe(2);
    expect(hasAcknowledgedStartupBoundary).not.toHaveBeenCalled();
  });

  it("returns the conventional interrupt status when first-launch acknowledgement is interrupted", async () => {
    const exitCode = await runCliApplication([], {
      cwd: "/work/orynt",
      isTTY: true,
      color: false,
      write: vi.fn(),
      ask: async () => INTERRUPTED_INPUT,
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      hasAcknowledgedStartupBoundary: async () => false,
      acknowledgeStartupBoundary: vi.fn(),
    });

    expect(exitCode).toBe(130);
  });

  it("does not silently replace a missing requested session", async () => {
    const output: string[] = [];
    const exitCode = await runCliApplication(["--resume", "missing"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      loadSession: async () => undefined,
    });

    expect(exitCode).toBe(2);
    expect(output.join("\n")).toContain("Session not found: missing");
  });
});
