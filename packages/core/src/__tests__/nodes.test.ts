import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  createFileSelectionNode,
  createIntakeNode,
  createRepoScanNode,
  activeLedgers,
} from "../agent/nodes";
import { TraceLedger } from "../ledger/trace";
import type { AgentState, AgentContext } from "../state/schema";

let tmpDir: string;

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  const context: AgentContext = {
    sessionId: "test-session",
    workspaceDir: tmpDir,
    outputDir: path.join(tmpDir, ".codepawl", "runs", "test-session"),
    dryRun: true,
    maxIterations: 10,
    temperature: 0.0,
  };
  return {
    query: "test query",
    messages: [],
    steps: [],
    context,
    nextNode: null,
    isComplete: false,
    error: null,
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openpawl-nodes-test-"));
  const ledger = new TraceLedger("test-session");
  activeLedgers.set("test-session", ledger);
});

afterEach(async () => {
  activeLedgers.delete("test-session");
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createIntakeNode", () => {
  it("passes through messages if already present", async () => {
    const node = createIntakeNode();
    const existingMsg = {
      id: "msg-1",
      role: "user" as const,
      content: "hello",
      timestamp: new Date().toISOString(),
    };
    const state = makeState({ messages: [existingMsg] });
    const result = await node(state);
    expect(result.messages).toHaveLength(1);
    expect(result.messages?.[0]?.content).toBe("hello");
  });

  it("adds a user message from query when messages is empty", async () => {
    const node = createIntakeNode();
    const state = makeState({ messages: [], query: "my task" });
    const result = await node(state);
    expect(result.messages).toHaveLength(1);
    expect(result.messages?.[0]?.content).toBe("my task");
    expect(result.messages?.[0]?.role).toBe("user");
  });
});

describe("createRepoScanNode", () => {
  it("scans a directory and returns file list", async () => {
    // Create some test files
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "src", "index.ts"), "export {};", "utf-8");
    await fs.writeFile(path.join(tmpDir, "README.md"), "# Test", "utf-8");

    const node = createRepoScanNode();
    const state = makeState();
    const result = await node(state);

    expect(result.repoScanResult).toBeDefined();
    const files = result.repoScanResult?.files ?? [];
    const filePaths = files.map((f) => f.path);
    expect(filePaths.some((p) => p.includes("index.ts"))).toBe(true);
    expect(filePaths.some((p) => p.includes("README.md"))).toBe(true);
  });

  it("excludes node_modules and .git from scan", async () => {
    await fs.mkdir(path.join(tmpDir, "node_modules", "react"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "node_modules", "react", "index.js"),
      "module.exports = {};",
      "utf-8"
    );
    await fs.mkdir(path.join(tmpDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, ".git", "config"), "[core]", "utf-8");
    await fs.writeFile(path.join(tmpDir, "src.ts"), "export {};", "utf-8");

    const node = createRepoScanNode();
    const state = makeState();
    const result = await node(state);

    const paths = (result.repoScanResult?.files ?? []).map((f) => f.path);
    expect(paths.every((p) => !p.startsWith("node_modules"))).toBe(true);
    expect(paths.every((p) => !p.startsWith(".git"))).toBe(true);
  });

  it("excludes ignored build artifact directories from scan", async () => {
    await fs.mkdir(path.join(tmpDir, "dist"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "dist", "bundle.js"), "compiled", "utf-8");
    await fs.writeFile(path.join(tmpDir, "index.ts"), "export {};", "utf-8");

    const node = createRepoScanNode();
    const result = await node(makeState());

    const paths = (result.repoScanResult?.files ?? []).map((f) => f.path);
    expect(paths).toContain("index.ts");
    expect(paths.every((p) => !p.startsWith("dist"))).toBe(true);
  });

  it("skips secret files during scan", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "SECRET=123", "utf-8");
    await fs.writeFile(path.join(tmpDir, "index.ts"), "export {};", "utf-8");

    const node = createRepoScanNode();
    const state = makeState();
    const result = await node(state);

    const paths = (result.repoScanResult?.files ?? []).map((f) => f.path);
    expect(paths.some((p) => p === ".env")).toBe(false);
    expect(paths.some((p) => p === "index.ts")).toBe(true);
  });

  it("detects TypeScript as a language", async () => {
    await fs.writeFile(path.join(tmpDir, "app.ts"), "const x = 1;", "utf-8");

    const node = createRepoScanNode();
    const state = makeState();
    const result = await node(state);

    expect(result.repoScanResult?.detectedLanguages).toContain("TypeScript");
  });

  it("detects npm package config", async () => {
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "test" }),
      "utf-8"
    );

    const node = createRepoScanNode();
    const state = makeState();
    const result = await node(state);

    const npmConfigs = result.repoScanResult?.packageConfigs.filter((c) => c.type === "npm") ?? [];
    expect(npmConfigs.length).toBeGreaterThan(0);
  });
});

describe("createFileSelectionNode", () => {
  it("skips secret-like files during file selection", async () => {
    await fs.writeFile(path.join(tmpDir, ".env"), "SECRET=123", "utf-8");
    await fs.writeFile(path.join(tmpDir, "index.ts"), "export {};", "utf-8");

    const node = createFileSelectionNode();
    const result = await node(
      makeState({
        scopeAnalysisResult: {
          rationale: "test",
          affectedModules: ["."],
          proposedFilesToModify: [".env", "index.ts"],
          proposedFilesToCreate: [],
        },
      })
    );

    const selectedPaths = result.fileSelectionResult?.selectedFiles.map((f) => f.path) ?? [];
    expect(selectedPaths).not.toContain(".env");
    expect(selectedPaths).toContain("index.ts");
  });

  it("skips binary files during file selection", async () => {
    await fs.writeFile(path.join(tmpDir, "image.png"), new Uint8Array([0, 1, 2, 3]));
    await fs.writeFile(path.join(tmpDir, "index.ts"), "export {};", "utf-8");

    const node = createFileSelectionNode();
    const result = await node(
      makeState({
        scopeAnalysisResult: {
          rationale: "test",
          affectedModules: ["."],
          proposedFilesToModify: ["image.png", "index.ts"],
          proposedFilesToCreate: [],
        },
      })
    );

    const selectedPaths = result.fileSelectionResult?.selectedFiles.map((f) => f.path) ?? [];
    expect(selectedPaths).not.toContain("image.png");
    expect(selectedPaths).toContain("index.ts");
  });

  it("skips unreadable files during file selection", async () => {
    const unreadablePath = path.join(tmpDir, "private.ts");
    await fs.writeFile(unreadablePath, "export const secret = true;", "utf-8");
    await fs.chmod(unreadablePath, 0o000);

    const node = createFileSelectionNode();
    const result = await node(
      makeState({
        scopeAnalysisResult: {
          rationale: "test",
          affectedModules: ["."],
          proposedFilesToModify: ["private.ts"],
          proposedFilesToCreate: [],
        },
      })
    );
    await fs.chmod(unreadablePath, 0o600);

    const selectedPaths = result.fileSelectionResult?.selectedFiles.map((f) => f.path) ?? [];
    expect(selectedPaths).not.toContain("private.ts");

    const ledger = activeLedgers.get("test-session");
    const eventNames = ledger?.getSummary().events.map((event) => event.name) ?? [];
    expect(eventNames).toContain("skipped_unreadable_file:private.ts");
  });
});
