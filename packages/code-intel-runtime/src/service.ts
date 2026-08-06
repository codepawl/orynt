import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  LineIndex,
  LspAdapterRegistry,
  LspManager,
  LspRuntimeError,
  LspWorkspace,
  WorkspaceRevisionAuthority,
  type LspDetectedRoot,
  type CustomLanguageServerAdapter,
  type LspWorkspaceSnapshot,
} from "@codepawl/lsp-runtime";
import type {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CodeAction,
  Command,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  SymbolInformation,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";

import {
  CODE_INTEL_PROTOCOL,
  CODE_INTEL_SCHEMA_VERSION,
  DEFAULT_RESULT_BUDGET,
  type CodeIntelEnvelope,
  type CodeIntelErrorCode,
  type CodeIntelEvidence,
  type CodeIntelStatus,
  type ResolvedSymbol,
  type ResultBudget,
  type SemanticSelector,
  type SourceRange,
  type MutationApplyResult,
  type MutationPreview,
  CodeIntelProtocolError,
} from "./contracts.js";
import {
  createMutationPreview,
  type MutationApprovalBundle,
  type MutationRuntime,
  type StoredMutationPreview,
} from "./mutation.js";
import {
  MemoryMutationPreviewStore,
  type MutationPreviewStore,
} from "./previewStore.js";

type SymbolCandidate = {
  name: string;
  qualifiedName: string;
  kind: number;
  uri: string;
  range: SourceRange;
  selectionRange: SourceRange;
  path: string;
  confidence: number;
  adapterId: string;
  language: string;
  root: string;
};

type Cached = {
  revision: number;
  value: CodeIntelEnvelope<unknown>;
};

type ContextPack = {
  primary: Awaited<ReturnType<CodeIntelService["inspect"]>>["data"];
  relations: Awaited<ReturnType<CodeIntelService["relations"]>>["data"];
  diagnostics: Awaited<ReturnType<CodeIntelService["diagnostics"]>>["data"];
  omitted: number;
};

type NormalizedDiagnostic = {
  id: string;
  path: string;
  range: SourceRange;
  severity?: number;
  code?: string | number;
  message: string;
  source?: string;
};

type StoredCodeAction = {
  action: CodeAction | Command;
  path: string;
  adapterId: string;
  language: string;
  snapshot: LspWorkspaceSnapshot;
  expiresAt: number;
};

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function requireNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new CodeIntelProtocolError(
    "REQUEST_CANCELLED",
    "Code-intelligence operation was cancelled.",
    true,
  );
}

function normalizeBudget(input?: Partial<ResultBudget>): ResultBudget {
  return {
    maxItems: Math.min(100, Math.max(1, input?.maxItems ?? DEFAULT_RESULT_BUDGET.maxItems)),
    maxChars: Math.min(50_000, Math.max(512, input?.maxChars ?? DEFAULT_RESULT_BUDGET.maxChars)),
    maxSnippetLines: Math.min(
      120,
      Math.max(1, input?.maxSnippetLines ?? DEFAULT_RESULT_BUDGET.maxSnippetLines),
    ),
    includeDeclaration:
      input?.includeDeclaration ?? DEFAULT_RESULT_BUDGET.includeDeclaration,
    includeGenerated:
      input?.includeGenerated ?? DEFAULT_RESULT_BUDGET.includeGenerated,
    includeTests: input?.includeTests ?? DEFAULT_RESULT_BUDGET.includeTests,
  };
}

function range(value: SourceRange): SourceRange {
  return {
    start: {
      line: Math.max(0, value.start.line),
      character: Math.max(0, value.start.character),
    },
    end: {
      line: Math.max(0, value.end.line),
      character: Math.max(0, value.end.character),
    },
  };
}

function locationFromDefinition(
  value: Location | LocationLink,
): { uri: string; range: SourceRange } {
  if ("targetUri" in value) {
    return {
      uri: value.targetUri,
      range: range(value.targetSelectionRange),
    };
  }
  return { uri: value.uri, range: range(value.range) };
}

function flattenDocumentSymbols(
  values: DocumentSymbol[],
  uri: string,
  path_: string,
  adapterId: string,
  language: string,
  root: string,
  parents: string[] = [],
): SymbolCandidate[] {
  const output: SymbolCandidate[] = [];
  for (const value of values) {
    const qualified = [...parents, value.name].join(".");
    output.push({
      name: value.name,
      qualifiedName: qualified,
      kind: value.kind,
      uri,
      path: path_,
      range: range(value.range),
      selectionRange: range(value.selectionRange),
      confidence: 1,
      adapterId,
      language,
      root,
    });
    output.push(
      ...flattenDocumentSymbols(
        value.children ?? [],
        uri,
        path_,
        adapterId,
        language,
        root,
        [...parents, value.name],
      ),
    );
  }
  return output;
}

export type CodeIntelServiceOptions = {
  maxSessions?: number;
  maxCacheEntries?: number;
  customAdapters?: CustomLanguageServerAdapter[];
  previewStore?: MutationPreviewStore;
};

export class CodeIntelService {
  private readonly manager: LspManager;
  private readonly cache = new Map<string, Cached>();
  private readonly inFlight = new Map<string, Promise<CodeIntelEnvelope<unknown>>>();
  private readonly handles = new Map<
    string,
    { symbol: SymbolCandidate; revision: number; epoch: number }
  >();
  private readonly cursors = new Map<
    string,
    {
      snapshotDigest: string;
      queryDigest: string;
      offset: number;
      expiresAt: number;
    }
  >();
  private readonly diagnosticBaselines = new Map<
    string,
    { diagnostics: NormalizedDiagnostic[]; expiresAt: number }
  >();
  private readonly codeActions = new Map<string, StoredCodeAction>();
  private readonly previewStore: MutationPreviewStore;
  private readonly workspaces = new Map<string, LspWorkspace>();
  private authority?: WorkspaceRevisionAuthority;
  private detected: LspDetectedRoot[] = [];
  private root = "";
  private closed = false;

  constructor(private readonly options: CodeIntelServiceOptions = {}) {
    this.manager = new LspManager({
      maxSessions: options.maxSessions ?? 8,
      registry: new LspAdapterRegistry(options.customAdapters ?? []),
    });
    this.previewStore = options.previewStore ?? new MemoryMutationPreviewStore();
  }

  async open(repositoryPath: string): Promise<void> {
    if (this.closed) throw new Error("Code-intelligence service is closed.");
    const root = await realpath(repositoryPath);
    if (this.root === root && this.detected.length > 0) return;
    await Promise.all(
      [...this.workspaces.values()].map((workspace) =>
        workspace.close({ closeManager: false })
      ),
    );
    this.workspaces.clear();
    await this.authority?.close();
    this.authority = await WorkspaceRevisionAuthority.open(root);
    this.root = root;
    await this.previewStore.open(root);
    this.detected = await this.manager.detect(root);
    this.cache.clear();
    this.handles.clear();
  }

  async status(): Promise<
    CodeIntelEnvelope<{
      roots: string[];
      detected: LspDetectedRoot[];
      sessions: ReturnType<LspManager["snapshots"]>;
    }>
  > {
    const started = performance.now();
    const snapshot = this.compositeSnapshot();
    return this.envelope({
      snapshot,
      status: "ok",
      data: {
        roots: this.detected.map(({ root }) => root),
        detected: structuredClone(this.detected),
        sessions: this.manager.snapshots(),
      },
      evidence: [
        {
          source: "lsp",
          adapter: "orynt-adapter-registry",
          methods: ["detect"],
          completeness: "complete",
        },
      ],
      total: this.detected.length,
      returned: this.detected.length,
      started,
      lspCalls: 0,
    });
  }

  failure(error: unknown): CodeIntelEnvelope<null> {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      retryable?: unknown;
      details?: unknown;
    };
    const known = new Set<CodeIntelErrorCode>([
      "WORKSPACE_NOT_FOUND",
      "NO_LANGUAGE_ADAPTER",
      "SERVER_NOT_INSTALLED",
      "SERVER_START_FAILED",
      "SERVER_WARMING",
      "SERVER_CRASHED",
      "SERVER_RESTART_LIMIT",
      "REQUEST_TIMEOUT",
      "REQUEST_CANCELLED",
      "UNSUPPORTED_CAPABILITY",
      "SYMBOL_NOT_FOUND",
      "AMBIGUOUS_SELECTOR",
      "INVALID_POSITION",
      "STALE_SNAPSHOT",
      "STALE_CURSOR",
      "STALE_PREVIEW",
      "APPROVAL_REQUIRED",
      "APPROVAL_REJECTED",
      "OUTSIDE_WORKSPACE",
      "SYMLINK_ESCAPE",
      "INVALID_WORKSPACE_EDIT",
      "OVERLAPPING_EDITS",
      "EDIT_CONFLICT",
      "VERIFICATION_FAILED",
      "RECOVERY_REQUIRED",
      "INTERNAL_PROTOCOL_ERROR",
    ]);
    const code =
      typeof candidate.code === "string" &&
        known.has(candidate.code as CodeIntelErrorCode)
        ? candidate.code as CodeIntelErrorCode
        : error instanceof CodeIntelProtocolError
          ? error.code
          : "INTERNAL_PROTOCOL_ERROR";
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : "Code-intelligence operation failed.";
    return this.envelope({
      snapshot: this.compositeSnapshot(),
      status: "error",
      data: null,
      evidence: [],
      warnings: [],
      total: 0,
      returned: 0,
      started: performance.now(),
      lspCalls: 0,
      error: {
        code,
        message,
        retryable: candidate.retryable === true,
        details:
          typeof candidate.details === "object" &&
            candidate.details !== null &&
            !Array.isArray(candidate.details)
            ? candidate.details as Record<string, unknown>
            : {},
      },
    });
  }

  runtimeStatus(): {
    repositoryPath?: string;
    sessions: ReturnType<LspManager["snapshots"]>;
  } {
    return {
      ...(this.root ? { repositoryPath: this.root } : {}),
      sessions: this.manager.snapshots(),
    };
  }

  async search(input: {
    query: string;
    path?: string;
    language?: string;
    adapterId?: string;
    budget?: Partial<ResultBudget>;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<CodeIntelEnvelope<{ symbols: SymbolCandidate[] }>> {
    const budget = normalizeBudget(input.budget);
    return this.cached(
      "search",
      { ...input, signal: undefined, budget },
      async () => {
        const started = performance.now();
        let candidates: SymbolCandidate[];
        let snapshot: LspWorkspaceSnapshot;
        let searchCompleteness: "complete" | "partial" = "complete";
        let lspCalls = 1;
        if (input.path) {
          const workspace = await this.workspaceForPath(
            input.path,
            input.language,
            input.adapterId,
          );
          const document = await workspace.synchronizeDocument(input.path);
          const response = await workspace.request<
            DocumentSymbol[] | SymbolInformation[] | null
          >(
            "textDocument/documentSymbol",
            { textDocument: { uri: document.uri } },
            { signal: input.signal },
          );
          snapshot = response.snapshot;
          candidates = Array.isArray(response.data)
            ? response.data.flatMap((value) =>
                "selectionRange" in value
                  ? flattenDocumentSymbols(
                      [value],
                      document.uri,
                      path.relative(this.root, document.path).replaceAll("\\", "/"),
                      workspace.adapterId,
                      document.languageId,
                      workspace.root,
                    )
                  : [
                      this.symbolInformation(value, workspace),
                    ]
              )
            : [];
        } else {
          const workspaces = await this.searchWorkspaces(
            input.language,
            input.adapterId,
          );
          const settled = await Promise.allSettled(
            workspaces.map(async (workspace) => ({
              workspace,
              response: await workspace.request<SymbolInformation[] | null>(
                "workspace/symbol",
                { query: input.query },
                { signal: input.signal },
              ),
            })),
          );
          const responses = settled.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : []
          );
          if (responses.length === 0) {
            const failure = settled.find(
              (result): result is PromiseRejectedResult =>
                result.status === "rejected",
            );
            throw failure?.reason ?? new Error("No language server answered.");
          }
          lspCalls = settled.length;
          searchCompleteness =
            responses.length === settled.length ? "complete" : "partial";
          snapshot = this.compositeSnapshot(
            responses.map(({ workspace }) => workspace),
          );
          candidates = responses.flatMap(({ response, workspace }) =>
            (response.data ?? []).map((value) =>
              this.symbolInformation(value, workspace)
            )
          );
        }
        const needle = input.query.trim().toLocaleLowerCase("en-US");
        candidates = candidates
          .filter(
            ({ name, qualifiedName }) =>
              !needle ||
              name.toLocaleLowerCase("en-US").includes(needle) ||
              qualifiedName.toLocaleLowerCase("en-US").includes(needle),
          )
          .sort(
            (left, right) =>
              right.confidence - left.confidence ||
              left.path.localeCompare(right.path) ||
              left.range.start.line - right.range.start.line,
          );
        const { items, nextCursor } = this.page(
          candidates,
          input.cursor,
          snapshot,
          budget,
          digest({
            operation: "search",
            query: input.query,
            path: input.path,
            language: input.language,
            adapterId: input.adapterId,
          }),
        );
        return this.envelope({
          snapshot,
          status: "ok",
          data: { symbols: items },
          evidence: [
            {
              source: "lsp",
              adapter: input.path
                ? candidates[0]?.adapterId ?? input.adapterId ?? "unknown"
                : "multi-adapter",
              methods: [
                input.path
                  ? "textDocument/documentSymbol"
                  : "workspace/symbol",
              ],
              completeness: searchCompleteness,
            },
          ],
          total: candidates.length,
          returned: items.length,
          nextCursor,
          started,
          lspCalls,
        });
      },
    ) as Promise<CodeIntelEnvelope<{ symbols: SymbolCandidate[] }>>;
  }

  async resolve(
    selector: SemanticSelector,
    signal?: AbortSignal,
  ): Promise<
    CodeIntelEnvelope<{
      symbol?: ResolvedSymbol;
      candidates: SymbolCandidate[];
    }>
  > {
    const started = performance.now();
    const { candidates, snapshot, methods } = await this.resolveCandidates(
      selector,
      signal,
    );
    if (candidates.length !== 1) {
      return this.envelope({
        snapshot,
        status: candidates.length === 0 ? "error" : "ambiguous",
        data: { candidates },
        evidence: [
          {
            source: "lsp",
            adapter: candidates[0]?.adapterId ?? "multi-adapter",
            methods,
            completeness: candidates.length === 0 ? "partial" : "complete",
          },
        ],
        warnings:
          candidates.length === 0 ? ["SYMBOL_NOT_FOUND"] : ["AMBIGUOUS_SELECTOR"],
        total: candidates.length,
        returned: candidates.length,
        started,
        lspCalls: methods.length,
      });
    }
    const candidate = candidates[0]!;
    const handle = `sym_${digest({
      candidate,
      revision: snapshot.revision,
      epoch: snapshot.sessionEpoch,
    }).slice(0, 24)}`;
    this.handles.set(handle, {
      symbol: candidate,
      revision: snapshot.revision,
      epoch: snapshot.sessionEpoch,
    });
    const symbol: ResolvedSymbol = {
      handle,
      ...candidate,
      identityDigest: digest({
        name: candidate.name,
        kind: candidate.kind,
        uri: candidate.uri,
        selectionRange: candidate.selectionRange,
      }),
    };
    return this.envelope({
      snapshot,
      status: "ok",
      data: { symbol, candidates: [] },
      evidence: [
        {
          source: "lsp",
          adapter: candidate.adapterId,
          root: candidate.root,
          methods,
          completeness: "complete",
        },
      ],
      total: 1,
      returned: 1,
      started,
      lspCalls: methods.length,
    });
  }

  async inspect(input: {
    selector: SemanticSelector;
    includeBody?: boolean;
    budget?: Partial<ResultBudget>;
    signal?: AbortSignal;
  }): Promise<
    CodeIntelEnvelope<{
      symbol?: ResolvedSymbol;
      hover?: unknown;
      definitions: Array<{ path: string; range: SourceRange }>;
      declaration?: { path: string; content: string; startLine: number };
      candidates: SymbolCandidate[];
    }>
  > {
    const budget = normalizeBudget(input.budget);
    const started = performance.now();
    const resolved = await this.resolve(input.selector, input.signal);
    if (resolved.status !== "ok" || !resolved.data.symbol) {
      return {
        ...resolved,
        data: {
          definitions: [],
          candidates: resolved.data.candidates,
        },
      };
    }
    const symbol = resolved.data.symbol;
    const workspace = await this.workspaceForPath(
      symbol.path,
      symbol.language,
      symbol.adapterId,
    );
    const document = await workspace.synchronizeDocument(symbol.path);
    const position = symbol.selectionRange.start;
    const [hoverResponse, definitionResponse] = await Promise.all([
      workspace.request<Hover | null>(
        "textDocument/hover",
        { textDocument: { uri: document.uri }, position },
        { signal: input.signal },
      ),
      workspace.request<Array<Location | LocationLink> | Location | LocationLink | null>(
        "textDocument/definition",
        { textDocument: { uri: document.uri }, position },
        { signal: input.signal },
      ),
    ]);
    const rawDefinitions =
      definitionResponse.data === null
        ? []
        : Array.isArray(definitionResponse.data)
          ? definitionResponse.data
          : [definitionResponse.data];
    const definitions = rawDefinitions
      .map(locationFromDefinition)
      .filter(({ uri }) => uri.startsWith("file:"))
      .map(({ uri, range: definitionRange }) => ({
        path: this.relativeFileUri(uri),
        range: definitionRange,
      }));
    const lines = document.content.split(/\r?\n/u);
    const start = Math.max(0, symbol.range.start.line);
    const end = Math.min(
      lines.length,
      input.includeBody
        ? start + budget.maxSnippetLines
        : Math.min(symbol.range.end.line + 1, start + budget.maxSnippetLines),
    );
    const declaration = budget.includeDeclaration
      ? {
          path: symbol.path,
          content: lines.slice(start, end).join("\n").slice(0, budget.maxChars),
          startLine: start + 1,
        }
      : undefined;
    return this.envelope({
      snapshot: definitionResponse.snapshot,
      status: "ok",
      data: {
        symbol,
        ...(hoverResponse.data ? { hover: hoverResponse.data.contents } : {}),
        definitions,
        ...(declaration ? { declaration } : {}),
        candidates: [],
      },
      evidence: [
        {
          source: "lsp",
          adapter: symbol.adapterId,
          root: symbol.root,
          methods: [
            "textDocument/documentSymbol",
            "textDocument/hover",
            "textDocument/definition",
          ],
          completeness: "complete",
        },
      ],
      total: definitions.length + 1,
      returned: definitions.length + 1,
      started,
      lspCalls: 3,
    });
  }

  async relations(input: {
    selector: SemanticSelector;
    relation: "references" | "callers" | "callees";
    budget?: Partial<ResultBudget>;
    cursor?: string;
    signal?: AbortSignal;
  }): Promise<
    CodeIntelEnvelope<{
      symbol?: ResolvedSymbol;
      locations: Array<{
        path: string;
        range: SourceRange;
        from?: string;
      }>;
      candidates: SymbolCandidate[];
    }>
  > {
    const budget = normalizeBudget(input.budget);
    const started = performance.now();
    const resolved = await this.resolve(input.selector, input.signal);
    if (resolved.status !== "ok" || !resolved.data.symbol) {
      return {
        ...resolved,
        data: { locations: [], candidates: resolved.data.candidates },
      };
    }
    const symbol = resolved.data.symbol;
    const workspace = await this.workspaceForPath(
      symbol.path,
      symbol.language,
      symbol.adapterId,
    );
    const document = await workspace.synchronizeDocument(symbol.path);
    const position = symbol.selectionRange.start;
    let raw: Array<{ uri: string; range: SourceRange; from?: string }> = [];
    let snapshot = document.snapshot;
    const methods: string[] = [];
    if (input.relation === "references") {
      const response = await workspace.request<Location[] | null>(
        "textDocument/references",
        {
          textDocument: { uri: document.uri },
          position,
          context: { includeDeclaration: true },
        },
        { signal: input.signal },
      );
      snapshot = response.snapshot;
      methods.push("textDocument/references");
      raw = (response.data ?? []).map(({ uri, range: value }) => ({
        uri,
        range: range(value),
      }));
    } else {
      const prepare = await workspace.request<CallHierarchyItem[] | null>(
        "textDocument/prepareCallHierarchy",
        { textDocument: { uri: document.uri }, position },
        { signal: input.signal },
      );
      snapshot = prepare.snapshot;
      methods.push("textDocument/prepareCallHierarchy");
      const item = prepare.data?.[0];
      if (item) {
        if (input.relation === "callers") {
          const response = await workspace.request<CallHierarchyIncomingCall[] | null>(
            "callHierarchy/incomingCalls",
            { item },
            { signal: input.signal },
          );
          snapshot = response.snapshot;
          methods.push("callHierarchy/incomingCalls");
          raw = (response.data ?? []).map(({ from, fromRanges }) => ({
            uri: from.uri,
            range: range(fromRanges[0] ?? from.selectionRange),
            from: from.name,
          }));
        } else {
          const response = await workspace.request<CallHierarchyOutgoingCall[] | null>(
            "callHierarchy/outgoingCalls",
            { item },
            { signal: input.signal },
          );
          snapshot = response.snapshot;
          methods.push("callHierarchy/outgoingCalls");
          raw = (response.data ?? []).map(({ to, fromRanges }) => ({
            uri: to.uri,
            range: range(fromRanges[0] ?? to.selectionRange),
            from: to.name,
          }));
        }
      }
    }
    const locations = raw
      .filter(({ uri }) => uri.startsWith("file:"))
      .map(({ uri, ...entry }) => ({
        ...entry,
        path: this.relativeFileUri(uri),
      }))
      .filter(
        (entry, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.path === entry.path &&
              candidate.range.start.line === entry.range.start.line &&
              candidate.range.start.character === entry.range.start.character,
          ) === index,
      )
      .sort(
        (left, right) =>
          left.path.localeCompare(right.path) ||
          left.range.start.line - right.range.start.line,
      );
    const page = this.page(
      locations,
      input.cursor,
      snapshot,
      budget,
      digest({
        operation: "relations",
        selector: input.selector,
        relation: input.relation,
      }),
    );
    return this.envelope({
      snapshot,
      status:
        input.relation !== "references" && methods.length === 1
          ? "unsupported"
          : "ok",
      data: { symbol, locations: page.items, candidates: [] },
      evidence: [
        {
          source: "lsp",
          adapter: symbol.adapterId,
          root: symbol.root,
          methods,
          completeness:
            input.relation === "references" ? "complete" : "partial",
        },
      ],
      warnings:
        input.relation !== "references" && methods.length === 1
          ? ["UNSUPPORTED_CAPABILITY"]
          : [],
      total: locations.length,
      returned: page.items.length,
      nextCursor: page.nextCursor,
      started,
      lspCalls: methods.length,
    });
  }

  async diagnostics(input: {
    path?: string;
    severity?: number;
    mode?: "latest" | "delta";
    baselineToken?: string;
    budget?: Partial<ResultBudget>;
  } = {}): Promise<
    CodeIntelEnvelope<{
      diagnostics: NormalizedDiagnostic[];
      baselineToken: string;
      added: NormalizedDiagnostic[];
      resolved: NormalizedDiagnostic[];
      unchanged: NormalizedDiagnostic[];
    }>
  > {
    const started = performance.now();
    const workspaces = input.path
      ? [await this.workspaceForPath(input.path)]
      : [...this.workspaces.values()];
    const synchronized = input.path
      ? await workspaces[0]!.synchronizeDocument(input.path)
      : undefined;
    const snapshot = this.compositeSnapshot(workspaces);
    const diagnostics = workspaces
      .flatMap((workspace) => workspace.diagnostics(synchronized?.uri))
      .flatMap((document) =>
        document.diagnostics.map((diagnostic) => {
          const normalized = {
            path: this.relativeFileUri(document.uri),
            range: range(diagnostic.range),
          ...(diagnostic.severity === undefined
            ? {}
            : { severity: diagnostic.severity }),
          ...(diagnostic.code === undefined
            ? {}
            : { code: diagnostic.code as string | number }),
          message:
            typeof diagnostic.message === "string"
              ? diagnostic.message
              : diagnostic.message.value,
          ...(diagnostic.source ? { source: diagnostic.source } : {}),
          };
          return {
            id: digest({
              path: normalized.path,
              range: normalized.range,
              severity: normalized.severity,
              code: normalized.code,
              source: normalized.source,
            }),
            ...normalized,
          };
        }),
      )
      .filter(
        ({ severity }) =>
          input.severity === undefined || severity === input.severity,
      );
    const budget = normalizeBudget(input.budget);
    const items = diagnostics.slice(0, budget.maxItems);
    const previous = input.baselineToken
      ? this.diagnosticBaselines.get(input.baselineToken)
      : undefined;
    if (
      input.baselineToken &&
      (!previous || previous.expiresAt <= Date.now())
    ) {
      throw new Error("STALE_CURSOR");
    }
    const previousById = new Map(
      (previous?.diagnostics ?? []).map((diagnostic) => [
        diagnostic.id,
        diagnostic,
      ]),
    );
    const currentById = new Map(
      diagnostics.map((diagnostic) => [diagnostic.id, diagnostic]),
    );
    const added = diagnostics.filter(({ id }) => !previousById.has(id));
    const unchanged = diagnostics.filter(({ id }) => previousById.has(id));
    const resolved = [...previousById.values()].filter(
      ({ id }) => !currentById.has(id),
    );
    const baselineToken = `diag_${randomUUID()}`;
    this.diagnosticBaselines.set(baselineToken, {
      diagnostics: structuredClone(diagnostics),
      expiresAt: Date.now() + 10 * 60_000,
    });
    this.trimBounded(this.diagnosticBaselines, 256);
    return this.envelope({
      snapshot,
      status: "partial",
      data: {
        diagnostics: items,
        baselineToken,
        added: input.mode === "delta" ? added.slice(0, budget.maxItems) : [],
        resolved:
          input.mode === "delta" ? resolved.slice(0, budget.maxItems) : [],
        unchanged:
          input.mode === "delta" ? unchanged.slice(0, budget.maxItems) : [],
      },
      evidence: [
        {
          source: "lsp",
          adapter: workspaces.length === 1
            ? workspaces[0]!.adapterId
            : "multi-adapter",
          methods: ["textDocument/publishDiagnostics"],
          completeness: "partial",
        },
      ],
      warnings: [
        "Diagnostics cover synchronized documents only; unopened workspace files may be absent.",
      ],
      total: diagnostics.length,
      returned: items.length,
      started,
      lspCalls: 0,
    });
  }

  async context(input: {
    goal: "explain" | "modify" | "debug" | "review";
    selector: SemanticSelector;
    include?: Array<
      "definition" | "signature" | "references" | "callers" | "diagnostics"
    >;
    budget?: Partial<ResultBudget>;
    signal?: AbortSignal;
  }): Promise<CodeIntelEnvelope<ContextPack>> {
    const started = performance.now();
    const budget = normalizeBudget(input.budget);
    const inspection = await this.inspect({
      selector: input.selector,
      includeBody: true,
      budget,
      signal: input.signal,
    });
    if (inspection.status !== "ok" || !inspection.data.symbol) {
      return {
        ...inspection,
        data: {
          primary: inspection.data,
          relations: {
            locations: [],
            candidates: inspection.data.candidates,
          },
          diagnostics: {
            diagnostics: [],
            baselineToken: "",
            added: [],
            resolved: [],
            unchanged: [],
          },
          omitted: 0,
        },
      };
    }
    const relation =
      input.include?.includes("callers") ? "callers" : "references";
    const [relations, diagnostics] = await Promise.all([
      this.relations({
        selector: { kind: "handle", handle: inspection.data.symbol.handle },
        relation,
        budget: {
          ...budget,
          maxItems: Math.max(1, Math.floor(budget.maxItems * 0.6)),
        },
        signal: input.signal,
      }),
      this.diagnostics({
        path: inspection.data.symbol.path,
        budget: {
          ...budget,
          maxItems: Math.max(1, Math.floor(budget.maxItems * 0.2)),
        },
      }),
    ]);
    const data: ContextPack = {
      primary: inspection.data,
      relations: relations.data,
      diagnostics: diagnostics.data,
      omitted:
        Math.max(0, relations.page.totalKnown - relations.page.returned) +
        Math.max(0, diagnostics.page.totalKnown - diagnostics.page.returned),
    };
    const serialized = JSON.stringify(data);
    const warnings = [
      ...inspection.warnings,
      ...relations.warnings,
      ...diagnostics.warnings,
    ];
    if (serialized.length > budget.maxChars) {
      data.primary.declaration = data.primary.declaration
        ? {
            ...data.primary.declaration,
            content: data.primary.declaration.content.slice(
              0,
              Math.max(256, Math.floor(budget.maxChars * 0.45)),
            ),
          }
        : undefined;
      warnings.push("Context pack was compacted to its character budget.");
    }
    return this.envelope({
      snapshot: inspection.snapshot,
      status:
        relations.status === "unsupported" || diagnostics.status === "partial"
          ? "partial"
          : "ok",
      data,
      evidence: this.mergeEvidence([
        ...inspection.evidence,
        ...relations.evidence,
        ...diagnostics.evidence,
      ]),
      warnings,
      total:
        inspection.page.totalKnown +
        relations.page.totalKnown +
        diagnostics.page.totalKnown,
      returned:
        inspection.page.returned +
        relations.page.returned +
        diagnostics.page.returned,
      started,
      lspCalls:
        inspection.metrics.lspCalls +
        relations.metrics.lspCalls +
        diagnostics.metrics.lspCalls,
    });
  }

  async renamePreview(input: {
    selector: SemanticSelector;
    newName: string;
    signal?: AbortSignal;
  }): Promise<CodeIntelEnvelope<{ preview?: MutationPreview; candidates: SymbolCandidate[] }>> {
    const started = performance.now();
    if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(input.newName)) {
      throw new CodeIntelProtocolError(
        "INVALID_WORKSPACE_EDIT",
        "Rename target is not a valid identifier.",
        false,
        { newName: input.newName },
      );
    }
    const resolved = await this.resolve(input.selector, input.signal);
    if (resolved.status !== "ok" || !resolved.data.symbol) {
      return {
        ...resolved,
        data: { candidates: resolved.data.candidates },
      };
    }
    const symbol = resolved.data.symbol;
    const workspace = await this.workspaceForPath(
      symbol.path,
      symbol.language,
      symbol.adapterId,
    );
    const document = await workspace.synchronizeDocument(symbol.path);
    const session = this.manager.snapshots().find(
      ({ adapterId, workspacePath }) =>
        adapterId === symbol.adapterId && workspacePath === workspace.root,
    );
    if (session?.normalizedCapabilities.rename === "unsupported") {
      throw new CodeIntelProtocolError(
        "UNSUPPORTED_CAPABILITY",
        "The selected language server does not support rename.",
        false,
        { adapterId: symbol.adapterId },
      );
    }
    if (session?.normalizedCapabilities.prepareRename === "native") {
      const prepared = await workspace.request<unknown>(
        "textDocument/prepareRename",
        {
          textDocument: { uri: document.uri },
          position: symbol.selectionRange.start,
        },
        { signal: input.signal },
      );
      if (prepared.data === null) {
        throw new CodeIntelProtocolError(
          "INVALID_WORKSPACE_EDIT",
          "The language server rejected rename at the selected symbol.",
          false,
        );
      }
    }
    const response = await workspace.request<WorkspaceEdit | null>(
      "textDocument/rename",
      {
        textDocument: { uri: document.uri },
        position: symbol.selectionRange.start,
        newName: input.newName,
      },
      { signal: input.signal },
    );
    if (!response.data) {
      throw new CodeIntelProtocolError(
        "INVALID_WORKSPACE_EDIT",
        "The language server returned no rename edit.",
        false,
      );
    }
    const stored = await createMutationPreview({
      root: this.root,
      snapshot: response.snapshot,
      operation: {
        kind: "rename",
        symbolHandle: symbol.handle,
        newName: input.newName,
      },
      workspaceEdit: response.data,
      positionEncoding: this.positionEncoding(symbol.adapterId),
      binding: {
        path: symbol.path,
        language: symbol.language,
        adapterId: symbol.adapterId,
      },
    });
    await this.previewStore.put(stored);
    return this.envelope({
      snapshot: response.snapshot,
      status: "ok",
      data: { preview: this.publicPreview(stored), candidates: [] },
      evidence: [{
        source: "lsp",
        adapter: symbol.adapterId,
        root: symbol.root,
        methods: [
          ...(session?.normalizedCapabilities.prepareRename === "native"
            ? ["textDocument/prepareRename"]
            : []),
          "textDocument/rename",
        ],
        completeness: "complete",
      }],
      total: stored.affectedFiles.length,
      returned: stored.affectedFiles.length,
      started,
      lspCalls:
        session?.normalizedCapabilities.prepareRename === "native" ? 2 : 1,
    });
  }

  async listCodeActions(input: {
    selector: SemanticSelector;
    onlyKinds?: string[];
    signal?: AbortSignal;
  }): Promise<CodeIntelEnvelope<{
    actions: Array<{
      handle: string;
      title: string;
      kind?: string;
      preferred: boolean;
      disabledReason?: string;
      previewable: boolean;
    }>;
    candidates: SymbolCandidate[];
  }>> {
    const started = performance.now();
    let symbol: ResolvedSymbol;
    if (input.selector.kind === "position") {
      const workspace = await this.workspaceForPath(input.selector.path);
      const document = await workspace.synchronizeDocument(input.selector.path);
      const lineIndex = new LineIndex(document.content);
      const byteOffset = lineIndex.byteOffsetAt(
        {
          line: input.selector.line - 1,
          character: input.selector.column - 1,
        },
        "utf-32",
      );
      const position = lineIndex.positionAt(
        byteOffset,
        this.positionEncoding(workspace.adapterId),
      );
      symbol = {
        handle: `position_${digest({
          path: input.selector.path,
          position,
          snapshot: document.snapshot.contentHash,
        }).slice(0, 24)}`,
        name: path.basename(input.selector.path),
        qualifiedName: path.basename(input.selector.path),
        kind: 0,
        path: input.selector.path,
        uri: document.uri,
        range: { start: position, end: position },
        selectionRange: { start: position, end: position },
        identityDigest: digest({
          uri: document.uri,
          position,
          snapshot: document.snapshot.contentHash,
        }),
        language: document.languageId,
        adapterId: workspace.adapterId,
        root: workspace.root,
        confidence: 1,
      };
    } else {
      const resolved = await this.resolve(input.selector, input.signal);
      if (resolved.status !== "ok" || !resolved.data.symbol) {
        return {
          ...resolved,
          data: { actions: [], candidates: resolved.data.candidates },
        };
      }
      symbol = resolved.data.symbol;
    }
    const workspace = await this.workspaceForPath(
      symbol.path,
      symbol.language,
      symbol.adapterId,
    );
    const document = await workspace.synchronizeDocument(symbol.path);
    let publishedDiagnostics:
      | ReturnType<LspWorkspace["diagnostics"]>[number]
      | undefined = workspace.diagnostics(document.uri)[0];
    if (!publishedDiagnostics) {
      publishedDiagnostics = await workspace.waitForDiagnosticsSettled(
        document.uri,
        {
          afterGeneration: -1,
          quietMs: 100,
          timeoutMs: 2_000,
          signal: input.signal,
        },
      ).catch(() => undefined);
    }
    const response = await workspace.request<Array<CodeAction | Command> | null>(
      "textDocument/codeAction",
      {
        textDocument: { uri: document.uri },
        range: symbol.range,
        context: {
          diagnostics: publishedDiagnostics?.diagnostics ?? [],
          ...(input.onlyKinds?.length ? { only: input.onlyKinds } : {}),
        },
      },
      { signal: input.signal },
    );
    const actions = (response.data ?? []).map((action) => {
      const handle = `action_${digest({
        action,
        snapshot: response.snapshot.contentHash,
      }).slice(0, 24)}_${randomUUID().slice(0, 8)}`;
      this.codeActions.set(handle, {
        action: structuredClone(action),
        path: symbol.path,
        adapterId: symbol.adapterId,
        language: symbol.language,
        snapshot: response.snapshot,
        expiresAt: Date.now() + 300_000,
      });
      const codeAction = "edit" in action || "kind" in action
        ? action as CodeAction
        : undefined;
      return {
        handle,
        title: action.title,
        ...(codeAction?.kind ? { kind: codeAction.kind } : {}),
        preferred: codeAction?.isPreferred === true,
        ...(codeAction?.disabled?.reason
          ? { disabledReason: codeAction.disabled.reason }
          : {}),
        previewable: Boolean(codeAction?.edit || codeAction?.data),
      };
    });
    this.trimBounded(this.codeActions, 256);
    return this.envelope({
      snapshot: response.snapshot,
      status: "ok",
      data: { actions, candidates: [] },
      evidence: [{
        source: "lsp",
        adapter: symbol.adapterId,
        root: symbol.root,
        methods: ["textDocument/codeAction"],
        completeness: "complete",
      }],
      total: actions.length,
      returned: actions.length,
      started,
      lspCalls: 1,
    });
  }

  async codeActionPreview(input: {
    actionHandle: string;
    signal?: AbortSignal;
  }): Promise<CodeIntelEnvelope<{ preview: MutationPreview }>> {
    const started = performance.now();
    const storedAction = this.codeActions.get(input.actionHandle);
    if (!storedAction || storedAction.expiresAt <= Date.now()) {
      this.codeActions.delete(input.actionHandle);
      throw new CodeIntelProtocolError(
        "STALE_PREVIEW",
        "Code-action handle is missing or expired.",
        false,
      );
    }
    const workspace = await this.workspaceForPath(
      storedAction.path,
      storedAction.language,
      storedAction.adapterId,
    );
    const current = workspace.snapshot();
    if (
      current.revision !== storedAction.snapshot.revision ||
      current.contentHash !== storedAction.snapshot.contentHash ||
      current.sessionEpoch !== storedAction.snapshot.sessionEpoch
    ) {
      throw new CodeIntelProtocolError(
        "STALE_SNAPSHOT",
        "Workspace changed after the code action was listed.",
        true,
      );
    }
    let action = structuredClone(storedAction.action);
    const session = this.manager.snapshots().find(
      ({ adapterId, workspacePath }) =>
        adapterId === storedAction.adapterId &&
        workspacePath === workspace.root,
    );
    if (
      "data" in action &&
      action.data !== undefined &&
      !action.edit &&
      session?.normalizedCapabilities.codeActionResolve === "native"
    ) {
      const resolved = await workspace.request<CodeAction>(
        "codeAction/resolve",
        action,
        { signal: input.signal },
      );
      action = resolved.data;
    }
    if (!("edit" in action) || !action.edit) {
      throw new CodeIntelProtocolError(
        "UNSUPPORTED_CAPABILITY",
        "Command-only code actions require an adapter-owned materializer.",
        false,
        {
          adapterId: storedAction.adapterId,
          command: "command" in action ? action.command : undefined,
        },
      );
    }
    if (action.command) {
      throw new CodeIntelProtocolError(
        "UNSUPPORTED_CAPABILITY",
        "Mixed edit-and-command code actions are unsupported without an adapter policy.",
        false,
        { adapterId: storedAction.adapterId, command: action.command.command },
      );
    }
    const preview = await createMutationPreview({
      root: this.root,
      snapshot: storedAction.snapshot,
      operation: {
        kind: "code_action",
        actionHandle: input.actionHandle,
        title: action.title,
        ...(action.kind ? { actionKind: action.kind } : {}),
      },
      workspaceEdit: action.edit,
      positionEncoding: this.positionEncoding(storedAction.adapterId),
      binding: {
        path: storedAction.path,
        language: storedAction.language,
        adapterId: storedAction.adapterId,
      },
    });
    await this.previewStore.put(preview);
    return this.envelope({
      snapshot: storedAction.snapshot,
      status: "ok",
      data: { preview: this.publicPreview(preview) },
      evidence: [{
        source: "lsp",
        adapter: storedAction.adapterId,
        methods: [
          "textDocument/codeAction",
          ...(session?.normalizedCapabilities.codeActionResolve === "native"
            ? ["codeAction/resolve"]
            : []),
        ],
        completeness: "complete",
      }],
      total: preview.affectedFiles.length,
      returned: preview.affectedFiles.length,
      started,
      lspCalls:
        session?.normalizedCapabilities.codeActionResolve === "native" ? 2 : 1,
    });
  }

  mutationPreview(previewId: string, previewDigest: string): MutationPreview {
    const preview = this.requirePreview(previewId, previewDigest);
    return this.publicPreview(preview);
  }

  async applyPreview(input: {
    previewId: string;
    previewDigest: string;
    runtime: MutationRuntime;
    approval: MutationApprovalBundle;
    signal?: AbortSignal;
    verify?: (
      approval: MutationApprovalBundle,
      signal?: AbortSignal,
    ) => Promise<{
      mode: "diagnostics_only" | "commands";
      commands: Array<{
        argvDigest: string;
        exitCode: number;
        durationMs: number;
      }>;
    }>;
  }): Promise<CodeIntelEnvelope<MutationApplyResult>> {
    const started = performance.now();
    requireNotAborted(input.signal);
    const preview = this.requirePreview(input.previewId, input.previewDigest);
    const expectedApprovalDigest = digest({
        previewId: input.approval.previewId,
        previewDigest: input.approval.previewDigest,
        verification: input.approval.verification,
        expiresAt: input.approval.expiresAt,
      });
    if (
        input.approval.previewId !== preview.previewId ||
        input.approval.previewDigest !== preview.previewDigest ||
        input.approval.approvalDigest !== expectedApprovalDigest ||
        Date.parse(input.approval.expiresAt) <= Date.now()
    ) {
        throw new CodeIntelProtocolError(
          "APPROVAL_REQUIRED",
          "Mutation approval is mismatched or expired.",
          false,
        );
    }
    if (!await this.previewStore.consumeApproval(
      preview.previewId,
      input.approval.approvalDigest,
    )) {
      throw new CodeIntelProtocolError(
        "APPROVAL_REQUIRED",
        "Mutation approval was already consumed or could not be persisted.",
        false,
      );
    }
    requireNotAborted(input.signal);
    if (preview.binding) {
      await this.workspaceForPath(
        preview.binding.path,
        preview.binding.language,
        preview.binding.adapterId,
      );
    }
    const sessionStillCurrent = this.manager.snapshots().some((session) =>
      session.serverFingerprint === preview.baseSnapshot.serverFingerprint
    );
    if (
      !sessionStillCurrent
    ) {
      throw new CodeIntelProtocolError(
        "STALE_PREVIEW",
        "Workspace or language-server state changed after preview.",
        true,
      );
    }
    const diagnosticBaselines = new Map<string, string>();
    const diagnosticSettle = new Map<
      string,
      {
        workspace: LspWorkspace;
        uri: string;
        afterGeneration: number;
      }
    >();
    for (const file of preview.files) {
      const workspace = await this.workspaceForPath(file.path);
      const document = await workspace.synchronizeDocument(file.path);
      const baseline = await this.diagnostics({
        path: file.path,
        mode: "latest",
        budget: { maxItems: 100 },
      });
      diagnosticBaselines.set(file.path, baseline.data.baselineToken);
      diagnosticSettle.set(file.path, {
        workspace,
        uri: document.uri,
        afterGeneration: workspace.diagnosticState(document.uri).generation,
      });
    }
    requireNotAborted(input.signal);
    const receipt = await input.runtime.apply({
      previewId: preview.previewId,
      previewDigest: preview.previewDigest,
      files: preview.files.map(({ path: filePath, expectedHash, content }) => ({
        path: filePath,
        expectedHash,
        content,
      })),
    });
    try {
      requireNotAborted(input.signal);
      const revision = await this.requireAuthority().publishMutation(
        preview.files.map(({ path: filePath, content }) => ({
          path: filePath,
          content,
        })),
      );
      await Promise.all(
        [...this.workspaces.values()].map((workspace) =>
          workspace.waitForRevision(revision)
        ),
      );
      await Promise.all(
        [...diagnosticSettle.values()].map((settle) =>
          settle.workspace.waitForDiagnosticsSettled(settle.uri, {
            afterGeneration: settle.afterGeneration,
            quietMs: 250,
            timeoutMs: 5_000,
            signal: input.signal,
          })
        ),
      );
      requireNotAborted(input.signal);
      const diagnosticDeltas = await Promise.all(
        preview.files.map(async ({ path: filePath }) =>
          await this.diagnostics({
            path: filePath,
            mode: "delta",
            baselineToken: diagnosticBaselines.get(filePath),
            budget: { maxItems: 100 },
          })
        ),
      );
      const added = diagnosticDeltas.flatMap(({ data }) => data.added);
      const resolved = diagnosticDeltas.flatMap(({ data }) => data.resolved);
      const unchanged = diagnosticDeltas.flatMap(({ data }) => data.unchanged);
      const newErrors = added.filter(({ severity }) => severity === 1);
      if (newErrors.length > 0) {
        throw new CodeIntelProtocolError(
          "VERIFICATION_FAILED",
          "Mutation introduced new severity-error diagnostics.",
          true,
          {
            diagnostics: newErrors.map(({ path: filePath, message, range }) => ({
              path: filePath,
              message,
              range,
            })),
          },
        );
      }
      const verification = input.verify
        ? await input.verify(input.approval, input.signal)
        : {
            mode: "diagnostics_only" as const,
            commands: [],
          };
      await input.runtime.finalize(receipt);
      await this.previewStore.delete(preview.previewId);
      this.cache.clear();
      this.handles.clear();
      return this.envelope({
        snapshot: this.compositeSnapshot(),
        status: "ok",
        data: {
          previewId: preview.previewId,
          previewDigest: preview.previewDigest,
          transactionId: receipt.transactionId,
          status: "applied",
          changedFiles: receipt.changedFiles,
          diagnosticsDelta: {
            added: added.length,
            resolved: resolved.length,
            unchanged: unchanged.length,
          },
          verification,
        },
        evidence: [{
          source: "lsp",
          adapter: "multi-adapter",
          methods: ["workspace/didChangeWatchedFiles", "textDocument/didChange"],
          completeness: "partial",
        }],
        warnings: [],
        total: receipt.changedFiles.length,
        returned: receipt.changedFiles.length,
        started,
        lspCalls: 0,
      });
    } catch (error) {
      let resynchronizationError: unknown;
      try {
        await input.runtime.rollback(receipt);
        try {
          const restoredFiles = await Promise.all(
            preview.files.map(async ({ path: filePath }) => ({
              path: filePath,
              content: await readFile(path.join(this.root, filePath), "utf8"),
            })),
          );
          const revision = await this.requireAuthority().publishMutation(
            restoredFiles,
          );
          await Promise.all(
            [...this.workspaces.values()].map((workspace) =>
              workspace.waitForRevision(revision)
            ),
          );
        } catch (rollbackSyncError) {
          resynchronizationError = rollbackSyncError;
        }
        await input.runtime.finalize(receipt);
      } catch (rollbackError) {
        throw new CodeIntelProtocolError(
          "RECOVERY_REQUIRED",
          "Verification failed and the repository transaction could not be rolled back safely.",
          false,
          {
            transactionId: receipt.transactionId,
            cause: error instanceof Error ? error.message : String(error),
            rollbackCause:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          },
        );
      }
      this.cache.clear();
      this.handles.clear();
      if (resynchronizationError) {
        throw new CodeIntelProtocolError(
          "SERVER_WARMING",
          "The repository was rolled back, but language sessions could not confirm the restored revision.",
          true,
          {
            transactionId: receipt.transactionId,
            cause: error instanceof Error ? error.message : String(error),
            resynchronizationCause:
              resynchronizationError instanceof Error
                ? resynchronizationError.message
                : String(resynchronizationError),
          },
        );
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all(
      [...this.workspaces.values()].map((workspace) =>
        workspace.close({ closeManager: false })
      ),
    );
    this.workspaces.clear();
    await this.authority?.close();
    this.authority = undefined;
    await this.manager.close();
    this.cache.clear();
    this.handles.clear();
    this.cursors.clear();
    this.diagnosticBaselines.clear();
    this.codeActions.clear();
    await this.previewStore.close();
  }

  private requirePreview(
    previewId: string,
    previewDigest: string,
  ): StoredMutationPreview {
    const preview = this.previewStore.get(previewId);
    if (
      !preview ||
      preview.previewDigest !== previewDigest ||
      Date.parse(preview.expiresAt) <= Date.now()
    ) {
      void this.previewStore.delete(previewId);
      throw new CodeIntelProtocolError(
        "STALE_PREVIEW",
        "Mutation preview is missing, mismatched, or expired.",
        false,
      );
    }
    return preview;
  }

  private publicPreview(preview: StoredMutationPreview): MutationPreview {
    const { files: _files, binding: _binding, ...publicPreview } = preview;
    return structuredClone(publicPreview);
  }

  private async resolveCandidates(
    selector: SemanticSelector,
    signal?: AbortSignal,
  ): Promise<{
    candidates: SymbolCandidate[];
    snapshot: LspWorkspaceSnapshot;
    methods: string[];
  }> {
    if (selector.kind === "handle") {
      const stored = this.handles.get(selector.handle);
      if (!stored) {
        return {
          candidates: [],
          snapshot: this.compositeSnapshot(),
          methods: [],
        };
      }
      const workspace = await this.workspaceForPath(
        stored.symbol.path,
        stored.symbol.language,
        stored.symbol.adapterId,
      );
      const snapshot = workspace.snapshot();
      if (
        stored.revision !== snapshot.revision ||
        stored.epoch !== snapshot.sessionEpoch
      ) {
        return { candidates: [], snapshot, methods: [] };
      }
      return {
        candidates: [structuredClone(stored.symbol)],
        snapshot,
        methods: [],
      };
    }
    if (selector.kind === "symbol") {
      const search = await this.search({
        query: selector.qualifiedName.split(/[.:#]/u).at(-1) ?? selector.qualifiedName,
        ...(selector.path ? { path: selector.path } : {}),
        ...(selector.language ? { language: selector.language } : {}),
        budget: { maxItems: 100 },
        signal,
      });
      const normalized = selector.qualifiedName.toLocaleLowerCase("en-US");
      const exact = search.data.symbols.filter(
        (candidate) =>
          candidate.name.toLocaleLowerCase("en-US") === normalized ||
          candidate.qualifiedName.toLocaleLowerCase("en-US") === normalized ||
          candidate.qualifiedName
            .toLocaleLowerCase("en-US")
            .endsWith(`.${normalized}`),
      );
      return {
        candidates: (exact.length > 0 ? exact : search.data.symbols).filter(
          (candidate) =>
            selector.symbolKind === undefined ||
            candidate.kind === selector.symbolKind,
        ),
        snapshot: search.snapshot,
        methods: search.evidence.flatMap(({ methods }) => methods),
      };
    }
    const workspace = await this.workspaceForPath(selector.path);
    const document = await workspace.synchronizeDocument(selector.path);
    let position: { line: number; character: number };
    if (selector.kind === "anchor") {
      const occurrence = Math.max(0, selector.occurrence ?? 0);
      let offset = -1;
      let from = 0;
      for (let index = 0; index <= occurrence; index += 1) {
        offset = document.content.indexOf(selector.text, from);
        if (offset < 0) break;
        from = offset + selector.text.length;
      }
      if (offset < 0) {
        return {
          candidates: [],
          snapshot: document.snapshot,
          methods: [],
        };
      }
      const cursor = offset + Math.min(
        selector.text.length,
        Math.max(0, selector.cursorOffsetInText ?? 0),
      );
      const byteOffset = Buffer.byteLength(document.content.slice(0, cursor), "utf8");
      position = new LineIndex(document.content).positionAt(
        byteOffset,
        this.positionEncoding(workspace.adapterId),
      );
    } else {
      const index = new LineIndex(document.content);
      const byteOffset = index.byteOffsetAt(
        { line: selector.line - 1, character: selector.column - 1 },
        "utf-32",
      );
      position = index.positionAt(
        byteOffset,
        this.positionEncoding(workspace.adapterId),
      );
    }
    const response = await workspace.request<Array<Location | LocationLink> | Location | LocationLink | null>(
      "textDocument/definition",
      { textDocument: { uri: document.uri }, position },
      { signal },
    );
    const raw =
      response.data === null
        ? []
        : Array.isArray(response.data)
          ? response.data
          : [response.data];
    const candidates = raw.map((entry) => {
      const definition = locationFromDefinition(entry);
      const filePath = this.relativeFileUri(definition.uri);
      return {
        name: path.basename(filePath),
        qualifiedName: path.basename(filePath),
        kind: 0,
        uri: definition.uri,
        path: filePath,
        range: definition.range,
        selectionRange: definition.range,
        confidence: 0.9,
        adapterId: workspace.adapterId,
        language: document.languageId,
        root: workspace.root,
      };
    });
    return {
      candidates,
      snapshot: response.snapshot,
      methods: ["textDocument/definition"],
    };
  }

  private symbolInformation(
    value: SymbolInformation,
    workspace: LspWorkspace,
  ): SymbolCandidate {
    const filePath = this.relativeFileUri(value.location.uri);
    return {
      name: value.name,
      qualifiedName: value.containerName
        ? `${value.containerName}.${value.name}`
        : value.name,
      kind: value.kind,
      uri: value.location.uri,
      path: filePath,
      range: range(value.location.range),
      selectionRange: range(value.location.range),
      confidence: 1,
      adapterId: workspace.adapterId,
      language:
        this.manager.adapters().find(({ id }) => id === workspace.adapterId)
          ?.languages[0] ?? workspace.adapterId,
      root: workspace.root,
    };
  }

  private page<T>(
    values: T[],
    cursor: string | undefined,
    snapshot: LspWorkspaceSnapshot,
    budget: ResultBudget,
    queryDigest: string,
  ): { items: T[]; nextCursor?: string } {
    let offset = 0;
    if (cursor) {
      const stored = this.cursors.get(cursor);
      if (
        !stored ||
        stored.expiresAt <= Date.now() ||
        stored.snapshotDigest !== snapshot.contentHash ||
        stored.queryDigest !== queryDigest
      ) {
        throw new Error("STALE_CURSOR");
      }
      offset = Math.max(0, stored.offset);
    }
    const items: T[] = [];
    let characters = 0;
    for (const value of values.slice(offset)) {
      const size = JSON.stringify(value).length;
      if (
        items.length >= budget.maxItems ||
        characters + size > budget.maxChars
      ) {
        break;
      }
      items.push(value);
      characters += size;
    }
    const nextOffset = offset + items.length;
    const nextCursor =
      nextOffset < values.length ? `page_${randomUUID()}` : undefined;
    if (nextCursor) {
      this.cursors.set(nextCursor, {
        snapshotDigest: snapshot.contentHash,
        queryDigest,
        offset: nextOffset,
        expiresAt: Date.now() + 10 * 60_000,
      });
      this.trimBounded(this.cursors, 512);
    }
    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  private envelope<T>(input: {
    snapshot: LspWorkspaceSnapshot;
    status: CodeIntelStatus;
    data: T;
    evidence: CodeIntelEvidence[];
    warnings?: string[];
    total: number;
    returned: number;
    nextCursor?: string;
    started: number;
    lspCalls: number;
    cache?: "hit" | "miss" | "joined";
    error?: CodeIntelEnvelope<unknown>["error"];
  }): CodeIntelEnvelope<T> {
    return {
      protocol: CODE_INTEL_PROTOCOL,
      schemaVersion: CODE_INTEL_SCHEMA_VERSION,
      requestId: `ci_${randomUUID()}`,
      workspaceId: `repository-${path.basename(this.root) || "root"}`,
      snapshot: structuredClone(input.snapshot),
      status: input.status,
      freshness:
        input.status === "warming"
          ? "warming"
          : input.status === "stale"
            ? "stale"
            : "fresh",
      data: input.data,
      evidence: input.evidence,
      page: {
        returned: input.returned,
        totalKnown: input.total,
        truncated: input.returned < input.total,
        ...(input.nextCursor ? { nextCursor: input.nextCursor } : {}),
      },
      warnings: input.warnings ?? [],
      ...(input.error ? { error: input.error } : {}),
      metrics: {
        cache: input.cache ?? "miss",
        totalMs: Number((performance.now() - input.started).toFixed(3)),
        lspCalls: input.lspCalls,
      },
    };
  }

  private async cached<T>(
    operation: string,
    input: unknown,
    create: () => Promise<CodeIntelEnvelope<T>>,
  ): Promise<CodeIntelEnvelope<T>> {
    const snapshot = this.compositeSnapshot();
    const key = digest({
      operation,
      input,
      revision: snapshot.revision,
      epoch: snapshot.sessionEpoch,
      server: snapshot.serverFingerprint,
    });
    const cached = this.cache.get(key);
    if (cached?.revision === snapshot.revision) {
      return {
        ...(structuredClone(cached.value) as CodeIntelEnvelope<T>),
        requestId: `ci_${randomUUID()}`,
        metrics: {
          ...(cached.value.metrics),
          cache: "hit",
        },
      };
    }
    const current = this.inFlight.get(key);
    if (current) {
      const joined = structuredClone(
        await current,
      ) as CodeIntelEnvelope<T>;
      joined.requestId = `ci_${randomUUID()}`;
      joined.metrics.cache = "joined";
      return joined;
    }
    const promise = create() as Promise<CodeIntelEnvelope<unknown>>;
    this.inFlight.set(key, promise);
    try {
      const value = (await promise) as CodeIntelEnvelope<T>;
      this.cache.set(key, {
        revision: value.snapshot.revision,
        value: structuredClone(value) as CodeIntelEnvelope<unknown>,
      });
      while (
        this.cache.size > (this.options.maxCacheEntries ?? 512)
      ) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (!oldest) break;
        this.cache.delete(oldest);
      }
      return value;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private mergeEvidence(evidence: CodeIntelEvidence[]): CodeIntelEvidence[] {
    const grouped = new Map<string, CodeIntelEvidence>();
    for (const item of evidence) {
      const key = `${item.source}:${item.adapter}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, structuredClone(item));
      } else {
        current.methods = [...new Set([...current.methods, ...item.methods])];
        if (item.completeness === "partial") current.completeness = "partial";
      }
    }
    return [...grouped.values()];
  }

  private trimBounded<T>(values: Map<string, T>, maximum: number): void {
    while (values.size > maximum) {
      const oldest = values.keys().next().value as string | undefined;
      if (!oldest) return;
      values.delete(oldest);
    }
  }

  private relativeFileUri(uri: string): string {
    if (!uri.startsWith("file:")) throw new Error("Only file URIs are supported.");
    const absolute = fileURLToPath(uri);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("OUTSIDE_WORKSPACE");
    }
    return relative.replaceAll("\\", "/");
  }

  private positionEncoding(
    adapterId: string,
  ): "utf-8" | "utf-16" | "utf-32" {
    return (
      this.manager.snapshots().find(
        ({ workspacePath, adapterId: activeAdapter }) =>
          workspacePath === this.root && activeAdapter === adapterId,
      )?.positionEncoding ?? "utf-16"
    );
  }

  private async workspaceForPath(
    relativePath: string,
    language?: string,
    requestedAdapterId?: string,
  ): Promise<LspWorkspace> {
    if (!this.root) throw new Error("Code-intelligence workspace is not open.");
    const extension = path.extname(relativePath).toLowerCase();
    const candidates = this.manager.adapters().filter((adapter) =>
      (!requestedAdapterId || adapter.id === requestedAdapterId) &&
      (!language || adapter.languages.includes(language)) &&
      adapter.extensions.includes(extension)
    );
    const selected =
      candidates.find((adapter) =>
        this.detected.some(
          (root) =>
            root.adapterId === adapter.id &&
            ["bundled", "ready", "unverified"].includes(root.availability),
        )
      ) ?? candidates[0];
    if (!selected) throw new Error("NO_LANGUAGE_ADAPTER");
    const detected = this.detected.find(
      ({ adapterId }) => adapterId === selected.id,
    );
    if (
      detected &&
      !["bundled", "ready", "unverified"].includes(detected.availability)
    ) {
      throw new Error(
        detected.availability === "missing"
          ? "SERVER_NOT_INSTALLED"
          : "SERVER_START_FAILED",
      );
    }
    const root = detected?.root ?? this.root;
    const key = `${selected.id}:${root}`;
    const existing = this.workspaces.get(key);
    if (existing) return existing;
    await this.ensureWorkspaceCapacity(key);
    const workspace = await LspWorkspace.open(
      root,
      this.manager,
      selected.id,
      this.requireAuthority(),
    );
    this.workspaces.set(key, workspace);
    return workspace;
  }

  private async searchWorkspaces(
    language?: string,
    requestedAdapterId?: string,
  ): Promise<LspWorkspace[]> {
    const available = this.detected.filter(
      (item) =>
        (!requestedAdapterId || item.adapterId === requestedAdapterId) &&
        (!language || item.languages.includes(language)) &&
        ["bundled", "ready", "unverified"].includes(item.availability),
    );
    const workspaces: LspWorkspace[] = [];
    for (const item of available.slice(0, 8)) {
      const key = `${item.adapterId}:${item.root}`;
      const existing = this.workspaces.get(key);
      if (existing) {
        workspaces.push(existing);
        continue;
      }
      await this.ensureWorkspaceCapacity(key);
      try {
        const workspace = await LspWorkspace.open(
          item.root,
          this.manager,
          item.adapterId,
          this.requireAuthority(),
        );
        this.workspaces.set(key, workspace);
        workspaces.push(workspace);
      } catch {
        // One unavailable or incompatible server must not suppress results
        // from the other detected language roots.
      }
    }
    if (workspaces.length === 0) throw new Error("NO_LANGUAGE_ADAPTER");
    return workspaces;
  }

  private async ensureWorkspaceCapacity(targetKey: string): Promise<void> {
    if (this.workspaces.has(targetKey) || this.workspaces.size < 8) return;
    const oldest = this.workspaces.entries().next().value as
      | [string, LspWorkspace]
      | undefined;
    if (!oldest) return;
    const [key, workspace] = oldest;
    this.workspaces.delete(key);
    await workspace.close({ closeManager: false });
    await this.manager.release(workspace.adapterId, workspace.root);
  }

  private compositeSnapshot(
    participants: LspWorkspace[] = [...this.workspaces.values()],
  ): LspWorkspaceSnapshot {
    const snapshots = participants.map((workspace) => workspace.snapshot());
    const sessions = snapshots.flatMap(({ sessions }) => sessions ?? []);
    const authority = this.authority?.snapshot();
    const revision = authority?.revision ??
      Math.max(1, ...snapshots.map(({ revision }) => revision));
    const contentHash = digest({
      workspace: authority?.contentHash ?? "unopened",
      detected: this.detected.map(
        ({ adapterId, root, availability, version }) => ({
          adapterId,
          root,
          availability,
          version,
        }),
      ),
      snapshots: snapshots.map(
        ({ revision, contentHash, sessionEpoch, serverFingerprint }) => ({
          revision,
          contentHash,
          sessionEpoch,
          serverFingerprint,
        }),
      ),
    });
    return {
      revision,
      contentHash,
      dirty: authority?.dirty ?? snapshots.some(({ dirty }) => dirty),
      sessionEpoch: Math.max(0, ...sessions.map(({ epoch }) => epoch)),
      serverFingerprint: digest(
        sessions.map(({ adapterId, root, serverFingerprint }) => ({
          adapterId,
          root,
          serverFingerprint,
        })),
      ),
      sessions,
    };
  }

  async restart(adapterId: string): Promise<void> {
    if (!this.manager.snapshots().some((session) => session.adapterId === adapterId)) {
      const detected = this.detected.find(
        (item) =>
          item.adapterId === adapterId &&
          ["bundled", "ready", "unverified"].includes(item.availability),
      );
      if (!detected) throw new Error("SERVER_NOT_INSTALLED");
      const workspace = await LspWorkspace.open(
        detected.root,
        this.manager,
        adapterId,
        this.requireAuthority(),
      );
      this.workspaces.set(`${adapterId}:${detected.root}`, workspace);
    }
    await this.manager.restart(adapterId);
    this.cache.clear();
    this.handles.clear();
  }

  detectedAdapters(): LspDetectedRoot[] {
    return structuredClone(this.detected);
  }

  workspaceAuthority(): WorkspaceRevisionAuthority {
    return this.requireAuthority();
  }

  private requireAuthority(): WorkspaceRevisionAuthority {
    if (!this.authority) {
      throw new Error(
        "Code-intelligence workspace revision authority is unavailable.",
      );
    }
    return this.authority;
  }

  private workspaceForAdapter(adapterId: string): LspWorkspace | undefined {
    for (const workspace of this.workspaces.values()) {
      if (workspace.adapterId === adapterId) return workspace;
    }
    return undefined;
  }
}
