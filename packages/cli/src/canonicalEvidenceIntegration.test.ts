import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, it } from "bun:test";

import type { RepositoryAgentRunRequest } from "@codepawl/coding-apprentice";
import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";
import { captureRepositoryEvidenceScope } from "@codepawl/repository-sandbox";
import {
  contextVmSessionId,
  canonicalEvidenceJson,
  type RepositoryTaskPlanV1,
  type RunEvent,
} from "@codepawl/shared";

import { runCliRepositoryTask } from "./runtime";

const execFileAsync = promisify(execFile);

it("injects a seeded canonical source through the active CLI repository boundary without a provider", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-evidence-"));
  const repositoryPath = path.join(root, "repository");
  await mkdir(repositoryPath);
  await execFileAsync("git", ["init", "-q"], { cwd: repositoryPath });
  await execFileAsync("git", ["config", "user.email", "test@example.invalid"], {
    cwd: repositoryPath,
  });
  await execFileAsync("git", ["config", "user.name", "Orynt Test"], {
    cwd: repositoryPath,
  });
  await writeFile(path.join(repositoryPath, "README.md"), "evidence\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: repositoryPath });
  await execFileAsync("git", ["commit", "-qm", "fixture"], {
    cwd: repositoryPath,
  });

  const scope = await captureRepositoryEvidenceScope(repositoryPath);
  const workspaceId = `repository-${scope.localRepositoryId}`;
  const intelligence = new LocalIntelligenceRuntime(root);
  await intelligence.initialize();
  const event: RunEvent = {
    id: "seed-run-event-1",
    runId: "seed-run",
    sequence: 1,
    type: "goal_received",
    timestamp: scope.capturedAt,
    actor: { kind: "user", id: "operator" },
    payload: { goal: "Inspect canonical evidence" },
    artifacts: [],
    redaction: { applied: false, redactedPaths: [], redactionCount: 0 },
  };
  const canonicalBase = {
    schemaVersion: 1 as const,
    eventId: "trace-seed-run-1",
    sourceRunEventId: event.id,
    runId: event.runId,
    taskId: "seed-task",
    workspaceId,
    sequenceNo: 1,
    occurredAt: event.timestamp,
    eventType: event.type,
    phase: "prepare" as const,
    actor: "user" as const,
    repositoryScope: scope,
    causalParentEventIds: [],
    redactedPayload: event.payload,
    artifactRefs: [],
    redaction: event.redaction,
  };
  await intelligence.contextVm.projectCanonicalTraceEvents([{
    ...canonicalBase,
    contentHash: createHash("sha256")
      .update(canonicalEvidenceJson(canonicalBase))
      .digest("hex"),
  }]);
  await intelligence.contextVm.extractSession(
    contextVmSessionId(event.runId),
    `coding-apprentice|${workspaceId}|${repositoryPath}|`,
  );
  intelligence.contextVm.close();

  let receivedContextPack: RepositoryAgentRunRequest["contextPack"];
  const plan: RepositoryTaskPlanV1 = {
    schemaVersion: 1,
    id: "plan-test",
    requestId: "request-test",
    revision: 1,
    goal: "Inspect canonical evidence",
    summary: "Read-only evidence injection test",
    sourcePromptHash: "a".repeat(64),
    requirements: [{
      id: "requirement",
      text: "Inspect evidence",
      source: "user_prompt",
      kind: "outcome",
      required: true,
    }],
    tasks: [{
      id: "task",
      title: "Inspect",
      instruction: "Inspect evidence",
      kind: "validation",
      dependencies: [],
      requirementIds: ["requirement"],
      authority: "read_only",
      operations: ["read"],
      readPaths: ["README.md"],
      expectedPaths: [],
      doneWhen: ["Evidence is inspected"],
      evidence: [],
    }],
    pathEnvelope: ["README.md"],
    allowedOperations: ["read"],
    budget: { maxTasks: 1, maxModelTokens: 1_000, maxWallTimeMs: 60_000 },
    recovery: { maxAttemptsPerTask: 0 },
    createdAt: scope.capturedAt,
    digest: "b".repeat(64),
  };
  const result = await runCliRepositoryTask({
    instruction: "Inspect canonical evidence",
    repositoryPath,
    modelId: "provider-free",
    thinkingEffort: "low",
    taskPlan: plan,
    acceptanceCriteria: [],
    authorization: {
      source: "operator",
      reasons: ["test"],
      expectedPaths: [],
      allowDestructiveChanges: false,
      allowChangedFileLimitExceeded: false,
      planId: plan.id,
      planRevision: plan.revision,
      planDigest: plan.digest,
    },
    onEvent: () => {},
  }, {
    stateRoot: root,
    contextVmDecisionDriver: async () => ({
      schemaVersion: 2,
      status: "READY",
    }),
    repositoryAgent: async (request: RepositoryAgentRunRequest) => {
      receivedContextPack = request.contextPack;
      const artifactRoot = path.join(root, "fake-run");
      const manifestPath = path.join(artifactRoot, "artifact-manifest.json");
      await mkdir(artifactRoot, { recursive: true });
      await writeFile(manifestPath, `${JSON.stringify({
        runId: "fake-run",
        status: "pass",
        summary: "Verifier pass",
        eventTypes: [],
        artifacts: {},
      })}\n`);
      return {
        runId: "fake-run",
        status: "pass",
        artifactRoot,
        artifactManifestPath: manifestPath,
        eventCount: 0,
        events: [],
      };
    },
  });
  expect(result.status).toBe("pass");
  expect(receivedContextPack?.rendered).toContain(event.id);
  expect(receivedContextPack?.rendered).toContain(scope.revisionKey!);
});
