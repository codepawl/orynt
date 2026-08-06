import { describe, expect, it, vi } from "bun:test";

import {
  buildRepositoryTaskPlan,
  RepositoryTaskExecutionError,
  runRepositoryTaskPlan,
  verifyRepositoryTaskPlanDigest,
} from "./taskPlanner";
import type {
  RepositoryRequirementCoverageV1,
  RepositorySemanticTaskV1,
  RepositoryTaskPlanV1,
  RepositoryTaskResultV1,
} from "@codepawl/shared";

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for task planner concurrency state");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function buildPlan(): RepositoryTaskPlanV1 {
  return buildRepositoryTaskPlan({
    requestId: "request-1",
    goal: "Implement API and UI support.",
    sourcePrompt: "Implement API and UI support without changing lockfiles.",
    maxModelTokens: 20_000,
    maxWallTimeMs: 60_000,
    now: () => "2026-08-02T00:00:00.000Z",
    candidate: {
      summary: "Implement API before UI.",
      requirements: [
        {
          id: "api",
          text: "Implement API support.",
          source: "user_prompt",
          kind: "outcome",
          required: true,
        },
        {
          id: "ui",
          text: "Implement UI support.",
          source: "user_prompt",
          kind: "outcome",
          required: true,
        },
      ],
      tasks: [
        {
          id: "api-task",
          title: "Implement API",
          instruction: "Implement API support.",
          kind: "change",
          dependencies: [],
          requirementIds: ["api"],
          authority: "single_writer",
          operations: ["write"],
          expectedPaths: ["src/api.ts"],
          doneWhen: ["API support is implemented."],
          evidence: [
            {
              id: "api-diff",
              requirementIds: ["api"],
              kind: "diff",
              description: "Inspect API diff.",
              path: "src/api.ts",
            },
          ],
        },
        {
          id: "ui-task",
          title: "Implement UI",
          instruction: "Implement UI support after API support.",
          kind: "change",
          dependencies: ["api-task"],
          requirementIds: ["ui"],
          authority: "single_writer",
          operations: ["write"],
          expectedPaths: ["src/ui.ts"],
          doneWhen: ["UI support is implemented."],
          evidence: [
            {
              id: "ui-diff",
              requirementIds: ["ui"],
              kind: "diff",
              description: "Inspect UI diff.",
              path: "src/ui.ts",
            },
          ],
        },
      ],
      allowedOperations: ["read", "write"],
    },
  });
}

function successfulResult(task: RepositorySemanticTaskV1): RepositoryTaskResultV1 {
  const artifactRefs = task.evidence.map(
    (evidence) => "artifact:" + task.id + ":" + evidence.id,
  );
  return {
    taskId: task.id,
    summary: task.title,
    artifactRefs,
    evidence: task.evidence.map((evidence, index) => ({
      id: evidence.id,
      requirementIds: [...evidence.requirementIds],
      kind: evidence.kind,
      status: "pass" as const,
      summary: "Recorded " + evidence.description,
      artifactRefs: [artifactRefs[index]!],
      ...(evidence.command === undefined ? {} : { command: evidence.command }),
      ...(evidence.path === undefined ? {} : { path: evidence.path }),
    })),
    changedPaths:
      task.authority === "single_writer" ? [...task.expectedPaths] : [],
  };
}

function covered(plan: RepositoryTaskPlanV1): RepositoryRequirementCoverageV1 {
  return {
    schemaVersion: 1,
    passed: true,
    coveredRequirementIds: plan.requirements.map((requirement) => requirement.id),
    missingRequirementIds: [],
    records: plan.requirements.map((requirement) => {
      const task = plan.tasks.find((candidate) =>
        candidate.requirementIds.includes(requirement.id),
      )!;
      const evidence = task.evidence.find((candidate) =>
        candidate.requirementIds.includes(requirement.id),
      )!;
      return {
        requirementId: requirement.id,
        status: "covered" as const,
        summary: "Evidence recorded.",
        evidence: [{ taskId: task.id, evidenceId: evidence.id }],
        artifactRefs: ["artifact:" + task.id + ":" + evidence.id],
      };
    }),
    summary: "covered",
    artifactRefs: ["artifact:coverage"],
  };
}

describe("repository task planner", () => {
  it("builds and verifies immutable approval material", () => {
    const plan = buildPlan();
    expect(plan.pathEnvelope).toEqual(["src/api.ts", "src/ui.ts"]);
    expect(() => verifyRepositoryTaskPlanDigest(plan)).not.toThrow();
    plan.summary = "tampered";
    expect(() => verifyRepositoryTaskPlanDigest(plan)).toThrow(
      "digest does not match",
    );
  });

  it("runs dependent writer tasks sequentially and verifies coverage", async () => {
    const order: string[] = [];
    const result = await runRepositoryTaskPlan({
      plan: buildPlan(),
      callbacks: {
        invoke: async ({ task, dependencyResults }) => {
          order.push(task.id);
          if (task.id === "ui-task") {
            expect(dependencyResults.map(({ taskId }) => taskId)).toEqual([
              "api-task",
            ]);
          }
          return successfulResult(task);
        },
        verifyCoverage: async ({ plan }) => covered(plan),
      },
    });
    expect(order).toEqual(["api-task", "ui-task"]);
    expect(result.status).toBe("pass");
    expect(result.executions.map(({ status }) => status)).toEqual([
      "completed",
      "completed",
    ]);
  });

  it("fails closed when coverage omits a requirement", async () => {
    const result = await runRepositoryTaskPlan({
      plan: buildPlan(),
      callbacks: {
        invoke: async ({ task }) => successfulResult(task),
        verifyCoverage: async ({ plan }) => {
          const value = covered(plan);
          value.passed = false;
          value.records[1] = {
            requirementId: "ui",
            status: "missing",
            summary: "No UI verification.",
            evidence: [],
            artifactRefs: [],
          };
          value.coveredRequirementIds = ["api"];
          value.missingRequirementIds = ["ui"];
          return value;
        },
      },
    });
    expect(result.status).toBe("fail");
    expect(result.coverage.missingRequirementIds).toEqual(["ui"]);
    expect(result.failure?.kind).toBe("verification");
  });

  it("retries only a typed retryable failure with a fresh attempt id", async () => {
    const attempts: Array<{ taskId: string; attemptId: string; retryIndex: number }> = [];
    const result = await runRepositoryTaskPlan({
      plan: buildPlan(),
      callbacks: {
        invoke: async ({ task, attemptId, retryIndex }) => {
          attempts.push({ taskId: task.id, attemptId, retryIndex });
          if (task.id === "api-task" && retryIndex === 0) {
            throw new RepositoryTaskExecutionError({
              kind: "provider_transient",
              message: "transient failure",
              retryable: true,
              artifactRefs: ["artifact:transient"],
            });
          }
          return successfulResult(task);
        },
        verifyCoverage: async ({ plan }) => covered(plan),
      },
    });

    expect(result.status).toBe("pass");
    expect(attempts.slice(0, 2).map(({ taskId, retryIndex }) => [
      taskId,
      retryIndex,
    ])).toEqual([
      ["api-task", 0],
      ["api-task", 1],
    ]);
    expect(attempts[0]!.attemptId).not.toBe(attempts[1]!.attemptId);
  });

  it("returns durable records for a terminal task failure", async () => {
    const result = await runRepositoryTaskPlan({
      plan: buildPlan(),
      callbacks: {
        invoke: async ({ task }) => {
          if (task.id === "api-task") {
            throw new RepositoryTaskExecutionError({
              kind: "scope",
              message: "unexpected write outside scope",
              retryable: false,
              artifactRefs: ["artifact:scope"],
            });
          }
          return successfulResult(task);
        },
        verifyCoverage: async ({ plan }) => covered(plan),
      },
    });

    expect(result.status).toBe("fail");
    expect(result.failedTaskId).toBe("api-task");
    expect(result.failure?.kind).toBe("scope");
    expect(result.executions.some((record) =>
      record.taskId === "api-task" && record.status === "failed")).toBe(true);
    expect(result.executions.some((record) =>
      record.taskId === "ui-task" && record.status === "blocked")).toBe(true);
  });

  it("caps ready read-only work at two concurrent tasks", async () => {
    const plan = buildRepositoryTaskPlan({
      requestId: "read-plan",
      goal: "Inspect three independent files.",
      sourcePrompt: "Inspect three independent files.",
      maxModelTokens: 20_000,
      maxWallTimeMs: 60_000,
      candidate: {
        summary: "Bounded parallel inspection.",
        requirements: [
          {
            id: "inspection",
            text: "Inspect every requested file.",
            source: "user_prompt",
            kind: "validation",
            required: true,
          },
        ],
        tasks: ["a", "b", "c"].map((id) => ({
          id,
          title: "Inspect " + id,
          instruction: "Read one bounded file.",
          kind: "validation" as const,
          dependencies: [],
          requirementIds: ["inspection"],
          authority: "read_only" as const,
          operations: ["read" as const],
          expectedPaths: [],
          readPaths: ["src/" + id + ".ts"],
          doneWhen: ["Inspection evidence is recorded."],
          evidence: [
            {
              id: id + "-review",
              requirementIds: ["inspection"],
              kind: "semantic_review" as const,
              description: "Review " + id,
            },
          ],
        })),
        allowedOperations: ["read"],
      },
    });
    let active = 0;
    let highestActive = 0;
    const release: Array<() => void> = [];
    const resultPromise = runRepositoryTaskPlan({
      plan,
      callbacks: {
        invoke: async ({ task }) => {
          active += 1;
          highestActive = Math.max(highestActive, active);
          await new Promise<void>((resolve) => release.push(resolve));
          active -= 1;
          return successfulResult(task);
        },
        verifyCoverage: async ({ plan: activePlan }) => {
          const task = activePlan.tasks[0]!;
          return {
            schemaVersion: 1,
            passed: true,
            coveredRequirementIds: ["inspection"],
            missingRequirementIds: [],
            records: [
              {
                requirementId: "inspection",
                status: "covered" as const,
                summary: "All read-only reviews completed.",
                evidence: activePlan.tasks.map((item) => ({
                  taskId: item.id,
                  evidenceId: item.evidence[0]!.id,
                })),
                artifactRefs: activePlan.tasks.map(
                  (item) => "artifact:" + item.id + ":" + item.evidence[0]!.id,
                ),
              },
            ],
            summary: "covered",
            artifactRefs: ["artifact:coverage"],
          };
        },
      },
    });
    await waitFor(() => release.length === 2);
    release.splice(0).forEach((resolve) => resolve());
    await waitFor(() => release.length === 1);
    release.splice(0).forEach((resolve) => resolve());
    const result = await resultPromise;
    expect(highestActive).toBe(2);
    expect(result.status).toBe("pass");
  });

  it("propagates cancellation before dispatching dependent work", async () => {
    const controller = new AbortController();
    const invoke = vi.fn(async () => {
      controller.abort();
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    });
    const result = await runRepositoryTaskPlan({
      plan: buildPlan(),
      signal: controller.signal,
      callbacks: {
        invoke,
        verifyCoverage: async ({ plan }) => covered(plan),
      },
    });
    expect(result.status).toBe("cancelled");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.executions.some((record) =>
      record.taskId === "ui-task" && record.status === "cancelled")).toBe(true);
  });
});
