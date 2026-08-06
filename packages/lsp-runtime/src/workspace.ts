import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  WorkspaceRevisionAuthority,
  type WorkspaceDocumentRevision,
} from "./authority.js";
import { LspManager } from "./manager.js";
import type { LspSession } from "./session.js";
import {
  LspRuntimeError,
  type DocumentDiagnostics,
  type LspSnapshotSession,
} from "./types.js";

type MirroredDocument = {
  path: string;
  uri: string;
  languageId: string;
  version: number;
  content: string;
  hash: string;
};

export type LspWorkspaceSnapshot = {
  revision: number;
  contentHash: string;
  dirty: boolean;
  sessionEpoch: number;
  serverFingerprint: string;
  sessions?: LspSnapshotSession[];
};

export type SynchronizedDocument = {
  path: string;
  uri: string;
  languageId: string;
  version: number;
  content: string;
  contentHash: string;
  snapshot: LspWorkspaceSnapshot;
};

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function languageId(filePath: string, adapterId: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".tsx":
      return "typescriptreact";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "javascriptreact";
    case ".ts":
      return "typescript";
    case ".py":
    case ".pyi":
      return "python";
    case ".json":
      return "json";
    case ".jsonc":
      return "jsonc";
    case ".html":
    case ".htm":
      return "html";
    case ".css":
      return "css";
    case ".scss":
      return "scss";
    case ".less":
      return "less";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".sh":
    case ".bash":
    case ".zsh":
      return "shellscript";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".c":
      return "c";
    case ".cc":
    case ".cpp":
    case ".cxx":
    case ".h":
    case ".hh":
    case ".hpp":
      return "cpp";
    case ".java":
      return "java";
    case ".cs":
      return "csharp";
    case ".lua":
      return "lua";
    default:
      return adapterId;
  }
}

export class LspWorkspace {
  private readonly documents = new Map<string, MirroredDocument>();
  private session?: LspSession;
  private syncTail: Promise<void> = Promise.resolve();
  private unsubscribe?: () => void;
  private closed = false;

  private constructor(
    readonly root: string,
    private readonly manager: LspManager,
    readonly adapterId: string,
    readonly authority: WorkspaceRevisionAuthority,
    private readonly ownsAuthority: boolean,
  ) {}

  static async open(
    workspacePath: string,
    manager = new LspManager(),
    adapterId = "typescript",
    authority?: WorkspaceRevisionAuthority,
  ): Promise<LspWorkspace> {
    const canonicalRoot = await realpath(workspacePath);
    const revisionAuthority = authority ??
      await WorkspaceRevisionAuthority.open(canonicalRoot);
    const workspace = new LspWorkspace(
      canonicalRoot,
      manager,
      adapterId,
      revisionAuthority,
      authority === undefined,
    );
    workspace.session = await manager.acquire(adapterId, workspace.root);
    workspace.session.setReplayHandler(async () => {
      await workspace.replayDocuments();
    });
    workspace.unsubscribe = revisionAuthority.subscribe(async (event) => {
      if (workspace.closed || !workspace.containsAuthorityPath(event.path)) {
        return;
      }
      workspace.syncTail = workspace.syncTail
        .then(() => workspace.synchronizeEvent(event))
        .catch(() => undefined);
      await workspace.syncTail;
    });
    return workspace;
  }

  async synchronizeDocument(relativeOrAbsolutePath: string): Promise<SynchronizedDocument> {
    this.assertOpen();
    const filePath = await this.safeFile(relativeOrAbsolutePath);
    await this.syncTail;
    const authorityDocument = await this.authority.observeFile(filePath);
    const content = authorityDocument.content ??
      await readFile(filePath, "utf8");
    const hash = authorityDocument.contentHash ?? contentHash(content);
    const existing = this.documents.get(filePath);
    const uri = pathToFileURL(filePath).href;
    const next: MirroredDocument = {
      path: filePath,
      uri,
      languageId: languageId(filePath, this.adapterId),
      version: existing ? existing.version + (existing.hash === hash ? 0 : 1) : 1,
      content,
      hash,
    };
    if (!existing) {
      await this.requireSession().notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: next.languageId,
          version: next.version,
          text: content,
        },
      });
    } else if (existing.hash !== hash) {
      await this.requireSession().notify("textDocument/didChange", {
        textDocument: { uri, version: next.version },
        contentChanges: [{ text: content }],
      });
    }
    this.documents.set(filePath, next);
    await this.syncTail;
    return {
      path: filePath,
      uri,
      languageId: next.languageId,
      version: next.version,
      content,
      contentHash: hash,
      snapshot: this.snapshot(),
    };
  }

  async request<TResult>(
    method: string,
    params: unknown,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<{ data: TResult; snapshot: LspWorkspaceSnapshot }> {
    this.assertOpen();
    await this.authority.idle();
    await this.syncTail;
    const revision = this.authority.currentRevision();
    const data = await this.requireSession().request<TResult>(
      method,
      params,
      options.timeoutMs,
      options.signal,
    );
    await this.syncTail;
    this.requireSession().markSynchronized(revision);
    const snapshot = this.snapshot();
    if (snapshot.revision !== revision) {
      throw new LspRuntimeError(
        "SERVER_WARMING",
        "Workspace changed while the semantic request was running.",
        true,
        { requestedRevision: revision, currentRevision: snapshot.revision },
      );
    }
    return { data, snapshot };
  }

  diagnostics(uri?: string): DocumentDiagnostics[] {
    return this.requireSession().diagnosticsFor(uri);
  }

  diagnosticState(uri: string): { generation: number; publishedAt: number } {
    return this.requireSession().diagnosticState(uri);
  }

  async waitForDiagnosticsSettled(
    uri: string,
    options: {
      afterGeneration: number;
      quietMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<DocumentDiagnostics> {
    const quietMs = options.quietMs ?? 250;
    const timeoutMs = options.timeoutMs ?? 5_000;
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      if (options.signal?.aborted) {
        throw new LspRuntimeError(
          "REQUEST_CANCELLED",
          "Diagnostics settle wait was cancelled.",
          true,
        );
      }
      const state = this.diagnosticState(uri);
      if (
        state.generation > options.afterGeneration &&
        Date.now() - state.publishedAt >= quietMs
      ) {
        const settled = this.diagnostics(uri)[0];
        if (settled) return settled;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new LspRuntimeError(
      "REQUEST_TIMEOUT",
      "Language-server diagnostics did not settle after mutation.",
      true,
      { uri, timeoutMs, afterGeneration: options.afterGeneration },
    );
  }

  snapshot(): LspWorkspaceSnapshot {
    const session = this.requireSession().snapshot();
    const authority = this.authority.snapshot();
    return {
      revision: authority.revision,
      contentHash: createHash("sha256")
        .update(
          JSON.stringify({
            workspace: authority.contentHash,
            epoch: session.epoch,
            server: session.serverFingerprint,
          }),
        )
        .digest("hex"),
      dirty: authority.dirty,
      sessionEpoch: session.epoch,
      serverFingerprint: session.serverFingerprint,
      sessions: [
        {
          adapterId: session.adapterId,
          root: this.root,
          epoch: session.epoch,
          serverFingerprint: session.serverFingerprint,
          state: session.state,
          latestSynchronizedRevision: session.latestSynchronizedRevision,
        },
      ],
    };
  }

  async waitForRevision(
    minimum: number,
    timeoutMs = 2_000,
  ): Promise<number> {
    return await this.authority.waitForRevision(minimum, timeoutMs);
  }

  async close(options: { closeManager?: boolean } = {}): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    await this.syncTail;
    for (const document of this.documents.values()) {
      await this.session
        ?.notify("textDocument/didClose", {
          textDocument: { uri: document.uri },
        })
        .catch(() => undefined);
    }
    this.documents.clear();
    if (this.ownsAuthority) await this.authority.close();
    if (options.closeManager !== false) await this.manager.close();
  }

  private async safeFile(input: string): Promise<string> {
    const candidate = path.resolve(this.root, input);
    const resolved = await realpath(candidate);
    const relative = path.relative(this.root, resolved);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      /(^|[/\\])(?:\.git|node_modules)([/\\]|$)/u.test(relative)
    ) {
      throw new LspRuntimeError(
        "INTERNAL_PROTOCOL_ERROR",
        "Code-intelligence path escaped the workspace boundary.",
        false,
      );
    }
    return resolved;
  }

  private async synchronizeEvent(
    event: WorkspaceDocumentRevision,
  ): Promise<void> {
    const filePath = path.resolve(this.authority.root, event.path);
    const existing = this.documents.get(filePath);
    if (existing && !event.deleted && event.content !== undefined) {
      const hash = event.contentHash ?? contentHash(event.content);
      if (hash !== existing.hash) {
        const next = {
          ...existing,
          content: event.content,
          hash,
          version: existing.version + 1,
        };
        this.documents.set(filePath, next);
        await this.requireSession().notify("textDocument/didChange", {
          textDocument: { uri: existing.uri, version: next.version },
          contentChanges: [{ text: event.content }],
        });
      }
    }
    if (existing && event.deleted) {
      this.documents.delete(filePath);
      await this.requireSession().notify("textDocument/didClose", {
        textDocument: { uri: existing.uri },
      });
    }
    await this.requireSession().notify("workspace/didChangeWatchedFiles", {
      changes: [{
        uri: pathToFileURL(filePath).href,
        type: event.deleted ? 3 : existing ? 2 : 1,
      }],
    });
    this.requireSession().markSynchronized(event.revision);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("LSP workspace is closed.");
  }

  private requireSession(): LspSession {
    if (!this.session) throw new Error("LSP workspace session is unavailable.");
    return this.session;
  }

  private async replayDocuments(): Promise<void> {
    const session = this.requireSession();
    for (const document of this.documents.values()) {
      await session.notify("textDocument/didOpen", {
        textDocument: {
          uri: document.uri,
          languageId: document.languageId,
          version: document.version,
          text: document.content,
        },
      });
    }
    session.markSynchronized(this.authority.currentRevision());
  }

  private containsAuthorityPath(authorityRelativePath: string): boolean {
    const absolute = path.resolve(this.authority.root, authorityRelativePath);
    const relative = path.relative(this.root, absolute);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }
}
