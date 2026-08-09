import { randomUUID } from "node:crypto";

import type {
  BrowserAction,
  BrowserActionBatch,
  BrowserActionIntent,
  BrowserPostcondition,
  BrowserToolAuthority,
  BrowserToolName,
  BrowserWaitOptions,
  OryntCdpBrowserRuntime,
} from "@codepawl/browser-runtime";

import type {
  GatewayActionRequest,
  GatewayAdapter,
  GatewayAdapterResult,
  GatewayExecutionResult,
} from "./index.js";

export type BrowserGatewayPayload =
  | { operation: "tabs" }
  | {
      operation: "observe";
      pageId?: string;
      screenshot?: boolean;
      mode?: "compact" | "full" | "delta";
      sinceRevision?: number;
      focus?: string;
    }
  | {
      operation: "act";
      pageId: string;
      action?: BrowserAction;
      batch?: BrowserActionBatch;
      postcondition?: BrowserPostcondition;
      intents?: BrowserActionIntent[];
    }
  | { operation: "wait"; options: BrowserWaitOptions };

export type BrowserGatewayActionRequest = GatewayActionRequest & {
  surface: "browser";
  payload: BrowserGatewayPayload;
};

export type BrowserToolGatewayContext = {
  runId: string;
  workspaceId: string;
  userId: string;
};

export function createGatewayBrowserToolAuthority(
  routeAction: (action: GatewayActionRequest) => Promise<GatewayExecutionResult>,
  context: BrowserToolGatewayContext,
  inspect: (
    pageId: string,
    payload: { action?: BrowserAction; batch?: BrowserActionBatch },
  ) => Promise<BrowserActionIntent[]>,
): BrowserToolAuthority {
  return {
    async execute(name: BrowserToolName, arguments_: Record<string, unknown>) {
      const payload = payloadForTool(name, arguments_);
      const stateChanging = name === "browser_act";
      const intents =
        payload.operation === "act"
          ? await inspect(payload.pageId, {
              ...(payload.action ? { action: payload.action } : {}),
              ...(payload.batch ? { batch: payload.batch } : {}),
            })
          : [];
      const enrichedPayload =
        payload.operation === "act"
          ? { ...payload, intents }
          : payload;
      const riskHint = intents.some(({ risk }) => risk === "blocked")
        ? "blocked"
        : intents.some(({ risk }) => risk === "takeover")
          ? "sensitive"
          : stateChanging
            ? "review"
            : undefined;
      const action: BrowserGatewayActionRequest = {
        id: `${context.runId}-${name}-${randomUUID()}`,
        ...context,
        surface: "browser",
        actionType: name,
        instruction: instructionForPayload(enrichedPayload),
        stateChanging,
        expectedEvidence: ["trace"],
        policyAction: {
          id: `${context.runId}-${name}-policy`,
          kind: "command",
          summary: stateChanging
            ? `Perform approved typed browser action: ${enrichedPayload.operation}`
            : `Read browser state: ${enrichedPayload.operation}`,
          command: stateChanging ? "browser act" : `browser ${payload.operation}`,
        },
        ...(riskHint ? { riskHint } : {}),
        ...(intents.length > 0
          ? {
              riskReasons: [
                ...new Set(intents.flatMap(({ reasons }) => reasons)),
              ],
              untrustedContent: intents
                .map(({ untrustedContent }) => untrustedContent)
                .filter(Boolean)
                .join("\n")
                .slice(0, 4_000),
            }
          : {}),
        payload: enrichedPayload,
      };
      const result = await routeAction(action);
      if (result.status !== "executed") {
        throw new Error(`Browser gateway ${result.status}: ${result.reason}`);
      }
      return {
        status: result.status,
        observation: result.observation,
        data: result.data,
        evidence: result.evidence.map((item) => ({
          id: item.id,
          artifactType: item.artifactType,
          storageRef: item.storageRef,
        })),
      };
    },
  };
}

export class BrowserGatewayAdapter implements GatewayAdapter {
  constructor(private readonly runtime: OryntCdpBrowserRuntime) {}

  async execute(action: GatewayActionRequest): Promise<GatewayAdapterResult> {
    if (action.surface !== "browser") {
      throw new Error("BrowserGatewayAdapter accepts only browser actions");
    }
    const payload = (action as Partial<BrowserGatewayActionRequest>).payload;
    if (!payload) throw new Error("Browser gateway payload is required");
    if (payload.operation === "tabs") {
      const pages = await this.runtime.listPages();
      return result(action, `Observed ${pages.length} browser page(s).`, {
        operation: "tabs",
        pageCount: pages.length,
        pages: pages.map((page) => ({ id: page.id, title: redactText(page.title), url: redactUrl(page.url) })),
      }, {
        operation: "tabs",
        pages: pages.map((page) => ({
          id: page.id,
          title: redactText(page.title),
          url: redactUrl(page.url),
        })),
      });
    }
    if (payload.operation === "observe") {
      const observation = await this.runtime.observe({
        pageId: payload.pageId,
        screenshot: payload.screenshot,
        mode: payload.mode,
        sinceRevision: payload.sinceRevision,
        focus: payload.focus,
      });
      const data = publicObservation(observation);
      return result(action, `Observed page ${observation.pageId}.`, {
        operation: "observe",
        observationId: observation.observationId,
        pageId: observation.pageId,
        url: redactUrl(observation.url),
        nodeCount: observation.nodes.length,
        truncated: observation.truncated,
        screenshotCaptured: Boolean(observation.screenshotBase64),
        observation: data,
      }, { operation: "observe", observation: data });
    }
    if (payload.operation === "wait") {
      const verified = await this.runtime.wait(payload.options);
      return result(action, verified ? "Browser postcondition observed." : "Browser postcondition timed out.", {
        operation: "wait",
        pageId: payload.options.pageId,
        postcondition: payload.options.postcondition,
        verified,
      }, {
        operation: "wait",
        pageId: payload.options.pageId,
        postcondition: payload.options.postcondition,
        verified,
      });
    }
    const execution =
      payload.batch
        ? await this.runtime.actBatch(payload.pageId, payload.batch)
        : await this.runtime.act(
            payload.pageId,
            payload.action!,
            payload.postcondition,
          );
    if (execution.status !== "executed" || !execution.verified) {
      throw new Error(execution.reason);
    }
    const data = publicObservation(execution.observation);
    return result(action, execution.reason, {
      operation: "act",
      pageId: payload.pageId,
      actionKind: payload.action?.kind ?? "batch",
      beforeObservationId:
        "beforeObservationIds" in execution.evidence
          ? execution.evidence.beforeObservationIds
          : execution.evidence.beforeObservationId,
      afterObservationId: execution.evidence.afterObservationId,
      verified: execution.verified,
      trace: execution.trace,
      observation: data,
    }, {
      operation: "act",
      actionId:
        "actionId" in execution ? execution.actionId : execution.batchId,
      pageId: execution.pageId,
      verified: execution.verified,
      observation: data,
      evidence: execution.evidence,
      trace: execution.trace,
    });
  }
}

function result(
  action: GatewayActionRequest,
  observation: string,
  metadata: Record<string, unknown>,
  data?: unknown,
): GatewayAdapterResult {
  return {
    actionId: action.id,
    status: "executed",
    observation,
    ...(data === undefined ? {} : { data }),
    evidence: [{
      id: `${action.id}-browser-trace`,
      artifactType: "trace",
      storageRef: `orynt-artifact://${action.runId}/${action.id}/browser-trace.json`,
      visibility: "user",
      metadata: redactMetadata(metadata),
    }],
  };
}

function publicObservation(
  observation: Awaited<ReturnType<OryntCdpBrowserRuntime["observe"]>>,
) {
  const publicNode = (node: (typeof observation.nodes)[number]) => ({
    ref: node.ref,
    role: node.role,
    name: redactText(node.name),
    ...(node.value === undefined
      ? {}
      : {
          value: redactNodeValue(
            node.role,
            node.name,
            node.value,
            node.inputType,
          ),
        }),
    ...(node.description === undefined
      ? {}
      : { description: redactText(node.description) }),
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    ...(node.focused === undefined ? {} : { focused: node.focused }),
    ...(node.fingerprint ? { fingerprint: node.fingerprint } : {}),
    ...(node.tag ? { tag: node.tag } : {}),
    ...(node.inputType ? { inputType: node.inputType } : {}),
    ...(node.hrefOrigin ? { hrefOrigin: node.hrefOrigin } : {}),
    ...(node.regionPath ? { regionPath: node.regionPath } : {}),
  });
  return {
    schemaVersion: observation.schemaVersion,
    observationId: observation.observationId,
    pageId: observation.pageId,
    url: redactUrl(observation.url),
    title: redactText(observation.title),
    revision: observation.revision,
    mode: observation.mode,
    nodes: observation.nodes.map(publicNode),
    regions: observation.regions.map((region) => ({
      id: region.id,
      kind: region.kind,
      ...(region.name ? { name: redactText(region.name) } : {}),
      ...(region.parentId ? { parentId: region.parentId } : {}),
      controlCount: region.controlCount,
    })),
    ...(observation.delta
      ? {
          delta: {
            baseRevision: observation.delta.baseRevision,
            added: observation.delta.added.map(publicNode),
            changed: observation.delta.changed.map(publicNode),
            removedFingerprints: observation.delta.removedFingerprints,
          },
        }
      : {}),
    truncated: observation.truncated,
    byteLength: observation.byteLength,
    ...(observation.scopeBlocked ? { scopeBlocked: true } : {}),
    ...(observation.visionEscalationRequired
      ? {
          visionEscalationRequired: true,
          visionEscalationReasons:
            observation.visionEscalationReasons?.map((reason) =>
              redactText(reason)
            ) ?? [],
        }
      : {}),
    ...(observation.timing ? { timing: observation.timing } : {}),
    screenshotCaptured: Boolean(observation.screenshotBase64),
  };
}

function redactNodeValue(
  role: string,
  name: string,
  value: string,
  inputType?: string,
): string {
  if (
    inputType === "password" ||
    /password|secret|token|credential|otp|card|cvv|authorization/iu.test(
      `${role} ${name}`,
    )
  ) {
    return "[REDACTED]";
  }
  return redactText(value, 1_000);
}

function redactText(value: string, maxLength = 500): string {
  return value
    .replace(
      /\b(?:bearer\s+)?[a-z0-9_-]*(?:token|secret|password|api[_ -]?key)[a-z0-9_-]*\s*[:=]\s*\S+/giu,
      "[REDACTED]",
    )
    .slice(0, maxLength);
}

function redactMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    /cookie|authorization|token|password|secret|credential/i.test(key)
      ? "[REDACTED]"
      : typeof nested === "string"
        ? nested.replace(/(cookie|authorization|token|password|secret|credential)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
        : nested,
  ]));
}

function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|auth|code/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "[INVALID_URL]";
  }
}

function payloadForTool(
  name: BrowserToolName,
  arguments_: Record<string, unknown>,
): BrowserGatewayPayload {
  if (name === "browser_tabs") return { operation: "tabs" };
  if (name === "browser_observe") {
    return {
      operation: "observe",
      ...(typeof arguments_.pageId === "string" ? { pageId: arguments_.pageId } : {}),
      ...(typeof arguments_.screenshot === "boolean" ? { screenshot: arguments_.screenshot } : {}),
      ...(typeof arguments_.mode === "string"
        ? { mode: arguments_.mode as "compact" | "full" | "delta" }
        : {}),
      ...(typeof arguments_.sinceRevision === "number"
        ? { sinceRevision: arguments_.sinceRevision }
        : {}),
      ...(typeof arguments_.focus === "string"
        ? { focus: arguments_.focus }
        : {}),
    };
  }
  if (name === "browser_act") {
    const action = isRecord(arguments_.action) ? arguments_.action : undefined;
    const batch = isRecord(arguments_.batch) ? arguments_.batch : undefined;
    if (
      typeof arguments_.pageId !== "string" ||
      Number(Boolean(action)) + Number(Boolean(batch)) !== 1
    ) {
      throw new Error(
        "browser_act requires pageId and exactly one typed action or batch",
      );
    }
    if (action) assertBrowserAction(action);
    if (batch) assertBrowserBatch(batch);
    if (arguments_.postcondition !== undefined) {
      if (batch) {
        throw new Error(
          "browser_act postcondition belongs inside a batch when batch is used",
        );
      }
      if (!isRecord(arguments_.postcondition)) throw new Error("browser_act postcondition must be an object");
      assertPostcondition(arguments_.postcondition);
    }
    return {
      operation: "act",
      pageId: arguments_.pageId,
      ...(action ? { action: action as BrowserAction } : {}),
      ...(batch ? { batch: batch as BrowserActionBatch } : {}),
      ...(isRecord(arguments_.postcondition)
        ? { postcondition: arguments_.postcondition as BrowserPostcondition }
        : {}),
    };
  }
  if (!isRecord(arguments_.postcondition)) {
    throw new Error("browser_wait requires a typed postcondition");
  }
  assertPostcondition(arguments_.postcondition);
  return {
    operation: "wait",
    options: {
      ...(typeof arguments_.pageId === "string" ? { pageId: arguments_.pageId } : {}),
      postcondition: arguments_.postcondition as BrowserPostcondition,
      ...(typeof arguments_.timeoutMs === "number" ? { timeoutMs: arguments_.timeoutMs } : {}),
    },
  };
}

function instructionForPayload(payload: BrowserGatewayPayload): string {
  if (payload.operation !== "act") return `Run typed browser operation ${payload.operation}.`;
  const summaries = payload.intents?.map(({ summary }) => summary) ?? [];
  if (summaries.length === 1) return summaries[0];
  if (summaries.length > 1) {
    return `Run ${summaries.length} approved browser actions: ${summaries.join("; ")}`.slice(0, 2_000);
  }
  return payload.action
    ? `Run typed browser action ${payload.action.kind}.`
    : `Run typed browser action batch ${payload.batch?.id ?? "unknown"}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertBrowserAction(action: Record<string, unknown>): asserts action is BrowserAction & Record<string, unknown> {
  const kind = action.kind;
  if (!["navigate", "click", "type", "select", "press", "scroll"].includes(String(kind))) {
    throw new Error(`Unsupported typed browser action: ${String(kind)}`);
  }
  if (kind === "navigate" && typeof action.url !== "string") throw new Error("navigate requires url");
  if (["click", "type", "select"].includes(String(kind)) &&
      (typeof action.observationId !== "string" || typeof action.ref !== "string")) {
    throw new Error(`${String(kind)} requires observationId and ref`);
  }
  if (kind === "type" && typeof action.text !== "string") throw new Error("type requires text");
  if (kind === "select" && typeof action.value !== "string") throw new Error("select requires value");
  if (kind === "press" && typeof action.key !== "string") throw new Error("press requires key");
  if (kind === "scroll" && typeof action.deltaY !== "number") throw new Error("scroll requires deltaY");
}

function assertBrowserBatch(
  batch: Record<string, unknown>,
): asserts batch is BrowserActionBatch & Record<string, unknown> {
  if (typeof batch.id !== "string" || !Array.isArray(batch.actions)) {
    throw new Error("browser batch requires id and actions");
  }
  if (batch.actions.length < 1 || batch.actions.length > 8) {
    throw new Error("browser batch must contain 1-8 actions");
  }
  for (const value of batch.actions) {
    if (!isRecord(value) || !isRecord(value.action)) {
      throw new Error("browser batch steps require a typed action");
    }
    assertBrowserAction(value.action);
    if (value.postcondition !== undefined) {
      if (!isRecord(value.postcondition)) {
        throw new Error("browser batch postcondition must be an object");
      }
      assertPostcondition(value.postcondition);
    }
  }
  if (batch.postconditions !== undefined) {
    if (!Array.isArray(batch.postconditions)) {
      throw new Error("browser batch postconditions must be an array");
    }
    for (const postcondition of batch.postconditions) {
      if (!isRecord(postcondition)) {
        throw new Error("browser batch postcondition must be an object");
      }
      assertPostcondition(postcondition);
    }
  }
}

function assertPostcondition(
  postcondition: Record<string, unknown>,
): asserts postcondition is BrowserPostcondition & Record<string, unknown> {
  const kind = postcondition.kind;
  if (![
    "url_includes",
    "text_present",
    "ref_absent",
    "ref_value_equals",
    "target_visible",
    "target_hidden",
    "target_value_equals",
    "page_revision_advanced",
  ].includes(String(kind))) {
    throw new Error(`Unsupported browser postcondition: ${String(kind)}`);
  }
  if (["url_includes", "text_present", "ref_value_equals", "target_value_equals"].includes(String(kind)) &&
      typeof postcondition.value !== "string") {
    throw new Error(`${String(kind)} requires value`);
  }
  if (["ref_absent", "ref_value_equals"].includes(String(kind)) &&
      (typeof postcondition.observationId !== "string" || typeof postcondition.ref !== "string")) {
    throw new Error(`${String(kind)} requires observationId and ref`);
  }
  if (["target_visible", "target_hidden", "target_value_equals"].includes(String(kind))) {
    const target = postcondition.target;
    if (
      !isRecord(target) ||
      typeof target.observationId !== "string" ||
      typeof target.ref !== "string"
    ) {
      throw new Error(`${String(kind)} requires a semantic target`);
    }
  }
  if (
    kind === "page_revision_advanced" &&
    (typeof postcondition.fromRevision !== "number" ||
      !Number.isInteger(postcondition.fromRevision) ||
      postcondition.fromRevision < 0)
  ) {
    throw new Error("page_revision_advanced requires fromRevision");
  }
}
