import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "bun:test";

import {
  computeMutationPreviewDigest,
  type StoredMutationPreview,
} from "./mutation.js";
import { FileMutationPreviewStore } from "./previewStore.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

it("persists private mutation previews across service-process restarts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-preview-store-"));
  roots.push(root);
  const repositoryPath = path.join(root, "repository");
  const stateRoot = path.join(root, "state");
  await mkdir(repositoryPath);
  await mkdir(stateRoot);
  const preview: StoredMutationPreview = {
    previewId: "preview_00000000-0000-4000-8000-000000000001",
    previewDigest: "digest",
    operation: { kind: "rename", symbolHandle: "symbol", newName: "next" },
    baseSnapshot: {
      revision: 1,
      contentHash: "content",
      serverFingerprint: "server",
      sessionEpoch: 1,
    },
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    affectedFiles: [{
      path: "one.ts",
      expectedHash: "before",
      afterHash: "after",
      editCount: 1,
    }],
    unifiedDiff: "--- a/one.ts\n+++ b/one.ts\n",
    warnings: [],
    files: [{
      path: "one.ts",
      expectedHash: "before",
      afterHash: "after",
      content: "next\n",
      editCount: 1,
    }],
  };
  preview.previewDigest = computeMutationPreviewDigest(preview);

  const first = new FileMutationPreviewStore({ stateRoot });
  await first.open(repositoryPath);
  await first.put(preview);

  const restarted = new FileMutationPreviewStore({ stateRoot });
  await restarted.open(repositoryPath);
  expect(restarted.get(preview.previewId)).toEqual(preview);
  const concurrent = new FileMutationPreviewStore({ stateRoot });
  await concurrent.open(repositoryPath);
  const approvalDigest = "a".repeat(64);
  expect((await Promise.all([
    restarted.consumeApproval(preview.previewId, approvalDigest),
    concurrent.consumeApproval(preview.previewId, approvalDigest),
  ])).sort()).toEqual([false, true]);
  expect(await restarted.consumeApproval(preview.previewId, approvalDigest)).toBe(false);
  const third = new FileMutationPreviewStore({ stateRoot });
  await third.open(repositoryPath);
  expect(await third.consumeApproval(preview.previewId, approvalDigest)).toBe(false);
  const directoryMode = (await stat(path.join(
    stateRoot,
    "code-intel-previews",
    (await import("node:crypto")).createHash("sha256")
      .update(repositoryPath).digest("hex"),
  ))).mode & 0o777;
  expect(directoryMode).toBe(0o700);
});
