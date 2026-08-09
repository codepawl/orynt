export const CODE_INTEL_PROTOCOL = "orynt.code-intel" as const;
export const CODE_INTEL_SCHEMA_VERSION = 1 as const;

export type CodeIntelStatus =
  | "ok"
  | "partial"
  | "ambiguous"
  | "warming"
  | "stale"
  | "unsupported"
  | "error";

export type CodeIntelFreshness = "fresh" | "warming" | "stale";

export type ResultBudget = {
  maxItems: number;
  maxChars: number;
  maxSnippetLines: number;
  includeDeclaration: boolean;
  includeGenerated: boolean;
  includeTests: "include" | "exclude" | "only";
};

export const DEFAULT_RESULT_BUDGET: ResultBudget = {
  maxItems: 30,
  maxChars: 18_000,
  maxSnippetLines: 40,
  includeDeclaration: true,
  includeGenerated: false,
  includeTests: "include",
};

export type FreshnessPolicy =
  | "require_fresh"
  | "allow_warming"
  | "allow_stale_cache";

export type CodeIntelRequestControls = {
  deadlineMs?: number;
  minWorkspaceRevision?: number;
  freshnessPolicy?: FreshnessPolicy;
  pathIncludes?: string[];
  pathExcludes?: string[];
};

export type CodeIntelErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "NO_LANGUAGE_ADAPTER"
  | "SERVER_NOT_INSTALLED"
  | "SERVER_START_FAILED"
  | "SERVER_WARMING"
  | "SERVER_CRASHED"
  | "SERVER_RESTART_LIMIT"
  | "REQUEST_TIMEOUT"
  | "REQUEST_CANCELLED"
  | "UNSUPPORTED_CAPABILITY"
  | "SYMBOL_NOT_FOUND"
  | "AMBIGUOUS_SELECTOR"
  | "INVALID_POSITION"
  | "STALE_SNAPSHOT"
  | "STALE_CURSOR"
  | "STALE_PREVIEW"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REJECTED"
  | "OUTSIDE_WORKSPACE"
  | "SYMLINK_ESCAPE"
  | "INVALID_WORKSPACE_EDIT"
  | "OVERLAPPING_EDITS"
  | "EDIT_CONFLICT"
  | "VERIFICATION_FAILED"
  | "RECOVERY_REQUIRED"
  | "INTERNAL_PROTOCOL_ERROR";

export type CodeIntelErrorDetail = {
  code: CodeIntelErrorCode;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
};

export class CodeIntelProtocolError extends Error {
  constructor(
    readonly code: CodeIntelErrorCode,
    message: string,
    readonly retryable = false,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CodeIntelProtocolError";
  }
}

export type SemanticSelector =
  | { kind: "handle"; handle: string }
  | {
      kind: "symbol";
      qualifiedName: string;
      path?: string;
      symbolKind?: number;
      language?: string;
    }
  | {
      kind: "anchor";
      path: string;
      text: string;
      occurrence?: number;
      cursorOffsetInText?: number;
      contextHash?: string;
    }
  | {
      kind: "position";
      path: string;
      line: number;
      column: number;
      coordinates: "one_based_unicode_scalar";
    };

export type SourceRange = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

export type ResolvedSymbol = {
  handle: string;
  name: string;
  qualifiedName: string;
  kind: number;
  path: string;
  uri: string;
  range: SourceRange;
  selectionRange: SourceRange;
  identityDigest: string;
  confidence: number;
  adapterId: string;
  language: string;
  root: string;
};

export type CodeIntelEvidence = {
  source: "lsp" | "tree_sitter" | "text" | "compiler";
  adapter: string;
  methods: string[];
  completeness: "complete" | "partial";
  root?: string;
};

export type CodeIntelEnvelope<T> = {
  protocol: typeof CODE_INTEL_PROTOCOL;
  schemaVersion: typeof CODE_INTEL_SCHEMA_VERSION;
  requestId: string;
  workspaceId: string;
  snapshot: {
    revision: number;
    contentHash: string;
    dirty: boolean;
    sessionEpoch: number;
    serverFingerprint: string;
    sessions?: Array<{
      adapterId: string;
      root: string;
      epoch: number;
      serverFingerprint: string;
      state: string;
      latestSynchronizedRevision: number;
    }>;
  };
  status: CodeIntelStatus;
  freshness: CodeIntelFreshness;
  data: T;
  evidence: CodeIntelEvidence[];
  page: {
    returned: number;
    totalKnown: number;
    truncated: boolean;
    nextCursor?: string;
  };
  warnings: string[];
  error?: CodeIntelErrorDetail;
  metrics: {
    cache: "hit" | "miss" | "joined";
    totalMs: number;
    lspCalls: number;
    queueMs?: number;
    syncWaitMs?: number;
    lspMs?: number;
    orchestrationMs?: number;
    renderMs?: number;
  };
};

export type MutationOperation =
  | { kind: "rename"; symbolHandle: string; newName: string }
  | { kind: "code_action"; actionHandle: string; title: string; actionKind?: string };

export type MutationPreviewFile = {
  path: string;
  expectedHash: string;
  afterHash: string;
  content: string;
  editCount: number;
};

export type MutationPreview = {
  previewId: string;
  previewDigest: string;
  operation: MutationOperation;
  baseSnapshot: CodeIntelEnvelope<unknown>["snapshot"];
  expiresAt: string;
  affectedFiles: Array<{
    path: string;
    expectedHash: string;
    afterHash: string;
    editCount: number;
  }>;
  unifiedDiff: string;
  warnings: string[];
};

export type MutationApplyResult = {
  previewId: string;
  previewDigest: string;
  transactionId: string;
  status: "applied" | "applied_with_warnings";
  changedFiles: string[];
  diagnosticsDelta?: {
    added: number;
    resolved: number;
    unchanged?: number;
  };
  verification?: {
    mode: "diagnostics_only" | "commands";
    commands: Array<{
      argvDigest: string;
      exitCode: number;
      durationMs: number;
    }>;
  };
};
