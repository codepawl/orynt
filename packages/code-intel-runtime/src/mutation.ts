import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LineIndex,
  type LspWorkspaceSnapshot,
  type PositionEncoding,
} from "@codepawl/lsp-runtime";
import type {
  AnnotatedTextEdit,
  CreateFile,
  DeleteFile,
  RenameFile,
  TextDocumentEdit,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";

import {
  CodeIntelProtocolError,
  type MutationOperation,
  type MutationPreview,
  type MutationPreviewFile,
} from "./contracts.js";

export type StoredMutationPreview = MutationPreview & {
  files: MutationPreviewFile[];
  binding?: {
    path: string;
    language: string;
    adapterId: string;
  };
};

export type MutationRuntime = {
  apply(input: {
    previewId: string;
    previewDigest: string;
    files: Array<{ path: string; expectedHash: string; content: string }>;
  }): Promise<{
    transactionId: string;
    leaseToken: string;
    changedFiles: string[];
  }>;
  rollback(input: { transactionId: string; leaseToken: string }): Promise<void>;
  finalize(input: { transactionId: string; leaseToken: string }): Promise<void>;
};

export type MutationVerificationCommand = {
  argv: [string, ...string[]];
  cwd: string;
  timeoutMs: number;
};

export type MutationApprovalBundle = {
  previewId: string;
  previewDigest: string;
  verification:
    | { mode: "diagnostics_only"; commands: [] }
    | { mode: "commands"; commands: MutationVerificationCommand[] };
  expiresAt: string;
  approvalDigest: string;
};

export function createMutationApprovalBundle(input: {
  preview: MutationPreview;
  commands?: MutationVerificationCommand[];
  ttlMs?: number;
}): MutationApprovalBundle {
  const expiresAt = new Date(Math.min(
    Date.parse(input.preview.expiresAt),
    Date.now() + (input.ttlMs ?? 300_000),
  )).toISOString();
  const commands = structuredClone(input.commands ?? []);
  const verification: MutationApprovalBundle["verification"] =
    commands.length > 0
      ? { mode: "commands", commands }
      : { mode: "diagnostics_only", commands: [] };
  const approvalDigest = digest({
    previewId: input.preview.previewId,
    previewDigest: input.preview.previewDigest,
    verification,
    expiresAt,
  });
  return {
    previewId: input.preview.previewId,
    previewDigest: input.preview.previewDigest,
    verification,
    expiresAt,
    approvalDigest,
  };
}

type UriEdits = {
  uri: string;
  version?: number | null;
  edits: Array<TextEdit | AnnotatedTextEdit>;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computeMutationPreviewDigest(
  preview: Pick<
    StoredMutationPreview,
    "previewId" | "operation" | "baseSnapshot" | "expiresAt" | "files"
  >,
): string {
  return digest({
    previewId: preview.previewId,
    operation: preview.operation,
    baseSnapshot: preview.baseSnapshot,
    expiresAt: preview.expiresAt,
    files: preview.files.map(
      ({ path: filePath, expectedHash, afterHash, editCount }) => ({
        path: filePath,
        expectedHash,
        afterHash,
        editCount,
      }),
    ),
  });
}

function contentDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isTextDocumentEdit(
  value: TextDocumentEdit | CreateFile | RenameFile | DeleteFile,
): value is TextDocumentEdit {
  return "textDocument" in value && Array.isArray(value.edits);
}

function collectEdits(edit: WorkspaceEdit): UriEdits[] {
  const grouped = new Map<string, UriEdits>();
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    grouped.set(uri, { uri, edits });
  }
  for (const change of edit.documentChanges ?? []) {
    if (!isTextDocumentEdit(change)) {
      throw new CodeIntelProtocolError(
        "INVALID_WORKSPACE_EDIT",
        "Resource create, delete, and rename operations are unsupported.",
        false,
      );
    }
    const existing = grouped.get(change.textDocument.uri);
    const value = existing ?? {
      uri: change.textDocument.uri,
      version: change.textDocument.version,
      edits: [],
    };
    for (const textEdit of change.edits) {
      if (!("newText" in textEdit)) {
        throw new CodeIntelProtocolError(
          "INVALID_WORKSPACE_EDIT",
          "Snippet workspace edits are unsupported.",
          false,
          { uri: change.textDocument.uri },
        );
      }
      value.edits.push(textEdit);
    }
    grouped.set(change.textDocument.uri, value);
  }
  if (grouped.size === 0) {
    throw new CodeIntelProtocolError(
      "INVALID_WORKSPACE_EDIT",
      "Language server returned no text edits.",
      false,
    );
  }
  return [...grouped.values()].sort((left, right) =>
    left.uri.localeCompare(right.uri)
  );
}

function relativeWorkspacePath(root: string, uri: string): string {
  if (!uri.startsWith("file:")) {
    throw new CodeIntelProtocolError(
      "INVALID_WORKSPACE_EDIT",
      "Only local file URIs are supported in workspace edits.",
      false,
      { uri },
    );
  }
  const absolute = fileURLToPath(uri);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new CodeIntelProtocolError(
      "OUTSIDE_WORKSPACE",
      "Workspace edit escaped the selected repository.",
      false,
      { uri },
    );
  }
  return relative.replaceAll("\\", "/");
}

function applyEdits(
  content: string,
  edits: Array<TextEdit | AnnotatedTextEdit>,
  encoding: PositionEncoding,
): string {
  const index = new LineIndex(content);
  const normalized = edits.map((edit) => ({
    start: index.byteOffsetAt(edit.range.start, encoding),
    end: index.byteOffsetAt(edit.range.end, encoding),
    newText: edit.newText,
  })).sort((left, right) => left.start - right.start || left.end - right.end);
  for (let position = 0; position < normalized.length; position += 1) {
    const edit = normalized[position]!;
    if (edit.start > edit.end) {
      throw new CodeIntelProtocolError(
        "INVALID_WORKSPACE_EDIT",
        "Workspace edit range is reversed.",
        false,
      );
    }
    const previous = normalized[position - 1];
    if (previous && edit.start < previous.end) {
      throw new CodeIntelProtocolError(
        "OVERLAPPING_EDITS",
        "Workspace edit contains overlapping text ranges.",
        false,
      );
    }
  }
  let bytes = Buffer.from(content, "utf8");
  for (const edit of [...normalized].reverse()) {
    bytes = Buffer.concat([
      bytes.subarray(0, edit.start),
      Buffer.from(edit.newText, "utf8"),
      bytes.subarray(edit.end),
    ]);
  }
  return bytes.toString("utf8");
}

function unifiedFileDiff(
  filePath: string,
  before: string,
  after: string,
): string {
  const beforeLines = before.replace(/\n$/u, "").split("\n");
  const afterLines = after.replace(/\n$/u, "").split("\n");
  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

export async function createMutationPreview(input: {
  root: string;
  snapshot: LspWorkspaceSnapshot;
  operation: MutationOperation;
  workspaceEdit: WorkspaceEdit;
  positionEncoding: PositionEncoding;
  ttlMs?: number;
  maxFiles?: number;
  maxEdits?: number;
  maxBytes?: number;
  binding?: StoredMutationPreview["binding"];
}): Promise<StoredMutationPreview> {
  const root = await realpath(input.root);
  const grouped = collectEdits(input.workspaceEdit);
  if (grouped.length > (input.maxFiles ?? 100)) {
    throw new CodeIntelProtocolError(
      "INVALID_WORKSPACE_EDIT",
      "Workspace edit exceeds the configured file limit.",
      false,
      { files: grouped.length },
    );
  }
  const totalEdits = grouped.reduce((sum, value) => sum + value.edits.length, 0);
  if (totalEdits > (input.maxEdits ?? 10_000)) {
    throw new CodeIntelProtocolError(
      "INVALID_WORKSPACE_EDIT",
      "Workspace edit exceeds the configured edit limit.",
      false,
      { edits: totalEdits },
    );
  }
  const files: MutationPreviewFile[] = [];
  const diffs: string[] = [];
  for (const group of grouped) {
    const relative = relativeWorkspacePath(root, group.uri);
    const unresolved = path.join(root, relative);
    const metadata = await lstat(unresolved);
    if (metadata.isSymbolicLink()) {
      throw new CodeIntelProtocolError(
        "SYMLINK_ESCAPE",
        "Workspace edit targets may not be symbolic links.",
        false,
        { path: relative },
      );
    }
    if (!metadata.isFile() || await realpath(unresolved) !== unresolved) {
      throw new CodeIntelProtocolError(
        "INVALID_WORKSPACE_EDIT",
        "Workspace edit targets must be canonical regular files.",
        false,
        { path: relative },
      );
    }
    const before = await readFile(unresolved, "utf8");
    const after = applyEdits(before, group.edits, input.positionEncoding);
    const expectedHash = contentDigest(before);
    const afterHash = contentDigest(after);
    files.push({
      path: relative,
      expectedHash,
      afterHash,
      content: after,
      editCount: group.edits.length,
    });
    diffs.push(unifiedFileDiff(relative, before, after));
  }
  const totalBytes = files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content),
    0,
  );
  if (totalBytes > (input.maxBytes ?? 10 * 1024 * 1024)) {
    throw new CodeIntelProtocolError(
      "INVALID_WORKSPACE_EDIT",
      "Workspace edit exceeds the configured byte limit.",
      false,
      { totalBytes },
    );
  }
  const previewId = `preview_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 300_000)).toISOString();
  const stored: StoredMutationPreview = {
    previewId,
    previewDigest: "",
    operation: input.operation,
    baseSnapshot: structuredClone(input.snapshot),
    expiresAt,
    affectedFiles: files.map(
      ({ path: filePath, expectedHash, afterHash, editCount }) => ({
        path: filePath,
        expectedHash,
        afterHash,
        editCount,
      }),
    ),
    unifiedDiff: diffs.join("\n"),
    warnings: [],
    files,
    ...(input.binding ? { binding: structuredClone(input.binding) } : {}),
  };
  stored.previewDigest = computeMutationPreviewDigest(stored);
  return stored;
}
