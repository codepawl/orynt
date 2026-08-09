import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { createMutationApprovalBundle } from "./mutation.js";
import { FileMutationPreviewStore } from "./previewStore.js";
import { CodeIntelService } from "./service.js";
import { CodeIntelToolExecutor } from "./tools.js";

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-code-intel-"));
  roots.push(root);
  await writeFile(
    path.join(root, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "ESNext",
      },
      include: ["src/**/*.ts"],
    })}\n`,
  );
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(path.join(root, "src"), { recursive: true })
  );
  await writeFile(
    path.join(root, "src", "main.ts"),
    [
      "export namespace First {",
      "  export function same(value: string): string { return value; }",
      "}",
      "export namespace Second {",
      "  export function same(value: number): number { return value; }",
      "}",
      "export function greet(name: string): string {",
      "  return `Hello ${name}`;",
      "}",
      "export const result = greet('Orynt');",
      "",
    ].join("\n"),
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("CodeIntelService", () => {
  it("returns snapshot-bound structured inspection and context", async () => {
    const root = await fixture();
    const service = new CodeIntelService();
    try {
      await service.open(root);
      const inspection = await service.inspect({
        selector: {
          kind: "symbol",
          qualifiedName: "greet",
          path: "src/main.ts",
        },
        includeBody: true,
      });
      expect(inspection).toMatchObject({
        protocol: "orynt.code-intel",
        schemaVersion: 1,
        status: "ok",
        freshness: "fresh",
      });
      expect(inspection.data.symbol?.name).toBe("greet");
      expect(inspection.data.declaration?.content).toContain(
        "function greet",
      );
      expect(inspection.snapshot.sessionEpoch).toBe(1);
      expect(inspection.evidence[0]?.source).toBe("lsp");

      const context = await service.context({
        goal: "explain",
        selector: {
          kind: "handle",
          handle: inspection.data.symbol!.handle,
        },
        include: ["definition", "references", "diagnostics"],
        budget: { maxChars: 8_000, maxItems: 12 },
      });
      expect(context.status).toBe("partial");
      expect(context.data.primary.symbol?.name).toBe("greet");
      expect(context.data.relations.locations.length).toBeGreaterThanOrEqual(1);
      expect(context.metrics.lspCalls).toBeGreaterThanOrEqual(3);
    } finally {
      await service.close();
    }
  }, 30_000);

  it("surfaces same-name ambiguity and caches deterministic searches", async () => {
    const root = await fixture();
    const service = new CodeIntelService();
    try {
      await service.open(root);
      const ambiguous = await service.resolve({
        kind: "symbol",
        qualifiedName: "same",
        path: "src/main.ts",
      });
      expect(ambiguous.status).toBe("ambiguous");
      expect(ambiguous.data.candidates).toHaveLength(2);

      const first = await service.search({
        query: "greet",
        path: "src/main.ts",
      });
      const second = await service.search({
        query: "greet",
        path: "src/main.ts",
      });
      expect(first.metrics.cache).toBe("miss");
      expect(second.metrics.cache).toBe("hit");
      expect(second.snapshot.contentHash).toBe(first.snapshot.contentHash);
    } finally {
      await service.close();
    }
  }, 30_000);

  it("observes an external file edit and invalidates stale cached results", async () => {
    const root = await fixture();
    const service = new CodeIntelService();
    try {
      await service.open(root);
      const before = await service.search({
        query: "greet",
        path: "src/main.ts",
      });
      await writeFile(
        path.join(root, "src", "main.ts"),
        "export function farewell(name: string): string { return `Bye ${name}`; }\n",
      );

      let after = await service.search({
        query: "farewell",
        path: "src/main.ts",
      });
      const deadline = Date.now() + 5_000;
      while (
        after.snapshot.revision <= before.snapshot.revision &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        after = await service.search({
          query: "farewell",
          path: "src/main.ts",
        });
      }
      expect(after.snapshot.revision).toBeGreaterThan(before.snapshot.revision);
      expect(after.snapshot.contentHash).not.toBe(before.snapshot.contentHash);
      expect(after.data.symbols.some(({ name }) => name === "farewell")).toBe(
        true,
      );
      expect(after.metrics.cache).toBe("miss");
    } finally {
      await service.close();
    }
  }, 30_000);

  it("exposes bounded read tools and keeps mutation apply unavailable by default", async () => {
    const service = new CodeIntelService();
    const executor = new CodeIntelToolExecutor(service);
    expect(executor.tools().map(({ name }) => name)).toEqual([
      "code_status",
      "code_search",
      "code_inspect",
      "code_relations",
      "code_diagnostics",
      "code_context",
      "code_refactor",
    ]);
    expect(executor.tools().map(({ name }) => name)).not.toContain(
      "code_refactor_apply",
    );
    await service.close();
  });

  it("previews and applies an exact approved rename", async () => {
    const root = await fixture();
    const service = new CodeIntelService();
    try {
      await service.open(root);
      const created = await service.renamePreview({
        selector: {
          kind: "symbol",
          qualifiedName: "greet",
          path: "src/main.ts",
        },
        newName: "welcome",
      });
      expect(created.status).toBe("ok");
      const preview = created.data.preview!;
      expect(preview.unifiedDiff).toContain("function welcome");
      expect(await readFile(path.join(root, "src", "main.ts"), "utf8")).toContain(
        "function greet",
      );

      const applied = await service.applyPreview({
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
        approval: createMutationApprovalBundle({ preview }),
        runtime: {
          apply: async ({ files }) => {
            for (const file of files) {
              await writeFile(path.join(root, file.path), file.content);
            }
            return {
              transactionId: "test-transaction",
              leaseToken: "test-lease",
              changedFiles: files.map(({ path: filePath }) => filePath),
            };
          },
          rollback: async () => undefined,
          finalize: async () => undefined,
        },
      });
      expect(applied.data.status).toBe("applied");
      expect(await readFile(path.join(root, "src", "main.ts"), "utf8")).toContain(
        "function welcome",
      );
    } finally {
      await service.close();
    }
  }, 30_000);

  it("publishes the restored revision immediately after verification rollback", async () => {
    const root = await fixture();
    const source = path.join(root, "src", "main.ts");
    const original = await readFile(source, "utf8");
    const service = new CodeIntelService();
    try {
      await service.open(root);
      const created = await service.renamePreview({
        selector: {
          kind: "symbol",
          qualifiedName: "greet",
          path: "src/main.ts",
        },
        newName: "welcome",
      });
      const preview = created.data.preview!;
      await expect(service.applyPreview({
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
        approval: createMutationApprovalBundle({ preview }),
        runtime: {
          apply: async ({ files }) => {
            for (const file of files) {
              await writeFile(path.join(root, file.path), file.content);
            }
            return {
              transactionId: "rollback-transaction",
              leaseToken: "rollback-lease",
              changedFiles: files.map(({ path: filePath }) => filePath),
            };
          },
          rollback: async () => {
            await writeFile(source, original);
          },
          finalize: async () => undefined,
        },
        verify: async () => {
          throw new Error("forced verification failure");
        },
      })).rejects.toThrow("forced verification failure");
      expect(await readFile(source, "utf8")).toBe(original);
      const restored = await service.search({
        query: "greet",
        path: "src/main.ts",
      });
      expect(restored.data.symbols.some(({ name }) => name === "greet"))
        .toBe(true);
      const removed = await service.search({
        query: "welcome",
        path: "src/main.ts",
      });
      expect(removed.data.symbols.some(({ name }) => name === "welcome"))
        .toBe(false);
    } finally {
      await service.close();
    }
  }, 30_000);

  it("lists real diagnostic actions and rejects mixed edit-command actions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-code-action-"));
    roots.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { noUnusedLocals: true },
        include: ["src/**/*.ts"],
      }),
    );
    await writeFile(
      path.join(root, "src", "main.ts"),
      "export function value(): number { const unused = 1; return 2; }\n",
    );
    const service = new CodeIntelService();
    try {
      await service.open(root);
      await service.inspect({
        selector: {
          kind: "symbol",
          qualifiedName: "value",
          path: "src/main.ts",
        },
      });
      const deadline = Date.now() + 5_000;
      let actions = await service.listCodeActions({
        selector: {
          kind: "position",
          path: "src/main.ts",
          line: 1,
          column: 41,
          coordinates: "one_based_unicode_scalar",
        },
        onlyKinds: ["quickfix"],
      });
      while (actions.data.actions.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        actions = await service.listCodeActions({
          selector: {
            kind: "position",
            path: "src/main.ts",
            line: 1,
            column: 41,
            coordinates: "one_based_unicode_scalar",
          },
          onlyKinds: ["quickfix"],
        });
      }
      const removeUnused = actions.data.actions.find(({ title }) =>
        title.includes("Remove unused declaration")
      );
      expect(removeUnused).toMatchObject({
        kind: "quickfix",
        previewable: true,
      });
      await expect(service.codeActionPreview({
        actionHandle: removeUnused!.handle,
      })).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
    } finally {
      await service.close();
    }
  }, 30_000);

  it("uses opaque query-bound cursors and diagnostics baselines", async () => {
    const root = await fixture();
    const service = new CodeIntelService();
    try {
      await service.open(root);
      const first = await service.search({
        query: "",
        path: "src/main.ts",
        budget: { maxItems: 1 },
      });
      expect(first.page.nextCursor).toMatch(/^page_/u);
      await expect(
        service.search({
          query: "different",
          path: "src/main.ts",
          cursor: first.page.nextCursor,
          budget: { maxItems: 1 },
        }),
      ).rejects.toThrow("STALE_CURSOR");

      const baseline = await service.diagnostics({
        path: "src/main.ts",
      });
      const delta = await service.diagnostics({
        path: "src/main.ts",
        mode: "delta",
        baselineToken: baseline.data.baselineToken,
      });
      expect(delta.data).toMatchObject({
        added: [],
        resolved: [],
      });
      expect(delta.data.baselineToken).toMatch(/^diag_/u);
    } finally {
      await service.close();
    }
  }, 30_000);

  it("revalidates and applies a durable preview after a service restart", async () => {
    const root = await fixture();
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-preview-state-"));
    roots.push(stateRoot);
    await mkdir(stateRoot, { recursive: true });
    const first = new CodeIntelService({
      previewStore: new FileMutationPreviewStore({ stateRoot }),
    });
    await first.open(root);
    const created = await first.renamePreview({
      selector: {
        kind: "symbol",
        qualifiedName: "greet",
        path: "src/main.ts",
      },
      newName: "welcome",
    });
    const preview = created.data.preview!;
    await first.close();

    const restarted = new CodeIntelService({
      previewStore: new FileMutationPreviewStore({ stateRoot }),
    });
    try {
      await restarted.open(root);
      expect(restarted.mutationPreview(preview.previewId, preview.previewDigest))
        .toEqual(preview);
      const result = await restarted.applyPreview({
        previewId: preview.previewId,
        previewDigest: preview.previewDigest,
        approval: createMutationApprovalBundle({ preview }),
        runtime: {
          apply: async ({ files }) => {
            for (const file of files) {
              await writeFile(path.join(root, file.path), file.content);
            }
            return {
              transactionId: "restart-transaction",
              leaseToken: "restart-lease",
              changedFiles: files.map(({ path: filePath }) => filePath),
            };
          },
          rollback: async () => undefined,
          finalize: async () => undefined,
        },
      });
      expect(result.data.status).toBe("applied");
      expect(await readFile(path.join(root, "src/main.ts"), "utf8"))
        .toContain("function welcome");
    } finally {
      await restarted.close();
    }
  }, 30_000);
});
