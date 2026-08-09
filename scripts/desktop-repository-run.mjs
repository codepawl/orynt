#!/usr/bin/env bun
import path from "node:path";

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
import { understandDesktopPrompt } from "../packages/coding-apprentice/dist/promptUnderstanding.js";
import {
  isModelTierConfiguration,
  modelTierConfigurationToOrchestrationProfile,
  routeModelTier,
} from "../packages/shared/dist/index.js";

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

function tieredModelRequest(input, routeInput) {
  const configuration = optionalObject(input, "modelTierConfiguration");
  const currentConnection = optionalObject(input, "modelConnection");
  const connections = Array.isArray(input.modelConnections)
    ? input.modelConnections.filter(
        (connection) =>
          connection && typeof connection === "object" && !Array.isArray(connection),
      )
    : currentConnection
      ? [currentConnection]
      : [];
  if (!configuration) {
    return {
      modelConnection: currentConnection,
      thinkingEffort: optionalString(input, "thinkingEffort"),
      configuration: undefined,
    };
  }
  if (!isModelTierConfiguration(configuration)) {
    throw new Error("modelTierConfiguration is invalid");
  }
  const decision = routeModelTier(configuration, routeInput);
  const binding = configuration.tiers[decision.selectedTier];
  const selectedConnection = connections.find(
    (connection) =>
      connection.providerId === binding.providerId &&
      connection.status === "ready",
  );
  if (!selectedConnection) {
    const error = new Error(
      `MODEL_TIER_UNAVAILABLE: ${decision.selectedTier} provider is not ready`,
    );
    error.code = "MODEL_TIER_UNAVAILABLE";
    throw error;
  }
  return {
    modelConnection: {
      ...selectedConnection,
      modelId: binding.modelId,
      modelLabel: binding.modelId,
    },
    thinkingEffort: binding.thinkingEffort,
    configuration,
    decision,
  };
}

export async function executeDesktopRepositoryOperation(
  input,
  {
    onRunEvent = () => undefined,
    onReady = () => undefined,
  } = {},
) {
  const operation =
    typeof input.operation === "string" && input.operation.trim()
      ? input.operation.trim()
      : "plan_and_start";
  if (operation === "understand_prompt") {
    const promptBasis = optionalObject(input, "promptBasis");
    if (!promptBasis) {
      throw new Error("promptBasis is required");
    }
    const routed = tieredModelRequest(input, {
      role: "coordinator",
      stage: "prompt_understanding",
      instruction: promptBasis.rawPrompt ?? "",
      authority: "read_only",
      requestedMinimumTier: optionalString(input, "minimumModelTier"),
    });
    const understanding = await understandDesktopPrompt({
      promptBasis,
      context: optionalObject(input, "context"),
      repositoryPath: requireString(input, "repositoryPath"),
      modelConnection: routed.modelConnection,
      thinkingEffort: routed.thinkingEffort,
    });
    // Understanding is intentionally pre-run: do not create a store, run,
    // checkpoint, artifact, approval, or synthetic run event here.
    return understanding;
  }
  const memoryRoot = requireString(input, "memoryRoot");
  const stateRoot =
    optionalString(input, "stateRoot") ??
    `${memoryRoot}/desktop-runtime`;
  if (operation === "status") {
    const runId = requireString(input, "runId");
    const snapshot = await desktopRuntimeSnapshot(
      new DesktopRepositoryRuntimeStore({ stateRoot }),
      runId,
    );
    return { ...snapshot, operation };
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
      onReady,
    });
    return { ...snapshot, operation };
  }
  if (operation === "cancel") {
    const snapshot = await cancelDesktopRepositoryRuntime({
      stateRoot,
      runId: requireString(input, "runId"),
      expectedRevision: requireRevision(input),
      reason: requireString(input, "reason"),
    });
    return { ...snapshot, operation };
  }
  if (operation === "recover") {
    const snapshot = await recoverDesktopRepositoryRuntime({
      stateRoot,
      runId: requireString(input, "runId"),
      expectedRevision: requireRevision(input),
      onRunEvent,
    });
    return { ...snapshot, operation };
  }
  if (operation === "mark_failed") {
    const snapshot = await markDesktopRepositoryRuntimeFailed({
      stateRoot,
      runId: requireString(input, "runId"),
      expectedRevision: requireRevision(input),
      reason: requireString(input, "reason"),
    });
    return { ...snapshot, operation };
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
    promptBasis: optionalObject(input, "promptBasis"),
    advisoryRefinedBrief: optionalString(input, "advisoryRefinedBrief"),
    skillContext: optionalObject(input, "skillContext"),
  };
  const plannerRoute = tieredModelRequest(input, {
    role: "coordinator",
    stage: "task_planning",
    instruction: request.goal,
    authority: "read_only",
    requestedMinimumTier: optionalString(input, "minimumModelTier"),
  });
  const planningRequest = {
    ...request,
    modelConnection: plannerRoute.modelConnection,
    thinkingEffort: plannerRoute.thinkingEffort,
  };
  const taskPlan = await planDesktopRepositoryTask(planningRequest);
  const operations = [
    ...new Set(taskPlan.tasks.flatMap((task) => task.operations)),
  ];
  const tieredExecution = plannerRoute.configuration
    ? modelTierConfigurationToOrchestrationProfile(
        plannerRoute.configuration,
        {
          instruction: request.goal,
          estimatedChangedFiles: taskPlan.pathEnvelope.length,
          operations,
          requestedMinimumTier: optionalString(input, "minimumModelTier"),
        },
      )
    : undefined;
  const implementer = tieredExecution?.profile.roles.implementer;
  const executionConnection = implementer
    ? (Array.isArray(input.modelConnections)
        ? input.modelConnections
        : [request.modelConnection]
      ).find(
        (connection) =>
          connection &&
          connection.providerId === implementer.providerId,
      )
    : undefined;
  if (implementer && !executionConnection) {
    const error = new Error(
      `MODEL_TIER_UNAVAILABLE: ${implementer.modelTier ?? "selected"} provider is not ready`,
    );
    error.code = "MODEL_TIER_UNAVAILABLE";
    throw error;
  }
  const snapshot = await startDesktopRepositoryRuntime({
    stateRoot,
    request: {
      ...request,
      ...(implementer
        ? {
            modelConnection: {
              ...executionConnection,
              providerId: implementer.providerId,
              modelId: implementer.modelId,
              modelLabel: implementer.modelId,
            },
            thinkingEffort: implementer.thinkingEffort,
            orchestration: {
              profile: tieredExecution.profile,
              priorInvocations: [],
            },
          }
        : {}),
      taskPlan,
    },
  });
  return { ...snapshot, operation };
}

async function main() {
  const result = await executeDesktopRepositoryOperation(await readJsonStdin(), {
    onRunEvent: (event) => {
      process.stderr.write(`ORYNT_RUN_EVENT ${JSON.stringify(event)}\n`);
    },
    onReady: (snapshot) => {
      process.stderr.write(`ORYNT_OPERATION_READY ${JSON.stringify(snapshot)}\n`);
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.basename(process.argv[1]) === "desktop-repository-run.mjs";

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
  });
}
