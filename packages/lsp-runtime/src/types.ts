import type {
  Diagnostic,
  InitializeResult,
  Position,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

export type LspSessionState =
  | "stopped"
  | "starting"
  | "initializing"
  | "warming"
  | "ready"
  | "degraded"
  | "restarting";

export type LspCommandSpec = {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fingerprint: string;
  initializationOptions?: unknown;
  workspaceConfiguration?: unknown;
};

export type LspAdapterDistribution = "bundled" | "system" | "custom";
export type LspAdapterTier = "tier_a" | "tier_b" | "tier_c" | "custom";
export type LspAdapterAvailability =
  | "bundled"
  | "ready"
  | "missing"
  | "broken"
  | "unverified";

export type LspDetectedRoot = {
  adapterId: string;
  root: string;
  languages: string[];
  distribution: LspAdapterDistribution;
  tier: LspAdapterTier;
  availability: LspAdapterAvailability;
  version?: string;
  detail?: string;
};

export type LspCapabilitySupport =
  | "native"
  | "adapter_extension"
  | "fallback"
  | "unsupported";

export type NormalizedLspCapabilities = {
  definition: LspCapabilitySupport;
  references: LspCapabilitySupport;
  documentSymbols: LspCapabilitySupport;
  workspaceSymbols: LspCapabilitySupport;
  hover: LspCapabilitySupport;
  callHierarchy: LspCapabilitySupport;
  typeHierarchy: LspCapabilitySupport;
  prepareRename: LspCapabilitySupport;
  rename: LspCapabilitySupport;
  codeAction: LspCapabilitySupport;
  codeActionResolve: LspCapabilitySupport;
  executeCommand: LspCapabilitySupport;
  pushDiagnostics: LspCapabilitySupport;
  pullDiagnostics: LspCapabilitySupport;
  documentSync: "none" | "full" | "incremental";
};

export type LspSessionKey = {
  workspacePath: string;
  adapterId: string;
  profileHash: string;
};

export type LspFailureCode =
  | "WORKSPACE_NOT_FOUND"
  | "NO_LANGUAGE_ADAPTER"
  | "SERVER_NOT_INSTALLED"
  | "SERVER_START_FAILED"
  | "SERVER_CRASHED"
  | "SERVER_RESTART_LIMIT"
  | "SERVER_WARMING"
  | "REQUEST_TIMEOUT"
  | "REQUEST_CANCELLED"
  | "UNSUPPORTED_CAPABILITY"
  | "INVALID_POSITION"
  | "STALE_SNAPSHOT"
  | "OUTSIDE_WORKSPACE"
  | "SYMLINK_ESCAPE"
  | "INTERNAL_PROTOCOL_ERROR";

export class LspRuntimeError extends Error {
  constructor(
    readonly code: LspFailureCode,
    message: string,
    readonly retryable: boolean,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "LspRuntimeError";
  }
}

export type LspSessionSnapshot = {
  state: LspSessionState;
  epoch: number;
  processId?: number;
  workspacePath: string;
  adapterId: string;
  serverFingerprint: string;
  positionEncoding: "utf-8" | "utf-16" | "utf-32";
  capabilities: ServerCapabilities;
  normalizedCapabilities: NormalizedLspCapabilities;
  readinessEvidence: string[];
  crashCount: number;
  restartBudgetRemaining: number;
  inFlightRequests: number;
  queuedRequests: number;
  requestCount: number;
  latestSynchronizedRevision: number;
  lastFailure?: {
    code: LspFailureCode;
    message: string;
    retryable: boolean;
  };
};

export type LspSnapshotSession = {
  adapterId: string;
  root: string;
  epoch: number;
  serverFingerprint: string;
  state: string;
  latestSynchronizedRevision: number;
};

export type LspInitializeEvidence = {
  result: InitializeResult;
  snapshot: LspSessionSnapshot;
};

export type DocumentDiagnostics = {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
  epoch: number;
  generation: number;
  publishedAt: number;
};

export type PositionEncoding = LspSessionSnapshot["positionEncoding"];

export type LspPosition = Position;
