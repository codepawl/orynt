#!/usr/bin/env node
import {
  DesktopRepositoryRuntimeStore,
  cancelDesktopRepositoryRuntime,
  desktopRuntimeSnapshot,
  markDesktopRepositoryRuntimeFailed,
  recoverDesktopRepositoryRuntime,
  resumeDesktopRepositoryRuntime,
  startDesktopRepositoryRuntime,
} from "../packages/coding-apprentice/dist/index.js";
import { planDesktopRepositoryTask } from "../packages/coding-apprentice/dist/repositoryTaskPlanning.js";

async function readJsonStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new Error("stdin JSON input is required");
  }
  return JSON.parse(raw);
}

function requireString(input, key) {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalObject(input, key) {
  const value = input[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function optionalString(input, key) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireRevision(input) {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    throw new Error("expectedRevision must be a non-negative safe integer");
  }
  return input.expectedRevision;
}

async function main() {
  const input = await readJsonStdin();
  const operation =
    typeof input.operation === "string" && input.operation.trim()
      ? input.operation.trim()
      : "plan_and_start";
  const memoryRoot = requireString(input, "memoryRoot");
  const stateRoot =
    optionalString(input, "stateRoot") ??
    `${memoryRoot}/desktop-runtime`;
  const onRunEvent = (event) => {
    process.stderr.write(`ORYNT_RUN_EVENT ${JSON.stringify(event)}\n`);
  };
  if (operation === "status") {
    const runId = requireString(input, "runId");
    const snapshot = await desktopRuntimeSnapshot(
      new DesktopRepositoryRuntimeStore({ stateRoot }),
      runId,
    );
    process.stdout.write(`${JSON.stringify({ ...snapshot, operation })}\n`);
    return;
  }
  if (operation === "resume") {
    const snapshot = await resumeDesktopRepositoryRuntime({
      stateRoot,
      runId: requireString(input, "runId"),
      approvalId: requireString(input, "approvalId"),
      approvalNonce: requireString(input, "approvalNonce"),
      expectedRevision: requireRevision(input),
      decision:
        input.decision === "approved" ? "approved" : input.decision === "rejected" || input.decision === "denied"
          ? "rejected"
          : (() => { throw new Error("decision must be approved or rejected"); })(),
      onRunEvent,
      onReady: (snapshot) => {
        process.stderr.write(`ORYNT_OPERATION_READY ${JSON.stringify(snapshot)}\n`);
      },
    });
    process.stdout.write(`${JSON.stringify({ ...snapshot, operation })}\n`);
    return;
  }
  if (operation === "cancel") {
    const snapshot = await cancelDesktopRepositoryRuntime({
      stateRoot,
      runId: requireString(input, "runId"),
      expectedRevision: requireRevision(input),
      reason: requireString(input, "reason"),
    });
    process.stdout.write(`${JSON.stringify({ ...snapshot, operation })}\n`);
    return;
  }
  if (operation === "recover") {
    const snapshot = await recoverDesktopRepositoryRuntime({
      stateRoot,
      runId: requireString(input, "runId"),
      expectedRevision: requireRevision(input),
      onRunEvent,
    });
    process.stdout.write(`${JSON.stringify({ ...snapshot, operation })}\n`);
    return;
  }
  if (operation === "mark_failed") {
    const snapshot = await markDesktopRepositoryRuntimeFailed({
      stateRoot,
      runId: requireString(input, "runId"),
      expectedRevision: requireRevision(input),
      reason: requireString(input, "reason"),
    });
    process.stdout.write(`${JSON.stringify({ ...snapshot, operation })}\n`);
    return;
  }
  if (operation !== "plan_and_start") {
    throw new Error(`unsupported operation: ${operation}`);
  }
  const request = {
    goal: requireString(input, "goal"),
    taskId: requireString(input, "taskId"),
    workspaceId: requireString(input, "workspaceId"),
    repositoryPath: requireString(input, "repositoryPath"),
    sandboxRoot: requireString(input, "sandboxRoot"),
    artifactRoot: requireString(input, "artifactRoot"),
    memoryRoot,
    budget: optionalObject(input, "budget"),
    modelConnection: optionalObject(input, "modelConnection"),
    thinkingEffort: optionalString(input, "thinkingEffort"),
    skillContext: optionalObject(input, "skillContext"),
  };
  const taskPlan = await planDesktopRepositoryTask(request);
  const snapshot = await startDesktopRepositoryRuntime({
    stateRoot,
    request: { ...request, taskPlan },
  });
  process.stdout.write(`${JSON.stringify({ ...snapshot, operation })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
