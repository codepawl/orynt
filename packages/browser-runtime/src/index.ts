import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

export const MAX_OBSERVATION_NODES = 250;
export const MAX_OBSERVATION_BYTES = 24 * 1024;
export const MAX_DELTA_NODES = 100;
export const MAX_DELTA_BYTES = 12 * 1024;
export const MAX_CANDIDATE_NODES = 30;
export const MAX_BATCH_ACTIONS = 8;
export const MAX_RECOVERY_ATTEMPTS = 2;

export type BrowserSessionMode = "isolated" | "attached";

export type BrowserPage = {
  id: string;
  title: string;
  url: string;
  type: string;
};

export type BrowserNode = {
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  focused?: boolean;
  backendDOMNodeId?: number;
  fingerprint?: string;
  tag?: string;
  inputType?: string;
  hrefOrigin?: string;
  regionPath?: string[];
  geometryBucket?: [number, number, number, number];
};

export type BrowserRegion = {
  id: string;
  kind: string;
  name?: string;
  parentId?: string;
  controlCount: number;
};

export type BrowserObservationDelta = {
  baseRevision: number;
  added: BrowserNode[];
  changed: BrowserNode[];
  removedFingerprints: string[];
};

export type BrowserObservation = {
  schemaVersion: 2;
  observationId: string;
  pageId: string;
  url: string;
  title: string;
  revision: number;
  mode: "snapshot" | "delta";
  nodes: BrowserNode[];
  regions: BrowserRegion[];
  delta?: BrowserObservationDelta;
  truncated: boolean;
  byteLength: number;
  scopeBlocked?: boolean;
  visionEscalationRequired?: boolean;
  visionEscalationReasons?: string[];
  timing?: BrowserObservationTiming;
  screenshotBase64?: string;
};

export type BrowserVisionCrop = {
  observationId: string;
  pageId: string;
  revision: number;
  ref: string;
  mimeType: "image/png";
  base64: string;
  clip: { x: number; y: number; width: number; height: number };
};

export type BrowserTargetIntent = {
  observationId: string;
  ref: string;
};

export type BrowserPostcondition =
  | { kind: "url_includes"; value: string }
  | { kind: "text_present"; value: string }
  | { kind: "ref_absent"; observationId: string; ref: string }
  | { kind: "ref_value_equals"; observationId: string; ref: string; value: string }
  | { kind: "target_visible"; target: BrowserTargetIntent }
  | { kind: "target_hidden"; target: BrowserTargetIntent }
  | { kind: "target_value_equals"; target: BrowserTargetIntent; value: string }
  | { kind: "page_revision_advanced"; fromRevision: number };

export type BrowserAction =
  | { kind: "navigate"; url: string }
  | { kind: "click"; observationId: string; ref: string }
  | { kind: "type"; observationId: string; ref: string; text: string; clear?: boolean }
  | { kind: "select"; observationId: string; ref: string; value: string }
  | { kind: "press"; key: string }
  | { kind: "scroll"; deltaX?: number; deltaY: number };

export type BrowserActionStep = {
  action: BrowserAction;
  postcondition?: BrowserPostcondition;
};

export type BrowserActionBatch = {
  id: string;
  expectedRevision?: number;
  actions: BrowserActionStep[];
  postconditions?: BrowserPostcondition[];
  maxRecoveryAttempts?: number;
};

export type BrowserActionIntent = {
  actionKind: BrowserAction["kind"];
  origin: string;
  target?: {
    role: string;
    name: string;
    tag?: string;
    inputType?: string;
    hrefOrigin?: string;
  };
  risk: "review" | "takeover" | "blocked";
  reasons: string[];
  summary: string;
  untrustedContent: string;
};

export type BrowserObservationTiming = {
  sensorMs: number;
  graphMs: number;
  retrievalMs: number;
};

export type BrowserExecutionTraceV2 = {
  schemaVersion: 2;
  batchId: string;
  actionCount: number;
  executedActionCount: number;
  recoveryCount: number;
  actionMs: number;
  waitMs: number;
  verifyMs: number;
  observationBytes: number;
  observationMode: BrowserObservation["mode"];
};

export type BrowserBatchExecutionResult = {
  batchId: string;
  pageId: string;
  status: "executed" | "partial" | "failed";
  verified: boolean;
  executedActionCount: number;
  failedActionIndex?: number;
  observation: BrowserObservation;
  trace: BrowserExecutionTraceV2;
  evidence: {
    beforeObservationIds: string[];
    afterObservationId: string;
    postconditions: BrowserPostcondition[];
  };
  reason: string;
};

export type BrowserActionResult = {
  actionId: string;
  pageId: string;
  status: "executed" | "failed";
  verified: boolean;
  observation: BrowserObservation;
  evidence: {
    beforeObservationId?: string;
    afterObservationId: string;
    postcondition?: BrowserPostcondition;
  };
  trace?: BrowserExecutionTraceV2;
  reason: string;
};

export type BrowserRuntimeStartOptions = {
  executablePath: string;
  userDataDir?: string;
  headless?: boolean;
  initialUrl?: string;
  startupTimeoutMs?: number;
  detached?: boolean;
  allowedOrigins?: string[];
};

export type BrowserRuntimeAttachOptions = {
  browserUrl?: string;
  webSocketUrl?: string;
  allowedOrigins?: string[];
};

export type BrowserObserveOptions = {
  pageId?: string;
  screenshot?: boolean;
  mode?: "compact" | "full" | "delta";
  sinceRevision?: number;
  focus?: string;
};

export type BrowserWaitOptions = {
  pageId?: string;
  postcondition: BrowserPostcondition;
  timeoutMs?: number;
};

export type BrowserToolName =
  | "browser_tabs"
  | "browser_observe"
  | "browser_act"
  | "browser_wait";

export type BrowserToolDefinition = {
  type: "function";
  name: BrowserToolName;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
};

export const BROWSER_AGENT_TOOLS: readonly BrowserToolDefinition[] = [
  {
    type: "function",
    name: "browser_tabs",
    description: "List browser pages. This is read-only.",
    strict: true,
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "browser_observe",
    description: "Read a bounded semantic page snapshot or revision delta. After a semantic observation, request visionRefs only for up to three ambiguous non-sensitive candidate refs.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        screenshot: { type: "boolean" },
        mode: { type: "string", enum: ["compact", "full", "delta"] },
        sinceRevision: { type: "number", minimum: 0 },
        focus: { type: "string", maxLength: 1_000 },
        visionRefs: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          uniqueItems: true,
          items: { type: "string", pattern: "^r[1-9][0-9]*$" },
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "browser_act",
    description: "Perform one typed browser action or one bounded action batch.",
    strict: true,
    parameters: {
      type: "object",
      required: ["pageId"],
      properties: {
        pageId: { type: "string" },
        action: { type: "object" },
        batch: { type: "object" },
        postcondition: { type: "object" },
      },
      oneOf: [
        { required: ["action"], not: { required: ["batch"] } },
        { required: ["batch"], not: { required: ["action"] } },
      ],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "browser_wait",
    description: "Wait for one typed browser postcondition.",
    strict: true,
    parameters: {
      type: "object",
      required: ["postcondition"],
      properties: {
        pageId: { type: "string" },
        postcondition: { type: "object" },
        timeoutMs: { type: "number", minimum: 1, maximum: 30_000 },
      },
      additionalProperties: false,
    },
  },
] as const;

export type BrowserToolCall = {
  callId: string;
  name: string;
  arguments: unknown;
};

export type BrowserToolResult = {
  output: string;
  isError?: boolean;
};

export interface BrowserToolAuthority {
  execute(name: BrowserToolName, arguments_: Record<string, unknown>): Promise<unknown>;
}

export class BrowserAgentToolExecutor {
  constructor(private readonly authority: BrowserToolAuthority) {}

  tools(): BrowserToolDefinition[] {
    return BROWSER_AGENT_TOOLS.map((tool) => structuredClone(tool));
  }

  async execute(call: BrowserToolCall): Promise<BrowserToolResult> {
    if (!BROWSER_AGENT_TOOLS.some((tool) => tool.name === call.name)) {
      return { output: JSON.stringify({ error: `Unsupported browser tool: ${call.name}` }), isError: true };
    }
    const arguments_ = record(call.arguments);
    if (Object.keys(arguments_).length === 0 && call.arguments !== undefined && !isRecord(call.arguments)) {
      return { output: JSON.stringify({ error: "Browser tool arguments must be an object" }), isError: true };
    }
    try {
      const result = await this.authority.execute(call.name as BrowserToolName, arguments_);
      return { output: JSON.stringify(result) };
    } catch (error) {
      return { output: JSON.stringify({ error: safeError(error) }), isError: true };
    }
  }
}

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  sessionId?: string;
};

type PendingCommand = {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

export interface CdpConnection {
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export class WebSocketCdpConnection implements CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCommand>();

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", (data) => this.receive(String(data)));
    socket.on("close", () => this.failPending(new Error("CDP connection closed")));
    socket.on("error", (error) => this.failPending(error));
  }

  static connect(url: string, timeoutMs = 10_000): Promise<WebSocketCdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, {
        maxPayload: 32 * 1024 * 1024,
        perMessageDeflate: false,
      });
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error("Timed out connecting to the CDP endpoint"));
      }, timeoutMs);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve(new WebSocketCdpConnection(socket));
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP connection is not open"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      this.socket.once("close", resolve);
      this.socket.close();
    });
  }

  private receive(raw: string): void {
    let message: CdpMessage;
    try {
      message = JSON.parse(raw) as CdpMessage;
    } catch {
      this.failPending(new Error("CDP returned malformed JSON"));
      return;
    }
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
    } else {
      pending.resolve(message.result ?? {});
    }
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

type ObservationState = BrowserObservation & {
  refs: Map<string, BrowserNode>;
};

type PageGraphState = {
  revision: number;
  nodesByFingerprint: Map<string, BrowserNode>;
  regions: BrowserRegion[];
  mutationObserverInstalled: boolean;
};

type DomNodeMetadata = {
  tag?: string;
  inputType?: string;
  hrefOrigin?: string;
  regionPath: string[];
  geometryBucket?: [number, number, number, number];
};

export class OryntCdpBrowserRuntime {
  private connection?: CdpConnection;
  private process?: ChildProcess;
  private endpoint?: string;
  private mode?: BrowserSessionMode;
  private readonly sessions = new Map<string, string>();
  private readonly observations = new Map<string, ObservationState>();
  private readonly pageGraphs = new Map<string, PageGraphState>();
  private readonly allowedOrigins = new Set<string>();

  constructor(
    private readonly connect: (url: string) => Promise<CdpConnection> =
      (url) => WebSocketCdpConnection.connect(url),
  ) {}

  get sessionMode(): BrowserSessionMode | undefined {
    return this.mode;
  }

  get webSocketUrl(): string | undefined {
    return this.endpoint;
  }

  get processId(): number | undefined {
    return this.process?.pid;
  }

  async start(options: BrowserRuntimeStartOptions): Promise<void> {
    this.assertDisconnected();
    if (!path.isAbsolute(options.executablePath)) {
      throw new Error("Chrome executablePath must be absolute");
    }
    const userDataDir = options.userDataDir
      ? path.resolve(options.userDataDir)
      : await mkdtemp(path.join(os.tmpdir(), "orynt-cdp-profile-"));
    await mkdir(userDataDir, { recursive: true, mode: 0o700 });
    const args = [
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      ...(options.headless === false ? [] : ["--headless=new"]),
      normalizeNavigableUrl(options.initialUrl ?? "about:blank"),
    ];
    this.process = spawn(options.executablePath, args, {
      stdio: "ignore",
      detached: options.detached ?? false,
    });
    let startupError: Error | undefined;
    this.process.once("error", (error) => {
      startupError = error;
    });
    if (options.detached) this.process.unref();
    const portFile = path.join(userDataDir, "DevToolsActivePort");
    const deadline = Date.now() + (options.startupTimeoutMs ?? 15_000);
    let port = "";
    let socketPath = "";
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (this.process.exitCode !== null) {
        throw new Error(`Chrome exited before CDP was ready (${this.process.exitCode})`);
      }
      try {
        const [line1, line2] = (await readFile(portFile, "utf8")).trim().split(/\r?\n/);
        port = line1 ?? "";
        socketPath = line2 ?? "";
        if (/^\d+$/.test(port) && socketPath) break;
      } catch {
        // Chrome creates DevToolsActivePort after the profile is ready.
      }
      await delay(25);
    }
    if (!port || !socketPath) throw new Error("Chrome did not publish DevToolsActivePort");
    await this.attach({
      webSocketUrl: `ws://127.0.0.1:${port}${socketPath}`,
      allowedOrigins: options.allowedOrigins ?? [],
    }, "isolated");
  }

  async attach(
    options: BrowserRuntimeAttachOptions,
    mode: BrowserSessionMode = "attached",
  ): Promise<void> {
    this.assertDisconnected();
    const endpoint = options.webSocketUrl ?? await discoverWebSocketUrl(options.browserUrl);
    assertLocalCdpEndpoint(endpoint);
    this.allowedOrigins.clear();
    for (const origin of options.allowedOrigins ?? []) {
      this.allowedOrigins.add(normalizeAllowedOrigin(origin));
    }
    const connection = await this.connect(endpoint);
    this.connection = connection;
    this.endpoint = endpoint;
    this.mode = mode;
    await connection.send("Target.setDiscoverTargets", { discover: true });
    await connection.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{ type: "page", exclude: false }],
    });
    await this.refreshSessions();
  }

  async listPages(): Promise<BrowserPage[]> {
    return (await this.listAllPages()).filter((page) =>
      this.isPageAllowed(page.url)
    );
  }

  private async listAllPages(): Promise<BrowserPage[]> {
    const result = await this.send("Target.getTargets");
    const targets = array(result.targetInfos);
    return targets
      .map(record)
      .filter((target) => target.type === "page")
      .map((target) => ({
        id: string(target.targetId),
        title: string(target.title),
        url: string(target.url),
        type: string(target.type),
      }));
  }

  async observe(options: BrowserObserveOptions = {}): Promise<BrowserObservation> {
    const page = await this.resolveAnyPage(options.pageId);
    if (!this.isPageAllowed(page.url)) {
      return this.scopeBlockedObservation(page);
    }
    const sessionId = await this.sessionFor(page.id);
    const graph = this.pageGraphs.get(page.id) ?? {
      revision: 0,
      nodesByFingerprint: new Map<string, BrowserNode>(),
      regions: [],
      mutationObserverInstalled: false,
    };
    this.pageGraphs.set(page.id, graph);
    await this.installMutationObserver(sessionId, graph);

    if (
      options.mode === "delta" &&
      graph.revision > 0 &&
      options.sinceRevision === graph.revision &&
      !(await this.hasBufferedMutations(sessionId))
    ) {
      const observation = this.buildObservation({
        page,
        graph,
        nodes: [],
        regions: graph.regions,
        mode: "delta",
        delta: {
          baseRevision: graph.revision,
          added: [],
          changed: [],
          removedFingerprints: [],
        },
        truncated: false,
        timing: { sensorMs: 0, graphMs: 0, retrievalMs: 0 },
      });
      this.rememberObservation(observation);
      return observation;
    }

    const sensorStarted = performance.now();
    await this.send("Accessibility.enable", {}, sessionId);
    let tree: Record<string, unknown>;
    let domSnapshot: Record<string, unknown>;
    try {
      [tree, domSnapshot] = await Promise.all([
        this.send(
          "Accessibility.getFullAXTree",
          { depth: -1 },
          sessionId,
        ),
        this.send(
          "DOMSnapshot.captureSnapshot",
          {
            computedStyles: ["display", "visibility", "position", "z-index"],
            includeDOMRects: true,
            includePaintOrder: true,
          },
          sessionId,
        ).catch(() => ({})),
      ]);
    } finally {
      await this.send("Accessibility.disable", {}, sessionId).catch(() => undefined);
    }
    const sensorMs = performance.now() - sensorStarted;
    const graphStarted = performance.now();
    const domMetadata = domMetadataByBackendId(domSnapshot);
    const candidates = array(tree.nodes)
      .map(record)
      .filter((node) => node.ignored !== true)
      .map((node) => axNode(node, domMetadata))
      .map((node) => {
        const fingerprint = semanticFingerprint(node);
        return {
          ...node,
          ref: `f-${fingerprint.slice(0, 12)}`,
          fingerprint,
        };
      });
    const regions = regionsForNodes(candidates);
    const currentByFingerprint = new Map(
      candidates
        .filter((node) => node.fingerprint)
        .map((node) => [node.fingerprint!, node]),
    );
    const graphChanged = !sameGraph(
      graph.nodesByFingerprint,
      currentByFingerprint,
    );
    const baseRevision = graph.revision;
    if (graph.revision === 0 || graphChanged) graph.revision += 1;
    const delta = graphDelta(
      graph.nodesByFingerprint,
      currentByFingerprint,
      baseRevision,
    );
    graph.nodesByFingerprint = currentByFingerprint;
    graph.regions = regions;
    const graphMs = performance.now() - graphStarted;

    const retrievalStarted = performance.now();
    const selected =
      options.mode === "delta"
        ? [...delta.added, ...delta.changed].slice(0, MAX_DELTA_NODES)
        : retrieveCandidates(
            candidates,
            options.focus,
            options.mode === "full"
              ? MAX_OBSERVATION_NODES
              : MAX_CANDIDATE_NODES,
          );
    const bounds =
      options.mode === "delta"
        ? { nodes: selected, truncated: selected.length < delta.added.length + delta.changed.length }
        : boundNodes(
            selected,
            options.mode === "full"
              ? MAX_OBSERVATION_NODES
              : MAX_CANDIDATE_NODES,
            MAX_OBSERVATION_BYTES,
          );
    const retrievalMs = performance.now() - retrievalStarted;
    const observationId = randomUUID();
    const nodes = bounds.nodes.map((node, index) => ({
      ...node,
      ref: `r${index + 1}`,
    }));
    const visionEscalationReasons = visionEscalationReasonsFor(
      candidates,
      nodes,
      options.focus,
    );
    const observation: BrowserObservation = {
      schemaVersion: 2,
      observationId,
      pageId: page.id,
      url: page.url,
      title: page.title,
      revision: graph.revision,
      mode: options.mode === "delta" ? "delta" : "snapshot",
      nodes,
      regions,
      ...(options.mode === "delta"
        ? {
            delta: {
              ...delta,
              added: withObservationRefs(delta.added, nodes),
              changed: withObservationRefs(delta.changed, nodes),
            },
          }
        : {}),
      truncated: bounds.truncated,
      byteLength: Buffer.byteLength(JSON.stringify(nodes)),
      ...(visionEscalationReasons.length > 0
        ? {
            visionEscalationRequired: true,
            visionEscalationReasons,
          }
        : {}),
      timing: { sensorMs, graphMs, retrievalMs },
    };
    if (options.screenshot) {
      const capture = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
      if (typeof capture.data === "string") observation.screenshotBase64 = capture.data;
    }
    this.rememberObservation(observation);
    return observation;
  }

  async inspectAction(
    pageId: string,
    action: BrowserAction,
  ): Promise<BrowserActionIntent> {
    validateAction(action);
    const page = await this.resolveAnyPage(pageId);
    const origin = navigablePageOrigin(page.url);
    if (!this.isPageAllowed(page.url)) {
      return {
        actionKind: action.kind,
        origin,
        risk: "blocked",
        reasons: ["The browser page origin is outside the explicit session scope."],
        summary: `Blocked ${action.kind} outside the allowed browser origin scope`,
        untrustedContent: "",
      };
    }
    if (action.kind === "navigate") {
      const targetOrigin = navigablePageOrigin(action.url);
      const allowed = this.isPageAllowed(action.url);
      return {
        actionKind: action.kind,
        origin: targetOrigin,
        risk: allowed ? "review" : "blocked",
        reasons: allowed
          ? ["Navigation is inside the explicit browser origin scope."]
          : ["Navigation target is outside the explicit browser origin scope."],
        summary: `${allowed ? "Navigate" : "Blocked navigation"} to ${targetOrigin}`,
        untrustedContent: "",
      };
    }
    if (action.kind === "press" || action.kind === "scroll") {
      return {
        actionKind: action.kind,
        origin,
        risk: "review",
        reasons: ["Browser input requires explicit approval."],
        summary:
          action.kind === "press"
            ? `Press ${action.key} on ${origin}`
            : `Scroll the page on ${origin}`,
        untrustedContent: "",
      };
    }
    const node = this.resolveRef(page.id, action.observationId, action.ref);
    const sessionId = await this.sessionFor(page.id);
    const metadata = await this.describeNodeMetadata(
      sessionId,
      node.backendDOMNodeId,
    );
    const target = {
      role: node.role,
      name: safeSemanticText(node.name),
      ...(metadata.tag ?? node.tag ? { tag: metadata.tag ?? node.tag } : {}),
      ...(metadata.inputType ?? node.inputType
        ? { inputType: metadata.inputType ?? node.inputType }
        : {}),
      ...(metadata.hrefOrigin ?? node.hrefOrigin
        ? { hrefOrigin: metadata.hrefOrigin ?? node.hrefOrigin }
        : {}),
    };
    const risk = classifyBrowserTargetRisk(action.kind, target);
    return {
      actionKind: action.kind,
      origin,
      target,
      risk: risk.risk,
      reasons: risk.reasons,
      summary: browserIntentSummary(action, origin, target),
      untrustedContent: [node.name, node.description].filter(Boolean).join("\n").slice(0, 1_000),
    };
  }

  async captureVisionCrops(input: {
    observationId: string;
    refs: string[];
    paddingCssPx?: number;
  }): Promise<BrowserVisionCrop[]> {
    if (input.refs.length < 1 || input.refs.length > 3 || new Set(input.refs).size !== input.refs.length) {
      throw new Error("Browser vision requires one to three unique candidate refs");
    }
    const state = this.observations.get(input.observationId);
    if (!state) throw new Error("Browser vision observation is stale or unknown");
    const page = await this.resolvePage(state.pageId);
    if (!this.isPageAllowed(page.url)) throw new Error("Browser vision page is outside the allowed origin scope");
    const graph = this.pageGraphs.get(page.id);
    if (!graph || graph.revision !== state.revision) {
      throw new Error("Browser vision observation revision is stale");
    }
    const sessionId = await this.sessionFor(page.id);
    const padding = Math.max(0, Math.min(48, input.paddingCssPx ?? 16));
    const crops: BrowserVisionCrop[] = [];
    for (const ref of input.refs) {
      const node = state.nodes.find((candidate) => candidate.ref === ref);
      if (!node?.backendDOMNodeId) throw new Error(`Browser vision candidate is unavailable: ${ref}`);
      if (isSensitiveVisionNode(node)) {
        throw new Error(`Browser vision is blocked for sensitive candidate: ${ref}`);
      }
      const box = await this.send("DOM.getBoxModel", {
        backendNodeId: node.backendDOMNodeId,
      }, sessionId);
      const model = record(box.model);
      const quad = array(model.border).map((value) => Number(value)).filter(Number.isFinite);
      if (quad.length < 8) throw new Error(`Browser vision candidate has no stable layout box: ${ref}`);
      const xs = [quad[0]!, quad[2]!, quad[4]!, quad[6]!];
      const ys = [quad[1]!, quad[3]!, quad[5]!, quad[7]!];
      const x = Math.max(0, Math.min(...xs) - padding);
      const y = Math.max(0, Math.min(...ys) - padding);
      const width = Math.max(1, Math.max(...xs) - x + padding);
      const height = Math.max(1, Math.max(...ys) - y + padding);
      const clip = { x, y, width, height };
      const capture = await this.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { ...clip, scale: 1 },
      }, sessionId);
      if (typeof capture.data !== "string") throw new Error("Browser vision crop capture failed");
      crops.push({
        observationId: input.observationId,
        pageId: page.id,
        revision: state.revision,
        ref,
        mimeType: "image/png",
        base64: capture.data,
        clip,
      });
    }
    return crops;
  }

  async inspectBatch(
    pageId: string,
    batch: BrowserActionBatch,
  ): Promise<BrowserActionIntent[]> {
    validateBatch(batch);
    const intents: BrowserActionIntent[] = [];
    for (const step of batch.actions) {
      intents.push(await this.inspectAction(pageId, step.action));
    }
    return intents;
  }

  async actBatch(
    pageId: string,
    batch: BrowserActionBatch,
  ): Promise<BrowserBatchExecutionResult> {
    validateBatch(batch);
    const startedAt = performance.now();
    const state = this.pageGraphs.get(pageId);
    if (
      batch.expectedRevision !== undefined &&
      state?.revision !== batch.expectedRevision
    ) {
      const observation = await this.observe({ pageId, mode: "compact" });
      return {
        batchId: batch.id,
        pageId,
        status: "failed",
        verified: false,
        executedActionCount: 0,
        failedActionIndex: 0,
        observation,
        trace: {
          schemaVersion: 2,
          batchId: batch.id,
          actionCount: batch.actions.length,
          executedActionCount: 0,
          recoveryCount: 0,
          actionMs: performance.now() - startedAt,
          waitMs: 0,
          verifyMs: 0,
          observationBytes: observation.byteLength,
          observationMode: observation.mode,
        },
        evidence: {
          beforeObservationIds: observationIdsForBatch(batch),
          afterObservationId: observation.observationId,
          postconditions: batch.postconditions ?? [],
        },
        reason: "Browser batch expected revision is stale.",
      };
    }

    let executedActionCount = 0;
    let recoveryCount = 0;
    let waitMs = 0;
    let lastResult: BrowserActionResult | undefined;
    const maxRecoveryAttempts = Math.min(
      batch.maxRecoveryAttempts ?? MAX_RECOVERY_ATTEMPTS,
      MAX_RECOVERY_ATTEMPTS,
    );
    for (let index = 0; index < batch.actions.length; index += 1) {
      let step = batch.actions[index];
      let postcondition =
        step.postcondition ?? implicitPostcondition(step.action);
      let result = await this.act(pageId, step.action, postcondition);
      let attempts = 0;
      while (
        result.status === "failed" &&
        !result.observation.scopeBlocked &&
        recoverablePreActionFailure(result.reason) &&
        attempts < maxRecoveryAttempts
      ) {
        const refreshed = await this.refreshActionTarget(pageId, step.action);
        if (!refreshed) break;
        attempts += 1;
        recoveryCount += 1;
        step = { ...step, action: refreshed };
        if (!step.postcondition) {
          postcondition = implicitPostcondition(refreshed);
        }
        result = await this.act(pageId, step.action, postcondition);
      }
      lastResult = result;
      waitMs += result.trace?.waitMs ?? 0;
      if (result.status !== "executed" || !result.verified) {
        executedActionCount += result.trace?.executedActionCount ?? 0;
        return batchResult({
          batch,
          pageId,
          status: executedActionCount > 0 ? "partial" : "failed",
          executedActionCount,
          failedActionIndex: index,
          recoveryCount,
          waitMs,
          startedAt,
          result,
          reason: result.reason,
        });
      }
      executedActionCount += 1;
    }

    for (const postcondition of batch.postconditions ?? []) {
      const waitStarted = performance.now();
      const verified = await this.wait({
        pageId,
        postcondition,
        timeoutMs: 8_000,
      });
      waitMs += performance.now() - waitStarted;
      if (!verified) {
        const observation = await this.observe({
          pageId,
          mode: "delta",
          sinceRevision: this.pageGraphs.get(pageId)?.revision,
        });
        const synthetic: BrowserActionResult = {
          actionId: randomUUID(),
          pageId,
          status: "failed",
          verified: false,
          observation,
          evidence: { afterObservationId: observation.observationId, postcondition },
          reason: "Browser batch postcondition was not observed.",
        };
        return batchResult({
          batch,
          pageId,
          status: executedActionCount > 0 ? "partial" : "failed",
          executedActionCount,
          failedActionIndex: batch.actions.length,
          recoveryCount,
          waitMs,
          startedAt,
          result: synthetic,
          reason: synthetic.reason,
        });
      }
    }

    if (!lastResult) throw new Error("Browser batch contains no actions");
    return batchResult({
      batch,
      pageId,
      status: "executed",
      executedActionCount,
      recoveryCount,
      waitMs,
      startedAt,
      result: lastResult,
      reason: "Browser action batch executed and verified.",
    });
  }

  async act(
    pageId: string,
    action: BrowserAction,
    postcondition?: BrowserPostcondition,
  ): Promise<BrowserActionResult> {
    const page = await this.resolvePage(pageId);
    const sessionId = await this.sessionFor(page.id);
    validateAction(action);
    if (action.kind === "navigate" && !this.isPageAllowed(action.url)) {
      throw new Error("Navigation target is outside the explicit browser origin scope");
    }
    const beforeObservationId = "observationId" in action ? action.observationId : undefined;
    const startedAt = performance.now();
    let waitMs = 0;
    try {
      if (action.kind === "navigate") {
        await this.send("Page.enable", {}, sessionId);
        await this.send("Page.navigate", { url: normalizeNavigableUrl(action.url) }, sessionId);
      } else if (action.kind === "press") {
        await dispatchKey(this.send.bind(this), sessionId, action.key);
      } else if (action.kind === "scroll") {
        await this.send("Runtime.evaluate", {
          expression: `scrollBy(${Math.trunc(action.deltaX ?? 0)},${Math.trunc(action.deltaY)})`,
          returnByValue: true,
        }, sessionId);
      } else {
        const node = this.resolveRef(page.id, action.observationId, action.ref);
        if (!node.backendDOMNodeId) throw new Error("Target reference has no DOM node");
        const resolved = await this.send("DOM.resolveNode", { backendNodeId: node.backendDOMNodeId }, sessionId);
        const objectId = string(record(resolved.object).objectId);
        if (!objectId) throw new Error("Target DOM node is no longer available");
        if (action.kind === "click") {
          await this.callOnNode(sessionId, objectId, ACTIONABLE_CLICK);
        } else if (action.kind === "type") {
          await this.callOnNode(sessionId, objectId, action.clear ? FOCUS_AND_CLEAR : FOCUS_NODE);
          await this.send("Input.insertText", { text: action.text }, sessionId);
        } else {
          await this.callOnNode(sessionId, objectId, SELECT_VALUE, [action.value]);
        }
      }
      const waitStarted = performance.now();
      const verified = postcondition
        ? await this.wait({ pageId: page.id, postcondition, timeoutMs: 8_000 })
        : true;
      waitMs = postcondition ? performance.now() - waitStarted : 0;
      const observation = await this.observe({
        pageId: page.id,
        mode: "delta",
        sinceRevision: this.pageGraphs.get(page.id)?.revision,
      });
      const scopeVerified = !observation.scopeBlocked;
      return {
        actionId: randomUUID(),
        pageId: page.id,
        status: scopeVerified ? "executed" : "failed",
        verified: verified && scopeVerified,
        observation,
        evidence: {
          ...(beforeObservationId ? { beforeObservationId } : {}),
          afterObservationId: observation.observationId,
          ...(postcondition ? { postcondition } : {}),
        },
        trace: {
          schemaVersion: 2,
          batchId: `single-${randomUUID()}`,
          actionCount: 1,
          executedActionCount: 1,
          recoveryCount: 0,
          actionMs: performance.now() - startedAt - waitMs,
          waitMs,
          verifyMs: waitMs,
          observationBytes: observation.byteLength,
          observationMode: observation.mode,
        },
        reason: !scopeVerified
          ? "Browser action moved outside the explicit origin scope; no page content was observed."
          : verified
            ? "Action executed and postcondition verified."
            : "Action executed but postcondition was not observed.",
      };
    } catch (error) {
      const observation = await this.observe({
        pageId: page.id,
        mode: "compact",
      });
      return {
        actionId: randomUUID(),
        pageId: page.id,
        status: "failed",
        verified: false,
        observation,
        evidence: {
          ...(beforeObservationId ? { beforeObservationId } : {}),
          afterObservationId: observation.observationId,
          ...(postcondition ? { postcondition } : {}),
        },
        trace: {
          schemaVersion: 2,
          batchId: `single-${randomUUID()}`,
          actionCount: 1,
          executedActionCount: 0,
          recoveryCount: 0,
          actionMs: performance.now() - startedAt,
          waitMs,
          verifyMs: waitMs,
          observationBytes: observation.byteLength,
          observationMode: observation.mode,
        },
        reason: safeError(error),
      };
    }
  }

  async wait(options: BrowserWaitOptions): Promise<boolean> {
    const page = await this.resolvePage(options.pageId);
    const sessionId = await this.sessionFor(page.id);
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8_000, 1), 30_000);
    if (options.postcondition.kind === "page_revision_advanced") {
      if (
        (this.pageGraphs.get(page.id)?.revision ?? 0) >
        options.postcondition.fromRevision
      ) {
        return true;
      }
      await this.waitExpression(
        sessionId,
        "Array.isArray(globalThis.__oryntMutationBuffer) && globalThis.__oryntMutationBuffer.length > 0",
        timeoutMs,
      );
      const observation = await this.observe({
        pageId: page.id,
        mode: "delta",
        sinceRevision: options.postcondition.fromRevision,
      });
      return observation.revision > options.postcondition.fromRevision;
    }
    if (options.postcondition.kind === "url_includes") {
      const value = JSON.stringify(options.postcondition.value);
      return this.waitExpression(sessionId, `location.href.includes(${value})`, timeoutMs);
    }
    if (options.postcondition.kind === "text_present") {
      const value = JSON.stringify(options.postcondition.value);
      return this.waitExpression(sessionId, `document.body?.innerText.includes(${value}) === true`, timeoutMs);
    }
    const semanticTarget =
      options.postcondition.kind === "target_visible" ||
      options.postcondition.kind === "target_hidden" ||
      options.postcondition.kind === "target_value_equals"
        ? options.postcondition.target
        : undefined;
    const observationId =
      semanticTarget?.observationId ??
      ("observationId" in options.postcondition
        ? options.postcondition.observationId
        : "");
    const ref =
      semanticTarget?.ref ??
      ("ref" in options.postcondition ? options.postcondition.ref : "");
    const state = this.observations.get(observationId);
    if (!state || state.pageId !== page.id) {
      throw new Error("Stale or invalid browser postcondition observation");
    }
    const node = state?.refs.get(ref);
    const absent =
      options.postcondition.kind === "ref_absent" ||
      options.postcondition.kind === "target_hidden";
    if (!node?.backendDOMNodeId) return absent;
    try {
      const resolved = await this.send("DOM.resolveNode", { backendNodeId: node.backendDOMNodeId }, sessionId);
      const objectId = string(record(resolved.object).objectId);
      if (!objectId) return options.postcondition.kind === "ref_absent";
      const expression =
        options.postcondition.kind === "ref_absent" ||
        options.postcondition.kind === "target_hidden"
          ? "!this.isConnected || this.hidden || getComputedStyle(this).display === 'none' || getComputedStyle(this).visibility === 'hidden'"
          : options.postcondition.kind === "target_visible"
            ? "this.isConnected && !this.hidden && getComputedStyle(this).display !== 'none' && getComputedStyle(this).visibility !== 'hidden'"
            : `String(this.value ?? this.textContent ?? '') === ${JSON.stringify(options.postcondition.value)}`;
      return this.waitNodeExpression(sessionId, objectId, expression, timeoutMs);
    } catch {
      return absent;
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.endpoint = undefined;
    this.sessions.clear();
    this.observations.clear();
    this.pageGraphs.clear();
    await connection?.close();
  }

  async close(): Promise<void> {
    if (this.connection && this.mode === "isolated") {
      await this.send("Browser.close").catch(() => undefined);
    }
    await this.disconnect();
    if (this.process && this.process.exitCode === null && !this.process.killed) {
      this.process.kill("SIGTERM");
    }
    this.process = undefined;
    this.mode = undefined;
  }

  private isPageAllowed(rawUrl: string): boolean {
    if (rawUrl === "about:blank") return true;
    try {
      return this.allowedOrigins.has(new URL(rawUrl).origin);
    } catch {
      return false;
    }
  }

  private scopeBlockedObservation(page: BrowserPage): BrowserObservation {
    const graph = this.pageGraphs.get(page.id);
    return {
      schemaVersion: 2,
      observationId: randomUUID(),
      pageId: page.id,
      url: safeOriginUrl(page.url),
      title: "",
      revision: graph?.revision ?? 0,
      mode: "snapshot",
      nodes: [],
      regions: [],
      truncated: false,
      byteLength: 2,
      scopeBlocked: true,
      timing: { sensorMs: 0, graphMs: 0, retrievalMs: 0 },
    };
  }

  private buildObservation(input: {
    page: BrowserPage;
    graph: PageGraphState;
    nodes: BrowserNode[];
    regions: BrowserRegion[];
    mode: BrowserObservation["mode"];
    delta?: BrowserObservationDelta;
    truncated: boolean;
    timing: BrowserObservationTiming;
  }): BrowserObservation {
    return {
      schemaVersion: 2,
      observationId: randomUUID(),
      pageId: input.page.id,
      url: input.page.url,
      title: input.page.title,
      revision: input.graph.revision,
      mode: input.mode,
      nodes: input.nodes,
      regions: input.regions,
      ...(input.delta ? { delta: input.delta } : {}),
      truncated: input.truncated,
      byteLength: Buffer.byteLength(JSON.stringify(input.nodes)),
      timing: input.timing,
    };
  }

  private rememberObservation(observation: BrowserObservation): void {
    this.observations.set(observation.observationId, {
      ...observation,
      refs: new Map(observation.nodes.map((node) => [node.ref, node])),
    });
    this.pruneObservations();
  }

  private async installMutationObserver(
    sessionId: string,
    graph: PageGraphState,
  ): Promise<void> {
    if (graph.mutationObserverInstalled) return;
    await this.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: MUTATION_BUFFER_SOURCE },
      sessionId,
    ).catch(() => undefined);
    await this.send(
      "Runtime.evaluate",
      { expression: MUTATION_BUFFER_SOURCE, returnByValue: true },
      sessionId,
    ).catch(() => undefined);
    graph.mutationObserverInstalled = true;
  }

  private async hasBufferedMutations(sessionId: string): Promise<boolean> {
    const result = await this.send(
      "Runtime.evaluate",
      {
        expression:
          "(() => { const b = globalThis.__oryntMutationBuffer; if (!Array.isArray(b)) return null; const changed = b.length > 0; b.splice(0, b.length); return changed; })()",
        returnByValue: true,
      },
      sessionId,
    ).catch(() => ({}));
    const value = record(record(result).result).value;
    return typeof value === "boolean" ? value : true;
  }

  private async describeNodeMetadata(
    sessionId: string,
    backendDOMNodeId?: number,
  ): Promise<DomNodeMetadata> {
    if (!backendDOMNodeId) return { regionPath: [] };
    const result = await this.send(
      "DOM.describeNode",
      { backendNodeId: backendDOMNodeId, depth: 0, pierce: true },
      sessionId,
    ).catch(() => ({}));
    const node = record(record(result).node);
    const attributes = attributeRecord(array(node.attributes));
    return {
      ...(string(node.localName) || string(node.nodeName)
        ? { tag: (string(node.localName) || string(node.nodeName)).toLowerCase() }
        : {}),
      ...(attributes.type ? { inputType: attributes.type.toLowerCase() } : {}),
      ...(hrefOrigin(attributes.href) ? { hrefOrigin: hrefOrigin(attributes.href) } : {}),
      regionPath: [],
    };
  }

  private async refreshActionTarget(
    pageId: string,
    action: BrowserAction,
  ): Promise<BrowserAction | undefined> {
    if (!("observationId" in action)) return undefined;
    const previous = this.observations
      .get(action.observationId)
      ?.refs.get(action.ref);
    if (!previous) return undefined;
    const observation = await this.observe({ pageId, mode: "full" });
    const exact = observation.nodes.find(
      (candidate) =>
        candidate.fingerprint &&
        candidate.fingerprint === previous.fingerprint,
    );
    const equivalent =
      exact ??
      observation.nodes.find(
        (candidate) =>
          candidate.role === previous.role &&
          normalizeSemanticText(candidate.name) ===
            normalizeSemanticText(previous.name) &&
          sameRegionPath(candidate.regionPath, previous.regionPath),
      );
    if (!equivalent) return undefined;
    return {
      ...action,
      observationId: observation.observationId,
      ref: equivalent.ref,
    };
  }

  private async refreshSessions(): Promise<void> {
    const pages = await this.listPages();
    for (const page of pages) await this.sessionFor(page.id);
  }

  private async sessionFor(targetId: string): Promise<string> {
    const existing = this.sessions.get(targetId);
    if (existing) return existing;
    const result = await this.send("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = string(result.sessionId);
    if (!sessionId) throw new Error(`Could not attach to page ${targetId}`);
    this.sessions.set(targetId, sessionId);
    await this.send("Page.enable", {}, sessionId);
    await this.send("DOM.enable", {}, sessionId);
    return sessionId;
  }

  private async resolvePage(pageId?: string): Promise<BrowserPage> {
    const pages = await this.listPages();
    const page = pageId ? pages.find((candidate) => candidate.id === pageId) : pages[0];
    if (!page) throw new Error(pageId ? `Browser page not found: ${pageId}` : "Browser has no page target");
    return page;
  }

  private async resolveAnyPage(pageId?: string): Promise<BrowserPage> {
    const pages = await this.listAllPages();
    const page = pageId
      ? pages.find((candidate) => candidate.id === pageId)
      : pages.find((candidate) => this.isPageAllowed(candidate.url)) ?? pages[0];
    if (!page) {
      throw new Error(
        pageId
          ? `Browser page not found: ${pageId}`
          : "Browser has no page target",
      );
    }
    return page;
  }

  private resolveRef(pageId: string, observationId: string, ref: string): BrowserNode {
    const observation = this.observations.get(observationId);
    if (!observation || observation.pageId !== pageId) {
      throw new Error("Stale or invalid browser observation");
    }
    const node = observation.refs.get(ref);
    if (!node) throw new Error(`Browser reference not found: ${ref}`);
    return node;
  }

  private pruneObservations(): void {
    while (this.observations.size > 20) {
      const oldest = this.observations.keys().next().value as string | undefined;
      if (!oldest) return;
      this.observations.delete(oldest);
    }
  }

  private async callOnNode(
    sessionId: string,
    objectId: string,
    functionDeclaration: string,
    arguments_: unknown[] = [],
  ): Promise<void> {
    const result = await this.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration,
      arguments: arguments_.map((value) => ({ value })),
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    const exception = record(result.exceptionDetails);
    if (Object.keys(exception).length > 0) {
      throw new Error(string(exception.text) || "Browser action failed");
    }
    const value = record(result.result).value;
    if (typeof value === "string" && value.startsWith("error:")) {
      throw new Error(value.slice(6));
    }
  }

  private async waitExpression(sessionId: string, expression: string, timeoutMs: number): Promise<boolean> {
    const functionDeclaration = `function(timeoutMs){const check=()=>Boolean(${expression});if(check())return true;return new Promise(resolve=>{const observer=new MutationObserver(()=>{if(check()){observer.disconnect();resolve(true)}});observer.observe(document,{subtree:true,childList:true,attributes:true,characterData:true});setTimeout(()=>{observer.disconnect();resolve(check())},timeoutMs)})}`;
    const result = await this.send("Runtime.evaluate", {
      expression: `(${functionDeclaration})(${timeoutMs})`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    return record(result.result).value === true;
  }

  private async waitNodeExpression(sessionId: string, objectId: string, expression: string, timeoutMs: number): Promise<boolean> {
    const result = await this.send("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(timeoutMs){const check=()=>Boolean(${expression});if(check())return true;return new Promise(resolve=>{const observer=new MutationObserver(()=>{if(check()){observer.disconnect();resolve(true)}});observer.observe(document,{subtree:true,childList:true,attributes:true,characterData:true});setTimeout(()=>{observer.disconnect();resolve(check())},timeoutMs)})}`,
      arguments: [{ value: timeoutMs }],
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    return record(result.result).value === true;
  }

  private send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    if (!this.connection) throw new Error("Browser runtime is not connected");
    return this.connection.send(method, params, sessionId);
  }

  private assertDisconnected(): void {
    if (this.connection) throw new Error("Browser runtime is already connected");
  }
}

const FOCUS_NODE = `function(){if(!this.isConnected)return "error:target is detached";const r=this.getBoundingClientRect();const s=getComputedStyle(this);if(r.width<=0||r.height<=0||s.visibility==="hidden"||s.display==="none")return "error:target is not visible";this.focus();return "ok"}`;
const FOCUS_AND_CLEAR = `function(){if(!this.isConnected)return "error:target is detached";const r=this.getBoundingClientRect();const s=getComputedStyle(this);if(r.width<=0||r.height<=0||s.visibility==="hidden"||s.display==="none")return "error:target is not visible";this.focus();if("value" in this){this.value="";this.dispatchEvent(new Event("input",{bubbles:true}))}return "ok"}`;
const ACTIONABLE_CLICK = `function(){if(!this.isConnected)return "error:target is detached";const r=this.getBoundingClientRect();const s=getComputedStyle(this);if(r.width<=0||r.height<=0||s.visibility==="hidden"||s.display==="none"||this.disabled)return "error:target is not actionable";const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(hit!==this&&!this.contains(hit))return "error:target is obscured";this.click();return "ok"}`;
const SELECT_VALUE = `function(value){if(!this.isConnected)return "error:target is detached";if(!(this instanceof HTMLSelectElement))return "error:target is not a select";const option=[...this.options].find(item=>item.value===value);if(!option)return "error:option not found";this.value=value;this.dispatchEvent(new Event("input",{bubbles:true}));this.dispatchEvent(new Event("change",{bubbles:true}));return "ok"}`;
const MUTATION_BUFFER_SOURCE = `(() => {
  if (Array.isArray(globalThis.__oryntMutationBuffer)) return;
  const buffer = [];
  Object.defineProperty(globalThis, "__oryntMutationBuffer", {
    value: buffer,
    configurable: false,
    writable: false
  });
  new MutationObserver((records) => {
    for (const record of records) {
      buffer.push({
        type: record.type,
        attribute: record.attributeName ?? null,
        added: record.addedNodes.length,
        removed: record.removedNodes.length
      });
    }
    if (buffer.length > 2000) buffer.splice(0, buffer.length - 2000);
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "aria-expanded", "aria-selected", "aria-checked", "aria-disabled",
      "disabled", "hidden", "value", "class"
    ]
  });
})()`;

async function discoverWebSocketUrl(browserUrl?: string): Promise<string> {
  if (!browserUrl) throw new Error("browserUrl or webSocketUrl is required");
  const url = new URL("/json/version", browserUrl);
  if (!isLoopback(url.hostname)) throw new Error("Only loopback CDP endpoints are allowed");
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`CDP discovery failed with HTTP ${response.status}`);
  const payload = record(await response.json());
  const endpoint = string(payload.webSocketDebuggerUrl);
  if (!endpoint) throw new Error("CDP discovery response has no webSocketDebuggerUrl");
  return endpoint;
}

function assertLocalCdpEndpoint(endpoint: string): void {
  const url = new URL(endpoint);
  if (!["ws:", "wss:"].includes(url.protocol)) throw new Error("CDP endpoint must use ws or wss");
  if (!isLoopback(url.hostname)) throw new Error("Only loopback CDP endpoints are allowed in the local runtime");
}

function isLoopback(hostname: string): boolean {
  return ["127.0.0.1", "::1", "[::1]", "localhost"].includes(hostname);
}

function normalizeNavigableUrl(raw: string): string {
  const url = new URL(raw);
  if (!["http:", "https:", "about:"].includes(url.protocol)) {
    throw new Error("Navigation is limited to http, https, and about URLs");
  }
  return url.toString();
}

function normalizeAllowedOrigin(raw: string): string {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Allowed browser origins must contain only http(s) scheme, host, and optional port",
    );
  }
  return url.origin;
}

function navigablePageOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === "about:" ? "about:blank" : url.origin;
  } catch {
    return "[invalid-origin]";
  }
}

function safeOriginUrl(raw: string): string {
  const origin = navigablePageOrigin(raw);
  return origin === "about:blank" || origin === "[invalid-origin]"
    ? origin
    : `${origin}/`;
}

function validateAction(action: BrowserAction): void {
  const serialized = JSON.stringify(action);
  if (Buffer.byteLength(serialized) > 16 * 1024) throw new Error("Browser action exceeds 16 KiB");
  if (action.kind === "type" && action.text.length > 8_000) throw new Error("Typed text exceeds 8,000 characters");
  if (action.kind === "press" && !/^(?:Enter|Tab|Escape|Backspace|Delete|Arrow(?:Up|Down|Left|Right)|Home|End|Page(?:Up|Down)|[A-Za-z0-9])$/.test(action.key)) {
    throw new Error(`Unsupported browser key: ${action.key}`);
  }
  if (action.kind === "scroll" && (!Number.isFinite(action.deltaY) || Math.abs(action.deltaY) > 10_000)) {
    throw new Error("scroll deltaY must be finite and at most 10,000");
  }
}

async function dispatchKey(
  send: (
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ) => Promise<Record<string, unknown>>,
  sessionId: string,
  key: string,
): Promise<void> {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key }, sessionId);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key }, sessionId);
}

function axNode(
  node: Record<string, unknown>,
  metadata: Map<number, DomNodeMetadata> = new Map(),
): Omit<BrowserNode, "ref"> {
  const properties = array(node.properties).map(record);
  const property = (name: string) => record(properties.find((item) => item.name === name)?.value).value;
  const backendDOMNodeId =
    typeof node.backendDOMNodeId === "number"
      ? node.backendDOMNodeId
      : undefined;
  const dom = backendDOMNodeId
    ? metadata.get(backendDOMNodeId)
    : undefined;
  return {
    role: string(record(node.role).value) || "unknown",
    name: string(record(node.name).value).slice(0, 500),
    ...(string(record(node.value).value) ? { value: string(record(node.value).value).slice(0, 1_000) } : {}),
    ...(string(record(node.description).value) ? { description: string(record(node.description).value).slice(0, 500) } : {}),
    ...(property("disabled") === true ? { disabled: true } : {}),
    ...(property("focused") === true ? { focused: true } : {}),
    ...(backendDOMNodeId ? { backendDOMNodeId } : {}),
    ...(dom?.tag ? { tag: dom.tag } : {}),
    ...(dom?.inputType ? { inputType: dom.inputType } : {}),
    ...(dom?.hrefOrigin ? { hrefOrigin: dom.hrefOrigin } : {}),
    ...(dom?.regionPath.length ? { regionPath: dom.regionPath } : {}),
    ...(dom?.geometryBucket ? { geometryBucket: dom.geometryBucket } : {}),
  };
}

export function boundNodes<T extends Omit<BrowserNode, "ref">>(
  nodes: T[],
  maxNodes = MAX_OBSERVATION_NODES,
  maxBytes = MAX_OBSERVATION_BYTES,
): { nodes: T[]; truncated: boolean } {
  const bounded: T[] = [];
  let bytes = 2;
  for (const node of nodes) {
    if (bounded.length >= maxNodes) break;
    const nodeBytes = Buffer.byteLength(JSON.stringify(node)) + (bounded.length ? 1 : 0);
    if (bytes + nodeBytes > maxBytes) break;
    bounded.push(node);
    bytes += nodeBytes;
  }
  return { nodes: bounded, truncated: bounded.length < nodes.length };
}

function domMetadataByBackendId(
  snapshot: Record<string, unknown>,
): Map<number, DomNodeMetadata> {
  const metadata = new Map<number, DomNodeMetadata>();
  const strings = array(snapshot.strings).map(string);
  for (const document_ of array(snapshot.documents).map(record)) {
    const nodes = record(document_.nodes);
    const backendIds = array(nodes.backendNodeId);
    const nodeNames = array(nodes.nodeName);
    const parents = array(nodes.parentIndex);
    const attributes = array(nodes.attributes);
    const layout = record(document_.layout);
    const layoutIndexes = array(layout.nodeIndex);
    const layoutBounds = array(layout.bounds);
    const geometryByNodeIndex = new Map<number, [number, number, number, number]>();
    for (let index = 0; index < layoutIndexes.length; index += 1) {
      const nodeIndex = Number(layoutIndexes[index]);
      const bounds = array(layoutBounds[index]).map(Number);
      if (
        Number.isInteger(nodeIndex) &&
        bounds.length >= 4 &&
        bounds.slice(0, 4).every(Number.isFinite)
      ) {
        geometryByNodeIndex.set(nodeIndex, [
          Math.round(bounds[0] / 16) * 16,
          Math.round(bounds[1] / 16) * 16,
          Math.round(bounds[2] / 16) * 16,
          Math.round(bounds[3] / 16) * 16,
        ]);
      }
    }
    const attributeByIndex = attributes.map((value) =>
      attributeRecord(array(value), strings)
    );
    const regionIdByIndex = new Map<number, string>();
    for (let index = 0; index < backendIds.length; index += 1) {
      const tag = snapshotString(nodeNames[index], strings).toLowerCase();
      const role = attributeByIndex[index]?.role?.toLowerCase();
      const kind = regionKind(tag, role);
      if (kind) {
        regionIdByIndex.set(
          index,
          `${kind}:${Number(backendIds[index]) || index}`,
        );
      }
    }
    for (let index = 0; index < backendIds.length; index += 1) {
      const backendDOMNodeId = Number(backendIds[index]);
      if (!Number.isInteger(backendDOMNodeId) || backendDOMNodeId <= 0) continue;
      const attributes_ = attributeByIndex[index] ?? {};
      const regionPath: string[] = [];
      let cursor = index;
      const seen = new Set<number>();
      while (cursor >= 0 && !seen.has(cursor)) {
        seen.add(cursor);
        const regionId = regionIdByIndex.get(cursor);
        if (regionId) regionPath.unshift(regionId);
        const parent = Number(parents[cursor]);
        if (!Number.isInteger(parent) || parent < 0) break;
        cursor = parent;
      }
      metadata.set(backendDOMNodeId, {
        ...(snapshotString(nodeNames[index], strings)
          ? { tag: snapshotString(nodeNames[index], strings).toLowerCase() }
          : {}),
        ...(attributes_.type
          ? { inputType: attributes_.type.toLowerCase() }
          : {}),
        ...(hrefOrigin(attributes_.href)
          ? { hrefOrigin: hrefOrigin(attributes_.href) }
          : {}),
        regionPath,
        ...(geometryByNodeIndex.get(index)
          ? { geometryBucket: geometryByNodeIndex.get(index)! }
          : {}),
      });
    }
  }
  return metadata;
}

function snapshotString(value: unknown, strings: string[]): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return strings[value] ?? "";
  }
  return string(value);
}

function attributeRecord(
  values: unknown[],
  strings: string[] = [],
): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (let index = 0; index + 1 < values.length; index += 2) {
    const name = snapshotString(values[index], strings).toLowerCase();
    if (!name) continue;
    attributes[name] = snapshotString(values[index + 1], strings);
  }
  return attributes;
}

function hrefOrigin(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol)
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function regionKind(tag: string, role?: string): string | undefined {
  const value = role || tag;
  if (["main", "navigation", "nav", "form", "dialog", "header", "banner", "footer", "contentinfo", "aside", "complementary", "section", "search"].includes(value)) {
    return value === "nav"
      ? "navigation"
      : value === "banner"
        ? "header"
        : value === "contentinfo"
          ? "footer"
          : value === "complementary"
            ? "aside"
            : value;
  }
  return undefined;
}

function regionsForNodes(nodes: BrowserNode[]): BrowserRegion[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    for (const regionId of node.regionPath ?? []) {
      counts.set(regionId, (counts.get(regionId) ?? 0) + 1);
    }
  }
  const regions: BrowserRegion[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    const path_ = node.regionPath ?? [];
    for (let index = 0; index < path_.length; index += 1) {
      const id = path_[index];
      if (seen.has(id)) continue;
      seen.add(id);
      regions.push({
        id,
        kind: id.split(":")[0] || "region",
        ...(index > 0 ? { parentId: path_[index - 1] } : {}),
        controlCount: counts.get(id) ?? 0,
      });
    }
  }
  if (regions.length === 0) {
    regions.push({ id: "document:root", kind: "document", controlCount: nodes.length });
  }
  return regions;
}

function semanticFingerprint(node: Omit<BrowserNode, "ref">): string {
  return createHash("sha256")
    .update([
      node.role,
      normalizeSemanticText(node.name),
      node.tag ?? "",
      node.inputType ?? "",
      (node.regionPath ?? []).join("/"),
      node.hrefOrigin ?? "",
    ].join("\0"))
    .digest("hex");
}

function normalizeSemanticText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function safeSemanticText(value: string): string {
  return value
    .replace(
      /\b(?:bearer\s+)?[a-z0-9_-]*(?:token|secret|password|api[_ -]?key)[a-z0-9_-]*\s*[:=]\s*\S+/giu,
      "[REDACTED]",
    )
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .slice(0, 160);
}

function sameGraph(
  left: Map<string, BrowserNode>,
  right: Map<string, BrowserNode>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [fingerprint, node] of left) {
    const candidate = right.get(fingerprint);
    if (
      !candidate ||
      candidate.disabled !== node.disabled ||
      candidate.focused !== node.focused ||
      candidate.value !== node.value
    ) {
      return false;
    }
  }
  return true;
}

function graphDelta(
  previous: Map<string, BrowserNode>,
  current: Map<string, BrowserNode>,
  baseRevision: number,
): BrowserObservationDelta {
  const added: BrowserNode[] = [];
  const changed: BrowserNode[] = [];
  for (const [fingerprint, node] of current) {
    const old = previous.get(fingerprint);
    if (!old) added.push(node);
    else if (
      old.disabled !== node.disabled ||
      old.focused !== node.focused ||
      old.value !== node.value
    ) changed.push(node);
  }
  return {
    baseRevision,
    added,
    changed,
    removedFingerprints: [...previous.keys()].filter(
      (fingerprint) => !current.has(fingerprint),
    ),
  };
}

function withObservationRefs(
  values: BrowserNode[],
  selected: BrowserNode[],
): BrowserNode[] {
  const selectedByFingerprint = new Map(
    selected.map((node) => [node.fingerprint, node]),
  );
  return values.flatMap((node) => {
    const selectedNode = selectedByFingerprint.get(node.fingerprint);
    return selectedNode ? [selectedNode] : [];
  });
}

function retrieveCandidates(
  nodes: BrowserNode[],
  focus: string | undefined,
  limit: number,
): BrowserNode[] {
  const interactive = nodes.filter((node) =>
    INTERACTIVE_ROLES.has(node.role.toLowerCase())
  );
  const candidates = interactive.length > 0 ? interactive : nodes;
  const queryTerms = tokenize(focus ?? "");
  if (queryTerms.length === 0) return candidates.slice(0, limit);
  const documents = candidates.map((node) =>
    tokenize([
      node.role,
      node.name,
      node.description ?? "",
      ...(node.regionPath ?? []),
    ].join(" "))
  );
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const term of new Set(document)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  return candidates
    .map((node, index) => {
      const document = documents[index];
      const frequencies = new Map<string, number>();
      for (const term of document) {
        frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      }
      let score = 0;
      for (const term of queryTerms) {
        const tf = frequencies.get(term) ?? 0;
        const df = documentFrequency.get(term) ?? 0;
        score += tf * Math.log(1 + candidates.length / (1 + df));
      }
      const normalizedName = normalizeSemanticText(node.name);
      const normalizedFocus = normalizeSemanticText(focus ?? "");
      if (normalizedName === normalizedFocus) score += 10;
      else if (normalizedName.includes(normalizedFocus)) score += 4;
      return { node, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ node }) => node);
}

function visionEscalationReasonsFor(
  allNodes: BrowserNode[],
  selectedNodes: BrowserNode[],
  focus: string | undefined,
): string[] {
  const reasons: string[] = [];
  if (
    allNodes.some(
      (node) =>
        node.tag?.toLowerCase() === "canvas" ||
        node.role.toLowerCase() === "canvas",
    )
  ) {
    reasons.push("Relevant page structure includes canvas content.");
  }
  if (
    allNodes.some(
      (node) =>
        INTERACTIVE_ROLES.has(node.role.toLowerCase()) &&
        node.name.trim().length === 0,
    )
  ) {
    reasons.push("One or more interactive controls lack a semantic name.");
  }
  if (focus?.trim() && selectedNodes.length === 0) {
    reasons.push("Structured retrieval found no candidate for the requested focus.");
  }
  return reasons;
}

function tokenize(value: string): string[] {
  return normalizeSemanticText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1)
    .slice(0, 200);
}

const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
]);

function classifyBrowserTargetRisk(
  actionKind: BrowserAction["kind"],
  target: NonNullable<BrowserActionIntent["target"]>,
): Pick<BrowserActionIntent, "risk" | "reasons"> {
  const semantic = [
    target.role,
    target.name,
    target.tag ?? "",
    target.inputType ?? "",
  ].join(" ").toLowerCase();
  const sensitive =
    target.inputType === "password" ||
    /\b(password|passcode|credential|api key|token|secret|otp|one[- ]time|cvv|cvc|card number|credit card|payment|purchase|buy now|place order|bank|send(?: email| message)?|publish|post publicly|delete|remove account|permission|grant access|upload)\b/u.test(semantic);
  return sensitive
    ? {
        risk: "takeover",
        reasons: [
          "The semantic browser target is credential, payment, external-send, destructive, upload, account, or permission related.",
        ],
      }
    : {
        risk: "review",
        reasons: [`Typed browser ${actionKind} requires explicit approval.`],
      };
}

function isSensitiveVisionNode(node: BrowserNode): boolean {
  const semantic = [
    node.role,
    node.name,
    node.description ?? "",
    node.tag ?? "",
    node.inputType ?? "",
  ].join(" ").toLowerCase();
  return (
    node.inputType === "password" ||
    /\b(password|passcode|credential|api key|token|secret|otp|one[- ]time|cvv|cvc|card number|credit card|payment|purchase|buy now|place order|bank)\b/u.test(semantic)
  );
}

function browserIntentSummary(
  action: BrowserAction,
  origin: string,
  target: NonNullable<BrowserActionIntent["target"]>,
): string {
  const label = target.name || target.role || target.tag || "unnamed control";
  if (action.kind === "type") {
    return `Type ${action.text.length} character(s) into ${target.role} “${label}” on ${origin}`;
  }
  if (action.kind === "select") {
    return `Select an option in ${target.role} “${label}” on ${origin}`;
  }
  return `${action.kind === "click" ? "Click" : action.kind} ${target.role} “${label}” on ${origin}`;
}

function validateBatch(batch: BrowserActionBatch): void {
  if (!batch.id || batch.id.length > 200) {
    throw new Error("Browser batch id must contain 1-200 characters");
  }
  if (
    batch.actions.length === 0 ||
    batch.actions.length > MAX_BATCH_ACTIONS
  ) {
    throw new Error(
      `Browser batch must contain 1-${MAX_BATCH_ACTIONS} actions`,
    );
  }
  if (
    batch.maxRecoveryAttempts !== undefined &&
    (!Number.isInteger(batch.maxRecoveryAttempts) ||
      batch.maxRecoveryAttempts < 0 ||
      batch.maxRecoveryAttempts > MAX_RECOVERY_ATTEMPTS)
  ) {
    throw new Error(
      `Browser batch recovery attempts must be 0-${MAX_RECOVERY_ATTEMPTS}`,
    );
  }
  for (const step of batch.actions) {
    validateAction(step.action);
    if (step.action.kind === "click" && !step.postcondition) {
      throw new Error("Every click in a browser batch requires a postcondition");
    }
  }
  if (Buffer.byteLength(JSON.stringify(batch)) > 64 * 1024) {
    throw new Error("Browser batch exceeds 64 KiB");
  }
}

function implicitPostcondition(
  action: BrowserAction,
): BrowserPostcondition | undefined {
  if (action.kind === "navigate") {
    return { kind: "url_includes", value: action.url };
  }
  if (action.kind === "type") {
    return {
      kind: "ref_value_equals",
      observationId: action.observationId,
      ref: action.ref,
      value: action.text,
    };
  }
  if (action.kind === "select") {
    return {
      kind: "ref_value_equals",
      observationId: action.observationId,
      ref: action.ref,
      value: action.value,
    };
  }
  return undefined;
}

function observationIdsForBatch(batch: BrowserActionBatch): string[] {
  return [
    ...new Set(
      batch.actions.flatMap(({ action }) =>
        "observationId" in action ? [action.observationId] : []
      ),
    ),
  ];
}

function batchResult(input: {
  batch: BrowserActionBatch;
  pageId: string;
  status: BrowserBatchExecutionResult["status"];
  executedActionCount: number;
  failedActionIndex?: number;
  recoveryCount: number;
  waitMs: number;
  startedAt: number;
  result: BrowserActionResult;
  reason: string;
}): BrowserBatchExecutionResult {
  return {
    batchId: input.batch.id,
    pageId: input.pageId,
    status: input.status,
    verified: input.status === "executed" && input.result.verified,
    executedActionCount: input.executedActionCount,
    ...(input.failedActionIndex === undefined
      ? {}
      : { failedActionIndex: input.failedActionIndex }),
    observation: input.result.observation,
    trace: {
      schemaVersion: 2,
      batchId: input.batch.id,
      actionCount: input.batch.actions.length,
      executedActionCount: input.executedActionCount,
      recoveryCount: input.recoveryCount,
      actionMs: performance.now() - input.startedAt - input.waitMs,
      waitMs: input.waitMs,
      verifyMs: input.waitMs,
      observationBytes: input.result.observation.byteLength,
      observationMode: input.result.observation.mode,
    },
    evidence: {
      beforeObservationIds: observationIdsForBatch(input.batch),
      afterObservationId: input.result.observation.observationId,
      postconditions: [
        ...input.batch.actions.flatMap(({ postcondition }) =>
          postcondition ? [postcondition] : []
        ),
        ...(input.batch.postconditions ?? []),
      ],
    },
    reason: input.reason,
  };
}

function sameRegionPath(
  left: string[] | undefined,
  right: string[] | undefined,
): boolean {
  return (left ?? []).join("/") === (right ?? []).join("/");
}

function recoverablePreActionFailure(reason: string): boolean {
  return /stale|detached|no longer available|not visible|not actionable|obscured|DOM node|reference not found/iu.test(
    reason,
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(cookie|authorization|token|password|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 1_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
