import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "bun:test";

import {
  CanonicalTraceFailure,
  CanonicalTraceJournal,
  canonicalTraceEventFromRunEvent,
} from "./canonicalTrace.js";

const scope = {
  schemaVersion: 1 as const,
  localRepositoryId: "local-repository-test",
  canonicalRepositoryPath: "/repo/test",
  headCommit: "a".repeat(40),
  branchRef: "main",
  dirty: false,
  workingStateDigest: null,
  revisionKey: `clean:${"a".repeat(40)}`,
  completeness: "complete" as const,
  capturedAt: "2026-08-05T00:00:00.000Z",
};

function runEvent(sequence: number, payload: unknown = { summary: "ok" }) {
  return {
    id: `run-1-event-${sequence}`,
    runId: "run-1",
    sequence,
    type: sequence === 1 ? "run_started" as const : "goal_received" as const,
    timestamp: `2026-08-05T00:00:0${sequence}.000Z`,
    actor: { kind: "runtime" as const, id: "test" },
    payload,
    redaction: { applied: false, redactedPaths: [] },
    artifacts: [],
  };
}

describe("canonical trace journal", () => {
  it("durably reopens, deduplicates replay, and contains no raw secret", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-trace-"));
    const file = path.join(root, "trace.jsonl");
    const journal = await CanonicalTraceJournal.open(file);
    const first = canonicalTraceEventFromRunEvent({
      event: runEvent(1, { token: "sk-AAAAAAAAAAAAAAAA" }),
      taskId: "task-1",
      workspaceId: "workspace-1",
      repositoryScope: scope,
    });
    journal.append(first);
    expect(journal.append(first)).toEqual(first);
    expect((await readFile(file, "utf8")).split("\n").filter(Boolean)).toHaveLength(1);
    expect(await readFile(file, "utf8")).not.toContain("sk-AAAAAAAAAAAAAAAA");
    expect((await CanonicalTraceJournal.open(file)).list()).toEqual([first]);
  });

  it("rejects conflicting replay, gaps, duplicate sequences, and truncated tails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-trace-invalid-"));
    const file = path.join(root, "trace.jsonl");
    const journal = await CanonicalTraceJournal.open(file);
    const first = canonicalTraceEventFromRunEvent({
      event: runEvent(1),
      taskId: "task-1",
      workspaceId: "workspace-1",
      repositoryScope: scope,
    });
    journal.append(first);
    expect(() => journal.append({ ...first, contentHash: "0".repeat(64) }))
      .toThrow();
    const third = canonicalTraceEventFromRunEvent({
      event: runEvent(3),
      taskId: "task-1",
      workspaceId: "workspace-1",
      repositoryScope: scope,
      previousEventId: first.eventId,
    });
    expect(() => journal.append(third)).toThrow(CanonicalTraceFailure);
    await writeFile(file, `${await readFile(file, "utf8")}{"schemaVersion":1`);
    await expect(CanonicalTraceJournal.open(file)).rejects.toMatchObject({
      code: "truncated_tail",
    });
  });
});
