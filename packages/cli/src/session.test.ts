import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "bun:test";
import {
  createDefaultModelTierConfiguration,
  createOrchestrationPreset,
  hashPromptUnderstandingBasis,
  REPOSITORY_DIFF_ARTIFACT_MAX_BYTES,
  type CapabilityRuntimeSettingsV1,
  type ContextLifecycleSnapshotV1,
} from "@codepawl/shared";
import type { ProviderUsageSnapshotV1 } from "@codepawl/model-runtime";

import {
  COMPOSER_PROMPT,
  INTERRUPTED_INPUT,
  NAVIGATE_BACK_INPUT,
  type ComposerChoice,
  type ComposerStatusContext,
  type LiveComposerContext,
  type LiveComposerSubmission,
} from "./composer";
import { terminalTextWidth } from "./terminal-presentation";
import {
  ActiveTurnTimer,
  approvalText,
  formatTurnDuration,
  promptUnderstandingQuestionsText,
  runInteractiveSession,
  turnDurationLine,
  turnDurationLineVariants,
  type CliRunRequest,
  type CliRunResult,
} from "./session";
import type {
  CliAgentTurnResult,
  ProposedRepositoryAction,
} from "./agent";
import type {
  CliRunSnapshot,
  CliSessionCatalogEntry,
  CliSessionSnapshot,
} from "./state";
import type { CliModelOption } from "./ui";
import {
  DEFAULT_CLI_SHORTCUTS,
  type CliShortcutPreferences,
} from "./shortcuts";
import {
  DEFAULT_CLI_STATUSLINE,
  type CliStatuslinePreferences,
} from "./statusline";
import type { DoctorReportV1 } from "./doctor";

async function waitUntil(check: () => unknown): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      check();
      return;
    } catch {
      await Bun.sleep(10);
    }
  }
  check();
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, "");
}

function doctorReport(summary = "ready"): DoctorReportV1 {
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
      durationMs: 5,
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
      id: "runtime.test",
      group: "runtime",
      label: "Diagnostic",
      status: "pass",
      required: true,
      summary,
      evidence: {},
      cause: null,
      remediation: null,
      durationMs: 1,
    }],
  };
}

function usageSnapshot(): ProviderUsageSnapshotV1 {
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
    analytics: {
      lifetimeTokens: 1_234,
    },
    issues: [],
  };
}

function lifecycleSnapshot(usedPercent = 62): ContextLifecycleSnapshotV1 {
  return {
    schemaVersion: 1,
    state: "healthy",
    capacity: {
      schemaVersion: 1,
      modelId: "gpt-5.6-terra",
      source: "provider_event",
      contextWindowTokens: 200_000,
      effectiveWindowTokens: 200_000,
    },
    usage: {
      schemaVersion: 1,
      precision: "provider",
      usedTokens: 124_000,
      usedPercent,
      remainingTokens: 76_000,
      observedAt: "2026-08-05T00:00:00.000Z",
    },
    thresholds: {
      warnPercent: 75,
      compactPercent: 85,
      hardPercent: 95,
    },
    providerThreadGeneration: 0,
    compactionCount: 0,
    recoveryCount: 0,
    overflowRetryCount: 0,
  };
}

function scriptedAsk(answers: string[]) {
  let index = 0;
  return vi.fn(async () => answers[index++] ?? "/exit");
}

function agentAnswer(reply = "Here is the repository answer."): CliAgentTurnResult {
  return {
    disposition: "answer",
    reply,
    conversationSummary: "Answered the latest repository question.",
  };
}

function agentAction(
  overrides: Partial<ProposedRepositoryAction> = {},
): CliAgentTurnResult {
  const operations = overrides.operations ?? ["write"];
  const estimatedPaths =
    overrides.estimatedPaths ?? ["packages/cli/src/session.ts"];
  return {
    disposition: "action",
    reply: "I can make that repository change.",
    conversationSummary: "User requested a bounded repository change.",
    action: {
      instruction: "Update the requested CLI behavior",
      rationale: "The user asked for a small repository-local change.",
      operations,
      estimatedPaths,
      estimatedChangedFiles:
        overrides.estimatedChangedFiles ?? estimatedPaths.length,
      helperTasks: [],
      taskPlan: {
        summary: "Update the requested CLI behavior.",
        requirements: [
          {
            id: "update-cli",
            text: "Update the requested CLI behavior.",
            source: "user_prompt",
            kind: "outcome",
            required: true,
          },
        ],
        tasks: [
          {
            id: "update-cli-behavior",
            title: "Update CLI behavior",
            instruction: "Update the requested CLI behavior.",
            kind: "change",
            dependencies: [],
            requirementIds: ["update-cli"],
            authority: "single_writer",
            operations: operations.filter(
              (operation): operation is "write" | "delete" | "rename" | "dependency" | "migration" =>
                ["write", "delete", "rename", "dependency", "migration"].includes(operation),
            ),
            expectedPaths: estimatedPaths,
            doneWhen: ["The requested CLI behavior is updated."],
            evidence: [
              {
                id: "cli-diff",
                requirementIds: ["update-cli"],
                kind: "diff",
                description: "Inspect the CLI behavior diff.",
                path: estimatedPaths[0],
              },
            ],
          },
        ],
        allowedOperations: [
          "read",
          ...operations.filter(
            (operation): operation is "write" | "delete" | "rename" | "dependency" | "migration" =>
              ["write", "delete", "rename", "dependency", "migration"].includes(operation),
          ),
        ],
      },
      ...overrides,
    },
  };
}

function agentClarification(): CliAgentTurnResult {
  const basis = {
    rawPrompt: "review this repository",
    acceptanceCriteria: [],
    clarificationAnswers: [],
    confirmedAssumptions: [],
  };
  return {
    disposition: "clarify",
    reply: "Choose the primary review focus.",
    conversationSummary: "The review focus remains unresolved.",
    promptUnderstandingBasis: basis,
    promptUnderstanding: {
      schemaVersion: 1,
      promptId: hashPromptUnderstandingBasis(basis),
      outcome: "repository_action",
      readiness: "clarification_required",
      reply: "Choose the primary review focus.",
      refinedBrief: null,
      questions: [{
        id: "focus",
        prompt: "Which review focus should define completion?",
        rationale: "The choice changes the review scope.",
        kind: "constraint",
        options: [{
          id: "correctness",
          label: "Correctness",
          description: "Review runtime behavior and tests.",
          recommended: true,
        }, {
          id: "release",
          label: "Release readiness",
          description: "Review packaging and operational gates.",
          recommended: false,
        }],
      }],
      assumptions: [],
    },
  };
}

describe("interactive Orynt session", () => {
  it("uses the configured coordinator tier binding for idle statusline truth", async () => {
    let statusContext: ComposerStatusContext | undefined;
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.6-sol",
        thinkingEffort: "high",
        orchestrationProfile: {
          ...createOrchestrationPreset("balanced"),
          preset: "auto",
        },
        modelTierConfiguration: createDefaultModelTierConfiguration(),
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([]),
        compose: async (_prompt, _initialValue, context) => {
          statusContext = context;
          return "/exit";
        },
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(statusContext).toEqual({
      mode: "next",
      preset: "auto",
      modelId: "gpt-5.6-terra",
      thinkingEffort: "medium",
    });
  });

  it("bootstraps idle context capacity before the first TTY composer", async () => {
    let statusContext: ComposerStatusContext | undefined;
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.6-terra",
        thinkingEffort: "medium",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([]),
        compose: async (_prompt, _initialValue, context) => {
          statusContext = context;
          return "/exit";
        },
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
        isTTY: true,
      },
      listModels: async () => [{
        id: "gpt-5.6-terra",
        label: "GPT-5.6-Terra",
        supportedThinkingEfforts: ["medium"],
        contextWindowTokens: 272_000,
        effectiveContextWindowTokens: 258_400,
        providerAutoCompactAtTokens: 244_800,
      }],
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(statusContext).toMatchObject({
      mode: "next",
      modelId: "gpt-5.6-terra",
      context: {
        state: "healthy",
        capacity: {
          modelId: "gpt-5.6-terra",
          contextWindowTokens: 272_000,
          effectiveWindowTokens: 258_400,
          source: "model_catalog",
        },
        usage: {
          usedTokens: 0,
          usedPercent: 0,
          remainingTokens: 258_400,
        },
      },
    });
  });

  it("updates live statusline with the resolved active coordinator model", async () => {
    const contexts: LiveComposerContext[] = [];
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.6-sol",
        thinkingEffort: "high",
        orchestrationProfile: {
          ...createOrchestrationPreset("balanced"),
          preset: "auto",
        },
        modelTierConfiguration: createDefaultModelTierConfiguration(),
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["hello", "/exit"]),
        beginLiveInput: (context) => {
          contexts.push(structuredClone(context));
          return {
            setContext: (next) => contexts.push(structuredClone(next)),
            pauseForModal: () => () => undefined,
            close: () => "",
          };
        },
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
        isTTY: true,
      },
      listModels: async () => [
        {
          id: "gpt-5.6-luna",
          label: "Luna",
          supportedThinkingEfforts: ["medium"],
        },
        {
          id: "gpt-5.6-terra",
          label: "Terra",
          supportedThinkingEfforts: ["medium"],
        },
        {
          id: "gpt-5.6-sol",
          label: "Sol",
          supportedThinkingEfforts: ["high"],
        },
      ],
      turn: async (request) => {
        const context = lifecycleSnapshot();
        request.onContext?.(context);
        return { ...agentAnswer(), context };
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(contexts).toContainEqual(
      expect.objectContaining({
        phase: "coordinating",
        status: {
          mode: "active",
          preset: "auto",
          role: "coordinator",
          modelId: "gpt-5.6-terra",
          thinkingEffort: "medium",
        },
      }),
    );
    expect(contexts).toContainEqual(
      expect.objectContaining({
        phase: "coordinating",
        status: expect.objectContaining({
          mode: "active",
          context: lifecycleSnapshot(),
        }),
      }),
    );
  });
  it("renders grouped prompt questions with recommendations while preserving free-form answers", () => {
    const text = promptUnderstandingQuestionsText({
      schemaVersion: 1,
      promptId: "prompt-1",
      outcome: "repository_action",
      readiness: "clarification_required",
      reply: "Need one validation decision.",
      refinedBrief: null,
      questions: [{
          id: "validation",
          prompt: "Which validation should define completion?",
          rationale: "It changes the task's acceptance gate.",
          kind: "validation",
          options: [{
            id: "focused",
            label: "Focused test",
            description: "Run the smallest relevant test.",
            recommended: true,
          }, {
            id: "full",
            label: "Full suite",
            description: "Run all CLI tests.",
            recommended: false,
          }],
        }, {
          id: "scope",
          prompt: "Which package should change?",
          rationale: "The package boundary is material.",
          kind: "constraint",
          options: [],
        }],
      assumptions: [],
    }, { round: 1 });

    expect(text).toContain("Validation");
    expect(text).toContain("Focused test · recommended");
    expect(text).toContain("Run the smallest relevant test.");
    expect(text).toContain("any free-form answer");
    expect(text).not.toContain("Which package should change?");
  });

  it("persists option-bearing clarification drafts without terminating the session", async () => {
    const output: string[] = [];
    const persisted: CliSessionSnapshot[] = [];

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["review this repository", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      persistSession: async (snapshot) => {
        persisted.push(structuredClone(snapshot));
      },
      turn: vi.fn(async () => agentClarification()),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(output.join("\n")).toContain(
      "Which review focus should define completion?",
    );
    expect(output.join("\n")).toContain("Correctness · recommended");
    expect(output.join("\n")).not.toContain("Invalid Orynt session snapshot");
    expect(
      persisted.at(-1)?.promptUnderstandingDraft?.understanding.questions[0]
        ?.options,
    ).toHaveLength(2);
  });

  it("keeps clarification chat alive across a session-save failure and reports recovery", async () => {
    const output: string[] = [];
    let persistCount = 0;
    const turn = vi
      .fn()
      .mockResolvedValueOnce(agentClarification())
      .mockResolvedValueOnce(agentAnswer("Review focus recorded."));

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "review this repository",
          "correctness",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      persistSession: vi.fn(async () => {
        persistCount += 1;
        if (persistCount === 2) throw new Error("state volume unavailable");
      }),
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    const rendered = output.join("\n");
    expect(rendered).toContain(
      "Session state was not saved: state volume unavailable",
    );
    expect(rendered).toContain(
      "This session is temporarily non-resumable.",
    );
    expect(rendered).toContain(
      "Which review focus should define completion?",
    );
    expect(rendered).toContain("Session persistence restored.");
    expect(turn).toHaveBeenCalledTimes(2);
  });

  it("formats branded turn duration lines and excludes paused time", () => {
    expect(formatTurnDuration(999)).toBe("<1s");
    expect(formatTurnDuration(38_900)).toBe("38s");
    expect(formatTurnDuration(14 * 60_000 + 38_000)).toBe("14m 38s");
    expect(formatTurnDuration(3_661_000)).toBe("1h 1m 1s");
    const crafted = stripAnsi(turnDurationLine("success", 878_000, {
      color: true,
      width: 60,
    }));
    expect(crafted.trim()).toBe(
      "─────── ✦ Crafted in 14m 38s ───────",
    );
    expect(crafted.length - crafted.trimStart().length).toBe(
      Math.floor((59 - crafted.trim().length) / 2),
    );
    expect(turnDurationLine("failed", 2_000, {
      color: false,
      width: 40,
    }).trim()).toBe("─────── ✕ Stopped after 2s ───────");
    expect(turnDurationLine("cancelled", 2_000, {
      color: false,
      width: 40,
    }).trim()).toBe("─────── ◇ Cancelled after 2s ───────");
    expect(turnDurationLine("cancelled", 3_661_000, {
      color: false,
      width: 18,
    }).length).toBeLessThanOrEqual(17);
    expect(
      turnDurationLineVariants("success", 43_000, { color: false }),
    ).toEqual([
      "─────── ✦ Crafted in 43s ───────",
      "────── ✦ Crafted in 43s ──────",
      "───── ✦ Crafted in 43s ─────",
      "──── ✦ Crafted in 43s ────",
      "─── ✦ Crafted in 43s ───",
      "── ✦ Crafted in 43s ──",
      "─ ✦ Crafted in 43s ─",
      "─────── ✦ 43s ───────",
      "────── ✦ 43s ──────",
      "───── ✦ 43s ─────",
      "──── ✦ 43s ────",
      "─── ✦ 43s ───",
      "── ✦ 43s ──",
      "─ ✦ 43s ─",
      "✦ 43s",
    ]);

    let now = 0;
    const timer = new ActiveTurnTimer(() => now);
    now = 5_000;
    timer.pause();
    now = 65_000;
    timer.resume();
    now = 70_000;
    expect(timer.finish()).toBe(10_000);
    now = 80_000;
    expect(timer.finish()).toBe(10_000);
  });

  it("streams coordinator replies without printing the final answer twice", async () => {
    const output: string[] = [];
    const streamUpdates: string[] = [];
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["hello", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        beginMessageStream: () => ({
          update: (text) => streamUpdates.push(text),
          finish: (text) => {
            if (text) streamUpdates.push(`final:${text}`);
          },
          abort: vi.fn(),
        }),
        color: false,
      },
      turn: vi.fn(async (request) => {
        request.onActivity?.({
          kind: "message",
          itemId: "message-1",
          text: "Hello",
          status: "updated",
        });
        request.onActivity?.({
          kind: "message",
          itemId: "message-1",
          text: "Hello from Orynt.",
          status: "completed",
        });
        return agentAnswer("Hello from Orynt.");
      }),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(streamUpdates).toEqual([
      "Hello",
      "Hello from Orynt.",
      "final:Hello from Orynt.",
    ]);
    expect(output.join("\n")).not.toContain("Agent\nHello from Orynt.");
  });

  it("safely restarts fresh coordination with an ordered live update", async () => {
    const output: string[] = [];
    let submitLive:
      | ((submission: LiveComposerSubmission) => void)
      | undefined;
    let controller: AbortController | undefined;
    let turnCalls = 0;
    const turn = vi.fn(async (request) => {
      turnCalls += 1;
      if (turnCalls <= 2) {
        const update =
          turnCalls === 1 ? "use bun instead" : "keep the output concise";
        queueMicrotask(() =>
          submitLive?.({
            kind: "message",
            value: update,
            delivery: "contextual",
          })
        );
        return await new Promise<CliAgentTurnResult>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("cancelled"), {
                  name: "AbortError",
                }),
              ),
            { once: true },
          );
        });
      }
      return agentAnswer("Updated safely.");
    });

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["update the CLI", "/exit"]),
        beginLiveInput: (_context, onSubmission) => {
          submitLive = onSubmission;
          return {
            setContext: vi.fn(),
            pauseForModal: () => () => undefined,
            close: () => "",
          };
        },
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      prepareRunSignal: () => {
        controller = new AbortController();
        return controller.signal;
      },
      cancelRunSignal: (signal) => {
        if (controller?.signal === signal) controller.abort();
      },
      releaseRunSignal: vi.fn(),
    });

    expect(turn).toHaveBeenCalledTimes(3);
    expect(turn.mock.calls[2]?.[0].prompt).toContain(
      '["update the CLI","use bun instead","keep the output concise"]',
    );
    expect(output.join("\n")).toContain(
      "Current request updated · restarting with 2 messages.",
    );
    expect(output.join("\n")).toContain(
      "Current request updated · restarting with 3 messages.",
    );
    expect(output.join("\n")).toContain("Updated safely.");
    expect(output.join("\n")).not.toContain("Agent turn cancelled.");
    expect(output.join("\n")).not.toContain("Agent turn failed:");
  });

  it("queues forced Next input and drains it as a separate FIFO turn", async () => {
    let submitLive:
      | ((submission: LiveComposerSubmission) => void)
      | undefined;
    let turnCalls = 0;
    const turn = vi.fn(async () => {
      turnCalls += 1;
      if (turnCalls === 1) {
        queueMicrotask(() =>
          submitLive?.({
            kind: "message",
            value: "then update docs",
            delivery: "next",
          })
        );
      }
      return agentAnswer(`answer-${turnCalls}`);
    });

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["inspect first", "/exit"]),
        beginLiveInput: (_context, onSubmission) => {
          submitLive = onSubmission;
          return {
            setContext: vi.fn(),
            pauseForModal: () => () => undefined,
            close: () => "",
          };
        },
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
        isTTY: true,
      },
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(turn.mock.calls.map(([request]) => request.prompt)).toEqual([
      "inspect first",
      "then update docs",
    ]);
  });

  it("recalls the newest pending draft and clears the remaining queue", async () => {
    const output: string[] = [];
    let managed = false;
    const turn = vi.fn(async () => agentAnswer("done"));

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["inspect first", "/exit"]),
        beginLiveInput: (_context, onSubmission) => ({
          setContext: (context) => {
            if (
              managed ||
              context.phase !== "coordinating"
            ) {
              return;
            }
            managed = true;
            onSubmission({
              kind: "message",
              value: "older pending",
              delivery: "next",
              draft: {
                value: "older pending",
                cursor: 13,
                blocks: [],
                images: [],
              },
            });
            onSubmission({
              kind: "message",
              value: "newest pending typo",
              delivery: "next",
              draft: {
                value: "newest pending typo",
                cursor: 7,
                blocks: [],
                images: [],
              },
            });
            const recalled = onSubmission({ kind: "edit_pending" });
            expect(recalled).toEqual({
              draft: {
                value: "newest pending typo",
                cursor: 7,
                blocks: [],
                images: [],
              },
            });
            onSubmission({ kind: "clear_pending" });
          },
          pauseForModal: () => () => undefined,
          close: () => "",
        }),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(turn).toHaveBeenCalledTimes(1);
    expect(output.join("\n")).toContain(
      "Pending edit · recalled newest message · 1 remaining.",
    );
    expect(output.join("\n")).toContain(
      "Pending cleared · removed 1 message.",
    );
  });

  it("stops the active turn, pauses pending messages, and resumes them in FIFO order", async () => {
    const output: string[] = [];
    let liveInputCount = 0;
    let controller: AbortController | undefined;
    const turn = vi.fn(async (request) => {
      if (turn.mock.calls.length === 1) {
        return await new Promise<CliAgentTurnResult>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("cancelled"), {
                  name: "AbortError",
                }),
              ),
            { once: true },
          );
        });
      }
      return agentAnswer("resumed-answer");
    });

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "inspect first",
          "/pending",
          "/pending resume",
          "/exit",
        ]),
        beginLiveInput: (_context, onSubmission) => {
          liveInputCount += 1;
          let submitted = false;
          return {
            setContext: (context) => {
              if (
                liveInputCount === 1 &&
                context.phase === "coordinating" &&
                !submitted
              ) {
                submitted = true;
                queueMicrotask(() => {
                  onSubmission({
                    kind: "message",
                    value: "run this after",
                    delivery: "next",
                  });
                  onSubmission({ kind: "stop", draft: "unfinished draft" });
                });
              }
            },
            pauseForModal: () => () => undefined,
            close: () => "",
          };
        },
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      prepareRunSignal: () => {
        controller = new AbortController();
        return controller.signal;
      },
      cancelRunSignal: (signal) => {
        if (controller?.signal === signal) controller.abort();
      },
      releaseRunSignal: vi.fn(),
    });

    expect(turn.mock.calls.map(([request]) => request.prompt)).toEqual([
      "inspect first",
      "run this after",
    ]);
    expect(output.join("\n")).toContain("Pending · 1 message · paused");
    expect(output.join("\n")).toContain("resumed-answer");
  });

  it("formats fallback agent replies inline with one blank row and a distinct prefix", async () => {
    const output: string[] = [];
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["hello", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: true,
      },
      turn: vi.fn(async (request) => {
        request.onActivity?.({
          kind: "message",
          itemId: "message-1",
          text: "Hello from Orynt.",
          status: "completed",
        });
        return agentAnswer("Hello from Orynt.");
      }),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(output).toContain(
      "\n\u001b[38;2;198;196;191mAgent ›\u001b[0m Hello from Orynt.",
    );
    expect(output.join("\n").match(/Hello from Orynt\./gu)).toHaveLength(1);
  });

  it("prints one Crafted separator after the final streamed response", async () => {
    let now = 0;
    let viewportWidth = 60;
    const events: string[] = [];
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["hello", "/exit"]),
        clear: vi.fn(),
        write: (value) => events.push(value),
        beginMessageStream: () => ({
          update: vi.fn(),
          finish: () => events.push("STREAM_FINISHED"),
          abort: vi.fn(),
        }),
        color: false,
        get width() {
          return viewportWidth;
        },
      },
      turn: vi.fn(async (request) => {
        now = 90_500;
        viewportWidth = 32;
        request.onActivity?.({
          kind: "message",
          itemId: "message-1",
          text: "Done.",
          status: "completed",
        });
        return agentAnswer("Done.");
      }),
      now: () => now,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    const streamFinished = events.indexOf("STREAM_FINISHED");
    const duration = events.findIndex((value) =>
      value.includes("✦ Crafted in 1m 30s"),
    );
    expect(streamFinished).toBeGreaterThanOrEqual(0);
    expect(duration).toBeGreaterThan(streamFinished);
    expect(
      events.filter((value) => value.includes("Crafted in")),
    ).toHaveLength(1);
    expect(events[duration]).toMatch(
      /^\n───── ✦ Crafted in 1m 30s ─────$/u,
    );
    expect(events[duration]?.slice(1)).toHaveLength(31);
  });

  it("keeps successful readiness rows only at full activity detail", async () => {
    const runSession = async (activityDetails: "important" | "full") => {
      const output: string[] = [];
      await runInteractiveSession({
        state: {
          repositoryPath: "/work/orynt",
          modelId: "gpt-5.5",
          thinkingEffort: "high",
          providerReady: true,
          providerDetail: "Authenticated",
          activityDetails,
        },
        terminal: {
          ask: scriptedAsk(["hello", "/exit"]),
          clear: vi.fn(),
          write: (value) => output.push(value),
          beginActivity: () => ({
            update: vi.fn(),
            settle: (label) => {
              if (label) output.push(`◇ ${label}`);
            },
            fail: vi.fn(),
            stop: vi.fn(),
          }),
          color: false,
        },
        turn: vi.fn(async (request) => {
          request.onActivity?.({
            kind: "tool",
            itemId: "tool-1",
            toolKind: "command",
            label: "Inspect repository",
            status: "requested",
          });
          request.onActivity?.({
            kind: "tool",
            itemId: "tool-1",
            toolKind: "command",
            label: "Inspect repository",
            status: "completed",
          });
          return agentAnswer();
        }),
        run: vi.fn(),
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      });
      return output.join("\n");
    };

    const normal = await runSession("important");
    expect(normal).not.toContain("Provider ready");
    expect(normal).not.toContain("Orchestration profile ready");
    expect(normal).not.toContain("Tool shell Inspect repository");
    const full = await runSession("full");
    expect(full).toContain("Provider ready");
    expect(full).toContain("Orchestration profile ready");
    expect(full).toContain("Tool shell Inspect repository");
    expect(full.match(/Tool shell Inspect repository/gu)).toHaveLength(1);
    expect(full).toContain("Activity  1 tool call · 0 skills attached");
  });

  it("persists Agent Skill auto-selection and routes only trusted eligible skills", async () => {
    const output: string[] = [];
    const persistSkillRouting = vi.fn(async () => undefined);
    const routeSkills = vi.fn(async (request) => {
      expect(request.candidates.map((candidate) => candidate.id)).toEqual([
        "trusted-skill",
      ]);
      return {
        skillIds: ["trusted-skill"],
        reason: "Relevant trusted skill",
      };
    });
    const snapshotSkills = vi.fn(async (request) => ({
      schemaVersion: 1 as const,
      runId: request.runId,
      createdAt: "2026-08-06T00:00:00.000Z",
      skills: [],
      digest: `digest:${request.skillIds.join(",")}`,
    }));
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
        activityDetails: "full",
      },
      skillRouting: "auto_trusted",
      persistSkillRouting,
      listSkills: async () => [
        {
          id: "trusted-skill",
          name: "Trusted skill",
          description: "Explains repositories",
          scope: "builtin",
          trust: "trusted",
          eligible: true,
          health: "ready",
        },
        {
          id: "community-skill",
          name: "Community skill",
          description: "Must remain manual",
          scope: "project",
          trust: "community",
          eligible: true,
          health: "ready",
        },
      ],
      routeSkills,
      snapshotSkills,
      terminal: {
        ask: scriptedAsk([
          "/skills auto status",
          "explain the repository",
          "/skills auto off",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      turn: vi.fn(async (request) => {
        const resolved = await request.resolveSkillContext?.();
        for (const attachment of resolved?.attachments ?? []) {
          request.onActivity?.({
            kind: "skill",
            itemId: `skill:${attachment.skillId}`,
            skillId: attachment.skillId,
            source: attachment.source,
            status: "completed",
          });
        }
        return {
          ...agentAnswer(),
          skillContext: resolved?.context,
          skillAttachments: resolved?.attachments,
        };
      }),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(routeSkills).toHaveBeenCalledTimes(1);
    expect(snapshotSkills).toHaveBeenCalledWith(
      expect.objectContaining({ skillIds: ["trusted-skill"] }),
    );
    expect(persistSkillRouting).toHaveBeenCalledWith("manual");
    const transcript = output.join("\n");
    expect(transcript).toContain(
      "Agent Skill auto-selection · on · trusted skills only",
    );
    expect(transcript).toContain("Skill trusted-skill · auto");
    expect(transcript).toContain("Activity  0 tool calls · 1 skill attached");
  });

  it("persists activity details while honoring a launch override", async () => {
    const output: string[] = [];
    const persistActivityDetails = vi.fn(async () => undefined);
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
        activityDetails: "full",
      },
      activityDetailsOverride: "full",
      persistActivityDetails,
      terminal: {
        ask: scriptedAsk([
          "/settings",
          "/settings debug on",
          "/settings activity off",
          "/settings",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persistActivityDetails).toHaveBeenCalledWith("off");
    const transcript = output.join("\n");
    expect(transcript).toMatch(
      /└─ Activity\s+Full · Full launch override · audit artifacts always full/u,
    );
    expect(transcript).toContain(
      "Activity details saved as Off. The Full launch override remains active.",
    );
    expect(transcript).toContain(
      "Debug was replaced by /settings activity <off|important|full>.",
    );
  });

  it("persists and immediately applies appearance settings while reporting overrides", async () => {
    const output: string[] = [];
    const persistAppearance = vi.fn(async () => undefined);
    const applyAppearance = vi
      .fn()
      .mockReturnValueOnce({ color: false, motion: true, screenMode: "fullscreen" })
      .mockReturnValueOnce({ color: false, motion: false, screenMode: "fullscreen" })
      .mockReturnValueOnce({
        color: false,
        motion: false,
        richText: false,
        screenMode: "fullscreen",
      })
      .mockReturnValueOnce({
        color: false,
        motion: false,
        richText: false,
        colorOverride: "--no-color",
        screenMode: "fullscreen",
      });
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      appearancePreferences: { color: true, motion: true, richText: true },
      appearanceResolution: { color: true, motion: true, richText: true },
      persistAppearance,
      applyAppearance,
      terminal: {
        ask: scriptedAsk([
          "/settings appearance color off",
          "/settings appearance motion off",
          "/settings appearance rich-text off",
          "/settings appearance color on",
          "/settings show",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: true,
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persistAppearance.mock.calls).toEqual([
      [{ color: false }],
      [{ motion: false }],
      [{ richText: false }],
      [{ color: true }],
    ]);
    expect(applyAppearance.mock.calls).toEqual([
      [{ color: false, motion: true, richText: true, themeId: "quiet-studio", screenMode: "auto" }],
      [{ color: false, motion: false, richText: true, themeId: "quiet-studio", screenMode: "auto" }],
      [{ color: false, motion: false, richText: false, themeId: "quiet-studio", screenMode: "auto" }],
      [{ color: true, motion: false, richText: false, themeId: "quiet-studio", screenMode: "auto" }],
    ]);
    const transcript = output.join("\n");
    expect(transcript).toContain("Color disabled.");
    expect(transcript).toContain("Motion disabled.");
    expect(transcript).toContain("Rich text disabled.");
    expect(transcript).toContain(
      "Color saved on. --no-color keeps it off for this launch.",
    );
    expect(transcript).toMatch(
      /Appearance\s+Screen auto · effective fullscreen · Theme Quiet Studio · Color on ·[\s│]+effective off \(--no-color\) · Motion off · Rich text off/u,
    );
  });

  it("reflows command surfaces from the live terminal width", async () => {
    const writes: Array<{ width: number; value: string }> = [];
    let width = 100;
    const commands = [
      { width: 40, value: "/help" },
      { width: 52, value: "/settings show" },
      { width: 44, value: "/status" },
      { width: 36, value: "/context" },
      { width: 36, value: "/exit" },
    ];
    let commandIndex = 0;

    await runInteractiveSession({
      state: {
        repositoryPath:
          "/work/orynt/packages/a-very-long-responsive-command-surface",
        modelId: "gpt-5.6-sol-with-a-long-model-identifier",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated with a detailed provider status",
      },
      terminal: {
        ask: async () => {
          const command = commands[commandIndex++] ?? commands.at(-1)!;
          width = command.width;
          return command.value;
        },
        clear: vi.fn(),
        write: (value) => writes.push({ width, value }),
        color: false,
        get width() {
          return width;
        },
      },
      run: vi.fn(),
      probeProvider: async () => ({
        ready: true,
        detail: "Authenticated with a detailed provider status",
      }),
    });

    const commandOutputs = writes.filter(({ value }) =>
      ["Commands", "Settings", "Session", "Context"].includes(
        value.split("\n")[0]?.trim() ?? "",
      )
    );
    expect(
      commandOutputs.map(({ value }) => value.split("\n")[0]?.trim()),
    ).toEqual(["Commands", "Settings", "Session", "Context"]);
    for (const output of commandOutputs) {
      expect(
        output.value
          .split("\n")
          .every((line) => terminalTextWidth(line) <= output.width),
      ).toBe(true);
    }
  });

  it("persists screen mode for the next launch without switching buffers mid-session", async () => {
    const output: string[] = [];
    const persistAppearance = vi.fn(async () => undefined);
    const applyAppearance = vi.fn();
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      appearancePreferences: {
        color: true,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
        screenMode: "auto",
      },
      appearanceResolution: {
        color: true,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
        screenMode: "fullscreen",
        screenOverride: "auto",
      },
      persistAppearance,
      applyAppearance,
      terminal: {
        ask: scriptedAsk([
          "/settings appearance screen inline",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: true,
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persistAppearance).toHaveBeenCalledWith({ screenMode: "inline" });
    expect(applyAppearance).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain(
      "Screen mode saved as inline. It will apply on the next launch.",
    );
  });

  it("returns Back to the immediate settings parent across nested scenes", async () => {
    const prompts: string[] = [];
    const selections = [
      "appearance",
      "color",
      "__orynt_back__",
      "__orynt_back__",
      "activity",
      "__orynt_back__",
      "agent",
      "advanced",
      "implementer",
      "__orynt_back__",
      "__orynt_back__",
      "__orynt_back__",
      "__orynt_back__",
    ];
    const select = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return selections.shift() ?? INTERRUPTED_INPUT;
    });
    const listModels = vi.fn(async () => [
      {
        id: "gpt-5.6-terra",
        label: "GPT-5.6-Terra",
        description: "Balanced coding model.",
        supportedThinkingEfforts: ["medium" as const],
        defaultThinkingEffort: "medium" as const,
      },
    ]);
    const turn = vi.fn();

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/settings", "/exit"]),
        select,
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
        isTTY: true,
      },
      listModels,
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(prompts).toEqual([
      "Settings › ",
      "Appearance › ",
      "Color › ",
      "Appearance › ",
      "Settings › ",
      "Activity details › ",
      "Settings › ",
      "Agent › ",
      "Customize profile › ",
      "Model › ",
      "Customize profile › ",
      "Agent › ",
      "Settings › ",
    ]);
    expect(listModels).toHaveBeenCalledOnce();
    expect(turn).not.toHaveBeenCalled();
  });

  it("returns to the Appearance parent after saving an interactive setting", async () => {
    const prompts: string[] = [];
    const selections = [
      "appearance",
      "rich-text",
      "off",
      "__orynt_back__",
      "__orynt_back__",
    ];
    const select = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return selections.shift() ?? INTERRUPTED_INPUT;
    });
    const persistAppearance = vi.fn(async () => undefined);

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      appearancePreferences: {
        color: true,
        motion: true,
        richText: true,
      },
      terminal: {
        ask: scriptedAsk(["/settings", "/exit"]),
        select,
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
        isTTY: true,
      },
      persistAppearance,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(prompts).toEqual([
      "Settings › ",
      "Appearance › ",
      "Rich text › ",
      "Appearance › ",
      "Settings › ",
    ]);
    expect(persistAppearance).toHaveBeenCalledOnce();
    expect(persistAppearance).toHaveBeenCalledWith({ richText: false });
  });

  it("applies and persists an interactive terminal theme immediately", async () => {
    const prompts: string[] = [];
    const selections = [
      "appearance",
      "theme",
      "monochrome",
      "__orynt_back__",
      "__orynt_back__",
    ];
    const select = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return selections.shift() ?? INTERRUPTED_INPUT;
    });
    const persistAppearance = vi.fn(async () => undefined);
    const applyAppearance = vi.fn(() => ({
      color: true,
      motion: true,
      richText: true,
      themeId: "monochrome" as const,
    }));
    const terminal = {
      ask: scriptedAsk(["/settings", "/exit"]),
      select,
      clear: vi.fn(),
      write: vi.fn(),
      color: true,
      themeId: "quiet-studio" as const,
      isTTY: true,
    };

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      appearancePreferences: {
        color: true,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
      },
      appearanceResolution: {
        color: true,
        motion: true,
        richText: true,
        themeId: "quiet-studio",
      },
      terminal,
      persistAppearance,
      applyAppearance,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(prompts).toEqual([
      "Settings › ",
      "Appearance › ",
      "Theme › ",
      "Appearance › ",
      "Settings › ",
    ]);
    expect(persistAppearance).toHaveBeenCalledWith({
      themeId: "monochrome",
    });
    expect(applyAppearance).toHaveBeenCalledWith({
      color: true,
      motion: true,
      richText: true,
      themeId: "monochrome",
      screenMode: "auto",
    });
    expect(terminal.themeId).toBe("monochrome");
  });

  it("opens the inline orchestration editor and updates one role without starting a run", async () => {
    const output: string[] = [];
    const persisted: CliSessionSnapshot[] = [];
    const state = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high" as const,
      providerReady: true,
      providerDetail: "Authenticated",
    };
    const select = vi
      .fn()
      .mockResolvedValueOnce("agent")
      .mockResolvedValueOnce("advanced")
      .mockResolvedValueOnce("implementer")
      .mockResolvedValueOnce("gpt-5.6-terra")
      .mockResolvedValueOnce("medium")
      .mockResolvedValueOnce("apply");
    const models: CliModelOption[] = [
      {
        id: "gpt-5.6-sol",
        label: "GPT-5.6-Sol",
        description: "Frontier coding model.",
        supportedThinkingEfforts: ["low", "high"],
        defaultThinkingEffort: "low",
      },
      {
        id: "gpt-5.6-terra",
        label: "GPT-5.6-Terra",
        description: "Balanced coding model.",
        supportedThinkingEfforts: ["low", "medium"],
        defaultThinkingEffort: "medium",
      },
    ];
    const listModels = vi.fn(async () => models);
    const run = vi.fn();
    const persistWorkingConfig = vi.fn(async () => undefined);

    await runInteractiveSession({
      state,
      terminal: {
        ask: scriptedAsk(["/settings", "/exit"]),
        select,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      listModels,
      persistSession: async (session) => persisted.push(session),
      persistWorkingConfig,
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(listModels).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(
      "Model › ",
      expect.arrayContaining([
        expect.objectContaining({
          value: "gpt-5.6-terra",
          label: "GPT-5.6-Terra",
        }),
      ]),
      "gpt-5.5",
    );
    expect(persisted.at(-1)).toMatchObject({
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      orchestrationProfile: {
        preset: "custom",
        roles: {
          implementer: {
            modelId: "gpt-5.6-terra",
            thinkingEffort: "medium",
          },
        },
      },
    });
    expect(persistWorkingConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        orchestrationProfile: expect.objectContaining({ preset: "custom" }),
      }),
    );
    const transcript = output.join("\n");
    expect(transcript).not.toContain("Orchestration profile · custom");
    expect(select).toHaveBeenCalledWith(
      "Review implementer › ",
      [
        expect.objectContaining({
          value: "apply",
          label: "Apply implementer override",
          details: expect.arrayContaining([
            expect.stringContaining("preset becomes Custom"),
          ]),
        }),
      ],
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("reviews an Agent preset before saving and keeps interactive success out of scrollback", async () => {
    const output: string[] = [];
    const persisted: CliSessionSnapshot[] = [];
    const selections = [
      "agent",
      "quality",
      NAVIGATE_BACK_INPUT,
      "quality",
      "apply",
      NAVIGATE_BACK_INPUT,
      NAVIGATE_BACK_INPUT,
    ];
    const select = vi.fn(async () => selections.shift() ?? INTERRUPTED_INPUT);

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/settings", "/exit"]),
        select,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      persistSession: async (session) => persisted.push(session),
      persistWorkingConfig: vi.fn(async () => undefined),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(select).toHaveBeenCalledWith(
      "Review quality › ",
      [expect.objectContaining({ value: "apply", label: "Apply quality" })],
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.orchestrationProfile.preset).toBe("quality");
    expect(output.join("\n")).not.toContain("Orchestration profile · quality");
  });

  it("reviews bounded custom Agent controls and stays inside the customize menu", async () => {
    const prompts: string[] = [];
    const selections = [
      "agent",
      "advanced",
      "helpers",
      "1",
      "apply",
      NAVIGATE_BACK_INPUT,
      NAVIGATE_BACK_INPUT,
      NAVIGATE_BACK_INPUT,
    ];
    const select = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return selections.shift() ?? INTERRUPTED_INPUT;
    });
    const persisted: CliSessionSnapshot[] = [];

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/settings", "/exit"]),
        select,
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
        isTTY: true,
      },
      persistSession: async (session) => persisted.push(session),
      persistWorkingConfig: vi.fn(async () => undefined),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(prompts.filter((prompt) => prompt === "Customize profile › ")).toHaveLength(2);
    expect(prompts).toContain("Read-only helpers › ");
    expect(prompts).toContain("Review profile control › ");
    expect(persisted.at(-1)?.orchestrationProfile).toMatchObject({
      preset: "custom",
      maxReadOnlyHelpers: 1,
    });
  });

  it("customizes subagent concurrency and an exact memory budget without cluttering the parent menu", async () => {
    const prompts: string[] = [];
    const selections = [
      "intelligence",
      "subagents",
      "concurrency",
      "2",
      "apply",
      NAVIGATE_BACK_INPUT,
      "customize",
      "memory-budget",
      "custom",
      "apply",
      NAVIGATE_BACK_INPUT,
      NAVIGATE_BACK_INPUT,
      NAVIGATE_BACK_INPUT,
    ];
    const select = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return selections.shift() ?? INTERRUPTED_INPUT;
    });
    const persisted: CapabilityRuntimeSettingsV1[] = [];
    const output: string[] = [];

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/settings", "1337", "/exit"]),
        select,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      persistCapabilityRuntime: async (settings) => {
        persisted.push(structuredClone(settings));
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(prompts).toContain("Subagents › ");
    expect(prompts).toContain("Maximum concurrent subagents › ");
    expect(prompts).toContain("Customize intelligence › ");
    expect(prompts).toContain("Memory token budget › ");
    expect(persisted).toHaveLength(2);
    expect(persisted[0]).toMatchObject({
      subagents: { mode: "adaptive", maxConcurrency: 2, maxDepth: 1 },
    });
    expect(persisted[1]).toMatchObject({
      memoryTokenBudget: 1337,
      subagents: { maxConcurrency: 2 },
    });
    expect(output.join("\n")).not.toContain("Intelligence\n");
  });

  it("supports bounded direct Agent and Intelligence customization with shared persistence", async () => {
    const output: string[] = [];
    const persistedCapabilities: CapabilityRuntimeSettingsV1[] = [];
    const persistedProfiles: CliSessionSnapshot[] = [];

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "/settings agent helpers 1",
          "/settings intelligence subagents concurrency 3",
          "/settings intelligence memory token-budget 2048",
          "/settings intelligence capabilities namespaces 9",
          "/settings show",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      persistSession: async (session) => persistedProfiles.push(session),
      persistWorkingConfig: vi.fn(async () => undefined),
      persistCapabilityRuntime: async (settings) => {
        persistedCapabilities.push(structuredClone(settings));
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persistedProfiles.at(-1)?.orchestrationProfile).toMatchObject({
      preset: "custom",
      maxReadOnlyHelpers: 1,
    });
    expect(persistedCapabilities).toHaveLength(2);
    expect(persistedCapabilities.at(-1)).toMatchObject({
      memoryTokenBudget: 2048,
      subagents: { maxConcurrency: 3 },
    });
    const transcript = output.join("\n");
    expect(transcript).toContain("Intelligence");
    expect(transcript).toMatch(/Memory\s+3 results · 2048 tokens/u);
    expect(transcript).toMatch(/Improvement\s+shadow review/u);
    expect(transcript).toMatch(/Subagents\s+adaptive · max 3/u);
    expect(transcript).toContain(
      "/settings intelligence capabilities <namespaces <1-3>|tools <1-10>>",
    );
  });

  it("persists and applies shortcut remaps through direct settings commands", async () => {
    const output: string[] = [];
    const persisted: CliShortcutPreferences[] = [];
    const applied: CliShortcutPreferences[] = [];

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "/settings shortcuts set undo alt+u",
          "/settings shortcuts set redo alt+u",
          "/help shortcuts",
          "/help getting-started",
          "/settings show",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      shortcutPreferences: DEFAULT_CLI_SHORTCUTS,
      persistShortcuts: async (shortcuts) => {
        persisted.push(structuredClone(shortcuts));
      },
      applyShortcuts: (shortcuts) => {
        applied.push(structuredClone(shortcuts));
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persisted).toHaveLength(1);
    expect(applied).toEqual(persisted);
    expect(persisted[0]?.undo).toEqual(["alt+u"]);
    const transcript = output.join("\n");
    const normalizedTranscript = transcript.replace(/\s+/gu, " ");
    expect(transcript).toContain("undo Alt+U");
    expect(transcript).toContain("assigned more than once");
    expect(transcript).toMatch(/Shortcuts\s+clear Esc\/Ctrl\+C/u);
    expect(normalizedTranscript).toContain(
      "Alt+U undoes the latest edit.",
    );
    expect(normalizedTranscript).toContain(
      "Type plain text to ask about the repository.",
    );
    expect(normalizedTranscript).toContain(
      "Run orynt --help outside the session",
    );
  });

  it("copies selected transcript responses and persists copy-on-select", async () => {
    const copied: string[] = [];
    const notices: string[] = [];
    const pickerChoices: ComposerChoice[][] = [];
    const persistedClipboard: Array<{ copyOnSelect: boolean }> = [];
    const appliedClipboard: Array<{ copyOnSelect: boolean }> = [];

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "/settings clipboard copy-on-select on",
          "/copy previous",
          "/copy all",
          "/copy",
          "/exit",
        ]),
        select: async (_prompt, choices) => {
          pickerChoices.push(choices);
          return "1";
        },
        clear: vi.fn(),
        write: vi.fn(),
        notify: (text) => notices.push(text),
        color: false,
        isTTY: true,
      },
      clipboardPreferences: { copyOnSelect: false },
      persistClipboard: async (preferences) => {
        persistedClipboard.push(structuredClone(preferences));
      },
      applyClipboard: (preferences) => {
        appliedClipboard.push(structuredClone(preferences));
      },
      readTranscript: async () => ({
        entries: [
          {
            schemaVersion: 1,
            sequence: 1,
            logicalTurnId: "turn-1",
            role: "user",
            content: "first question",
            recordedAt: "2026-08-06T01:00:00.000Z",
            contentHash: "hash-1",
          },
          {
            schemaVersion: 1,
            sequence: 2,
            logicalTurnId: "turn-1",
            role: "agent",
            content: "older response",
            recordedAt: "2026-08-06T01:00:01.000Z",
            contentHash: "hash-2",
          },
          {
            schemaVersion: 1,
            sequence: 3,
            logicalTurnId: "turn-2",
            role: "agent",
            content: "latest response",
            recordedAt: "2026-08-06T01:00:02.000Z",
            contentHash: "hash-3",
          },
        ],
        total: 3,
      }),
      copyText: async (value) => {
        copied.push(value);
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persistedClipboard).toEqual([{ copyOnSelect: true }]);
    expect(appliedClipboard).toEqual([{ copyOnSelect: true }]);
    expect(copied).toEqual([
      "older response",
      "older response\n\n---\n\nlatest response",
      "latest response",
    ]);
    expect(pickerChoices.at(-1)?.map((choice) => choice.value)).toEqual([
      "1",
      "2",
      "all",
    ]);
    expect(notices).toEqual([
      "Saved · Copy on select on",
      expect.stringContaining("Copied response 2"),
      expect.stringContaining("Copied 2 Agent responses"),
      expect.stringContaining("Copied latest response"),
    ]);
  });

  it("persists and applies statusline field toggles through settings", async () => {
    const output: string[] = [];
    const persisted: CliStatuslinePreferences[] = [];
    const applied: CliStatuslinePreferences[] = [];

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "/settings statusline set shortcuts on",
          "/settings statusline set model off",
          "/settings statusline set quota off",
          "/settings statusline context-format percent",
          "/settings statusline show",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      statuslinePreferences: DEFAULT_CLI_STATUSLINE,
      persistStatusline: async (statusline) => {
        persisted.push(structuredClone(statusline));
      },
      applyStatusline: (statusline) => {
        applied.push(structuredClone(statusline));
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persisted).toHaveLength(4);
    expect(applied).toEqual(persisted);
    expect(persisted.at(-1)).toMatchObject({
      model: false,
      quota: false,
      shortcuts: true,
      contextFormat: "percent",
    });
    expect(output.join("\n")).toContain(
      "Statusline · on · profile on · role on · model off · effort on · context on (percent) · quota off · shortcuts on",
    );
  });

  it("refreshes provider quota at startup and once after a completed turn", async () => {
    const setProviderUsage = vi.fn();
    const readProviderUsage = vi
      .fn<() => Promise<ProviderUsageSnapshotV1>>()
      .mockResolvedValueOnce(usageSnapshot())
      .mockRejectedValueOnce(new Error("quota temporarily unavailable"));

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["hello", "/exit"]),
        setProviderUsage,
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
      },
      run: vi.fn(),
      turn: async () => agentAnswer(),
      readProviderUsage,
      probeProvider: async () => ({
        ready: true,
        detail: "Authenticated",
      }),
    });

    expect(readProviderUsage).toHaveBeenCalledTimes(2);
    expect(readProviderUsage).toHaveBeenNthCalledWith(1, "quota");
    expect(readProviderUsage).toHaveBeenNthCalledWith(2, "quota");
    expect(setProviderUsage).toHaveBeenCalledTimes(1);
    expect(setProviderUsage).toHaveBeenCalledWith(usageSnapshot());
  });

  it("shows migration guidance for direct model ids and non-TTY editing", async () => {
    const persisted: CliSessionSnapshot[] = [];
    const persistWorkingConfig = vi.fn(async () => undefined);
    const directState = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high" as const,
      providerReady: true,
      providerDetail: "Authenticated",
    };
    await runInteractiveSession({
      state: directState,
      terminal: {
        ask: scriptedAsk(["/model custom-model", "/exit"]),
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
      },
      listModels: vi.fn(),
      persistSession: async (session) => persisted.push(session),
      persistWorkingConfig,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });
    expect(persisted).toEqual([]);
    expect(persistWorkingConfig).not.toHaveBeenCalled();

    const output: string[] = [];
    const listModels = vi.fn();
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/model", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: false,
      },
      listModels,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(listModels).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("Use /model profile <name>");
  });

  it("rejects an oversized direct model id without persisting it", async () => {
    const output: string[] = [];
    const persistSession = vi.fn();
    const persistWorkingConfig = vi.fn();

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          `/model role coordinator ${"m".repeat(201)} high`,
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      persistSession,
      persistWorkingConfig,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(output.join("\n")).toContain("Invalid Orynt model preference");
    expect(persistSession).not.toHaveBeenCalled();
    expect(persistWorkingConfig).not.toHaveBeenCalled();
  });

  it("preserves the profile on catalog cancellation and accepts an explicit role override", async () => {
    const cancelledSnapshots: CliSessionSnapshot[] = [];
    const cancelledConfig = vi.fn();
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/model", "", "/exit"]),
        select: vi
          .fn()
          .mockResolvedValueOnce("advanced")
          .mockResolvedValueOnce("helper"),
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
        isTTY: true,
      },
      listModels: async () => {
        throw new Error("catalog unavailable");
      },
      persistSession: async (session) => cancelledSnapshots.push(session),
      persistWorkingConfig: cancelledConfig,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });
    expect(cancelledSnapshots).toEqual([]);
    expect(cancelledConfig).not.toHaveBeenCalled();

    const fallbackSnapshots: CliSessionSnapshot[] = [];
    const fallbackConfig = vi.fn(async () => undefined);
    const output: string[] = [];
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "/model role helper future-codex-model low",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      listModels: async () => [],
      persistSession: async (session) => fallbackSnapshots.push(session),
      persistWorkingConfig: fallbackConfig,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(fallbackSnapshots.at(-1)).toMatchObject({
      modelId: "gpt-5.5",
      thinkingEffort: "high",
      orchestrationProfile: {
        preset: "custom",
        roles: {
          helper: {
            modelId: "future-codex-model",
            thinkingEffort: "low",
          },
        },
      },
    });
    expect(fallbackConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        orchestrationProfile: expect.objectContaining({ preset: "custom" }),
      }),
    );
    expect(output.join("\n")).toContain("future-codex-model");
  });

  it("persists only the working config field changed by each command", async () => {
    const persistWorkingConfig = vi.fn(async () => undefined);
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/other",
        modelId: "gpt-one-shot",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "/repo .",
          "/model effort helper low",
          "/model role coordinator gpt-persisted high",
          "/exit",
        ]),
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
      },
      persistWorkingConfig,
      persistSession: vi.fn(async () => undefined),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persistWorkingConfig.mock.calls[0]).toEqual([
      { repositoryPath: expect.stringMatching(/orynt$/u) },
    ]);
    expect(persistWorkingConfig.mock.calls.slice(1)).toEqual([
      [
        expect.objectContaining({
          orchestrationProfile: expect.objectContaining({ preset: "custom" }),
        }),
      ],
      [
        expect.objectContaining({
          orchestrationProfile: expect.objectContaining({
            roles: expect.objectContaining({
              coordinator: expect.objectContaining({
                modelId: "gpt-persisted",
              }),
            }),
          }),
        }),
      ],
    ]);
  });

  it("keeps a config change active while warning when its default cannot be saved", async () => {
    const output: string[] = [];
    const persisted: CliSessionSnapshot[] = [];
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk([
          "/model role coordinator gpt-session-only high",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      persistWorkingConfig: async () => {
        throw new Error("preferences are read-only");
      },
      persistSession: async (session) => persisted.push(session),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(persisted.at(-1)?.modelId).toBe("gpt-session-only");
    expect(output.join("\n")).toContain(
      "Default was not saved: preferences are read-only",
    );
  });

  it("requires a first-TTY-launch boundary acknowledgement without approving conversational work", async () => {
    const output: string[] = [];
    const acknowledgeStartupBoundary = vi.fn(async () => undefined);
    const ask = scriptedAsk(["yes", "what does this repository do?", "/exit"]);
    const run = vi.fn();
    const turn = vi.fn(async () => agentAnswer("It is a supervised repository agent."));

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      startupBoundaryAcknowledged: false,
      acknowledgeStartupBoundary,
      turn,
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(ask.mock.calls[0]?.[0]).toBe("Continue in this repository? [y/N] ");
    expect(ask.mock.calls.map(([prompt]) => prompt)).not.toContain(
      "Run this sensitive action? [y/N] ",
    );
    expect(output.join("\n")).toContain("Safety acknowledgement · shown once");
    expect(output.join("\n")).toContain("does not approve sensitive work");
    expect(output.join("\n")).toContain("It is a supervised repository agent.");
    expect(acknowledgeStartupBoundary).toHaveBeenCalledOnce();
    expect(turn).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("exits without persisting or running when first-launch acknowledgement is denied", async () => {
    const output: string[] = [];
    const acknowledgeStartupBoundary = vi.fn();
    const run = vi.fn();

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["no"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      startupBoundaryAcknowledged: false,
      acknowledgeStartupBoundary,
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(output.join("\n")).toContain("Startup cancelled");
    expect(acknowledgeStartupBoundary).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("sends a positional startup prompt to the conversational agent after onboarding", async () => {
    const output: string[] = [];
    const ask = scriptedAsk(["yes", "/exit"]);
    const run = vi.fn();
    const turn = vi.fn(async () => agentAnswer("Repository inspection complete."));

    await runInteractiveSession({
      initialPrompt: "inspect this repository",
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      startupBoundaryAcknowledged: false,
      acknowledgeStartupBoundary: vi.fn(),
      turn,
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(output.join("\n")).not.toContain("Goal        inspect this repository");
    expect(ask.mock.calls.map(([prompt]) => prompt)).toEqual([
      "Continue in this repository? [y/N] ",
      `\n${COMPOSER_PROMPT}`,
    ]);
    expect(turn).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "inspect this repository", activeGoal: undefined }),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("discards an entire multiline draft when its continuation is interrupted", async () => {
    const output: string[] = [];
    const ask = scriptedAsk(["fix the contract \\", INTERRUPTED_INPUT, "/exit"]);
    const run = vi.fn();

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(output.join("\n")).toContain("Draft cancelled");
    expect(ask.mock.calls.map(([prompt]) => prompt)).not.toContain(
      "Approve this medium-risk isolated run? [y/N] ",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("arms cancellation before post-approval persistence and never starts an aborted run", async () => {
    const output: string[] = [];
    const turnController = new AbortController();
    const runController = new AbortController();
    const prepareRunSignal = vi
      .fn()
      .mockReturnValueOnce(turnController.signal)
      .mockReturnValueOnce(runController.signal);
    const releaseRunSignal = vi.fn();
    const run = vi.fn();
    let persistCount = 0;
    let releasePersist: (() => void) | undefined;
    const persistSession = vi.fn(async () => {
      persistCount += 1;
      if (persistCount === 3) {
        await new Promise<void>((resolve) => {
          releasePersist = resolve;
        });
      }
    });

    const session = runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["inspect repository", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: true,
      },
      prepareRunSignal,
      releaseRunSignal,
      persistSession,
      turn: vi.fn(async () => agentAction()),
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    await waitUntil(() => expect(prepareRunSignal).toHaveBeenCalledTimes(2));
    runController.abort();
    releasePersist?.();
    await session;

    expect(stripAnsi(output.join("\n"))).toContain(
      "Cancelled · active agent operation stopped.",
    );
    expect(output.join("\n")).toContain(
      "\u001b[38;2;223;114;114mCancelled\u001b[0m",
    );
    expect(run).not.toHaveBeenCalled();
    expect(releaseRunSignal).toHaveBeenCalledWith(runController.signal);
  });

  it("blocks automatic and approval-required actions when the durable checkpoint fails", async () => {
    for (const operations of [["write"], ["delete"]] as const) {
      const output: string[] = [];
      const ask = scriptedAsk(["change the CLI", "/exit"]);
      const run = vi.fn();
      let persistCount = 0;

      await runInteractiveSession({
        state: {
          repositoryPath: "/work/orynt",
          modelId: "gpt-5.5",
          thinkingEffort: "high",
          providerReady: true,
          providerDetail: "Authenticated",
        },
        terminal: {
          ask,
          clear: vi.fn(),
          write: (value) => output.push(value),
          color: false,
        },
        persistSession: vi.fn(async () => {
          persistCount += 1;
          if (persistCount === 2) {
            throw new Error("state volume unavailable");
          }
        }),
        turn: vi.fn(async () =>
          agentAction({
            operations: [...operations],
          })
        ),
        run,
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      });

      const rendered = output.join("\n");
      expect(rendered).toContain(
        "Repository action blocked because the current session could not be saved.",
      );
      expect(rendered).toContain(
        "No approval was requested and no repository work was started.",
      );
      expect(rendered).not.toContain("Run this sensitive action?");
      expect(rendered).not.toContain("Auto-authorized");
      expect(run).not.toHaveBeenCalled();
      expect(ask).toHaveBeenCalledTimes(2);
    }
  });

  it("reports and remembers cancellation during an active repository run", async () => {
    const output: string[] = [];
    const persisted: CliSessionSnapshot[] = [];
    const controller = new AbortController();
    const run = vi.fn(
      ({ signal }: CliRunRequest) =>
        new Promise<CliRunResult>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("Repository action cancelled.");
              error.name = "RepositoryRunCancelledError";
              reject(error);
            },
            { once: true },
          );
        }),
    );
    const session = runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["change the CLI", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      turn: vi.fn(async () => agentAction()),
      run,
      prepareRunSignal: () => controller.signal,
      releaseRunSignal: vi.fn(),
      persistSession: async (snapshot) => persisted.push(snapshot),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    await waitUntil(() => expect(run).toHaveBeenCalledOnce());
    controller.abort();
    await session;

    expect(output.join("\n")).toContain("Stopped");
    expect(output.join("\n")).toContain("Repository action cancelled");
    expect(persisted.at(-1)?.conversationSummary).toMatch(
      /Action outcome: cancelled during execution; no further stages were run\.$/,
    );
  });

  it("escapes control sequences in the approval display without changing the run value", () => {
    const text = approvalText(
      {
        repositoryPath: "/work\u001b[2J/orynt",
        modelId: "gpt\nspoof",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
        acceptanceCriteria: ["tests pass\rspoof"],
      },
      {
        instruction: "inspect\u001b]0;spoof\u0007\nrepository",
        rationale: "sensitive\u001b[Hreason",
        operations: ["delete"],
        estimatedPaths: ["packages/cli/src/session.ts"],
        estimatedChangedFiles: 1,
      },
      {
        decision: "approval_required",
        risk: "high",
        reasons: ["reason\u001b[Hspoof"],
      },
    );

    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("\u0007");
    expect(text).toContain("\\u001b");
    expect(text).toContain("\\n");
    expect(text).toContain("Action approval · this repository run only");
    expect(text).not.toContain("gpt");
    expect(text).not.toContain("tests pass");
  });

  it("colors only the approval heading without changing its plain text", () => {
    const state = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "high" as const,
      providerReady: true,
      providerDetail: "Authenticated",
    };
    const action = {
      instruction: "update the CLI",
      rationale: "Operator requested the change",
      operations: ["edit" as const],
      estimatedPaths: ["packages/cli/src/session.ts"],
      estimatedChangedFiles: 1,
    };
    const authorization = {
      decision: "approval_required" as const,
      risk: "medium" as const,
      reasons: ["Sensitive repository action."],
    };
    const plain = approvalText(state, action, authorization);
    const colored = approvalText(
      state,
      action,
      authorization,
      { color: true },
    );

    expect(stripAnsi(colored)).toBe(plain);
    expect(colored).toContain(
      "\u001b[38;2;212;169;79mAction approval\u001b[0m",
    );
    expect(colored).not.toContain(
      "\u001b[38;2;212;169;79mupdate the CLI",
    );
  });

  it("auto-authorizes a safe action proposed from natural-language chat and streams a concise trace", async () => {
    const output: string[] = [];
    const contexts: LiveComposerContext[] = [];
    const ask = scriptedAsk(["fix the failing contract", "/exit"]);
    const run = vi.fn(async (request: CliRunRequest): Promise<CliRunResult> => {
      request.onEvent({ type: "run_started", payload: { summary: "started" } });
      request.onEvent({ type: "codex_execution_started", payload: { summary: "running" } });
      request.onEvent({
        type: "codex_context_usage",
        payload: {
          current: {
            inputTokens: 12_000,
            cachedInputTokens: 9_000,
            outputTokens: 500,
            reasoningOutputTokens: 120,
            totalTokens: 12_500,
          },
          precision: "provider",
        },
      });
      request.onEvent({
        type: "codex_execution_finished",
        payload: {
          summary: "finished",
          lastMessagePreview: "I found the contract mismatch.\nUpdated the CLI contract.",
        },
      });
      request.onEvent({
        type: "codex_sandbox_diff_inspected",
        payload: { changedFiles: ["packages/cli/src/session.ts"] },
      });
      request.onEvent({ type: "verification_started", payload: { summary: "verifying" } });
      request.onEvent({ type: "verification_passed", payload: { summary: "All checks passed" } });
      return {
        runId: "run-cli-1",
        status: "pass",
        artifactRoot: "/state/orynt/artifacts/run-cli-1",
        artifactManifestPath: "/state/orynt/artifacts/run-cli-1/artifact-manifest.json",
        eventCount: 3,
        events: [],
      };
    });

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: true,
        width: 100,
        isTTY: true,
        beginLiveInput: (context) => {
          contexts.push(structuredClone(context));
          return {
            setContext: (next) => contexts.push(structuredClone(next)),
            pauseForModal: () => () => undefined,
            close: () => "",
          };
        },
      },
      listModels: async () => [{
        id: "gpt-5.5",
        label: "GPT 5.5",
        supportedThinkingEfforts: ["high"],
        contextWindowTokens: 272_000,
        effectiveContextWindowTokens: 200_000,
      }],
      turn: vi.fn(async (request) => {
        const coordinatorContext = lifecycleSnapshot(25);
        coordinatorContext.capacity.modelId = "gpt-5.5";
        coordinatorContext.capacity.contextWindowTokens = 272_000;
        coordinatorContext.capacity.effectiveWindowTokens = 200_000;
        coordinatorContext.usage.usedTokens = 50_000;
        coordinatorContext.usage.current = {
          inputTokens: 49_000,
          cachedInputTokens: 30_000,
          outputTokens: 1_000,
          reasoningOutputTokens: 200,
          totalTokens: 50_000,
        };
        request.onContext?.(coordinatorContext);
        return {
          ...agentAction({ instruction: "fix the failing contract" }),
          context: coordinatorContext,
        };
      }),
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "fix the failing contract",
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        activeGoal: undefined,
        authorization: expect.objectContaining({
          decision: "auto_allowed",
          source: "automatic_policy",
        }),
      }),
    );
    expect(ask.mock.calls.map(([prompt]) => prompt)).not.toContain(
      "Run this sensitive action? [y/N] ",
    );
    const transcript = output.join("\n");
    const plainTranscript = stripAnsi(transcript);
    expect(plainTranscript).toContain("Auto-authorized");
    expect(plainTranscript).toContain("I found the contract mismatch.");
    expect(plainTranscript).toContain("All checks passed");
    expect(plainTranscript).toContain("Prepare");
    expect(plainTranscript).toContain("Run       Codex working");
    expect(plainTranscript).toContain("Verify");
    expect(plainTranscript).toContain("✓ Done");
    expect(plainTranscript).toContain("Changes · 1 file");
    expect(plainTranscript).toContain("Run run-cli-1");
    expect(plainTranscript).toContain("artifact-manifest.json");
    expect(transcript).toContain("\u001b[2m✓\u001b[0m Auto-authorized");
    expect(contexts).toContainEqual(
      expect.objectContaining({
        phase: "executing",
        status: expect.objectContaining({
          mode: "active",
          role: "implementer",
          context: expect.objectContaining({
            capacity: expect.objectContaining({
              effectiveWindowTokens: 200_000,
            }),
            usage: expect.objectContaining({
              precision: "provider",
              usedTokens: 12_500,
              current: expect.objectContaining({
                inputTokens: 12_000,
                outputTokens: 500,
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("turns failed verifier evidence into one bounded recovery task without another approval", async () => {
    const output: string[] = [];
    let recoveryTask:
      | {
          role: string;
          authority: string;
          expectedPaths: string[];
          depth: number;
        }
      | undefined;
    const run = vi.fn(
      async (request: CliRunRequest): Promise<CliRunResult> => {
        const review = await request.postVerificationReview?.({
          runId: "run-recovery-1",
          repositoryPath: "/work/orynt",
          sandboxWorktreePath: "/state/sandbox/run-recovery-1",
          status: "fail",
          summary: "Verifier command failed.",
          signal: request.signal,
        });
        recoveryTask = review?.recoveryTask;
        return {
          runId: "run-recovery-1",
          status: "pass",
          artifactRoot: "/state/orynt/artifacts/run-recovery-1",
          artifactManifestPath:
            "/state/orynt/artifacts/run-recovery-1/artifact-manifest.json",
          eventCount: 0,
          events: [],
        };
      },
    );
    const ask = scriptedAsk(["fix the CLI", "/exit"]);

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      turn: vi.fn(async () =>
        agentAction({
          instruction: "fix the CLI",
          estimatedPaths: ["packages/cli/src/session.ts"],
        }),
      ),
      readOnlyRole: vi.fn(async () => ({
        summary: "The verifier found a bounded CLI regression.",
        findings: ["The changed session path remains in scope."],
        recommendation: "Repair the regression and rerun verification.",
        recovery: {
          instruction: "Repair the CLI regression.",
          expectedPaths: ["packages/cli/src/session.ts"],
        },
      })),
      run,
      probeProvider: async () => ({
        ready: true,
        detail: "Authenticated",
      }),
    });

    expect(recoveryTask).toMatchObject({
      role: "implementer",
      authority: "single_writer",
      expectedPaths: ["packages/cli/src/session.ts"],
      depth: 2,
    });
    expect(
      ask.mock.calls.filter(
        ([prompt]) =>
          prompt === "Run this sensitive action? [y/N] ",
      ),
    ).toHaveLength(0);
    expect(output.join("\n")).toContain("◇ Recovery gpt-5.5 · high");
  });

  it("does not execute when the operator denies approval", async () => {
    const output: string[] = [];
    const run = vi.fn();
    const persisted: CliSessionSnapshot[] = [];
    const state = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.5",
      thinkingEffort: "medium" as const,
      providerReady: true,
      providerDetail: "Authenticated",
      conversationSummary: "x".repeat(4_000),
    };

    await runInteractiveSession({
      state,
      terminal: {
        ask: scriptedAsk(["change README", "no", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      turn: vi.fn(async () => {
        const result = agentAction({
          operations: ["delete"],
          instruction: "Delete an obsolete README section",
        });
        result.conversationSummary = "x".repeat(4_000);
        return result;
      }),
      run,
      persistSession: async (snapshot) => {
        persisted.push(snapshot);
      },
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(run).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("Action cancelled before execution");
    expect(output.join("\n")).toContain("◇ Cancelled after");
    expect(persisted.at(-1)?.conversationSummary).toHaveLength(4_000);
    expect(persisted.at(-1)?.conversationSummary).toMatch(
      /Action outcome: operator denied the proposed repository action\.$/,
    );
  });

  it("measures one whole action prompt while excluding approval wait", async () => {
    let now = 0;
    let promptRead = false;
    const output: string[] = [];
    const ask = vi.fn(async (prompt: string) => {
      if (!promptRead) {
        promptRead = true;
        return "delete the obsolete file";
      }
      if (prompt === "Run this sensitive action? [y/N] ") {
        now = 70_000;
        return "yes";
      }
      return "/exit";
    });
    const run = vi.fn(async (): Promise<CliRunResult> => {
      now = 90_000;
      return {
        runId: "run-duration-1",
        status: "pass",
        artifactRoot: "/artifacts/run-duration-1",
        artifactManifestPath: "/artifacts/run-duration-1/manifest.json",
        eventCount: 0,
        events: [],
      };
    });

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        width: 60,
      },
      turn: vi.fn(async () => {
        now = 10_000;
        return agentAction({
          operations: ["delete"],
          instruction: "Delete the obsolete repository file",
        });
      }),
      now: () => now,
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(run).toHaveBeenCalledOnce();
    expect(
      output.filter((value) => value.includes("Crafted in")),
    ).toEqual([
      expect.stringContaining("✦ Crafted in 30s"),
    ]);
  });

  it("asks exactly once for each sensitive action and never presents audit approvals as prompts", async () => {
    const ask = scriptedAsk([
      "inspect the repository",
      "no",
      "check the tests",
      "no",
      "/exit",
    ]);

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
      },
      turn: vi.fn(async () =>
        agentAction({
          operations: ["delete"],
          instruction: "Delete an obsolete repository file",
        }),
      ),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(
      ask.mock.calls.filter(
        ([prompt]) => prompt === "Run this sensitive action? [y/N] ",
      ),
    ).toHaveLength(2);
  });

  it("treats a positional startup message as a prompt and preserves sensitive action approval", async () => {
    const ask = scriptedAsk(["no", "/exit"]);
    const run = vi.fn();

    await runInteractiveSession({
      initialPrompt: "remove obsolete repository file",
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        clear: vi.fn(),
        write: vi.fn(),
        color: false,
      },
      turn: vi.fn(async () =>
        agentAction({
          operations: ["delete"],
          instruction: "Delete an obsolete repository file",
        }),
      ),
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(ask.mock.calls[0]?.[0]).toBe("Run this sensitive action? [y/N] ");
    expect(run).not.toHaveBeenCalled();
  });

  it("maintains typed goal, criteria, state, evidence, verification, cost, usage, and doctor views", async () => {
    const output: string[] = [];
    const persisted: CliSessionSnapshot[] = [];
    const lastRun: CliRunSnapshot = {
      runId: "run-typed-1",
      status: "pass",
      summary: "Verified repository task",
      verification: "passed",
      evidenceCount: 2,
      artifactManifestPath: "/artifacts/manifest.json",
      artifacts: { contract: "/artifacts/contract.md", verificationResult: "/artifacts/verify.json" },
      eventTypes: ["verification_passed"],
      estimatedTotalTokens: 1000,
      estimatedCostUsd: 0.04,
      costPerSuccessfulTask: 0.04,
      workingState: { mode: "DELIBERATE", activeChunkCount: 2, hardConstraints: ["repository-only"] },
    };

    await runInteractiveSession({
      state: {
        sessionId: "session-typed",
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
        lastRun,
      },
      terminal: {
        ask: scriptedAsk([
          "/goal audit repository safety",
          "/criteria tests pass; no secrets persisted",
          "/plan",
          "/state",
          "/evidence",
          "/verify",
          "/cost",
          "/usage verbose",
          "/doctor",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      diagnose: async () => doctorReport("TTY ready · Codex CLI ready"),
      readProviderUsage: async () => usageSnapshot(),
      persistSession: async (session) => persisted.push(session),
    });

    const transcript = output.join("\n");
    expect(transcript).toMatch(/├─ Goal\s+audit repository safety/u);
    expect(transcript).toContain("tests pass");
    expect(transcript).toContain("DELIBERATE");
    expect(transcript).toContain("/artifacts/verify.json");
    expect(transcript).toMatch(/Verdict\s+passed/u);
    expect(transcript).toContain("$0.0400");
    expect(transcript).toContain("Codex usage · ready");
    expect(transcript).toMatch(/Tokens\s+1,234/u);
    expect(transcript).toContain("TTY ready");
    expect(persisted.at(-1)).toMatchObject({
      goal: "audit repository safety",
      acceptanceCriteria: ["tests pass", "no secrets persisted"],
    });
  });

  it("renders a verified file-filtered diff from the last run artifact", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-session-diff-"));
    try {
      const artifactPath = path.join(root, "repository-diff.json");
      const artifact = {
        schemaVersion: 1,
        runId: "run-diff-1",
        taskId: "task-diff-1",
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
      const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
      await writeFile(artifactPath, serialized, { mode: 0o600 });
      const output: string[] = [];
      await runInteractiveSession({
        state: {
          repositoryPath: "/work/orynt",
          modelId: "gpt-5.5",
          thinkingEffort: "high",
          providerReady: true,
          providerDetail: "Authenticated",
          lastRun: {
            runId: "run-diff-1",
            status: "pass",
            summary: "Verified.",
            verification: "passed",
            evidenceCount: 1,
            artifactManifestPath: path.join(root, "artifact-manifest.json"),
            artifacts: { repositoryDiff: artifactPath },
            eventTypes: ["verification_passed"],
            repositoryDiff: {
              available: true,
              reference: {
                artifactRoot: root,
                path: artifactPath,
                sha256: createHash("sha256").update(serialized).digest("hex"),
                byteLength: Buffer.byteLength(serialized),
              },
              totals: artifact.totals,
              truncated: false,
              redactionCount: 0,
            },
          },
        },
        terminal: {
          ask: scriptedAsk(["/diff packages/value.txt", "/exit"]),
          clear: vi.fn(),
          write: (value) => output.push(value),
          color: false,
        },
        run: vi.fn(),
        probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      });

      expect(output.join("\n")).toContain(
        "Diff · Verified · 1 file · +1/-1",
      );
      expect(output.join("\n")).toContain("+new");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("repairs provider state through /setup without starting an agent turn", async () => {
    const output: string[] = [];
    const setupProvider = vi.fn(async () => ({
      outcome: "ready" as const,
      status: {
        ready: true,
        detail: "Logged in using ChatGPT · app-server ready",
        code: "CODEX_READY" as const,
        nextAction: "none" as const,
      },
    }));
    const turn = vi.fn();
    const readProviderUsage = vi.fn(async () => usageSnapshot());
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: false,
        providerDetail: "Not logged in",
      },
      terminal: {
        ask: scriptedAsk(["/setup", "/status", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      run: vi.fn(),
      turn,
      probeProvider: async () => ({
        ready: true,
        detail: "Logged in using ChatGPT · app-server ready",
      }),
      setupProvider,
      readProviderUsage,
    });
    expect(setupProvider).toHaveBeenCalledOnce();
    expect(turn).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("Codex CLI is ready");
    expect(output.join("\n")).toContain("Provider     ready");
    expect(output.join("\n")).toContain("Usage        Codex · pro · 7d 60% left");
    expect(readProviderUsage).toHaveBeenCalledWith("quota");
  });

  it("escapes controls in persisted state, evidence, verification, provider, and doctor output", async () => {
    const output: string[] = [];
    const malicious = "\u001b]52;c;owned\u0007\r\n\u202espoof";
    const lastRun: CliRunSnapshot = {
      runId: `run-${malicious}`,
      status: "pass",
      summary: `summary-${malicious}`,
      verification: "passed",
      evidenceCount: 1,
      artifactManifestPath: `/artifacts/${malicious}/manifest.json`,
      artifacts: { [`contract-${malicious}`]: `/artifacts/${malicious}/contract.md` },
      eventTypes: ["verification_passed"],
      workingState: {
        mode: `mode-${malicious}`,
        activeChunkCount: 1,
        hardConstraints: [`constraint-${malicious}`],
        selectedOptionId: `option-${malicious}`,
      },
      memory: {
        summary: `memory-${malicious}`,
        episodeCount: 1,
        candidateRuleCount: 0,
      },
    };

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: `provider-${malicious}`,
        lastRun,
      },
      terminal: {
        ask: scriptedAsk(["/status", "/plan", "/state", "/evidence", "/verify", "/doctor", "inspect", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: false, detail: `provider-${malicious}` }),
      diagnose: async () => doctorReport(`doctor-${malicious}`),
    });

    const transcript = output.join("\n");
    expect(transcript).not.toContain("\u001b");
    expect(transcript).not.toContain("\u0007");
    expect(transcript).not.toContain("\r");
    expect(transcript).not.toContain("\u202e");
    expect(transcript).toContain("memory-\\u001b]52;c;owned\\u0007\\r\\n\\u202espoof");
    expect(transcript).toContain("summary-\\u001b]52;c;owned\\u0007\\r\\n\\u202espoof");
    expect(transcript).toContain("provider-\\u001b]52;c;owned\\u0007\\r\\n\\u202espoof");
    expect(transcript).toContain("doctor-\\u001b]52;c;owned\\u0007\\r\\n\\u202espoof");
  });

  it("supports portable multiline prompts and restores only compact conversation state", async () => {
    const output: string[] = [];
    const resumed: CliSessionSnapshot = {
      schemaVersion: 1,
      sessionId: "session-resumed",
      repositoryPath: "/work/resumed",
      modelId: "gpt-5.6",
      thinkingEffort: "medium",
      mode: "plan",
      goal: "resumed goal",
      acceptanceCriteria: ["resume works"],
      conversationSummary: "Earlier repository context.",
      turnCount: 3,
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    };
    const ask = scriptedAsk(["/resume latest", "fix the contract \\", "without changing public API", "/exit"]);
    const remember = vi.fn();
    const turn = vi.fn(async () => agentAnswer("I understand the requested constraint."));

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask,
        remember,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      loadSession: async () => resumed,
    });

    const transcript = output.join("\n");
    expect(transcript).toContain("Resumed session session-resumed");
    expect(transcript).toContain("I understand the requested constraint.");
    expect(ask.mock.calls.map(([prompt]) => prompt)).toContain("… ");
    expect(remember).toHaveBeenCalledWith("fix the contract\nwithout changing public API");
    expect(turn).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "fix the contract\nwithout changing public API",
        activeGoal: "resumed goal",
        conversationSummary: "Earlier repository context.",
        recentTurns: [],
      }),
    );
  });

  it("opens /sessions as a paginated picker and resumes the selected session", async () => {
    const output: string[] = [];
    const select = vi
      .fn()
      .mockResolvedValueOnce("__orynt_sessions_load_more__")
      .mockResolvedValueOnce("session-target");
    const entry = (
      sessionId: string,
      title: string,
      updatedAt: string,
    ): CliSessionCatalogEntry => ({
      sessionId,
      title,
      repositoryPath: "/work/orynt",
      pinned: sessionId === "session-current",
      turnCount: sessionId === "session-target" ? 7 : 2,
      snapshotBytes: 256,
      verification: sessionId === "session-target" ? "passed" : undefined,
      modifiedWorktreeProtected: false,
      createdAt: updatedAt,
      updatedAt,
    });
    const listSessions = vi.fn(async (options?: { cursor?: string }) =>
      options?.cursor
        ? {
            entries: [
              entry(
                "session-target",
                "Target session",
                "2026-08-05T02:00:00.000Z",
              ),
            ],
          }
        : {
            entries: [
              entry(
                "session-current",
                "Current session",
                "2026-08-05T03:00:00.000Z",
              ),
            ],
            nextCursor: "session-current",
          }
    );
    const resumed: CliSessionSnapshot = {
      schemaVersion: 1,
      sessionId: "session-target",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.6",
      thinkingEffort: "medium",
      mode: "plan",
      goal: "restored goal",
      acceptanceCriteria: ["picker resumes"],
      conversationSummary: "Restored context.",
      turnCount: 7,
      createdAt: "2026-08-05T02:00:00.000Z",
      updatedAt: "2026-08-05T02:00:00.000Z",
    };

    await runInteractiveSession({
      state: {
        sessionId: "session-current",
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/sessions", "/exit"]),
        select,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      listSessions,
      loadSession: async (sessionId) =>
        sessionId === resumed.sessionId ? resumed : undefined,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(listSessions).toHaveBeenNthCalledWith(1, {
      repositoryPath: "/work/orynt",
      limit: 20,
    });
    expect(listSessions).toHaveBeenNthCalledWith(2, {
      repositoryPath: "/work/orynt",
      limit: 20,
      cursor: "session-current",
    });
    const firstChoices = select.mock.calls[0]?.[1] as Array<{
      value: string;
      description?: string;
    }>;
    expect(firstChoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "session-current",
          description: expect.stringContaining("current"),
        }),
        expect.objectContaining({
          value: "__orynt_sessions_load_more__",
        }),
      ]),
    );
    const secondChoices = select.mock.calls[1]?.[1] as Array<{
      value: string;
    }>;
    expect(secondChoices.map(({ value }) => value)).toEqual([
      "session-current",
      "session-target",
    ]);
    expect(output.join("\n")).toContain("Resumed session session-target");
    expect(output.join("\n")).not.toContain("1. Current session");
  });

  it("keeps the current /sessions selection state-neutral", async () => {
    const output: string[] = [];
    const loadSession = vi.fn();

    await runInteractiveSession({
      state: {
        sessionId: "session-current",
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/sessions", "/exit"]),
        select: vi.fn(async () => "session-current"),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      listSessions: async () => ({
        entries: [{
          sessionId: "session-current",
          title: "Current session",
          repositoryPath: "/work/orynt",
          pinned: false,
          turnCount: 1,
          snapshotBytes: 128,
          modifiedWorktreeProtected: false,
          createdAt: "2026-08-05T03:00:00.000Z",
          updatedAt: "2026-08-05T03:00:00.000Z",
        }],
      }),
      loadSession,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(loadSession).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain(
      "Session is already current: session-current",
    );
  });

  it("rejects an interactive resume target in Trash", async () => {
    const output: string[] = [];
    const turn = vi.fn();
    const trashed: CliSessionSnapshot = {
      schemaVersion: 1,
      sessionId: "session-trashed",
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.6",
      thinkingEffort: "medium",
      mode: "plan",
      acceptanceCriteria: [],
      trashedAt: "2026-08-04T00:00:00.000Z",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
    };

    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.5",
        thinkingEffort: "high",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/resume session-trashed", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      loadSession: async () => trashed,
    });

    const transcript = output.join("\n");
    expect(turn).not.toHaveBeenCalled();
    expect(transcript).not.toContain("Resumed session session-trashed");
    expect(transcript).toContain("Session is in Trash: session-trashed");
    expect(transcript).toContain(
      "orynt sessions restore session-trashed",
    );
  });

  it("pins the next request upward to Heavy and resets after the turn", async () => {
    const output: string[] = [];
    const turn = vi.fn(async () => agentAnswer("Heavy review complete."));
    const state = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.6-terra",
      thinkingEffort: "medium" as const,
      modelTierConfiguration: createDefaultModelTierConfiguration(),
      providerReady: true,
      providerDetail: "Authenticated",
    };
    await runInteractiveSession({
      state,
      terminal: {
        ask: scriptedAsk([
          "/tier heavy",
          "review this repository",
          "summarize this repository",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      listModels: async () => [
        {
          id: "gpt-5.6-luna",
          label: "Luna",
          supportedThinkingEfforts: ["medium"],
        },
        {
          id: "gpt-5.6-terra",
          label: "Terra",
          supportedThinkingEfforts: ["medium"],
        },
        {
          id: "gpt-5.6-sol",
          label: "Sol",
          supportedThinkingEfforts: ["high"],
        },
      ],
      turn,
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(turn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ modelId: "gpt-5.6-sol" }),
    );
    expect(turn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ modelId: "gpt-5.6-terra" }),
    );
    expect(output.join("\n")).toContain(
      "Next request minimum model tier set to heavy",
    );
  });

  it("opens a guided tier picker and keeps cancellation state-neutral", async () => {
    const output: string[] = [];
    const state = {
      repositoryPath: "/work/orynt",
      modelId: "gpt-5.6-terra",
      thinkingEffort: "medium" as const,
      modelTierConfiguration: createDefaultModelTierConfiguration(),
      providerReady: true,
      providerDetail: "Authenticated",
      nextMinimumTier: "medium" as const,
    };
    const select = vi
      .fn()
      .mockResolvedValueOnce(NAVIGATE_BACK_INPUT)
      .mockResolvedValueOnce("heavy");

    await runInteractiveSession({
      state,
      terminal: {
        ask: scriptedAsk(["/tier", "/tier", "/exit"]),
        select,
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: true,
      },
      turn: vi.fn(),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(select).toHaveBeenNthCalledWith(
      1,
      "Next request tier › ",
      expect.arrayContaining([
        expect.objectContaining({ value: "auto", label: "Auto" }),
        expect.objectContaining({ value: "heavy", label: "Heavy" }),
      ]),
      "medium",
    );
    expect(select).toHaveBeenNthCalledWith(
      2,
      "Next request tier › ",
      expect.any(Array),
      "medium",
    );
    expect(output.join("\n")).toContain(
      "Next request minimum model tier set to heavy",
    );
  });

  it("keeps no-argument tier editing fail-closed outside an interactive TTY", async () => {
    const output: string[] = [];
    await runInteractiveSession({
      state: {
        repositoryPath: "/work/orynt",
        modelId: "gpt-5.6-terra",
        thinkingEffort: "medium",
        providerReady: true,
        providerDetail: "Authenticated",
      },
      terminal: {
        ask: scriptedAsk(["/tier", "/tier impossible", "/exit"]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
        isTTY: false,
      },
      turn: vi.fn(),
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    expect(
      output.filter(
        (line) => line === "Usage: /tier <auto|light|medium|heavy>",
      ),
    ).toHaveLength(2);
  });
});
