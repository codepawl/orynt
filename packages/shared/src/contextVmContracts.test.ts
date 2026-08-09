import { describe, expect, it } from "bun:test";

import {
  contextVmArtifactId,
  contextVmCheckpointId,
  contextVmEventId,
  contextVmSessionId,
  contextVmTaskId,
  parseContextVmEventV1,
  parseContextVmMemoryDecisionV1,
  parseContextVmMemoryDecisionV2,
  parseContextVmConsolidationCandidateV1,
  parseContextVmStateCheckpointV1,
  type ContextVmArtifactId,
  type ContextVmEventId,
} from "./contextVmContracts";

describe("ContextVM contracts", () => {
  it("brands and validates IDs without making identifier kinds interchangeable", () => {
    const event: ContextVmEventId = contextVmEventId(
      "evt_0000000001_0123456789abcdef01234567",
    );
    const artifact: ContextVmArtifactId = contextVmArtifactId(
      `artifact_sha256_${"a".repeat(64)}`,
    );
    expect(event).toContain("evt_");
    expect(artifact).toContain("artifact_sha256_");
    expect(() => contextVmSessionId("../escape")).toThrow();
    expect(() => contextVmTaskId("")).toThrow();

    // @ts-expect-error Branded event and artifact IDs are intentionally distinct.
    const invalid: ContextVmEventId = artifact;
    expect(invalid).toBe(artifact);
  });

  it("round-trips strict versioned events and rejects unknown fields", () => {
    const value = {
      schemaVersion: 1,
      id: contextVmEventId("evt_0000000001_0123456789abcdef01234567"),
      sessionId: contextVmSessionId("run-1"),
      taskId: contextVmTaskId("task-1"),
      sequenceNo: 1,
      source: { kind: "test_fixture", id: "fixture-1" },
      occurredAt: "2026-08-04T00:00:00.000Z",
      recordedAt: "2026-08-04T00:00:00.001Z",
      actor: { kind: "runtime", id: "test" },
      kind: "state_transition",
      payload: { ready: true },
      artifacts: [],
      parentEventIds: [],
      contentHash: "b".repeat(64),
      sensitivity: "internal",
      redaction: { applied: false, redactedPaths: [], policyVersion: 2 },
    } as const;
    expect(parseContextVmEventV1(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(() => parseContextVmEventV1({ ...value, unexpected: true })).toThrow();
  });

  it("strictly parses READY and bounded NEED_MEMORY decisions", () => {
    expect(parseContextVmMemoryDecisionV1({
      schemaVersion: 1,
      status: "READY",
      answerOrAction: { summary: "continue" },
    })).toEqual({
      schemaVersion: 1,
      status: "READY",
      answerOrAction: { summary: "continue" },
    });
    const needMemory = {
      schemaVersion: 1,
      status: "NEED_MEMORY",
      missing: [{
        kind: "original_design_reason",
        entities: ["AuthCallback"],
        relation: "caused_by",
        timeRange: null,
        requiredSourceTypes: ["decision", "user_message"],
        minimumEvidenceQuality: "verified",
      }],
    };
    expect(parseContextVmMemoryDecisionV1(needMemory)).toEqual(needMemory);
    expect(() => parseContextVmMemoryDecisionV1({
      ...needMemory,
      missing: [{ ...needMemory.missing[0], entities: ["*"] }],
    })).toThrow();
    expect(() => parseContextVmMemoryDecisionV1({
      ...needMemory,
      missing: [{
        ...needMemory.missing[0],
        timeRange: {
          start: "2026-08-05T01:00:00.000Z",
          end: "2026-08-05T00:00:00.000Z",
        },
      }],
    })).toThrow();
    expect(() => parseContextVmMemoryDecisionV1({
      ...needMemory,
      unexpected: true,
    })).toThrow();
  });

  it("keeps the V2 memory decision readiness-only", () => {
    expect(parseContextVmMemoryDecisionV2({
      schemaVersion: 2,
      status: "READY",
    })).toEqual({
      schemaVersion: 2,
      status: "READY",
    });
    expect(() => parseContextVmMemoryDecisionV2({
      schemaVersion: 2,
      status: "READY",
      answerOrAction: { summary: "must not bypass the real provider call" },
    })).toThrow();
    expect(() => parseContextVmMemoryDecisionV2({
      schemaVersion: 2,
      status: "NEED_MEMORY",
      missing: [],
    })).toThrow();
  });

  it("strictly parses recovery checkpoints and raw-source consolidation claims", () => {
    const sessionId = contextVmSessionId("session-recovery");
    const state = {
      schemaVersion: 1 as const,
      reducerVersion: "contextvm-state-v1" as const,
      sessionId,
      throughSequence: 2,
      activeGoal: "Recover the task",
      tasks: [],
      constraints: [],
      obligations: [],
      artifactVersions: [],
      terminalStatus: null,
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      id: contextVmCheckpointId(`chk_${"a".repeat(32)}`),
      sessionId,
      capturedThroughSequence: 2,
      sourceEventRange: { start: 1, end: 2 },
      reducerVersion: "contextvm-state-v1" as const,
      state,
      stateHash: "b".repeat(64),
      reason: "explicit" as const,
      createdAt: "2026-08-05T00:00:00.000Z",
    };
    expect(parseContextVmStateCheckpointV1(checkpoint)).toEqual(checkpoint);
    expect(() => parseContextVmStateCheckpointV1({
      ...checkpoint,
      sourceEventRange: { start: 2, end: 2 },
    })).toThrow();

    const candidate = {
      schemaVersion: 1 as const,
      namespace: "repository:test",
      sessionId,
      outputKind: "session_summary" as const,
      trigger: "session_checkpoint" as const,
      claims: [{
        kind: "goal" as const,
        value: "Recover the task",
        sources: [{
          type: "event" as const,
          eventId: contextVmEventId(
            "evt_0000000001_0123456789abcdef01234567",
          ),
        }],
      }],
    };
    expect(parseContextVmConsolidationCandidateV1(candidate)).toEqual(candidate);
    expect(() => parseContextVmConsolidationCandidateV1({
      ...candidate,
      claims: [{ ...candidate.claims[0], value: "" }],
    })).toThrow();
  });
});
