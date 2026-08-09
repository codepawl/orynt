import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "bun:test";

import { createMutationPreview } from "./mutation.js";

const roots: string[] = [];

function snapshot() {
  return {
    revision: 1,
    contentHash: "workspace-hash",
    dirty: false,
    sessionEpoch: 1,
    serverFingerprint: "server",
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("createMutationPreview", () => {
  it("normalizes UTF-16 edits into a deterministic full-file preview", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-preview-"));
    roots.push(root);
    const filePath = path.join(root, "main.ts");
    await writeFile(filePath, "const emoji = '😀';\n");
    const preview = await createMutationPreview({
      root,
      snapshot: snapshot(),
      operation: { kind: "rename", symbolHandle: "symbol", newName: "icon" },
      workspaceEdit: {
        changes: {
          [pathToFileURL(filePath).href]: [{
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 11 },
            },
            newText: "icon",
          }],
        },
      },
      positionEncoding: "utf-16",
    });
    expect(preview.files[0]?.content).toBe("const icon = '😀';\n");
    expect(preview.unifiedDiff).toContain("+const icon");
    expect(preview.previewDigest).toHaveLength(64);
  });

  it("normalizes an edit-only code action into an approvable preview", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-preview-"));
    roots.push(root);
    const filePath = path.join(root, "main.ts");
    await writeFile(filePath, "const unused = 1;\n");
    const preview = await createMutationPreview({
      root,
      snapshot: snapshot(),
      operation: {
        kind: "code_action",
        actionHandle: "action-edit-only",
        title: "Remove unused declaration",
        actionKind: "quickfix",
      },
      workspaceEdit: {
        changes: {
          [pathToFileURL(filePath).href]: [{
            range: {
              start: { line: 0, character: 0 },
              end: { line: 1, character: 0 },
            },
            newText: "",
          }],
        },
      },
      positionEncoding: "utf-16",
    });
    expect(preview.operation.kind).toBe("code_action");
    expect(preview.files[0]?.content).toBe("");
    expect(preview.previewDigest).toHaveLength(64);
  });

  it("rejects overlapping edits before producing a preview", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-preview-"));
    roots.push(root);
    const filePath = path.join(root, "main.ts");
    await writeFile(filePath, "abcdef\n");
    await expect(createMutationPreview({
      root,
      snapshot: snapshot(),
      operation: { kind: "rename", symbolHandle: "symbol", newName: "x" },
      workspaceEdit: {
        changes: {
          [pathToFileURL(filePath).href]: [
            {
              range: {
                start: { line: 0, character: 1 },
                end: { line: 0, character: 4 },
              },
              newText: "x",
            },
            {
              range: {
                start: { line: 0, character: 3 },
                end: { line: 0, character: 5 },
              },
              newText: "y",
            },
          ],
        },
      },
      positionEncoding: "utf-16",
    })).rejects.toMatchObject({ code: "OVERLAPPING_EDITS" });
  });
});
