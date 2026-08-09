import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "bun:test";

import { RepositoryAgentToolExecutor } from "./repositoryTools.js";
import { CompositeAgentToolExecutor } from "./index.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-model-runtime-"));
  roots.push(root);
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await writeFile(path.join(root, "README.md"), "hello\n", "utf8");
  await writeFile(path.join(root, ".env"), "TOKEN=private\n", "utf8");
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RepositoryAgentToolExecutor", () => {
  it("describes repository activity without exposing patch bodies", async () => {
    const root = await fixture();
    const executor = new RepositoryAgentToolExecutor({
      repositoryPath: root,
      mode: "workspace-write",
      allowedCommands: ["bun test"],
    });
    expect(executor.describe({
      callId: "list",
      name: "repo_list",
      arguments: { glob: "packages/**/*.ts" },
    })).toEqual({
      action: "list",
      toolName: "repo_list",
      detail: "rg --files --hidden -g \"!.git\" -g \"packages/**/*.ts\"",
    });
    expect(executor.describe({
      callId: "read",
      name: "repo_read",
      arguments: { path: "README.md" },
    })).toEqual({
      action: "read",
      toolName: "repo_read",
      detail: "README.md",
    });
    expect(executor.describe({
      callId: "run",
      name: "repo_exec",
      arguments: { argv: ["bun", "test"], cwd: "packages/cli" },
    })).toEqual({
      action: "run",
      toolName: "repo_exec",
      detail: "bun test · in packages/cli",
    });

    const patch = [
      "diff --git a/src/index.ts b/src/index.ts",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1 +1 @@",
      "-export const secret = 'do-not-render';",
      "+export const secret = 'still-hidden';",
      "",
    ].join("\n");
    const edit = executor.describe({
      callId: "edit",
      name: "repo_apply_patch",
      arguments: { patch },
    });
    expect(edit).toEqual({
      action: "edit",
      toolName: "repo_apply_patch",
      detail: "src/index.ts",
    });
    expect(JSON.stringify(edit)).not.toContain("do-not-render");
    expect(JSON.stringify(edit)).not.toContain("still-hidden");

    const composite = new CompositeAgentToolExecutor([executor]);
    expect(composite.describe({
      callId: "composite-read",
      name: "repo_read",
      arguments: { path: "README.md" },
    })).toEqual({
      action: "read",
      toolName: "repo_read",
      detail: "README.md",
    });
  });

  it("supports bounded read tools while blocking sensitive files", async () => {
    const root = await fixture();
    const executor = new RepositoryAgentToolExecutor({ repositoryPath: root, mode: "read-only" });
    const read = await executor.execute({ callId: "1", name: "repo_read", arguments: { path: "README.md" } });
    expect(read.output).toBe("hello\n");
    await expect(executor.execute({
      callId: "2",
      name: "repo_read",
      arguments: { path: ".env" },
    })).rejects.toThrow("sensitive path");
    expect(executor.tools().map((tool) => tool.name)).not.toContain("repo_exec");
  });

  it("applies validated patches and rejects protected writes", async () => {
    const root = await fixture();
    const executor = new RepositoryAgentToolExecutor({
      repositoryPath: root,
      mode: "workspace-write",
      protectedPaths: ["README.md"],
    });
    const patch = [
      "diff --git a/src/index.ts b/src/index.ts",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1 +1 @@",
      "-export const value = 1;",
      "+export const value = 2;",
      "",
    ].join("\n");
    const result = await executor.execute({
      callId: "3",
      name: "repo_apply_patch",
      arguments: { patch },
    });
    expect(result.isError).not.toBe(true);
    expect(await readFile(path.join(root, "src", "index.ts"), "utf8")).toContain("value = 2");
    await expect(executor.execute({
      callId: "4",
      name: "repo_apply_patch",
      arguments: {
        patch: [
          "diff --git a/README.md b/README.md",
          "--- a/README.md",
          "+++ b/README.md",
          "@@ -1 +1 @@",
          "-hello",
          "+changed",
          "",
        ].join("\n"),
      },
    })).rejects.toThrow("protected path");
  });

  it("enforces exact task-owned paths and removes arbitrary command execution", async () => {
    const root = await fixture();
    const executor = new RepositoryAgentToolExecutor({
      repositoryPath: root,
      mode: "workspace-write",
      allowedWritePaths: ["src/index.ts"],
      allowedCommands: ["bun --version"],
    });
    const allowedPatch = [
      "diff --git a/src/index.ts b/src/index.ts",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1 +1 @@",
      "-export const value = 1;",
      "+export const value = 2;",
      "",
    ].join("\n");
    await expect(executor.execute({
      callId: "task-write-allowed",
      name: "repo_apply_patch",
      arguments: { patch: allowedPatch },
    })).resolves.toMatchObject({ isError: false });
    await expect(executor.execute({
      callId: "task-write-denied",
      name: "repo_apply_patch",
      arguments: {
        patch: [
          "diff --git a/README.md b/README.md",
          "--- a/README.md",
          "+++ b/README.md",
          "@@ -1 +1 @@",
          "-hello",
          "+changed",
          "",
        ].join("\n"),
      },
    })).rejects.toThrow("task-owned path scope");
    expect(executor.tools().map((tool) => tool.name)).not.toContain("repo_exec");
  });

  it("executes only bare allowlisted commands with argv", async () => {
    const root = await fixture();
    const executor = new RepositoryAgentToolExecutor({
      repositoryPath: root,
      mode: "workspace-write",
      allowedCommands: ["bun --version"],
    });
    const result = await executor.execute({
      callId: "5",
      name: "repo_exec",
      arguments: { argv: ["bun", "--version"], cwd: null },
    });
    expect(result.isError).not.toBe(true);
    await expect(executor.execute({
      callId: "6",
      name: "repo_exec",
      arguments: { argv: ["sh", "-c", "echo bad"], cwd: null },
    })).rejects.toThrow("not allowlisted");
    await expect(executor.execute({
      callId: "7",
      name: "repo_exec",
      arguments: { argv: ["node", "-e", "process.stdout.write('unsafe')"], cwd: null },
    })).rejects.toThrow("not allowlisted");
  });
});
