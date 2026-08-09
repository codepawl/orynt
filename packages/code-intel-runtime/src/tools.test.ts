import { describe, expect, it } from "bun:test";

import type { MutationPreview } from "./contracts.js";
import type { CodeIntelService } from "./service.js";
import { CodeIntelToolExecutor } from "./tools.js";

const preview: MutationPreview = {
  previewId: "preview-1",
  previewDigest: "digest-1",
  operation: { kind: "rename", symbolHandle: "symbol-1", newName: "next" },
  baseSnapshot: {
    revision: 1,
    contentHash: "workspace",
    dirty: false,
    sessionEpoch: 1,
    serverFingerprint: "server",
  },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  affectedFiles: [{
    path: "main.ts",
    expectedHash: "before",
    afterHash: "after",
    editCount: 1,
  }],
  unifiedDiff: "--- a/main.ts\n+++ b/main.ts\n",
  warnings: [],
};

describe("CodeIntelToolExecutor mutation boundary", () => {
  it("exposes apply only with both approval and mutation runtime", async () => {
    let applied = false;
    const service = {
      mutationPreview: () => preview,
      applyPreview: async () => {
        applied = true;
        return { status: "ok" };
      },
      failure: (error: { code?: string; message?: string }) => ({
        status: "error",
        error: {
          code: error.code ?? "INTERNAL_PROTOCOL_ERROR",
          message: error.message ?? "error",
        },
      }),
    } as unknown as CodeIntelService;
    const executor = new CodeIntelToolExecutor(service, {
      mutationRuntime: {
        apply: async () => ({
          transactionId: "transaction",
          leaseToken: "lease",
          changedFiles: [],
        }),
        rollback: async () => undefined,
        finalize: async () => undefined,
      },
      approveMutation: async (candidate) =>
        candidate.previewDigest === preview.previewDigest,
    });
    expect(executor.tools().map(({ name }) => name)).toContain(
      "code_refactor_apply",
    );
    const result = await executor.execute({
      callId: "apply",
      name: "code_refactor_apply",
      arguments: {
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
      },
    });
    expect(result.isError).toBe(false);
    expect(applied).toBe(true);
  });

  it("fails closed when exact-preview approval is rejected", async () => {
    const service = {
      mutationPreview: () => preview,
      applyPreview: async () => {
        throw new Error("must not apply");
      },
      failure: (error: { code?: string; message?: string }) => ({
        status: "error",
        error: {
          code: error.code ?? "INTERNAL_PROTOCOL_ERROR",
          message: error.message ?? "error",
        },
      }),
    } as unknown as CodeIntelService;
    const executor = new CodeIntelToolExecutor(service, {
      mutationRuntime: {
        apply: async () => ({
          transactionId: "transaction",
          leaseToken: "lease",
          changedFiles: [],
        }),
        rollback: async () => undefined,
        finalize: async () => undefined,
      },
      approveMutation: async () => false,
    });
    const result = await executor.execute({
      callId: "rejected",
      name: "code_refactor_apply",
      arguments: {
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.output).error.code).toBe("APPROVAL_REJECTED");
  });
});
