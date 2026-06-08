import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type { RepoScanResult } from "../state/schema";
import {
  createContextPack,
  DEFAULT_CONTEXT_MAX_BYTES,
  DEFAULT_CONTEXT_MAX_CHARS,
  DEFAULT_CONTEXT_MAX_FILES,
  resolveContextBudgets,
} from "../agent/context";

let tmpDir: string;

async function writeFileAndStat(
  workspace: string,
  relativePath: string,
  content: string
): Promise<{ path: string; sizeBytes: number; isDir: boolean }> {
  const absolutePath = path.join(workspace, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf-8");
  const stat = await fs.stat(absolutePath);
  return { path: relativePath, sizeBytes: stat.size, isDir: false };
}

async function buildRepoScan(workspace: string, entries: Record<string, string>): Promise<RepoScanResult> {
  const files = await Promise.all(
    Object.entries(entries).map(([relativePath, content]) =>
      writeFileAndStat(workspace, relativePath, content)
    )
  );

  return {
    rootDir: workspace,
    files,
    detectedLanguages: [],
    packageConfigs: [
      { type: "npm", path: "package.json" },
      { type: "cargo", path: "Cargo.toml" },
    ],
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpawl-context-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createContextPack", () => {
  it("creates compact file summaries with repository hints and metrics", async () => {
    const repoScan = await buildRepoScan(tmpDir, {
      "package.json": "{\"name\":\"pkg\"}",
      "packages/core/src/auth/login.ts": "export const login = () => true;",
      "packages/core/src/utils.ts": "export const noop = () => {};",
      "README.md": "# Demo",
      ".env": "SECRET=abc",
      ".git/config": "ignored",
      "Cargo.toml": "[package]\nname=\"demo\"",
    });

    const contextPack = await createContextPack({
      workspaceRoot: tmpDir,
      task: "add auth login flow",
      repoScan,
      maxFiles: 2,
    });

    expect(contextPack.taskSummary).toBe("Task: add auth login flow");
    expect(contextPack.repositoryRoot).toBe(tmpDir);
    expect(contextPack.packageHints.map((item) => item.path).sort()).toContain("Cargo.toml");
    expect(contextPack.workspaceHints).toContain("packages/core");
    expect(contextPack.compactFileSummaries.length).toBeGreaterThan(0);
    expect(contextPack.compactFileSummaries[0]?.path).toBe("packages/core/src/auth/login.ts");
    expect(contextPack.metrics.inputScannedFiles).toBe(repoScan.files.length);
    expect(contextPack.metrics.candidateFiles).toBeGreaterThanOrEqual(1);
    expect(contextPack.omittedContextNotes.length).toBeGreaterThan(0);
  });

  it("excludes ignored directories, generated folders, and secret/binary files from candidates", async () => {
    const repoScan = await buildRepoScan(tmpDir, {
      "package.json": "{\"name\":\"pkg\"}",
      "packages/core/src/auth/login.ts": "export const login = () => true;",
      "packages/core/src/secrets.key": "nope",
      "packages/core/src/icon.svg": "<svg></svg>",
      "dist/bundle.js": "console.log(\"x\")",
      "node_modules/react/index.js": "module.exports={}",
      ".codepawl/runs/sample.json": "{}",
      "README.md": "# Demo",
      "packages/core/src/image.png": "\u0000\u0001",
    });

    const contextPack = await createContextPack({
      workspaceRoot: tmpDir,
      task: "review repository",
      repoScan,
    });

    expect(contextPack.compactFileSummaries.some((file) => file.path.includes("node_modules"))).toBe(false);
    expect(contextPack.compactFileSummaries.some((file) => file.path === "secrets.key")).toBe(false);
    expect(contextPack.compactFileSummaries.some((file) => file.path.includes("dist/"))).toBe(false);
    expect(contextPack.compactFileSummaries.some((file) => file.path.includes(".codepawl/"))).toBe(false);
    expect(contextPack.compactFileSummaries.some((file) => file.path.includes("image.png"))).toBe(false);
  });

  it("enforces file, byte, and char budgets when selecting context", async () => {
    const repoScan = await buildRepoScan(tmpDir, {
      "packages/core/src/auth/login.ts": "export const login = () => true;",
      "packages/core/src/auth/session.ts": "export const token = \"abc123\";",
      "packages/core/src/utils.ts": "export const noop = () => {};",
      "packages/core/src/readme.txt": "short text",
    });

    const fileBudgetPack = await createContextPack({
      workspaceRoot: tmpDir,
      task: "auth",
      repoScan,
      maxFiles: 1,
    });
    expect(fileBudgetPack.compactFileSummaries.length).toBe(1);
    expect(fileBudgetPack.metrics.compactionReason).toBe("file_cap");

    const byteBudgetPack = await createContextPack({
      workspaceRoot: tmpDir,
      task: "auth",
      repoScan,
      maxBytes: 1,
      maxFiles: DEFAULT_CONTEXT_MAX_FILES,
    });
    expect(byteBudgetPack.metrics.compactionReason).toBe("byte_cap");
    expect(byteBudgetPack.metrics.includedBytes).toBe(0);
    expect(byteBudgetPack.metrics.includedFiles).toBe(0);

    const charBudgetPack = await createContextPack({
      workspaceRoot: tmpDir,
      task: "auth",
      repoScan,
      maxChars: 1,
      maxFiles: DEFAULT_CONTEXT_MAX_FILES,
      maxBytes: DEFAULT_CONTEXT_MAX_BYTES,
    });
    expect(charBudgetPack.metrics.compactionReason).toBe("char_cap");
    expect(charBudgetPack.metrics.estimatedContextChars).toBeGreaterThan(0);
  });

  it("resolves CLI/env context budgets with strict positive fallback", () => {
    const resolved = resolveContextBudgets(
      {},
      {
        OPENPAWL_CONTEXT_MAX_FILES: "3",
        OPENPAWL_CONTEXT_MAX_BYTES: "8192",
        OPENPAWL_CONTEXT_MAX_CHARS: "1024",
      }
    );
    expect(resolved.maxFiles).toBe(3);
    expect(resolved.maxBytes).toBe(8192);
    expect(resolved.maxChars).toBe(1024);
  });
});
