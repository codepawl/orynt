import { describe, expect, it, vi } from "bun:test";
import { createSingleModelTierConfiguration } from "@codepawl/shared";
import type { ProviderUsageSnapshotV1 } from "@codepawl/model-runtime";

import { runCliApplication } from "./app";
import { INTERRUPTED_INPUT } from "./composer";
import type { DoctorReportV1 } from "./doctor";

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

function doctorReport(
  overrides: Partial<DoctorReportV1> = {},
): DoctorReportV1 {
  return {
    schemaVersion: 1,
    kind: "orynt_doctor_report",
    generatedAt: "2026-08-04T00:00:00.000Z",
    status: "healthy",
    summary: {
      passed: 1,
      warnings: 0,
      failed: 0,
      skipped: 0,
      durationMs: 10,
    },
    context: {
      oryntVersion: "0.1.0",
      bunVersion: "1.3.14",
      platform: "linux",
      architecture: "x64",
      repositoryPath: "/work/orynt",
      stateRoot: "/state/orynt",
    },
    checks: [{
      id: "workspace.repository",
      group: "workspace",
      label: "Repository",
      status: "pass",
      required: true,
      summary: "ready",
      evidence: { gitRoot: "/work/orynt" },
      cause: null,
      remediation: null,
      durationMs: 1,
    }],
    ...overrides,
  };
}

function usageSnapshot(
  overrides: Partial<ProviderUsageSnapshotV1> = {},
): ProviderUsageSnapshotV1 {
  return {
    schemaVersion: 1,
    kind: "orynt_provider_usage",
    generatedAt: "2026-08-04T00:00:00.000Z",
    status: "ready",
    provider: {
      id: "codex",
      label: "Codex",
      transport: "app_server",
    },
    account: { type: "chatgpt", plan: "pro" },
    meters: [{
      id: "codex",
      label: "Codex",
      primary: true,
      windows: [{
        id: "primary",
        label: "7d",
        usedPercent: 40,
        remainingPercent: 60,
      }],
    }],
    issues: [],
    ...overrides,
  };
}

describe("Orynt CLI application", () => {
  it("coordinates startup phases only for the default interactive launch", async () => {
    const events: string[] = [];
    const startup = {
      update: vi.fn((label: string) => events.push(`update:${label}`)),
      settle: vi.fn(),
      fail: vi.fn(),
      stop: vi.fn(() => events.push("stop")),
    };

    const exitCode = await runCliApplication([], {
      cwd: "/work/orynt",
      isTTY: true,
      color: false,
      write: vi.fn(),
      ask: async () => "/exit",
      clear: vi.fn(),
      beginStartupActivity: vi.fn((label: string) => {
        events.push(`begin:${label}`);
        return startup;
      }),
      loadPreferences: async () => {
        events.push("preferences");
        return {
          schemaVersion: 6,
          activityDetails: "important",
          appearance: { color: true, motion: true, richText: true },
        };
      },
      probeProvider: async () => {
        events.push("probe");
        return { ready: true, detail: "Authenticated" };
      },
      run: vi.fn(),
      hasAcknowledgedStartupBoundary: async () => true,
    });

    expect(exitCode).toBe(0);
    expect(events).toEqual([
      "begin:Loading workspace",
      "preferences",
      "update:Checking Codex",
      "probe",
      "stop",
    ]);
  });

  it("prints help without probing provider state or opening an interactive session", async () => {
    const output: string[] = [];
    const probeProvider = vi.fn();
    const beginStartupActivity = vi.fn();
    const hasAcknowledgedStartupBoundary = vi.fn();

    const exitCode = await runCliApplication(["--help"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider,
      beginStartupActivity,
      run: vi.fn(),
      hasAcknowledgedStartupBoundary,
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("Usage: orynt [options] [prompt]");
    expect(probeProvider).not.toHaveBeenCalled();
    expect(beginStartupActivity).not.toHaveBeenCalled();
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

  it("fails closed before a headless run when prompt clarification is required", async () => {
    const output: string[] = [];
    const run = vi.fn();
    const turn = vi.fn(async () => ({
      disposition: "clarify" as const,
      reply: "Which validation command should define completion?",
      conversationSummary: "Need an explicit validation command.",
      promptUnderstandingBasis: {
        rawPrompt: "update the CLI",
        acceptanceCriteria: [],
        clarificationAnswers: [],
        confirmedAssumptions: [],
      },
      promptUnderstanding: {
        schemaVersion: 1 as const,
        promptId: "prompt-understanding-1",
        outcome: "repository_action" as const,
        readiness: "clarification_required" as const,
        reply: "Which validation command should define completion?",
        refinedBrief: null,
        questions: [{
          id: "validation-command",
          prompt: "Which validation command should define completion?",
          rationale: "It changes the acceptance gate.",
          kind: "validation" as const,
          options: [{
            id: "focused-test",
            label: "Focused test",
            description: "Run the smallest relevant test.",
            recommended: true,
          }, {
            id: "full-suite",
            label: "Full suite",
            description: "Run all CLI tests.",
            recommended: false,
          }],
        }],
        assumptions: [],
      },
    }));

    const exitCode = await runCliApplication(
      ["run", "--jsonl", "--approve-once", "update", "the", "CLI"],
      {
        cwd: "/work/orynt",
        isTTY: false,
        write: (value) => output.push(value),
        ask: vi.fn(),
        clear: vi.fn(),
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
        turn,
        run,
      },
    );

    expect(exitCode).toBe(2);
    expect(turn).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(output.at(-1) ?? "{}")).toMatchObject({
      schemaVersion: 1,
      kind: "error",
      classification: "planning",
      code: "PROMPT_CLARIFICATION_REQUIRED",
      promptUnderstanding: expect.objectContaining({
        readiness: "clarification_required",
      }),
    });
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

  it("preserves finalized run evidence when a headless repository run fails", async () => {
    const output: string[] = [];
    const exitCode = await runCliApplication(
      ["run", "--jsonl", "--approve-once", "audit"],
      {
        cwd: "/work/orynt",
        isTTY: false,
        write: (value) => output.push(value),
        ask: vi.fn(),
        clear: vi.fn(),
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
        turn: headlessTaskPlanner,
        run: async () => {
          throw Object.assign(new Error("Managed verifier failed."), {
            runId: "run-failed-1",
            artifactRoot: "/artifacts/run-failed-1",
            artifactManifestPath:
              "/artifacts/run-failed-1/artifact-manifest.json",
            eventLogPath: "/artifacts/run-failed-1/run-events.json",
            outcome: {
              schemaVersion: 1,
              status: "fail",
              stage: "verification",
              classification: "verification",
              code: "validation_failed",
              retryable: false,
              message: "Managed verifier failed.",
              verifierFailureClass: "test_failure",
            },
          });
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(output.at(-1) ?? "{}")).toMatchObject({
      schemaVersion: 1,
      kind: "result",
      runId: "run-failed-1",
      status: "fail",
      classification: "verification",
      failureClass: "test_failure",
      artifactManifestPath:
        "/artifacts/run-failed-1/artifact-manifest.json",
      eventLogPath: "/artifacts/run-failed-1/run-events.json",
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
          modelTierConfiguration: createSingleModelTierConfiguration(
            "gpt-tier-saved",
            "high",
          ),
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
    await runCliApplication(
      [
        "run",
        "--jsonl",
        "--approve-once",
        "--profile",
        "quality",
        "inspect",
      ],
      dependencies,
    );

    expect(requests).toEqual([
      expect.objectContaining({
        repositoryPath: "/work/saved",
        modelId: "gpt-tier-saved",
        thinkingEffort: "high",
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
      expect.objectContaining({
        repositoryPath: "/work/saved",
        modelId: "gpt-5.6-terra",
        thinkingEffort: "high",
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
    expect(savedOutput.join("\n")).toContain("› Custom model setup");

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
    expect(resumedOutput.join("\n")).toContain("› Custom model setup");
  });

  it("keeps terminal width live through the app boundary", async () => {
    const output: string[] = [];
    const answers = ["hello", "/exit"];
    let answerIndex = 0;
    let viewportWidth = 60;

    await runCliApplication([], {
      cwd: "/work/current",
      isTTY: true,
      color: false,
      get width() {
        return viewportWidth;
      },
      write: (value) => output.push(value),
      ask: async () => answers[answerIndex++] ?? "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: vi.fn(async (request) => {
        viewportWidth = 32;
        request.onActivity?.({
          kind: "message",
          itemId: "message-1",
          text: "Done.",
          status: "completed",
        });
        return {
          disposition: "answer" as const,
          reply: "Done.",
          conversationSummary: "Done.",
        };
      }),
      run: vi.fn(),
      hasAcknowledgedStartupBoundary: async () => true,
    });

    const duration = output.find((value) => value.includes("Crafted in"));
    expect(duration).toMatch(
      /^\n *─{1,7} ✦ Crafted in (?:<1s|1s) ─{1,7}$/u,
    );
    expect(duration?.slice(1).length).toBeLessThanOrEqual(31);
  });

  it("routes turn duration variants through the responsive centered writer", async () => {
    const output: string[] = [];
    const centered: string[][] = [];
    const answers = ["hello", "/exit"];
    let answerIndex = 0;

    await runCliApplication([], {
      cwd: "/work/current",
      isTTY: true,
      color: false,
      width: 60,
      write: (value) => output.push(value),
      writeCentered: (variants) => centered.push([...variants]),
      ask: async () => answers[answerIndex++] ?? "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      turn: vi.fn(async (request) => {
        request.onActivity?.({
          kind: "message",
          itemId: "message-1",
          text: "Done.",
          status: "completed",
        });
        return {
          disposition: "answer" as const,
          reply: "Done.",
          conversationSummary: "Done.",
        };
      }),
      run: vi.fn(),
      hasAcknowledgedStartupBoundary: async () => true,
    });

    expect(centered).toHaveLength(1);
    expect(centered[0]?.[0]).toMatch(
      /^\n─────── ✦ Crafted in (?:<1s|1s) ───────$/u,
    );
    expect(centered[0]?.at(-1)).toMatch(/^\n✦ (?:<1s|1s)$/u);
    expect(output.some((value) => value.includes("Crafted in"))).toBe(false);
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
    expect(reopenedOutput.join("\n")).toContain("› Custom model setup");
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
    expect(firstOutput.join("\n")).toContain("› Custom model setup");
    expect(firstOutput.join("\n")).not.toContain("do not resume");
    expect(secondOutput.join("\n")).toContain("/work/latest");
    expect(secondOutput.join("\n")).toContain("› Custom model setup");
    expect(secondOutput.join("\n")).not.toContain("do not resume");
  });

  it("does not bootstrap working config from a session in Trash", async () => {
    const output: string[] = [];
    const persistWorkingConfig = vi.fn(async () => undefined);
    const trashedLatest = {
      schemaVersion: 1 as const,
      sessionId: "session-trashed-latest",
      repositoryPath: "/work/trashed",
      modelId: "gpt-trashed",
      thinkingEffort: "medium" as const,
      mode: "plan" as const,
      acceptanceCriteria: [],
      trashedAt: "2026-08-04T00:00:00.000Z",
      createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
    };

    await runCliApplication([], {
      cwd: "/work/current",
      isTTY: true,
      color: false,
      write: (value) => output.push(value),
      ask: async () => "/exit",
      clear: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      run: vi.fn(),
      loadPreferences: async () => ({ schemaVersion: 2 }),
      loadSession: async (sessionId) =>
        sessionId === "latest" ? trashedLatest : undefined,
      persistWorkingConfig,
      hasAcknowledgedStartupBoundary: async () => true,
    });

    expect(persistWorkingConfig).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryPath: "/work/current" }),
    );
    expect(persistWorkingConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({ repositoryPath: "/work/trashed" }),
    );
    expect(output.join("\n")).toContain("/work/current");
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
      diagnose: async () => doctorReport(),
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("Orynt doctor");
    expect(output.join("\n")).toContain("Repository");
    expect(run).not.toHaveBeenCalled();
  });

  it("renders headless provider usage without opening a model session", async () => {
    const output: string[] = [];
    const readProviderUsage = vi.fn(async () => usageSnapshot());
    const probeProvider = vi.fn();
    const run = vi.fn();

    const exitCode = await runCliApplication(["usage"], {
      cwd: "/work/orynt",
      isTTY: true,
      color: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider,
      run,
      readProviderUsage,
    });

    expect(exitCode).toBe(0);
    expect(readProviderUsage).toHaveBeenCalledWith("quota");
    expect(output.join("\n")).toContain("Codex usage · ready");
    expect(output.join("\n")).toContain("60% left");
    expect(probeProvider).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("emits complete provider usage JSON and reports degraded status", async () => {
    const output: string[] = [];
    const readProviderUsage = vi.fn(async () => usageSnapshot({
      status: "degraded",
      analytics: {
        lifetimeTokens: 1_234,
        dailyUsage: [{ startDate: "2026-08-03", tokens: 100 }],
      },
      issues: [{
        code: "CODEX_ANALYTICS_UNAVAILABLE",
        message: "Partial provider data.",
        severity: "warning",
      }],
    }));

    const exitCode = await runCliApplication(["usage", "--json"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: vi.fn(),
      run: vi.fn(),
      readProviderUsage,
    });

    expect(exitCode).toBe(1);
    expect(readProviderUsage).toHaveBeenCalledWith("full");
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      schemaVersion: 1,
      kind: "orynt_provider_usage",
      status: "degraded",
      analytics: {
        lifetimeTokens: 1_234,
        dailyUsage: [{ startDate: "2026-08-03", tokens: 100 }],
      },
    });
  });

  it("runs live doctor probes only after explicit confirmation", async () => {
    const output: string[] = [];
    const diagnose = vi.fn(async () => doctorReport({
      checks: [{
        id: "live.tier.heavy",
        group: "live",
        label: "Heavy tier",
        status: "pass",
        required: true,
        summary: "ready · gpt-5.6-sol · high",
        evidence: { sentinelMatched: true },
        cause: null,
        remediation: null,
        durationMs: 20,
      }],
    }));
    const exitCode = await runCliApplication(
      ["doctor", "--live", "--confirm-live"],
      {
        cwd: "/work/orynt",
        isTTY: true,
        write: (value) => output.push(value),
        ask: vi.fn(),
        clear: vi.fn(),
        probeProvider: vi.fn(),
        run: vi.fn(),
        diagnose,
      },
    );

    expect(exitCode).toBe(0);
    expect(diagnose).toHaveBeenCalledWith(
      expect.objectContaining({ live: true }),
    );
    expect(output.join("\n")).toContain("Heavy tier");
  });

  it("emits structured doctor JSON and fails required health checks", async () => {
    const output: string[] = [];
    const failed = doctorReport({
      status: "unhealthy",
      summary: {
        passed: 0,
        warnings: 0,
        failed: 1,
        skipped: 0,
        durationMs: 10,
      },
      checks: [{
        id: "provider.authentication",
        group: "provider",
        label: "Authentication",
        status: "fail",
        required: true,
        summary: "sign-in required",
        evidence: { authenticated: false },
        cause: "No authenticated Codex session.",
        remediation: {
          description: "Authenticate Codex through Orynt setup.",
          command: "orynt setup",
        },
        durationMs: 1,
      }],
    });
    const exitCode = await runCliApplication(["doctor", "--json"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => output.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: vi.fn(),
      run: vi.fn(),
      diagnose: async () => failed,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      schemaVersion: 1,
      kind: "orynt_doctor_report",
      status: "unhealthy",
      checks: [
        expect.objectContaining({
          id: "provider.authentication",
          status: "fail",
        }),
      ],
    });
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

  it("rejects an explicitly requested session in Trash", async () => {
    const output: string[] = [];
    const ask = vi.fn();
    const exitCode = await runCliApplication(
      ["--resume", "session-trashed"],
      {
        cwd: "/work/orynt",
        isTTY: false,
        write: (value) => output.push(value),
        ask,
        clear: vi.fn(),
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
        run: vi.fn(),
        loadSession: async () => ({
          schemaVersion: 1,
          sessionId: "session-trashed",
          repositoryPath: "/work/orynt",
          modelId: "gpt-5.5",
          thinkingEffort: "high",
          mode: "plan",
          acceptanceCriteria: [],
          trashedAt: "2026-08-04T00:00:00.000Z",
          createdAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-08-04T00:00:00.000Z",
        }),
      },
    );

    expect(exitCode).toBe(2);
    expect(ask).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain(
      "Session is in Trash: session-trashed",
    );
    expect(output.join("\n")).toContain(
      "orynt sessions restore session-trashed",
    );
  });

  it("emits stable read-only setup status in human and JSON modes", async () => {
    const status = {
      ready: false,
      detail: "No authenticated Codex CLI session was detected.",
      code: "CODEX_AUTH_REQUIRED" as const,
      nextAction: "login" as const,
      remediationCommand: "orynt setup",
    };
    const human: string[] = [];
    const json: string[] = [];
    await expect(runCliApplication(["setup", "--check"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => human.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => status,
      run: vi.fn(),
    })).resolves.toBe(1);
    await expect(runCliApplication(["setup", "--check", "--json"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: (value) => json.push(value),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: async () => status,
      run: vi.fn(),
    })).resolves.toBe(1);
    expect(human.join("\n")).toContain("CODEX_AUTH_REQUIRED");
    expect(JSON.parse(json[0] ?? "{}")).toMatchObject({
      schemaVersion: 1,
      kind: "codex_setup_status",
      code: "CODEX_AUTH_REQUIRED",
      nextAction: "login",
    });
  });

  it("runs explicit setup only in a TTY", async () => {
    const ready = {
      ready: true,
      detail: "Logged in using ChatGPT · app-server ready",
      code: "CODEX_READY" as const,
      nextAction: "none" as const,
    };
    const setupProvider = vi.fn(async () => ({
      outcome: "ready" as const,
      status: ready,
    }));
    await expect(runCliApplication(["setup"], {
      cwd: "/work/orynt",
      isTTY: true,
      write: vi.fn(),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: vi.fn(),
      setupProvider,
      run: vi.fn(),
    })).resolves.toBe(0);
    expect(setupProvider).toHaveBeenCalledOnce();

    await expect(runCliApplication(["setup"], {
      cwd: "/work/orynt",
      isTTY: false,
      write: vi.fn(),
      ask: vi.fn(),
      clear: vi.fn(),
      probeProvider: vi.fn(),
      setupProvider,
      run: vi.fn(),
    })).resolves.toBe(2);
    expect(setupProvider).toHaveBeenCalledOnce();
  });

  it("repairs Codex before an interactive prompt and preserves that prompt", async () => {
    const unavailable = {
      ready: false,
      detail: "Not logged in",
      code: "CODEX_AUTH_REQUIRED" as const,
      nextAction: "login" as const,
    };
    const ready = {
      ready: true,
      detail: "Logged in using ChatGPT · app-server ready",
      code: "CODEX_READY" as const,
      nextAction: "none" as const,
    };
    const setupProvider = vi.fn(async () => ({
      outcome: "ready" as const,
      status: ready,
    }));
    const turn = vi.fn(async () => ({
      disposition: "respond" as const,
      reply: "Repository inspected.",
      conversationSummary: "Inspection complete.",
    }));
    const probeProvider = vi.fn()
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValue(ready);
    await expect(runCliApplication(["inspect", "the", "repository"], {
      cwd: "/work/orynt",
      isTTY: true,
      color: false,
      write: vi.fn(),
      ask: async () => "/exit",
      clear: vi.fn(),
      probeProvider,
      setupProvider,
      turn,
      run: vi.fn(),
    })).resolves.toBe(0);
    expect(setupProvider).toHaveBeenCalledWith(unavailable);
    expect(turn).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "inspect the repository" }),
    );
  });

  it("never prompts headless work and emits the readiness code", async () => {
    const output: string[] = [];
    const setupProvider = vi.fn();
    const exitCode = await runCliApplication(
      ["run", "--jsonl", "--approve-once", "audit"],
      {
        cwd: "/work/orynt",
        isTTY: true,
        write: (value) => output.push(value),
        ask: vi.fn(),
        clear: vi.fn(),
        probeProvider: async () => ({
          ready: false,
          detail: "Codex executable missing",
          code: "CODEX_CLI_MISSING",
          nextAction: "install",
        }),
        setupProvider,
        run: vi.fn(),
      },
    );
    expect(exitCode).toBe(1);
    expect(setupProvider).not.toHaveBeenCalled();
    expect(JSON.parse(output[0] ?? "{}")).toMatchObject({
      kind: "error",
      classification: "environment",
      code: "CODEX_CLI_MISSING",
    });
  });
});
