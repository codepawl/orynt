import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";
import { buildRepositoryTaskPlan } from "@codepawl/cognitive-kernel";

import {
  DesktopRepositoryRuntimeStore,
  cancelDesktopRepositoryRuntime,
  markDesktopRepositoryRuntimeFailed,
  recoverDesktopRepositoryRuntime,
  resumeDesktopRepositoryRuntime,
  startDesktopRepositoryRuntime,
} from "./desktopRuntime";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function request(root: string) {
  return {
    goal: "Implement a bounded repository change",
    taskId: "task-desktop-runtime",
    workspaceId: "workspace-desktop-runtime",
    repositoryPath: path.join(root, "repo"),
    sandboxRoot: path.join(root, "sandboxes"),
    artifactRoot: path.join(root, "artifacts"),
    memoryRoot: path.join(root, "memory"),
    modelConnection: {
      providerId: "codex-cli",
      providerLabel: "Codex CLI",
      modelId: "gpt-test",
      modelLabel: "GPT Test",
      authMethod: "chatgptOAuth",
    },
  } as const;
}

function taskPlan() {
  return buildRepositoryTaskPlan({
    goal: "Implement a bounded repository change",
    sourcePrompt: "Implement a bounded repository change",
    maxModelTokens: 10_000,
    maxWallTimeMs: 60_000,
    candidate: {
      summary: "Implement the bounded change.",
      requirements: [{
        id: "change",
        text: "Implement a bounded repository change",
        source: "user_prompt",
        kind: "outcome",
        required: true,
      }],
      tasks: [{
        id: "change-task",
        title: "Implement change",
        instruction: "Implement the bounded repository change.",
        kind: "change",
        dependencies: [],
        requirementIds: ["change"],
          authority: "single_writer",
          operations: ["write"],
          readPaths: [],
          expectedPaths: ["src/change.ts"],
        doneWhen: ["The bounded change is implemented."],
        evidence: [{
          id: "change-diff",
          requirementIds: ["change"],
          kind: "diff",
          description: "Inspect the bounded diff.",
          path: "src/change.ts",
        }],
      }],
      allowedOperations: ["read", "write"],
    },
  });
}

function plannedRequest(root: string) {
  return { ...request(root), taskPlan: taskPlan() };
}

describe("desktop repository runtime lifecycle", () => {
  it("starts at a durable approval boundary without executing the repository task", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-desktop-runtime-"));
    roots.push(root);
    const stateRoot = path.join(root, "state");

    const snapshot = await startDesktopRepositoryRuntime({
      request: plannedRequest(root),
      stateRoot,
    });

    expect(snapshot.status).toBe("waiting_for_approval");
    expect(snapshot.checkpointRevision).toBe(0);
    expect(snapshot.approval?.status).toBe("pending");
    expect(snapshot.taskPlan?.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(snapshot)).not.toContain("nonce");
    const store = new DesktopRepositoryRuntimeStore({ stateRoot });
    expect((await store.loadCheckpoint(snapshot.runId)).approval?.nonce).toBeTruthy();
    await expect(store.loadResult(snapshot.runId)).resolves.toBeUndefined();
  });

  it("consumes rejection once and rejects stale approval replay", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-desktop-runtime-"));
    roots.push(root);
    const stateRoot = path.join(root, "state");
    const started = await startDesktopRepositoryRuntime({
      request: plannedRequest(root),
      stateRoot,
    });
    const store = new DesktopRepositoryRuntimeStore({ stateRoot });
    const privateCheckpoint = await store.loadCheckpoint(started.runId);

    const rejected = await resumeDesktopRepositoryRuntime({
      stateRoot,
      runId: started.runId,
      approvalId: privateCheckpoint.approval!.id,
      approvalNonce: privateCheckpoint.approval!.nonce,
      expectedRevision: privateCheckpoint.revision,
      decision: "rejected",
    });
    expect(rejected.status).toBe("blocked");
    expect(rejected.checkpointRevision).toBe(1);

    await expect(
      resumeDesktopRepositoryRuntime({
        stateRoot,
        runId: started.runId,
        approvalId: privateCheckpoint.approval!.id,
        approvalNonce: privateCheckpoint.approval!.nonce,
        expectedRevision: privateCheckpoint.revision,
        decision: "rejected",
      }),
    ).rejects.toThrow("revision conflict");
  });

  it("rejects a task plan changed after the approval checkpoint", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-desktop-runtime-"));
    roots.push(root);
    const stateRoot = path.join(root, "state");
    const started = await startDesktopRepositoryRuntime({
      request: plannedRequest(root),
      stateRoot,
    });
    expect(started.taskPlan?.tasks).toHaveLength(1);
    expect(JSON.stringify(started)).not.toContain("nonce");

    const store = new DesktopRepositoryRuntimeStore({ stateRoot });
    const tampered = await store.mutate(
      started.runId,
      started.checkpointRevision,
      (checkpoint) => {
        checkpoint.taskPlan!.summary = "Tampered after approval.";
        return checkpoint;
      },
    );
    await expect(
      resumeDesktopRepositoryRuntime({
        stateRoot,
        runId: started.runId,
        approvalId: tampered.approval!.id,
        approvalNonce: tampered.approval!.nonce,
        expectedRevision: tampered.revision,
        decision: "approved",
      }),
    ).rejects.toThrow("stale, invalid");
  });

  it("cancels before dispatch and marks only in-doubt runs failed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-desktop-runtime-"));
    roots.push(root);
    const stateRoot = path.join(root, "state");
    const started = await startDesktopRepositoryRuntime({
      request: plannedRequest(root),
      stateRoot,
    });

    const cancelled = await cancelDesktopRepositoryRuntime({
      stateRoot,
      runId: started.runId,
      expectedRevision: started.checkpointRevision,
      reason: "Operator cancelled before approval.",
    });
    expect(cancelled.status).toBe("cancelled");
    await expect(
      markDesktopRepositoryRuntimeFailed({
        stateRoot,
        runId: started.runId,
        expectedRevision: cancelled.checkpointRevision,
        reason: "Must not be allowed.",
      }),
    ).rejects.toThrow("only execution-in-doubt");
  });

  it("recovers dispatched state as execution-in-doubt without replay", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-desktop-runtime-"));
    roots.push(root);
    const stateRoot = path.join(root, "state");
    const started = await startDesktopRepositoryRuntime({
      request: plannedRequest(root),
      stateRoot,
    });
    const store = new DesktopRepositoryRuntimeStore({ stateRoot });
    const running = await store.mutate(
      started.runId,
      started.checkpointRevision,
      (checkpoint) => {
        checkpoint.status = "running";
        checkpoint.approval!.status = "approved";
        checkpoint.executionAttempt = {
          id: "attempt-dispatched",
          idempotencyKey: "desktop-runtime:test",
          status: "dispatched",
        };
        return checkpoint;
      },
    );

    const recovered = await recoverDesktopRepositoryRuntime({
      stateRoot,
      runId: running.runId,
      expectedRevision: running.revision,
    });
    expect(recovered.status).toBe("execution_in_doubt");
    expect(recovered.executionAttemptStatus).toBe("in_doubt");

    const failed = await markDesktopRepositoryRuntimeFailed({
      stateRoot,
      runId: running.runId,
      expectedRevision: recovered.checkpointRevision,
      reason: "Operator reviewed the uncertain sandbox.",
    });
    expect(failed.status).toBe("failed");
  });

  it("refuses to create a new executable approval checkpoint without a trusted task plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-desktop-runtime-"));
    roots.push(root);

    await expect(
      startDesktopRepositoryRuntime({
        request: request(root),
        stateRoot: path.join(root, "state"),
      }),
    ).rejects.toThrow("requires a trusted task plan");
  });
});
