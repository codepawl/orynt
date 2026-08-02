import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function runSidecar(input: Record<string, unknown>) {
  const repositoryRoot = path.resolve(process.cwd(), "../..");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      path.join(repositoryRoot, "scripts", "register-extensionless-esm-loader.mjs"),
      path.join(repositoryRoot, "scripts", "desktop-repository-run.mjs"),
    ],
    {
      cwd: repositoryRoot,
      input: JSON.stringify(input),
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "desktop repository sidecar failed");
  }
  return JSON.parse(result.stdout) as {
    runId: string;
    status: string;
    checkpointRevision: number;
    approval: { id: string; status: string } | null;
  };
}

describe("desktop repository sidecar v2", () => {
  it("fails closed when a bare request has no ready planning model", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-sidecar-v2-"));
    roots.push(root);
    const memoryRoot = path.join(root, "memory");
    const baseRequest = {
      goal: "Prepare a supervised repository task",
      taskId: "task-sidecar-v2",
      workspaceId: "workspace-sidecar-v2",
      repositoryPath: path.join(root, "repository"),
      sandboxRoot: path.join(root, "sandboxes"),
      artifactRoot: path.join(root, "artifacts"),
      memoryRoot,
    };

    expect(() => runSidecar(baseRequest)).toThrow(
      "Desktop task planning requires a ready model connection.",
    );
  });
});
