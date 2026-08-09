import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createConservativeCodingApprenticePolicy } from "@codepawl/shared";
import { afterEach, describe, expect, it } from "bun:test";

import { runRepositoryActionWithCognitiveRuntime } from "./repositoryRuntime";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("repository cognitive runtime integration", () => {
  it("persists approval before dispatch and redacts the private nonce", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-repository-runtime-"));
    temporaryRoots.push(root);
    const order: string[] = [];
    const policy = createConservativeCodingApprenticePolicy(
      path.join(root, "repo"),
      path.join(root, "sandbox"),
    );

    const result = await runRepositoryActionWithCognitiveRuntime({
      runId: "run-approved",
      taskId: "task-approved",
      workspaceId: "workspace-approved",
      goal: "Apply a repository change",
      constraints: ["repository only"],
      budget: {
        maxSteps: 4,
        maxWallTimeMs: 30_000,
        maxModelTokens: 1_000,
        stopOnBudgetExceeded: true,
      },
      policy,
      stateRoot: root,
      memoryHits: [],
      action: {
        id: "action-approved",
        summary: "Run controlled repository executor",
        policyAction: {
          id: "policy-action-approved",
          kind: "command",
          summary: "Run controlled repository executor",
          command: "codex exec",
        },
        expectedObservation: "execution finished",
        confidence: 0.9,
        uncertaintyScore: 0.1,
      },
      authorize: async () => {
        order.push("approved");
        return "approved";
      },
      execute: async () => {
        order.push("executed");
        return { observation: "execution finished", evidence: [] };
      },
      verify: async ({ action, execution }) => {
        order.push("verified");
        return {
          actionId: action.id,
          status: "pass",
          expectedObservation: action.expectedObservation,
          actualObservation: execution.observation,
          evidence: execution.evidence,
        };
      },
      learn: async () => {
        order.push("learned");
        return {
          summary: "Verifier-backed repository memory persisted.",
          evidenceRefs: ["file:///managed/memory.json"],
        };
      },
    });

    expect(order).toEqual(["approved", "executed", "verified", "learned"]);
    expect(result.checkpoint.status).toBe("completed");
    expect(result.checkpoint.approval?.nonce).toBeTruthy();
    expect(result.trace.approval).not.toHaveProperty("nonce");
    expect(JSON.stringify(result.trace)).not.toContain(
      result.checkpoint.approval?.nonce,
    );
    const persisted = JSON.parse(
      await readFile(
        path.join(root, "runs", "run-approved", "checkpoint.json"),
        "utf8",
      ),
    );
    expect(persisted.executionAttempt.status).toBe("completed");
  });

  it("does not dispatch when explicit approval is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-repository-runtime-"));
    temporaryRoots.push(root);
    let executed = false;
    const policy = createConservativeCodingApprenticePolicy(
      path.join(root, "repo"),
      path.join(root, "sandbox"),
    );

    await expect(
      runRepositoryActionWithCognitiveRuntime({
        runId: "run-no-approval",
        taskId: "task-no-approval",
        workspaceId: "workspace-no-approval",
        goal: "Apply a repository change",
        constraints: [],
        budget: {
          maxSteps: 4,
          maxWallTimeMs: 30_000,
          maxModelTokens: 1_000,
          stopOnBudgetExceeded: true,
        },
        policy,
        stateRoot: root,
        memoryHits: [],
        action: {
          id: "action-no-approval",
          summary: "Run controlled repository executor",
          policyAction: {
            id: "policy-action-no-approval",
            kind: "command",
            summary: "Run controlled repository executor",
            command: "codex exec",
          },
          expectedObservation: "execution finished",
          confidence: 0.9,
          uncertaintyScore: 0.1,
        },
        execute: async () => {
          executed = true;
          return { observation: "execution finished", evidence: [] };
        },
        verify: async ({ action, execution }) => ({
          actionId: action.id,
          status: "pass",
          expectedObservation: action.expectedObservation,
          actualObservation: execution.observation,
          evidence: execution.evidence,
        }),
      }),
    ).rejects.toThrow("requires explicit approval");
    expect(executed).toBe(false);
  });

  it("cannot complete or learn when the independent verifier fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-repository-runtime-"));
    temporaryRoots.push(root);
    let learned = false;
    const policy = createConservativeCodingApprenticePolicy(
      path.join(root, "repo"),
      path.join(root, "sandbox"),
    );
    const result = await runRepositoryActionWithCognitiveRuntime({
      runId: "run-verifier-fail",
      taskId: "task-verifier-fail",
      workspaceId: "workspace-verifier-fail",
      goal: "Apply a repository change",
      constraints: ["repository only"],
      budget: {
        maxSteps: 4,
        maxWallTimeMs: 30_000,
        maxModelTokens: 1_000,
        stopOnBudgetExceeded: true,
      },
      policy,
      stateRoot: root,
      memoryHits: [],
      action: {
        id: "action-verifier-fail",
        summary: "Run controlled repository executor",
        policyAction: {
          id: "policy-action-verifier-fail",
          kind: "command",
          summary: "Run controlled repository executor",
          command: "codex exec",
        },
        expectedObservation: "verified repository change",
        confidence: 0.9,
        uncertaintyScore: 0.1,
      },
      authorize: async () => "approved",
      execute: async () => ({
        observation: "gateway execution finished",
        evidence: [],
      }),
      verify: async ({ action, execution }) => ({
        actionId: action.id,
        status: "fail",
        expectedObservation: action.expectedObservation,
        actualObservation: execution.observation,
        evidence: execution.evidence,
      }),
      learn: async () => {
        learned = true;
        return { summary: "must not run" };
      },
    });
    expect(result.checkpoint.status).toBe("failed");
    expect(result.checkpoint.events.some((event) => event.eventType === "run.completed")).toBe(false);
    expect(result.checkpoint.events.some((event) => event.eventType === "learning.completed")).toBe(false);
    expect(learned).toBe(false);
  });
});
