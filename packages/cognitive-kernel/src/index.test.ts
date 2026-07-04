import { describe, expect, it } from "vitest";
import { createConservativeCodingApprenticePolicy } from "@codepawl/shared";

import { DeterministicCognitiveKernel, StaticMemoryProvider, type KernelActionPlan } from "./index";

const policy = createConservativeCodingApprenticePolicy("/repo/codepawl", "/tmp/codepawl-worktree");

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
  });

  it("pauses for explicit approval when policy classifies the action as review risk", async () => {
    const kernel = new DeterministicCognitiveKernel({
      policy,
      memoryProvider: new StaticMemoryProvider([]),
      planner: { plan: async () => plan({ policyAction: { id: "policy-action-install", kind: "command", summary: "Install packages", command: "pnpm install" } }) },
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
