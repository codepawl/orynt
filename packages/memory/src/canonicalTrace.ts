import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  canonicalEvidenceJson,
  parseCanonicalTraceEventV1,
  redactSensitivePayload,
  runEventTaskPhase,
  type CanonicalTraceActorV1,
  type CanonicalTraceEventV1,
  type CanonicalTracePhaseV1,
  type RepositoryEvidenceScopeV1,
  type RunEvent,
} from "@codepawl/shared";

const MAX_JOURNAL_BYTES = 64 * 1024 * 1024;

export class CanonicalTraceFailure extends Error {
  constructor(
    readonly code:
      | "invalid_path"
      | "truncated_tail"
      | "sequence_conflict"
      | "source_conflict"
      | "journal_too_large"
      | "write_failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CanonicalTraceFailure";
  }
}

function tracePhase(event: RunEvent): CanonicalTracePhaseV1 {
  if (event.type === "run_finished") return "done";
  if (
    event.type.includes("recovery") ||
    event.payload && typeof event.payload === "object" &&
      !Array.isArray(event.payload) &&
      (event.payload as Record<string, unknown>).recoveryAttempt !== undefined
  ) return "recovery";
  const phase = runEventTaskPhase(event.type);
  if (phase === "observe" || phase === "plan" || phase === "approval") {
    return "prepare";
  }
  if (phase === "act" || phase === "apply") return "run";
  if (phase === "verify") return "verify";
  if (phase === "summarize") return "done";
  return "unknown";
}

function traceActor(event: RunEvent): CanonicalTraceActorV1 {
  if (event.actor.kind === "user") return "user";
  if (event.actor.kind === "verifier") return "verifier";
  if (event.actor.kind === "policy") return "policy";
  if (event.actor.kind === "system") return "system";
  if (event.type.startsWith("codex_")) return "model";
  if (
    event.type.includes("command") ||
    event.type.includes("sandbox") ||
    event.type.includes("diff")
  ) return "tool";
  return "orynt";
}

export function canonicalTraceEventFromRunEvent(input: {
  event: RunEvent;
  taskId: string;
  workspaceId: string;
  repositoryScope: RepositoryEvidenceScopeV1;
  previousEventId?: string;
  causalParentEventIds?: string[];
}): CanonicalTraceEventV1 {
  const redacted = redactSensitivePayload(input.event.payload);
  const base = {
    schemaVersion: 1 as const,
    eventId: `trace-${input.event.runId}-${input.event.sequence}`,
    sourceRunEventId: input.event.id,
    runId: input.event.runId,
    taskId: input.taskId,
    workspaceId: input.workspaceId,
    sequenceNo: input.event.sequence,
    occurredAt: input.event.timestamp,
    eventType: input.event.type,
    phase: tracePhase(input.event),
    actor: traceActor(input.event),
    repositoryScope: structuredClone(input.repositoryScope),
    ...(input.previousEventId
      ? { previousEventId: input.previousEventId }
      : {}),
    causalParentEventIds: [...(input.causalParentEventIds ?? [])],
    redactedPayload: redacted.payload,
    artifactRefs: structuredClone(input.event.artifacts),
    redaction: redacted.redaction,
  };
  return {
    ...base,
    contentHash: createHash("sha256")
      .update(canonicalEvidenceJson(base))
      .digest("hex"),
  };
}

export class CanonicalTraceJournal {
  readonly journalPath: string;
  private events: CanonicalTraceEventV1[] = [];
  private bySource = new Map<string, CanonicalTraceEventV1>();

  private constructor(journalPath: string) {
    if (!path.isAbsolute(journalPath)) {
      throw new CanonicalTraceFailure(
        "invalid_path",
        "canonical trace journal path must be absolute",
      );
    }
    this.journalPath = path.resolve(journalPath);
  }

  static async open(journalPath: string): Promise<CanonicalTraceJournal> {
    const journal = new CanonicalTraceJournal(journalPath);
    await mkdir(path.dirname(journal.journalPath), {
      recursive: true,
      mode: 0o700,
    });
    journal.load();
    return journal;
  }

  private load(): void {
    if (!existsSync(this.journalPath)) return;
    const bytes = readFileSync(this.journalPath);
    if (bytes.byteLength > MAX_JOURNAL_BYTES) {
      throw new CanonicalTraceFailure(
        "journal_too_large",
        "canonical trace journal exceeds its bounded size",
      );
    }
    if (bytes.byteLength > 0 && bytes.at(-1) !== 0x0a) {
      throw new CanonicalTraceFailure(
        "truncated_tail",
        "canonical trace journal has a truncated final line",
      );
    }
    for (const line of bytes.toString("utf8").split("\n").filter(Boolean)) {
      this.accept(parseCanonicalTraceEventV1(JSON.parse(line)), false);
    }
  }

  private accept(
    event: CanonicalTraceEventV1,
    persist: boolean,
  ): CanonicalTraceEventV1 {
    const expectedHash = createHash("sha256")
      .update(canonicalEvidenceJson({ ...event, contentHash: undefined }))
      .digest("hex");
    if (event.contentHash !== expectedHash) {
      throw new CanonicalTraceFailure(
        "source_conflict",
        `canonical trace content hash mismatch: ${event.sourceRunEventId}`,
      );
    }
    const duplicate = this.bySource.get(event.sourceRunEventId);
    if (duplicate) {
      if (duplicate.contentHash !== event.contentHash) {
        throw new CanonicalTraceFailure(
          "source_conflict",
          `canonical source replay conflict: ${event.sourceRunEventId}`,
        );
      }
      return structuredClone(duplicate);
    }
    const expected = this.events.length + 1;
    const previous = this.events.at(-1);
    if (
      event.sequenceNo !== expected ||
      (expected > 1 && event.previousEventId !== previous?.eventId) ||
      (expected === 1 && event.previousEventId !== undefined)
    ) {
      throw new CanonicalTraceFailure(
        "sequence_conflict",
        `canonical trace expected sequence ${expected}`,
      );
    }
    if (persist) {
      const line = `${JSON.stringify(event)}\n`;
      const descriptor = openSync(this.journalPath, "a", 0o600);
      try {
        writeSync(descriptor, line, undefined, "utf8");
        fsyncSync(descriptor);
      } catch (error) {
        throw new CanonicalTraceFailure(
          "write_failed",
          "canonical trace append failed",
          { cause: error },
        );
      } finally {
        closeSync(descriptor);
      }
    }
    this.events.push(structuredClone(event));
    this.bySource.set(event.sourceRunEventId, structuredClone(event));
    return structuredClone(event);
  }

  append(event: CanonicalTraceEventV1): CanonicalTraceEventV1 {
    return this.accept(parseCanonicalTraceEventV1(event), true);
  }

  list(): CanonicalTraceEventV1[] {
    return structuredClone(this.events);
  }

  last(): CanonicalTraceEventV1 | undefined {
    const event = this.events.at(-1);
    return event ? structuredClone(event) : undefined;
  }
}
