import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDefaultCapabilityRuntimeSettings } from "@codepawl/shared";
import { afterEach, describe, expect, it } from "bun:test";

import {
  cliCodeIntelStatus,
  prepareCliCapabilities,
  prepareCliCodeIntelTools,
  shutdownCliCapabilityRuntime,
} from "./capabilities.js";

const roots: string[] = [];

async function fixture(): Promise<{ repositoryPath: string; stateRoot: string }> {
  const repositoryPath = await mkdtemp(
    path.join(os.tmpdir(), "orynt-cli-code-intel-"),
  );
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-state-"));
  roots.push(repositoryPath, stateRoot);
  await mkdir(path.join(repositoryPath, "src"), { recursive: true });
  await writeFile(
    path.join(repositoryPath, "tsconfig.json"),
    `${JSON.stringify({ include: ["src/**/*.ts"] })}\n`,
  );
  await writeFile(
    path.join(repositoryPath, "src", "main.ts"),
    "export function greet(name: string): string { return `Hello ${name}`; }\n",
  );
  return { repositoryPath, stateRoot };
}

afterEach(async () => {
  await shutdownCliCapabilityRuntime();
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("CLI code intelligence", () => {
  it("attaches read-only code tools without a browser and reuses the process", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const prepared = await prepareCliCapabilities({
      stateRoot,
      repositoryPath,
      prompt: "explain greet",
      settings: createDefaultCapabilityRuntimeSettings(),
    });
    expect(prepared?.selectedCapabilityIds).toContain("code-intelligence.read");
    expect(
      prepared?.tools.tools().map(({ name }) => name).filter((name) =>
        name.startsWith("code_")
      ),
    ).toEqual([
      "code_status",
      "code_search",
      "code_inspect",
      "code_relations",
      "code_diagnostics",
      "code_context",
      "code_refactor",
    ]);
    const first = cliCodeIntelStatus();
    expect(first).toMatchObject({ enabled: true, sessions: 0 });
    const search = await prepared?.tools.execute({
      callId: "code-search",
      name: "code_search",
      arguments: { query: "greet", path: "src/main.ts" },
    });
    expect(search?.isError).not.toBe(true);
    const warmed = cliCodeIntelStatus();
    expect(warmed).toMatchObject({
      enabled: true,
      sessions: 1,
      state: "ready",
    });

    await prepared?.close();
    const readOnlyTools = await prepareCliCodeIntelTools(repositoryPath);
    expect(readOnlyTools?.tools()).toHaveLength(7);
    expect(readOnlyTools?.tools().map(({ name }) => name)).not.toContain(
      "code_refactor_apply",
    );
    expect(cliCodeIntelStatus().serverFingerprint).toBe(
      warmed.serverFingerprint,
    );
  }, 30_000);

  it("applies only an explicitly approved diagnostics-only rename bundle", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const approvals: Array<{ summary: string; digest: string }> = [];
    const prepared = await prepareCliCapabilities({
      stateRoot,
      repositoryPath,
      prompt: "rename greet",
      settings: createDefaultCapabilityRuntimeSettings(),
      approveCodeRefactor: async (summary, digest) => {
        approvals.push({ summary, digest });
        return true;
      },
    });
    expect(prepared?.selectedCapabilityIds).toContain("code-intelligence.mutate");
    const created = await prepared!.tools.execute({
      callId: "rename-preview",
      name: "code_refactor",
      arguments: {
        operation: "rename_preview",
        selector: {
          kind: "symbol",
          qualifiedName: "greet",
          path: "src/main.ts",
        },
        newName: "welcome",
      },
    });
    expect(created.isError).toBe(false);
    const preview = JSON.parse(created.output).data.preview as {
      previewId: string;
      previewDigest: string;
    };
    const applied = await prepared!.tools.execute({
      callId: "rename-apply",
      name: "code_refactor_apply",
      arguments: preview,
    });
    expect(applied.isError).toBe(false);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.summary).toContain("LSP diagnostics delta only");
    expect(approvals[0]!.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.parse(applied.output).data.verification).toEqual({
      mode: "diagnostics_only",
      commands: [],
    });
    expect(await import("node:fs/promises").then(({ readFile }) =>
      readFile(path.join(repositoryPath, "src", "main.ts"), "utf8")
    )).toContain("function welcome");
    await prepared?.close();
  }, 30_000);

  it("rolls back an approved rename when its policy-bound command fails", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const prepared = await prepareCliCapabilities({
      stateRoot,
      repositoryPath,
      prompt: "rename greet and verify",
      settings: createDefaultCapabilityRuntimeSettings(),
      codeVerificationCommands: [{
        argv: [process.execPath, "-e", "process.exit(7)"],
        cwd: repositoryPath,
        timeoutMs: 5_000,
      }],
      approveCodeRefactor: async () => true,
    });
    const created = await prepared!.tools.execute({
      callId: "failing-preview",
      name: "code_refactor",
      arguments: {
        operation: "rename_preview",
        selector: {
          kind: "symbol",
          qualifiedName: "greet",
          path: "src/main.ts",
        },
        newName: "welcome",
      },
    });
    const preview = JSON.parse(created.output).data.preview as {
      previewId: string;
      previewDigest: string;
    };
    const applied = await prepared!.tools.execute({
      callId: "failing-apply",
      name: "code_refactor_apply",
      arguments: preview,
    });
    expect(applied.isError).toBe(true);
    expect(applied.output).toContain("Approved verification command failed");
    expect(await import("node:fs/promises").then(({ readFile }) =>
      readFile(path.join(repositoryPath, "src", "main.ts"), "utf8")
    )).toContain("function greet");
    await prepared?.close();
  }, 30_000);

  it("cancels verification and rolls back the active mutation", async () => {
    const { repositoryPath, stateRoot } = await fixture();
    const controller = new AbortController();
    const prepared = await prepareCliCapabilities({
      stateRoot,
      repositoryPath,
      prompt: "rename greet and cancel verification",
      settings: createDefaultCapabilityRuntimeSettings(),
      signal: controller.signal,
      codeVerificationCommands: [{
        argv: [
          process.execPath,
          "-e",
          "setInterval(() => undefined, 1000)",
        ],
        cwd: repositoryPath,
        timeoutMs: 10_000,
      }],
      approveCodeRefactor: async () => {
        setTimeout(() => controller.abort(), 100);
        return true;
      },
    });
    const created = await prepared!.tools.execute({
      callId: "cancel-preview",
      name: "code_refactor",
      arguments: {
        operation: "rename_preview",
        selector: {
          kind: "symbol",
          qualifiedName: "greet",
          path: "src/main.ts",
        },
        newName: "welcome",
      },
    });
    const preview = JSON.parse(created.output).data.preview as {
      previewId: string;
      previewDigest: string;
    };
    const applied = await prepared!.tools.execute({
      callId: "cancel-apply",
      name: "code_refactor_apply",
      arguments: preview,
    });
    expect(applied.isError).toBe(true);
    expect(applied.output).toContain("REQUEST_CANCELLED");
    expect(await import("node:fs/promises").then(({ readFile }) =>
      readFile(path.join(repositoryPath, "src", "main.ts"), "utf8")
    )).toContain("function greet");
    await prepared?.close();
  }, 30_000);
});
