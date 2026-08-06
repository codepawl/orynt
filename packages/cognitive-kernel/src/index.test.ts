import { describe, expect, it } from "bun:test";
import { createConservativeCodingApprenticePolicy } from "@codepawl/shared";

import {
  CognitiveRuntimeV1,
  parseCognitiveRunCheckpointV1,
  DeterministicCognitiveKernel,
  StaticMemoryProvider,
  type CognitiveRuntimeBudgetV1,
  type CognitiveRunCheckpointV1,
  type CognitiveRuntimeOptionsV1,
  type KernelActionPlan,
} from "./index";

const policy = createConservativeCodingApprenticePolicy("/repo/orynt", "/tmp/orynt-worktree");

function plan(overrides: Partial<KernelActionPlan> = {}): KernelActionPlan {
  return {
    id: "action-read-repo",
    summary: "Read repository status",
    policyAction: {
      id: "policy-action-read-repo",
      kind: "command",
      summary: "Run git status",
      command: "git status",
    },
    expectedObservation: "working tree clean",
    confidence: 0.88,
    uncertaintyScore: 0.12,
    ...overrides,
  };
}

describe("DeterministicCognitiveKernel", () => {
  it("runs the supervised observe-retrieve-plan-gate-execute-verify-summarize loop", async () => {
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([
        {
          id: "memory-report-format",
          kind: "semantic",
          summary: "User prefers markdown summaries.",
          relevance: 0.91,
          sourceRunId: "run-prior",
        },
      ]),
      planner: {
        plan: async () => plan(),
      },
      gateway: {
        execute: async () => ({
          actionId: "action-read-repo",
          observation: "working tree clean",
          evidence: [{ id: "evidence-status", kind: "command_log", label: "git status output" }],
        }),
      },
    });

    const result = await kernel.runTask({
      runId: "run-1",
      taskId: "task-1",
      workspaceId: "workspace-1",
      goal: "Check repository status",
      constraints: ["Do not mutate files"],
      maxSteps: 4,
    });

    expect(result.status).toBe("completed");
    expect(result.phases).toEqual(["observe", "retrieve", "plan", "gate", "execute", "verify", "learn", "summarize"]);
    expect(result.memoryHits.map((hit) => hit.id)).toEqual(["memory-report-format"]);
    expect(result.actionDecisions[0]).toMatchObject({ decision: "allow" });
    expect(result.verifications[0]).toMatchObject({ status: "pass", expectedObservation: "working tree clean", actualObservation: "working tree clean" });
    expect(result.summary).toContain("completed");
    expect(result.budgetedTrace.decision.mode).toBe("HABIT");
    expect(result.budgetedTrace.cost.costPerSuccessfulTask).toBeGreaterThan(0);
  });

  it("builds compact lossless-constraint state and typed memory under a token budget", async () => {
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([
        { id: "semantic-1", kind: "semantic", summary: "Use targeted tests before broad builds.", relevance: 0.95 },
        { id: "episodic-1", kind: "episodic", summary: "Prior repository run recovered after inspecting the smallest failing file.", relevance: 0.91 },
        { id: "procedural-1", kind: "procedural", summary: "TDD loop: failing test, minimal fix, focused verification, broad verification.", relevance: 0.89 },
        { id: "semantic-low", kind: "semantic", summary: "Long unrelated memory that should lose the budget competition.", relevance: 0.1 },
      ]),
      planner: { plan: async () => plan() },
      gateway: {
        execute: async () => ({
          actionId: "action-read-repo",
          observation: "working tree clean",
          evidence: [{ id: "trace-1", kind: "trace", label: "verification trace" }],
        }),
      },
      tokenBudgetPolicy: {
        workingState: { maxActiveChunks: 7, maxChunkWords: 15 },
        memoryRetrieval: { semantic: 12, episodic: 12, procedural: 12, maxTotal: 36 },
        optionGenerator: { maxOptions: 5, maxOutputTokens: 500 },
        tradeoffSimulator: { maxOutputTokens: 600 },
        policySelector: { maxOutputTokens: 300 },
        finalResponder: { maxOutputTokens: 800 },
      },
    });

    const hardConstraints = ["do not mutate files", "all auth tests must pass", "budget <= 50 USD"];
    const result = await kernel.runTask({
      runId: "run-budgeted-state",
      taskId: "task-budgeted-state",
      workspaceId: "workspace-1",
      goal: "Fix the login 401 bug after token refresh without touching public auth API.",
      constraints: hardConstraints,
      maxSteps: 4,
    });

    expect(result.budgetedTrace.needState.hardConstraints).toEqual(hardConstraints);
    expect(result.budgetedTrace.workingState.hardConstraints).toEqual(hardConstraints);
    expect(result.budgetedTrace.workingState.activeChunks.length).toBeLessThanOrEqual(7);
    expect(result.budgetedTrace.workingState.activeChunks.every((chunk) => chunk.split(/\s+/).length <= 15)).toBe(true);
    expect(result.budgetedTrace.memoryContext.selected.map((hit) => hit.kind)).toEqual(["semantic", "episodic", "procedural"]);
    expect(result.budgetedTrace.memoryContext.dropped.map((hit) => hit.id)).toContain("semantic-low");
    expect(result.budgetedTrace.options).toHaveLength(3);
    expect(result.budgetedTrace.tradeoffScores[0].score).toBeGreaterThanOrEqual(result.budgetedTrace.tradeoffScores.at(-1)?.score ?? 0);
    expect(result.budgetedTrace.decision.selectedOptionId).toBe(result.budgetedTrace.tradeoffScores[0].optionId);
  });

  it("pauses for explicit approval when policy classifies the action as review risk", async () => {
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([]),
      planner: { plan: async () => plan({ policyAction: { id: "policy-action-install", kind: "command", summary: "Install packages", command: "bun install" } }) },
      gateway: {
        execute: async () => {
          throw new Error("gateway should not execute before approval");
        },
      },
    });

    const result = await kernel.runTask({
      runId: "run-approval",
      taskId: "task-approval",
      workspaceId: "workspace-1",
      goal: "Install dependencies",
      constraints: [],
      maxSteps: 3,
    });

    expect(result.status).toBe("waiting_for_user");
    expect(result.phases).toEqual(["observe", "retrieve", "plan", "gate"]);
    expect(result.approvalRequests[0]).toMatchObject({
      actionId: "action-read-repo",
      risk: "high",
      reason: expect.stringContaining("approval"),
    });
    expect(result.gatewayResults).toHaveLength(0);
  });

  it("blocks disallowed actions before gateway execution", async () => {
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([]),
      planner: { plan: async () => plan({ policyAction: { id: "policy-action-delete", kind: "command", summary: "Delete everything", command: "rm -rf ." } }) },
      gateway: {
        execute: async () => {
          throw new Error("blocked action should not execute");
        },
      },
    });

    const result = await kernel.runTask({
      runId: "run-blocked",
      taskId: "task-blocked",
      workspaceId: "workspace-1",
      goal: "Delete repository",
      constraints: [],
      maxSteps: 3,
    });

    expect(result.status).toBe("blocked");
    expect(result.actionDecisions[0]).toMatchObject({ decision: "block", risk: "blocked" });
    expect(result.gatewayResults).toHaveLength(0);
  });

  it("recovers from a predictive mismatch with a recovery action", async () => {
    let calls = 0;
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([]),
      planner: {
        plan: async () => plan({ id: "action-check-value", expectedObservation: "value updated" }),
        recover: async () => plan({ id: "action-recheck-value", expectedObservation: "value updated", summary: "Recheck after mismatch" }),
      },
      gateway: {
        execute: async (action) => {
          calls += 1;
          return {
            actionId: action.id,
            observation: calls === 1 ? "value unchanged" : "value updated",
            evidence: [{ id: `evidence-${calls}`, kind: "trace", label: `Observation ${calls}` }],
          };
        },
      },
    });

    const result = await kernel.runTask({
      runId: "run-recovery",
      taskId: "task-recovery",
      workspaceId: "workspace-1",
      goal: "Update value",
      constraints: [],
      maxSteps: 5,
    });

    expect(result.status).toBe("completed");
    expect(result.retryCount).toBe(1);
    expect(result.phases).toContain("recover");
    expect(result.verifications.map((verification) => verification.status)).toEqual(["fail", "pass"]);
  });

  it("asks the user when planner uncertainty is too high", async () => {
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([]),
      planner: {
        plan: async () =>
          plan({
            confidence: 0.22,
            uncertaintyScore: 0.91,
            openQuestion: "Which repository should I use?",
          }),
      },
      gateway: {
        execute: async () => {
          throw new Error("uncertain action should not execute");
        },
      },
    });

    const result = await kernel.runTask({
      runId: "run-uncertain",
      taskId: "task-uncertain",
      workspaceId: "workspace-1",
      goal: "Fix it",
      constraints: [],
      maxSteps: 3,
    });

    expect(result.status).toBe("waiting_for_user");
    expect(result.openQuestions).toEqual(["Which repository should I use?"]);
    expect(result.phases).toEqual(["observe", "retrieve", "plan", "ask"]);
  });

  it("terminates when recovery exceeds the loop budget", async () => {
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([]),
      planner: {
        plan: async () => plan({ id: "action-loop", expectedObservation: "done" }),
        recover: async () => plan({ id: "action-loop-recovery", expectedObservation: "done" }),
      },
      gateway: {
        execute: async (action) => ({
          actionId: action.id,
          observation: "still not done",
          evidence: [{ id: "evidence-loop", kind: "trace", label: "Loop observation" }],
        }),
      },
    });

    const result = await kernel.runTask({
      runId: "run-loop",
      taskId: "task-loop",
      workspaceId: "workspace-1",
      goal: "Finish impossible task",
      constraints: [],
      maxSteps: 1,
    });

    expect(result.status).toBe("failed");
    expect(result.stopReason).toBe("loop_budget_exceeded");
    expect(result.retryCount).toBe(1);
  });
});

const runtimeBudget: CognitiveRuntimeBudgetV1 = {
  maxSteps: 3,
  maxWallTimeMs: 30_000,
  maxModelTokens: 1_000,
  maxUsd: 1,
  stopOnBudgetExceeded: true,
};

function runtimeOptions(
  overrides: Partial<CognitiveRuntimeOptionsV1> = {},
): CognitiveRuntimeOptionsV1 {
  return {
    policy,
    observer: {
      observe: async () => ({
        summary: "Repository state observed.",
        evidenceRefs: ["observation-1"],
        usage: { elapsedMs: 5 },
      }),
    },
    memoryProvider: {
      retrieve: async () => ({
        hits: [
          {
            id: "memory-1",
            kind: "episodic",
            summary: "Prior run used a focused repository check.",
            relevance: 0.9,
          },
        ],
        usage: { modelTokens: 10 },
      }),
    },
    planner: {
      plan: async () => ({
        action: plan(),
        usage: { modelTokens: 20, estimatedUsd: 0.01 },
      }),
    },
    gateway: {
      execute: async ({ action }) => ({
        result: {
          actionId: action.id,
          observation: "working tree clean",
          evidence: [
            {
              id: "gateway-evidence-1",
              kind: "command_log",
              label: "Repository status",
            },
          ],
        },
        usage: { elapsedMs: 10, toolCalls: 1 },
      }),
    },
    verifier: {
      verify: async ({ action, gatewayResult }) => ({
        verification: {
          actionId: action.id,
          status:
            gatewayResult.observation === action.expectedObservation
              ? "pass"
              : "fail",
          expectedObservation: action.expectedObservation,
          actualObservation: gatewayResult.observation,
          evidence: gatewayResult.evidence,
        },
        usage: { elapsedMs: 2 },
      }),
    },
    learner: {
      learn: async () => ({
        summary: "Created a source-backed learning candidate.",
        evidenceRefs: ["learning-candidate-1"],
      }),
    },
    now: () => "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

function runtimeInput(
  budget: CognitiveRuntimeBudgetV1 = runtimeBudget,
) {
  return {
    runId: "runtime-run-1",
    taskId: "runtime-task-1",
    workspaceId: "workspace-1",
    goal: "Inspect repository status",
    constraints: ["Do not mutate files"],
    budget,
  };
}

describe("CognitiveRuntimeV1", () => {
  it("runs a safe repository action from observation through durable completion events", async () => {
    const persistedEvents: string[] = [];
    const runtime = new CognitiveRuntimeV1(
      runtimeOptions({
        eventSink: {
          append: async (event) => {
            persistedEvents.push(event.eventType);
          },
        },
      }),
    );

    const checkpoint = await runtime.start(runtimeInput());

    expect(checkpoint).toMatchObject({
      schemaVersion: 1,
      status: "completed",
      phase: "summarize",
      usage: {
        stepCount: 1,
        elapsedMs: 17,
        modelTokens: 30,
        estimatedUsd: 0.01,
        toolCalls: 1,
      },
      learningSummary: "Created a source-backed learning candidate.",
    });
    expect(checkpoint.events.map((event) => event.eventType)).toEqual([
      "runtime.started",
      "observation.captured",
      "usage.recorded",
      "memory.retrieved",
      "usage.recorded",
      "plan.created",
      "usage.recorded",
      "policy.decided",
      "usage.recorded",
      "execution.prepared",
      "action.dispatched",
      "action.executed",
      "usage.recorded",
      "verification.completed",
      "usage.recorded",
      "learning.completed",
      "run.completed",
    ]);
    expect(persistedEvents).toEqual(
      checkpoint.events.map((event) => event.eventType),
    );
    expect(
      checkpoint.events.every(
        (event, index) =>
          event.sequence === index + 1 &&
          event.checkpointRevision === index + 1,
      ),
    ).toBe(true);
  });

  it("suspends for approval and resumes exactly once with matching nonce and revision", async () => {
    let gatewayCalls = 0;
    const options = runtimeOptions({
      planner: {
        plan: async () => ({
          action: plan({
            policyAction: {
              id: "policy-action-install",
              kind: "command",
              summary: "Install dependencies",
              command: "bun install",
            },
            expectedObservation: "working tree clean",
          }),
        }),
      },
      gateway: {
        execute: async ({ action }) => {
          gatewayCalls += 1;
          return {
            result: {
              actionId: action.id,
              observation: "working tree clean",
              evidence: [],
            },
          };
        },
      },
      approvalNonceFactory: ({ revision }) => `nonce-${revision}`,
    });
    const runtime = new CognitiveRuntimeV1(options);

    const waiting = await runtime.start(runtimeInput());

    expect(waiting.status).toBe("waiting_for_approval");
    expect(waiting.approval).toMatchObject({
      status: "pending",
      nonce: `nonce-${waiting.revision}`,
      requestedRevision: waiting.revision,
    });
    expect(gatewayCalls).toBe(0);

    const resumeInput = {
      runId: waiting.runId,
      taskId: waiting.taskId,
      approvalId: waiting.approval!.id,
      approvalNonce: waiting.approval!.nonce,
      expectedRevision: waiting.revision,
      decision: "approved" as const,
    };
    const completed = await runtime.resume(waiting, resumeInput);

    expect(completed.status).toBe("completed");
    expect(completed.approval?.status).toBe("approved");
    expect(completed.events.map((event) => event.eventType)).toContain(
      "approval.approved",
    );
    expect(gatewayCalls).toBe(1);
    await expect(runtime.resume(waiting, resumeInput)).rejects.toThrow(
      "already been consumed",
    );
  });

  it("rejects stale or mismatched approval continuations before execution", async () => {
    let gatewayCalls = 0;
    const runtime = new CognitiveRuntimeV1(
      runtimeOptions({
        planner: {
          plan: async () => ({
            action: plan({
              policyAction: {
                id: "policy-action-install",
                kind: "command",
                summary: "Install dependencies",
                command: "bun install",
              },
            }),
          }),
        },
        gateway: {
          execute: async ({ action }) => {
            gatewayCalls += 1;
            return {
              result: {
                actionId: action.id,
                observation: "working tree clean",
                evidence: [],
              },
            };
          },
        },
      }),
    );
    const waiting = await runtime.start(runtimeInput());

    await expect(
      runtime.resume(waiting, {
        runId: waiting.runId,
        taskId: waiting.taskId,
        approvalId: waiting.approval!.id,
        approvalNonce: "wrong-nonce",
        expectedRevision: waiting.revision,
        decision: "approved",
      }),
    ).rejects.toThrow("does not match");
    await expect(
      runtime.resume(waiting, {
        runId: waiting.runId,
        taskId: waiting.taskId,
        approvalId: waiting.approval!.id,
        approvalNonce: waiting.approval!.nonce,
        expectedRevision: waiting.revision - 1,
        decision: "approved",
      }),
    ).rejects.toThrow("revision is stale");
    expect(gatewayCalls).toBe(0);
  });

  it("stops before gateway execution when accumulated model usage exceeds budget", async () => {
    let gatewayCalls = 0;
    const runtime = new CognitiveRuntimeV1(
      runtimeOptions({
        planner: {
          plan: async () => ({
            action: plan(),
            usage: { modelTokens: 51, estimatedUsd: 0.02 },
          }),
        },
        gateway: {
          execute: async ({ action }) => {
            gatewayCalls += 1;
            return {
              result: {
                actionId: action.id,
                observation: "working tree clean",
                evidence: [],
              },
            };
          },
        },
      }),
    );

    const checkpoint = await runtime.start(
      runtimeInput({
        ...runtimeBudget,
        maxModelTokens: 50,
      }),
    );

    expect(checkpoint.status).toBe("budget_exceeded");
    expect(checkpoint.usage.modelTokens).toBe(61);
    expect(checkpoint.events.at(-1)?.eventType).toBe("budget.exceeded");
    expect(gatewayCalls).toBe(0);
  });

  it("uses cryptographically random approval nonces by default", async () => {
    const approvalOptions = runtimeOptions({
      planner: {
        plan: async () => ({
          action: plan({
            policyAction: {
              id: "policy-action-install",
              kind: "command",
              summary: "Install dependencies",
              command: "bun install",
            },
          }),
        }),
      },
    });

    const first = await new CognitiveRuntimeV1(approvalOptions).start(runtimeInput());
    const second = await new CognitiveRuntimeV1(approvalOptions).start(runtimeInput());

    expect(first.approval?.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.approval?.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.approval?.nonce).not.toBe(second.approval?.nonce);
  });

  it("uses checkpoint CAS to reject approval replay across runtime instances", async () => {
    let persisted: CognitiveRunCheckpointV1 | null = null;
    let gatewayCalls = 0;
    const checkpointSink = {
      create: (checkpoint: CognitiveRunCheckpointV1) => {
        if (persisted) {
          throw new Error("checkpoint already exists");
        }
        persisted = structuredClone(checkpoint);
      },
      compareAndSwap: (
        checkpoint: CognitiveRunCheckpointV1,
        expectedRevision: number,
      ) => {
        if (!persisted || persisted.revision !== expectedRevision) {
          throw new Error("stale checkpoint revision");
        }
        persisted = structuredClone(checkpoint);
      },
    };
    const options = runtimeOptions({
      checkpointSink,
      approvalNonceFactory: () => "persisted-nonce",
      planner: {
        plan: async () => ({
          action: plan({
            policyAction: {
              id: "policy-action-install",
              kind: "command",
              summary: "Install dependencies",
              command: "bun install",
            },
          }),
        }),
      },
      gateway: {
        execute: async ({ action }) => {
          gatewayCalls += 1;
          return {
            result: {
              actionId: action.id,
              observation: "working tree clean",
              evidence: [],
            },
          };
        },
      },
    });
    const firstRuntime = new CognitiveRuntimeV1(options);
    const waiting = await firstRuntime.start(runtimeInput());
    const resumeInput = {
      runId: waiting.runId,
      taskId: waiting.taskId,
      approvalId: waiting.approval!.id,
      approvalNonce: waiting.approval!.nonce,
      expectedRevision: waiting.revision,
      decision: "approved" as const,
    };

    await new CognitiveRuntimeV1(options).resume(waiting, resumeInput);
    await expect(firstRuntime.resume(waiting, resumeInput)).rejects.toThrow(
      "stale checkpoint revision",
    );
    expect(gatewayCalls).toBe(1);
  });

  it("cancels a waiting approval without allowing later execution", async () => {
    let gatewayCalls = 0;
    const runtime = new CognitiveRuntimeV1(runtimeOptions({
      planner: {
        plan: async () => ({
          action: plan({
            policyAction: {
              id: "policy-action-install",
              kind: "command",
              summary: "Install dependencies",
              command: "bun install",
            },
          }),
        }),
      },
      gateway: {
        execute: async ({ action }) => {
          gatewayCalls += 1;
          return {
            result: {
              actionId: action.id,
              observation: "working tree clean",
              evidence: [],
            },
          };
        },
      },
    }));
    const waiting = await runtime.start(runtimeInput());
    const cancelled = await runtime.cancel(waiting, {
      runId: waiting.runId,
      taskId: waiting.taskId,
      expectedRevision: waiting.revision,
      reason: "Operator changed intent",
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.approval?.status).toBe("cancelled");
    expect(cancelled.events.at(-1)?.eventType).toBe("run.cancelled");
    await expect(runtime.resume(cancelled, {
      runId: cancelled.runId,
      taskId: cancelled.taskId,
      approvalId: waiting.approval!.id,
      approvalNonce: waiting.approval!.nonce,
      expectedRevision: cancelled.revision,
      decision: "approved",
    })).rejects.toThrow("not waiting");
    expect(gatewayCalls).toBe(0);
  });

  it("fails closed as execution in doubt when gateway dispatch has no result", async () => {
    const runtime = new CognitiveRuntimeV1(runtimeOptions({
      gateway: {
        execute: async () => {
          throw new Error("connection dropped after dispatch");
        },
      },
    }));

    const checkpoint = await runtime.start(runtimeInput());

    expect(checkpoint.status).toBe("execution_in_doubt");
    expect(checkpoint.executionAttempt).toMatchObject({
      status: "in_doubt",
      idempotencyKey: expect.stringContaining(checkpoint.runId),
    });
    expect(checkpoint.events.slice(-3).map((event) => event.eventType)).toEqual([
      "execution.prepared",
      "action.dispatched",
      "run.execution_in_doubt",
    ]);
    expect(checkpoint.gatewayResults).toHaveLength(0);
  });

  it("recovers only a durably prepared attempt and never re-dispatches an uncertain one", async () => {
    let gatewayCalls = 0;
    const runtime = new CognitiveRuntimeV1(runtimeOptions({
      gateway: {
        execute: async ({ action }) => {
          gatewayCalls += 1;
          return {
            result: {
              actionId: action.id,
              observation: "working tree clean",
              evidence: [],
            },
          };
        },
      },
    }));
    const completed = await runtime.start(runtimeInput());
    const prepared = structuredClone(completed);
    prepared.status = "running";
    prepared.phase = "execute";
    prepared.pendingAction = structuredClone(prepared.actionPlans[0]!);
    prepared.gatewayResults = [];
    prepared.verifications = [];
    prepared.executionAttempt = {
      ...prepared.executionAttempt!,
      status: "prepared",
      dispatchedRevision: undefined,
      completedRevision: undefined,
    };
    gatewayCalls = 0;

    const recovered = await runtime.recover(prepared, {
      runId: prepared.runId,
      taskId: prepared.taskId,
      expectedRevision: prepared.revision,
    });
    expect(recovered.status).toBe("completed");
    expect(gatewayCalls).toBe(1);

    const dispatched = structuredClone(prepared);
    dispatched.executionAttempt!.status = "dispatched";
    const uncertain = await runtime.recover(dispatched, {
      runId: dispatched.runId,
      taskId: dispatched.taskId,
      expectedRevision: dispatched.revision,
    });
    expect(uncertain.status).toBe("execution_in_doubt");
    expect(gatewayCalls).toBe(1);
  });
});

describe("cognitive checkpoint v1 codec", () => {
  it("rejects unknown nested fields and inconsistent terminal state", async () => {
    const checkpoint = await new CognitiveRuntimeV1(runtimeOptions()).start(runtimeInput());
    const withUnknownField = structuredClone(checkpoint) as CognitiveRunCheckpointV1 & {
      budget: CognitiveRunCheckpointV1["budget"] & { unexpected: boolean };
    };
    withUnknownField.budget.unexpected = true;
    expect(() => parseCognitiveRunCheckpointV1(withUnknownField)).toThrow(
      "checkpoint.budget has unexpected or missing fields",
    );

    const inconsistent = structuredClone(checkpoint);
    inconsistent.status = "completed";
    inconsistent.pendingAction = null;
    inconsistent.verifications = [];
    expect(() => parseCognitiveRunCheckpointV1(inconsistent)).toThrow(
      "completed checkpoint requires final verifier pass",
    );
  });
});
