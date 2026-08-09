import { describe, expect, it } from "bun:test";

import { createHash } from "node:crypto";
import {
  canonicalEvidenceJson,
  parseCanonicalTraceEventV1,
  parseRepositoryEvidenceScopeV1,
} from "./canonicalEvidenceContracts.js";

describe("canonical evidence v1 contracts", () => {
  const repositoryScope = {
    schemaVersion: 1 as const,
    localRepositoryId: "local-repository-abc",
    canonicalRepositoryPath: "/repo/orynt",
    headCommit: "a".repeat(40),
    branchRef: "main",
    dirty: true,
    workingStateDigest: "b".repeat(64),
    revisionKey: `dirty:${"a".repeat(40)}:${"b".repeat(64)}`,
    completeness: "complete" as const,
    capturedAt: "2026-08-05T00:00:00.000Z",
  };

  it("parses a complete repository scope without weakening unavailable state", () => {
    expect(parseRepositoryEvidenceScopeV1(repositoryScope)).toEqual(repositoryScope);
    expect(() => parseRepositoryEvidenceScopeV1({
      ...repositoryScope,
      completeness: "unavailable",
      revisionKey: undefined,
    })).toThrow();
  });

  it("parses a content-bound canonical trace event and rejects mutation", () => {
    const base = {
      schemaVersion: 1 as const,
      eventId: "trace-run-1-1",
      sourceRunEventId: "run-1-event-1",
      runId: "run-1",
      taskId: "task-1",
      workspaceId: "workspace-1",
      sequenceNo: 1,
      occurredAt: "2026-08-05T00:00:00.000Z",
      eventType: "run_started" as const,
      phase: "prepare" as const,
      actor: "orynt" as const,
      repositoryScope,
      causalParentEventIds: [],
      redactedPayload: { summary: "started" },
      artifactRefs: [],
      redaction: { applied: false, redactedPaths: [] },
    };
    const event = {
      ...base,
      contentHash: createHash("sha256").update(canonicalEvidenceJson(base)).digest("hex"),
    };
    expect(parseCanonicalTraceEventV1(event)).toEqual(event);
    expect(() => parseCanonicalTraceEventV1({
      ...event,
      contentHash: "not-a-hash",
    })).toThrow();
  });
});
