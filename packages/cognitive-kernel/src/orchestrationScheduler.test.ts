import { describe, expect, it, vi } from "vitest";

import {
  createOrchestrationPreset,
  resolveOrchestrationProfile,
  type OrchestrationChildTask,
  type OrchestrationPlan,
} from "@codepawl/shared";

import { runAdaptiveOrchestration } from "./orchestrationScheduler";

const catalog = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
].map((id) => ({
  id,
  supportedThinkingEfforts: [
    "low" as const,
    "medium" as const,
    "high" as const,
    "xhigh" as const,
  ],
}));

function task(
  id: string,
  role: OrchestrationChildTask["role"],
  authority: OrchestrationChildTask["authority"],
  dependencies: string[] = [],
): OrchestrationChildTask {
  return {
    id,
    role,
    title: id,
    instruction: `Run ${id}`,
    dependencies,
    authority,
    expectedPaths: [],
    expectedArtifacts: [],
    depth: 1,
  };
}

function plan(tasks: OrchestrationChildTask[]): OrchestrationPlan {
  return {
    schemaVersion: 1,
    id: "plan-1",
    runId: "run-1",
    parentTaskId: "parent-1",
    summary: "bounded plan",
    tasks,
    createdAt: "2026-07-29T00:00:00.000Z",
  };
}

describe("adaptive orchestration scheduler", () => {
  it("runs read-only helpers before the only writer and leaves pass authority to verification", async () => {
    const order: string[] = [];
    const profile = resolveOrchestrationProfile(
      createOrchestrationPreset("balanced"),
      catalog,
    );
    const result = await runAdaptiveOrchestration({
      plan: plan([
        task("helper-a", "helper", "read_only"),
        task("helper-b", "helper", "read_only"),
        task(
          "implement",
          "implementer",
          "single_writer",
          ["helper-a", "helper-b"],
        ),
        task("review", "reviewer", "read_only", ["implement"]),
      ]),
      profile,
      callbacks: {
        invoke: async ({ task: child }) => {
          order.push(child.id);
          return {
            taskId: child.id,
            summary: child.title,
            artifactRefs: [`artifact:${child.id}`],
          };
        },
        verify: async () => ({
          passed: true,
          summary: "verified",
          artifactRefs: ["verdict"],
        }),
      },
    });

    expect(new Set(order.slice(0, 2))).toEqual(
      new Set(["helper-a", "helper-b"]),
    );
    expect(order.slice(2)).toEqual(["implement", "review"]);
    expect(result.status).toBe("pass");
    expect(result.invocations).toHaveLength(4);
    expect(
      result.invocations.filter(
        (invocation) => invocation.role === "implementer",
      ),
    ).toHaveLength(1);
  });

  it("allows one verifier-driven recovery and records its parent reviewer invocation", async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce({
        passed: false,
        summary: "failed",
        artifactRefs: ["verdict-1"],
      })
      .mockResolvedValueOnce({
        passed: true,
        summary: "recovered",
        artifactRefs: ["verdict-2"],
      });
    const profile = resolveOrchestrationProfile(
      createOrchestrationPreset("quality"),
      catalog,
    );
    const result = await runAdaptiveOrchestration({
      plan: plan([
        task("implement", "implementer", "single_writer"),
        task("review", "reviewer", "read_only", ["implement"]),
      ]),
      profile,
      callbacks: {
        invoke: async ({ task: child }) => ({
          taskId: child.id,
          summary: child.title,
          artifactRefs: [],
        }),
        verify,
        recover: async () =>
          task("recover", "implementer", "single_writer", ["implement"]),
      },
    });

    expect(result.status).toBe("pass");
    expect(result.recoveryAttempts).toBe(1);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(result.invocations.at(-1)).toMatchObject({
      taskId: "recover",
      retryIndex: 1,
      parentInvocationId: expect.any(String),
    });
  });

  it("propagates cancellation and does not dispatch the writer", async () => {
    const controller = new AbortController();
    const invoked: string[] = [];
    const profile = resolveOrchestrationProfile(
      createOrchestrationPreset("balanced"),
      catalog,
    );
    const result = await runAdaptiveOrchestration({
      plan: plan([
        task("helper", "helper", "read_only"),
        task("implement", "implementer", "single_writer", ["helper"]),
      ]),
      profile,
      signal: controller.signal,
      callbacks: {
        invoke: async ({ task: child }) => {
          invoked.push(child.id);
          controller.abort();
          throw Object.assign(new Error("cancelled"), { name: "AbortError" });
        },
        verify: async () => ({
          passed: true,
          summary: "unreachable",
          artifactRefs: [],
        }),
      },
    });

    expect(result.status).toBe("cancelled");
    expect(invoked).toEqual(["helper"]);
    expect(result.invocations[0]?.status).toBe("cancelled");
  });

  it("rejects recovery that expands the approved writer scope", async () => {
    const profile = resolveOrchestrationProfile(
      createOrchestrationPreset("quality"),
      catalog,
    );
    const writer = {
      ...task("implement", "implementer", "single_writer"),
      expectedPaths: ["src/approved.ts"],
    };
    await expect(
      runAdaptiveOrchestration({
        plan: plan([writer]),
        profile,
        callbacks: {
          invoke: async ({ task: child }) => ({
            taskId: child.id,
            summary: child.title,
            artifactRefs: [],
          }),
          verify: async () => ({
            passed: false,
            summary: "failed",
            artifactRefs: [],
          }),
          recover: async () => ({
            ...task("recover", "implementer", "single_writer", ["implement"]),
            expectedPaths: ["src/unapproved.ts"],
          }),
        },
      }),
    ).rejects.toThrow("cannot expand approved paths");
  });
});
