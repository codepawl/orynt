import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "bun:test";

import { DesktopRuntime } from "./index";

const roots: string[] = [];

async function fixture() {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "orynt-tauri-runtime-")),
  );
  roots.push(root);
  const repository = path.join(root, "repository");
  await mkdir(path.join(repository, ".git"), { recursive: true });
  const calls: Array<{ kind: string; request: Record<string, unknown> }> = [];
  const runtime = new DesktopRuntime({
    dataRoot: path.join(root, "tauri-data"),
    repositoryRoot: root,
    runtimeSkillRoot: path.join(root, "builtins"),
    environment: { PATH: "" },
    repositoryOperation: async (request) => {
      calls.push({ kind: "repository", request });
      if (request.operation === "understand_prompt") {
        return { schemaVersion: 1, outcome: "repository_action" };
      }
      return {
        schemaVersion: 2,
        runId: "run-desktop-123456789abc-1",
        status: "waiting_for_approval",
        checkpointRevision: 0,
        events: [],
      };
    },
    memoryOperation: async (request) => {
      calls.push({ kind: "memory", request });
      return [];
    },
    skillOperation: async (request) => {
      calls.push({ kind: "skill", request });
      return { skills: [] };
    },
  });
  return { root, repository, runtime, calls };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DesktopRuntime", () => {
  it("keeps Tauri state under its configured fresh data root", async () => {
    const { root, repository, runtime } = await fixture();
    await runtime.execute("settings_update", {
      input: { defaultRepositoryPath: repository, welcomeCompleted: true },
    });
    const raw = await readFile(path.join(root, "tauri-data", "settings-v1.json"), "utf8");
    expect(JSON.parse(raw).welcomeCompleted).toBe(true);
    expect(runtime.dataRoot).not.toContain("com.codepawl.orynt");
  });

  it("keeps prompt understanding read-only and routes through the repository module", async () => {
    const { repository, runtime, calls } = await fixture();
    await runtime.execute("prompt_understand", {
      input: { repositoryPath: repository, promptBasis: { rawPrompt: "Inspect this repo" } },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request.operation).toBe("understand_prompt");
    await expect(readFile(path.join(runtime.dataRoot, "runs"))).rejects.toBeTruthy();
  });

  it("rejects filesystem roots as repositories", async () => {
    const { runtime } = await fixture();
    await expect(runtime.execute("prompt_understand", {
      input: { repositoryPath: path.parse(process.cwd()).root, promptBasis: { rawPrompt: "No" } },
    })).rejects.toThrow("non-root");
  });

  it("passes managed roots and nested input to memory and skill modules", async () => {
    const { runtime, calls } = await fixture();
    await runtime.execute("memory_list_episodes");
    await runtime.execute("skill_inventory_list");
    expect(calls[0]).toMatchObject({
      kind: "memory",
      request: { operation: "episode.list", memoryRoot: runtime.memoryRoot, input: {} },
    });
    expect(calls[1]).toMatchObject({
      kind: "skill",
      request: { operation: "inventory.list", managerRoot: runtime.skillStateRoot, input: {} },
    });
  });

  it("does not allow artifacts to escape their persisted artifact root", async () => {
    const { root, runtime } = await fixture();
    const artifactRoot = path.join(root, "artifacts");
    const outside = path.join(root, "outside.txt");
    await mkdir(artifactRoot, { recursive: true });
    await writeFile(outside, "secret");
    await runtime.initialize();
    await writeFile(path.join(runtime.runsRoot, "run-safe-1.json"), JSON.stringify({
      runId: "run-safe-1",
      artifactRoot,
      artifacts: [{ id: "outside", path: outside }],
    }));
    await expect(runtime.execute("artifact_read", {
      input: { runId: "run-safe-1", artifactId: "outside" },
    })).rejects.toThrow("escaped");
  });
});
