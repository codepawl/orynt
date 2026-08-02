import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { CognitiveRunCheckpointV1 } from "@codepawl/cognitive-kernel";
import { LocalStateError } from "@codepawl/local-state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalJsonCognitiveCheckpointStore } from "./checkpointStore";

let stateRoot = "";

function checkpoint(revision = 0): CognitiveRunCheckpointV1 {
  const timestamp = "2026-07-30T00:00:00.000Z";
  return {
    schemaVersion: 1,
    runId: "run-checkpoint-store",
    taskId: "task-checkpoint-store",
    workspaceId: "workspace-test",
    goal: "Persist a cognitive checkpoint",
    constraints: ["repository-only"],
    status: "running",
    phase: "observe",
    revision,
    budget: {
      maxSteps: 4,
      maxWallTimeMs: 60_000,
      maxModelTokens: 4_000,
      stopOnBudgetExceeded: true,
    },
    usage: {
      stepCount: 0,
      elapsedMs: 0,
      modelTokens: 0,
      estimatedUsd: 0,
      toolCalls: 0,
    },
    events: Array.from({ length: revision }, (_, index) => ({
      schemaVersion: 1 as const,
      id: `run-checkpoint-store-cognitive-event-${index + 1}`,
      runId: "run-checkpoint-store",
      taskId: "task-checkpoint-store",
      sequence: index + 1,
      checkpointRevision: index + 1,
      timestamp,
      eventType: "runtime.started" as const,
      phase: "observe" as const,
      summary: "checkpoint event",
      evidenceRefs: [],
      usage: {
        stepCount: 0,
        elapsedMs: 0,
        modelTokens: 0,
        estimatedUsd: 0,
        toolCalls: 0,
      },
    })),
    observationSummary: "",
    memoryHits: [],
    actionPlans: [],
    actionDecisions: [],
    pendingAction: null,
    approval: null,
    executionAttempt: null,
    gatewayResults: [],
    verifications: [],
    learningSummary: null,
    summary: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("LocalJsonCognitiveCheckpointStore", () => {
  beforeEach(async () => {
    stateRoot = await mkdtemp(path.join(tmpdir(), "orynt-checkpoint-store-"));
  });

  afterEach(async () => {
    await rm(stateRoot, { recursive: true, force: true });
  });

  it("creates, loads, and revision-checks durable checkpoints", async () => {
    const first = new LocalJsonCognitiveCheckpointStore({ stateRoot });
    const second = new LocalJsonCognitiveCheckpointStore({ stateRoot });
    await first.create(checkpoint());

    const next = checkpoint(1);
    next.phase = "retrieve";
    await second.compareAndSwap(next, 0);

    await expect(first.load(next.runId)).resolves.toMatchObject({
      revision: 1,
      phase: "retrieve",
    });
    await expect(first.compareAndSwap(checkpoint(1), 0)).rejects.toMatchObject({
      code: "revision_conflict",
    } satisfies Partial<LocalStateError>);
  });

  it("rejects duplicate creation and unsafe run identifiers", async () => {
    const store = new LocalJsonCognitiveCheckpointStore({ stateRoot });
    await store.create(checkpoint());
    await expect(store.create(checkpoint())).rejects.toMatchObject({
      code: "revision_conflict",
    } satisfies Partial<LocalStateError>);
    expect(() => store.checkpointPath("../escape")).toThrow(
      "checkpoint runId is invalid",
    );
  });
});
