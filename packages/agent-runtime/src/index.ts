import {
  LocalCapabilityLedger,
  selectCapabilities,
  type CapabilityRouterWeights,
  type CapabilityLedgerSnapshotV1,
} from "@codepawl/capability-runtime";
import type {
  AgentFunctionTool,
  AgentToolCall,
  AgentToolResult,
} from "@codepawl/model-runtime";
import type {
  AgentTurnEventV1,
  AgentTurnRequestV1,
  CapabilityDescriptorV1,
  CapabilityOutcomeV1,
  CapabilitySelectionPlanV1,
} from "@codepawl/shared";

export {
  createAgentApplicationSession,
  type AgentApplicationDispatchResult,
  type AgentApplicationDriver,
  type AgentApplicationDriverResult,
  type AgentApplicationEventInputV1,
  type AgentApplicationSession,
  type AgentApplicationSessionOptions,
} from "./applicationSession.js";
export {
  buildBoundRepositoryTaskPlan,
  evaluateAgentAction,
  verifyApprovedRepositoryTaskPlan,
  type AgentActionAuthorization,
  type AgentActionOperation,
  type BoundTaskPlanInput,
  type ProposedRepositoryAction,
} from "./repositoryAction.js";
export {
  ContextController,
  estimateContextTokens,
  type ContextControllerOptions,
  type ContextPreflightDecision,
} from "./contextController.js";

export type CapabilityInventoryProvider = {
  list(input: AgentTurnRequestV1): Promise<CapabilityDescriptorV1[]>;
};

export type AgentCapabilityToolBinding = {
  capabilityId: string;
  tools: AgentFunctionTool[];
  execute(call: AgentToolCall): Promise<AgentToolResult>;
};

export type PreparedAgentTurn = {
  request: AgentTurnRequestV1;
  capabilityPlan: CapabilitySelectionPlanV1;
  descriptors: CapabilityDescriptorV1[];
  tools: AgentFunctionTool[];
  executeTool(call: AgentToolCall): Promise<AgentToolResult>;
  event: AgentTurnEventV1;
};

export type AgentTurnDriverResult<TResult> = {
  result: TResult;
  outcomes?: CapabilityOutcomeV1[];
};

export type AgentRuntimeSessionOptions<TResult> = {
  inventory: CapabilityInventoryProvider;
  toolBindings?: AgentCapabilityToolBinding[];
  ledger?: LocalCapabilityLedger;
  runTurn(input: {
    prepared: PreparedAgentTurn;
    signal?: AbortSignal;
  }): Promise<AgentTurnDriverResult<TResult>>;
  close?: () => Promise<void>;
  now?: () => string;
  routerWeights?: CapabilityRouterWeights;
};

export interface AgentRuntimeSession<TResult> {
  prepare(request: AgentTurnRequestV1): Promise<PreparedAgentTurn>;
  runTurn(
    request: AgentTurnRequestV1,
    options?: { signal?: AbortSignal },
  ): Promise<AgentTurnDriverResult<TResult> & {
    prepared: PreparedAgentTurn;
    ledger?: CapabilityLedgerSnapshotV1;
  }>;
  resume(
    request: AgentTurnRequestV1,
    options?: { signal?: AbortSignal },
  ): Promise<AgentTurnDriverResult<TResult> & {
    prepared: PreparedAgentTurn;
    ledger?: CapabilityLedgerSnapshotV1;
  }>;
  cancel(): void;
  close(): Promise<void>;
}

export function createAgentRuntimeSession<TResult>(
  options: AgentRuntimeSessionOptions<TResult>,
): AgentRuntimeSession<TResult> {
  let activeController: AbortController | undefined;
  let closed = false;
  const now = options.now ?? (() => new Date().toISOString());

  const prepare = async (
    request: AgentTurnRequestV1,
  ): Promise<PreparedAgentTurn> => {
    if (closed) throw new Error("Agent runtime session is closed.");
    const descriptors = await options.inventory.list(request);
    const ledger = options.ledger ? await options.ledger.load() : undefined;
    const capabilityPlan = selectCapabilities({
      descriptors,
      outcomes: ledger?.outcomes ?? [],
      request: {
        schemaVersion: 1,
        runId: request.runId,
        taskId: request.taskId,
        intent: request.prompt,
        environment: request.environment,
        repositoryPath: request.repositoryPath,
        connectedCapabilityIds: request.connectedCapabilityIds,
      },
      settings: request.capabilitySettings,
      ...(options.routerWeights ? { routerWeights: options.routerWeights } : {}),
      now,
    });
    const selectedIds = new Set(
      capabilityPlan.selected.map(({ capabilityId }) => capabilityId),
    );
    const selectedBindings = (options.toolBindings ?? []).filter((binding) =>
      selectedIds.has(binding.capabilityId),
    );
    const byTool = new Map<
      string,
      AgentCapabilityToolBinding
    >();
    const tools: AgentFunctionTool[] = [];
    const selectedToolNames = new Set(
      capabilityPlan.toolNamesLoaded.map((name) => name.split(".").at(-1)!),
    );
    for (const binding of selectedBindings) {
      for (const tool of binding.tools) {
        if (!selectedToolNames.has(tool.name)) continue;
        if (byTool.has(tool.name)) {
          throw new Error(`Duplicate selected agent tool: ${tool.name}`);
        }
        byTool.set(tool.name, binding);
        tools.push(structuredClone(tool));
      }
    }
    return {
      request: structuredClone(request),
      capabilityPlan,
      descriptors: descriptors.map((descriptor) =>
        structuredClone(descriptor)
      ),
      tools,
      executeTool: async (call) => {
        const binding = byTool.get(call.name);
        if (!binding) {
          return {
            output: JSON.stringify({
              error: `Tool was not selected for this turn: ${call.name}`,
            }),
            isError: true,
          };
        }
        return binding.execute(call);
      },
      event: {
        schemaVersion: 1,
        id: `${request.runId}-${request.taskId}-capabilities`,
        runId: request.runId,
        taskId: request.taskId,
        type: "capabilities_selected",
        summary: `Selected ${capabilityPlan.selected.length} capability descriptor(s).`,
        capabilityIds: capabilityPlan.selected.map(
          ({ capabilityId }) => capabilityId,
        ),
        artifactRefs: [],
        recordedAt: now(),
      },
    };
  };

  const execute = async (
    request: AgentTurnRequestV1,
    input: { signal?: AbortSignal } = {},
  ) => {
    if (activeController) {
      throw new Error("Agent runtime session already has an active turn.");
    }
    const controller = new AbortController();
    activeController = controller;
    const abort = () => controller.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    try {
      const prepared = await prepare(request);
      const driven = await options.runTurn({
        prepared,
        signal: controller.signal,
      });
      let ledger: CapabilityLedgerSnapshotV1 | undefined;
      for (const outcome of driven.outcomes ?? []) {
        ledger = options.ledger
          ? await options.ledger.appendOutcome(outcome)
          : undefined;
      }
      return {
        ...driven,
        prepared,
        ...(ledger ? { ledger } : {}),
      };
    } finally {
      input.signal?.removeEventListener("abort", abort);
      if (activeController === controller) activeController = undefined;
    }
  };

  return {
    prepare,
    runTurn: execute,
    resume: execute,
    cancel: () => activeController?.abort(),
    close: async () => {
      if (closed) return;
      closed = true;
      activeController?.abort();
      await options.close?.();
    },
  };
}
