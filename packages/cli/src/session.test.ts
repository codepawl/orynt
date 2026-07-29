import { describe, expect, it, vi } from "vitest";

import { INTERRUPTED_INPUT } from "./composer";
import {
  approvalText,
  runInteractiveSession,
  type CliRunRequest,
  type CliRunResult,
} from "./session";
import type {
  CliAgentTurnResult,
  ProposedRepositoryAction,
} from "./agent";
import type { CliRunSnapshot, CliSessionSnapshot } from "./state";
import type { CliModelOption } from "./ui";

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/gu, "");
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
  return {
    disposition: "action",
    reply: "I can make that repository change.",
    conversationSummary: "User requested a bounded repository change.",
    action: {
      instruction: "Update the requested CLI behavior",
      rationale: "The user asked for a small repository-local change.",
      operations: ["write"],
      estimatedPaths: ["packages/cli/src/session.ts"],
      estimatedChangedFiles: 1,
      helperTasks: [],
      ...overrides,
    },
  };
}

describe("interactive Orynt session", () => {
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
      .mockResolvedValueOnce("advanced")
      .mockResolvedValueOnce("implementer")
      .mockResolvedValueOnce("gpt-5.6-terra")
      .mockResolvedValueOnce("medium");
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
        ask: scriptedAsk(["/model", "/exit"]),
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
    expect(transcript).toContain("Orchestration profile · custom");
    expect(transcript).toContain(
      "├─ implementer  gpt-5.6-terra · medium",
    );
    expect(transcript).toContain(
      "└─ budgets      wall time hard · token/cost advisory",
    );
    expect(run).not.toHaveBeenCalled();
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

    expect(ask.mock.calls[0]?.[0]).toBe("Acknowledge this supervised repository boundary? [y/N] ");
    expect(ask.mock.calls.map(([prompt]) => prompt)).not.toContain(
      "Approve this sensitive isolated action? [y/N] ",
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
      "Acknowledge this supervised repository boundary? [y/N] ",
      "\n❯ ",
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
      if (persistCount === 2) {
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
        color: false,
      },
      prepareRunSignal,
      releaseRunSignal,
      persistSession,
      turn: vi.fn(async () => agentAction()),
      run,
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
    });

    await vi.waitFor(() => expect(prepareRunSignal).toHaveBeenCalledTimes(2));
    runController.abort();
    releasePersist?.();
    await session;

    expect(output.join("\n")).toContain("Repository action cancelled before execution");
    expect(run).not.toHaveBeenCalled();
    expect(releaseRunSignal).toHaveBeenCalledWith(runController.signal);
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

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
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
    const ask = scriptedAsk(["fix the failing contract", "/exit"]);
    const run = vi.fn(async (request: CliRunRequest): Promise<CliRunResult> => {
      request.onEvent({ type: "run_started", payload: { summary: "started" } });
      request.onEvent({ type: "codex_execution_started", payload: { summary: "running" } });
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
      },
      turn: vi.fn(async () =>
        agentAction({ instruction: "fix the failing contract" }),
      ),
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
      "Approve this sensitive isolated action? [y/N] ",
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
          prompt === "Approve this sensitive isolated action? [y/N] ",
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
    expect(persisted.at(-1)?.conversationSummary).toHaveLength(4_000);
    expect(persisted.at(-1)?.conversationSummary).toMatch(
      /Action outcome: operator denied the proposed repository action\.$/,
    );
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
        ([prompt]) => prompt === "Approve this sensitive isolated action? [y/N] ",
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

    expect(ask.mock.calls[0]?.[0]).toBe("Approve this sensitive isolated action? [y/N] ");
    expect(run).not.toHaveBeenCalled();
  });

  it("maintains typed goal, criteria, state, evidence, verification, cost, and doctor views", async () => {
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
          "/doctor",
          "/exit",
        ]),
        clear: vi.fn(),
        write: (value) => output.push(value),
        color: false,
      },
      run: vi.fn(),
      probeProvider: async () => ({ ready: true, detail: "Authenticated" }),
      diagnose: async () => ["TTY: ready", "Codex CLI: ready"],
      persistSession: async (session) => persisted.push(session),
    });

    const transcript = output.join("\n");
    expect(transcript).toContain("├─ Goal         audit repository safety");
    expect(transcript).toContain("tests pass");
    expect(transcript).toContain("DELIBERATE");
    expect(transcript).toContain("/artifacts/verify.json");
    expect(transcript).toContain("Verification passed");
    expect(transcript).toContain("$0.0400");
    expect(transcript).toContain("TTY: ready");
    expect(persisted.at(-1)).toMatchObject({
      goal: "audit repository safety",
      acceptanceCriteria: ["tests pass", "no secrets persisted"],
    });
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
      diagnose: async () => [`doctor-${malicious}`],
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
});
