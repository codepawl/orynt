import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export type ArtifactGateFailure = {
  code: string;
  detail: string;
};

export type ArtifactGateResult = {
  passed: boolean;
  failures: ArtifactGateFailure[];
};

type ArtifactEntry = {
  kind?: string;
  path?: string;
  uri?: string;
  sha256?: string;
  byteLength?: number;
  mediaType?: string;
  redaction?: "public" | "redacted" | "private";
};

type ArtifactManifest = {
  schemaVersion: number;
  artifacts: ArtifactEntry[] | Record<string, string | ArtifactEntry | null>;
  status?: string;
  outcome?: {
    status?: string;
    stage?: string;
    classification?: string;
    code?: string;
  };
  selectedAgentSkills?: { digest?: string; skillIds?: string[] } | null;
};

type RuntimeTrace = {
  revision: number;
  status: string;
  events: Array<{
    revision?: number;
    checkpointRevision?: number;
    type?: string;
    eventType?: string;
    evidenceRefs?: string[];
  }>;
  approval?: { status: string } | null;
  verification?: { status: string } | null;
  verifications?: Array<{ status: string; evidence?: Array<{ id: string }> }>;
  learning?: { evidenceRefs?: string[] } | null;
  learningSummary?: string | null;
  usage?: {
    steps?: number;
    stepCount?: number;
    modelTokens: number;
    toolCalls: number;
    costUsd?: number;
    estimatedUsd?: number;
  };
  budget?: {
    maxSteps: number;
    maxModelTokens: number;
    maxUsd?: number;
  };
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("artifact JSON must be an object");
  }
  return value as Record<string, unknown>;
}

async function json(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactPath(root: string, artifact: ArtifactEntry): string | null {
  const candidate = artifact.path ?? artifact.uri;
  if (!candidate || candidate.includes("://")) return null;
  const resolved = path.resolve(root, candidate);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

export async function evaluateControlledRunArtifacts(
  manifestPath: string,
  options: { requireSchemaVersion?: number } = {},
): Promise<ArtifactGateResult> {
  const failures: ArtifactGateFailure[] = [];
  const root = path.dirname(path.resolve(manifestPath));
  const rawManifest = object(await json(manifestPath));
  const manifest = rawManifest as unknown as ArtifactManifest;
  if (!Number.isSafeInteger(manifest.schemaVersion) || !manifest.artifacts ||
    typeof manifest.artifacts !== "object") {
    return { passed: false, failures: [{ code: "manifest_invalid", detail: "Manifest schema or artifact list is invalid." }] };
  }
  if (
    options.requireSchemaVersion !== undefined &&
    manifest.schemaVersion !== options.requireSchemaVersion
  ) {
    failures.push({
      code: "manifest_version",
      detail: `Release artifact manifest must use schema v${options.requireSchemaVersion}.`,
    });
  }

  const entries: Array<[string, ArtifactEntry]> = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.map((entry, index) => [entry.kind ?? `artifact-${index}`, entry])
    : Object.entries(manifest.artifacts)
      .filter((entry): entry is [string, string | ArtifactEntry] => entry[1] !== null)
      .map(([key, value]) => [key, typeof value === "string" ? { path: value } : value]);
  const resolvedEntries = new Map<string, { entry: ArtifactEntry; filePath: string }>();
  for (const [key, entry] of entries) {
    const candidate = artifactPath(root, entry);
    if (!candidate) {
      failures.push({ code: "artifact_path", detail: `Artifact ${key} is not repository-local.` });
      continue;
    }
    try {
      const [rootReal, artifactReal] = await Promise.all([realpath(root), realpath(candidate)]);
      if (artifactReal !== rootReal && !artifactReal.startsWith(`${rootReal}${path.sep}`)) {
        failures.push({ code: "artifact_path", detail: `Artifact ${key} escapes the artifact root.` });
        continue;
      }
      resolvedEntries.set(key, { entry, filePath: artifactReal });
      if (manifest.schemaVersion >= 3) {
        const bytes = await readFile(artifactReal);
        const metadata = await stat(artifactReal);
        if (
          !entry.sha256 ||
          entry.sha256.replace(/^sha256:/, "") !== sha256(bytes) ||
          entry.byteLength !== metadata.size ||
          !entry.mediaType ||
          !entry.redaction
        ) {
          failures.push({ code: "artifact_integrity", detail: `Artifact ${key} metadata or digest is invalid.` });
        }
        if (entry.redaction === "private") {
          failures.push({ code: "private_artifact_exposed", detail: `Private artifact ${key} is reader-visible.` });
        }
      }
    } catch {
      failures.push({ code: "artifact_missing", detail: `Artifact ${key} is missing or unreadable.` });
    }
  }

  if (manifest.outcome && manifest.outcome.status !== "pass") {
    if (
      !manifest.outcome.status ||
      !manifest.outcome.stage ||
      !manifest.outcome.classification ||
      !manifest.outcome.code ||
      (manifest.status && manifest.status !== manifest.outcome.status)
    ) {
      failures.push({
        code: "failure_outcome_invalid",
        detail: "Failed run outcome is incomplete or conflicts with the manifest.",
      });
    }
    const eventLog = [...resolvedEntries.values()].find(
      ({ entry, filePath }) =>
        entry.kind === "event_log" || filePath.endsWith("run-events.json"),
    );
    if (!eventLog) {
      failures.push({
        code: "failure_event_log_missing",
        detail: "Failed runs require a reader-visible event log.",
      });
    } else {
      try {
        const payload = await json(eventLog.filePath);
        const events = Array.isArray(payload)
          ? payload
          : Array.isArray(object(payload).events)
            ? object(payload).events as unknown[]
            : [];
        const terminal = events.some((event) => {
          try {
            return object(event).type === "run_finished";
          } catch {
            return false;
          }
        });
        if (!terminal) {
          failures.push({
            code: "failure_terminal_event_missing",
            detail: "Failed run event log lacks a terminal run_finished event.",
          });
        }
      } catch {
        failures.push({
          code: "failure_event_log_invalid",
          detail: "Failed run event log is invalid.",
        });
      }
    }
    const exposedPayloads: unknown[] = [rawManifest];
    for (const [, resolved] of resolvedEntries) {
      if (
        resolved.entry.redaction !== "private" &&
        resolved.filePath.endsWith(".json")
      ) {
        exposedPayloads.push(await json(resolved.filePath).catch(() => null));
      }
    }
    const serialized = JSON.stringify(exposedPayloads);
    if (
      serialized.includes('"nonce"') ||
      serialized.includes('"idempotencyKey"') ||
      serialized.includes('"executionAttempt"')
    ) {
      failures.push({
        code: "private_nonce_exposed",
        detail: "Reader-facing failure evidence contains a private approval nonce.",
      });
    }
    return { passed: failures.length === 0, failures };
  }

  const traceArtifact = Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((item) =>
      item.kind === "cognitive_trace" || item.path?.endsWith("cognitive-trace.json") || item.uri?.endsWith("cognitive-trace.json"),
    )
    : manifest.artifacts.cognitiveTrace
      ? typeof manifest.artifacts.cognitiveTrace === "string"
        ? { path: manifest.artifacts.cognitiveTrace }
        : manifest.artifacts.cognitiveTrace
      : undefined;
  const absoluteTracePath = traceArtifact && path.isAbsolute(traceArtifact.path ?? "")
    ? path.resolve(traceArtifact.path as string)
    : null;
  const tracePath = absoluteTracePath &&
    (absoluteTracePath === root || absoluteTracePath.startsWith(`${root}${path.sep}`))
    ? absoluteTracePath
    : traceArtifact && artifactPath(root, traceArtifact);
  if (!tracePath) {
    return { passed: false, failures: [{ code: "trace_missing", detail: "A repository-local cognitive trace is required." }] };
  }
  const traceFile = object(await json(tracePath));
  const trace = (traceFile.runtime ?? traceFile) as RuntimeTrace;
  if (!Array.isArray(trace.events)) {
    return { passed: false, failures: [{ code: "trace_invalid", detail: "Runtime events are missing." }] };
  }

  for (let index = 0; index < trace.events.length; index += 1) {
    const revision = trace.events[index]?.checkpointRevision ?? trace.events[index]?.revision;
    if (!Number.isSafeInteger(revision) || index > 0) {
      const previous = index > 0
        ? trace.events[index - 1]?.checkpointRevision ?? trace.events[index - 1]?.revision
        : 0;
      if (!Number.isSafeInteger(revision) || Number(revision) <= Number(previous)) {
        failures.push({ code: "revision_order", detail: "Runtime event revisions must be strictly increasing." });
        break;
      }
    }
  }
  const eventName = (event: RuntimeTrace["events"][number]) => event.eventType ?? event.type;
  const executionIndex = trace.events.findIndex((event) => eventName(event) === "action.dispatched");
  const approvalIndex = trace.events.findIndex((event) => eventName(event) === "approval.approved");
  const verificationIndex = trace.events.findIndex((event) => eventName(event) === "verification.completed");
  const completionIndex = trace.events.findIndex((event) => eventName(event) === "run.completed");
  if (executionIndex < 0) {
    failures.push({ code: "execution_evidence_missing", detail: "Completed controlled run lacks dispatch evidence." });
  }
  if (approvalIndex < 0 || executionIndex < 0 || approvalIndex > executionIndex) {
    failures.push({ code: "approval_before_use", detail: "Gateway execution lacks prior consumed approval evidence." });
  }
  if (
    verificationIndex < 0 ||
    completionIndex < 0 ||
    verificationIndex < executionIndex ||
    completionIndex < verificationIndex
  ) {
    failures.push({ code: "event_sequence_incomplete", detail: "Dispatch, verification, and completion evidence is incomplete or out of order." });
  }
  const finalVerification = trace.verifications?.at(-1) ?? trace.verification;
  if (trace.status === "completed" && finalVerification?.status !== "pass") {
    failures.push({ code: "verifier_pass", detail: "Completed execution requires verifier-pass evidence." });
  }
  const hasLearning = Boolean(trace.learning ?? trace.learningSummary);
  if (hasLearning && finalVerification?.status !== "pass") {
    failures.push({ code: "learning_without_verification", detail: "Learning exists without verifier-pass evidence." });
  }
  if (hasLearning) {
    const learningRefs = trace.learning?.evidenceRefs ??
      trace.events.find((event) => eventName(event) === "learning.completed")?.evidenceRefs ??
      [];
    const verifierRefs = "evidence" in (finalVerification ?? {})
      ? (finalVerification as { evidence?: Array<{ id: string }> }).evidence ?? []
      : [];
    if ((learningRefs?.length ?? 0) === 0 && verifierRefs.length === 0) {
      failures.push({ code: "learning_provenance", detail: "Learning evidence references are missing." });
    }
  }
  if (manifest.selectedAgentSkills) {
    if (!/^sha256:[a-f0-9]{64}$/i.test(manifest.selectedAgentSkills.digest ?? "") ||
      !Array.isArray(manifest.selectedAgentSkills.skillIds)) {
      failures.push({ code: "skill_snapshot_digest", detail: "Selected skill snapshot digest is missing or invalid." });
    }
    const contextEntry = resolvedEntries.get("skillContext");
    if (!contextEntry) {
      failures.push({ code: "skill_snapshot_missing", detail: "Selected skills require a skill-context artifact." });
    } else {
      try {
        const context = object(await json(contextEntry.filePath));
        const skills = Array.isArray(context.skills) ? context.skills : [];
        const digest = `sha256:${sha256(JSON.stringify(skills))}`;
        if (digest !== manifest.selectedAgentSkills.digest) {
          failures.push({ code: "skill_snapshot_digest", detail: "Skill snapshot digest does not match skill-context content." });
        }
      } catch {
        failures.push({ code: "skill_snapshot_invalid", detail: "Skill context is invalid." });
      }
    }
  }
  if (trace.usage && trace.budget) {
    if ((trace.usage.stepCount ?? trace.usage.steps ?? 0) > trace.budget.maxSteps ||
      trace.usage.modelTokens > trace.budget.maxModelTokens ||
      (trace.budget.maxUsd !== undefined && (trace.usage.estimatedUsd ?? trace.usage.costUsd ?? 0) > trace.budget.maxUsd)) {
      failures.push({ code: "budget_exceeded", detail: "Persisted usage exceeds the declared runtime budget." });
    }
  }
  const memoryRetrieval = resolvedEntries.get("memoryRetrieval");
  if (manifest.schemaVersion >= 3 && !memoryRetrieval) {
    failures.push({ code: "memory_retrieval_missing", detail: "Memory retrieval evidence is required." });
  }
  if (memoryRetrieval) {
    try {
      const retrieval = object(await json(memoryRetrieval.filePath));
      const items = Array.isArray(retrieval.items) ? retrieval.items : [];
      for (const item of items) {
        const value = object(item);
        if (
          value.status !== "approved" ||
          value.sensitivity === "sensitive" ||
          value.expired === true ||
          value.conflicted === true ||
          value.advisory !== true
        ) {
          failures.push({ code: "memory_retrieval_policy", detail: "Memory retrieval contains an ineligible item." });
          break;
        }
      }
    } catch {
      failures.push({ code: "memory_retrieval_invalid", detail: "Memory retrieval evidence is invalid." });
    }
  }
  const exposedPayloads: unknown[] = [traceFile];
  for (const [, resolved] of resolvedEntries) {
    if (resolved.entry.redaction !== "private" && resolved.filePath.endsWith(".json")) {
      exposedPayloads.push(await json(resolved.filePath).catch(() => null));
    }
  }
  const serialized = JSON.stringify(exposedPayloads);
  if (
    serialized.includes('"nonce"') ||
    serialized.includes('"idempotencyKey"') ||
    serialized.includes('"executionAttempt"')
  ) {
    failures.push({ code: "private_nonce_exposed", detail: "Reader-facing trace contains a private approval nonce." });
  }
  return { passed: failures.length === 0, failures };
}

export function evaluateReleaseArtifacts(
  manifestPath: string,
): Promise<ArtifactGateResult> {
  return evaluateControlledRunArtifacts(manifestPath, { requireSchemaVersion: 4 });
}
