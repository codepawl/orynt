import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertRepositoryTaskScope,
  captureRepositoryTaskScope,
  repositoryTaskScopeDelta,
} from "./taskScopeGuard";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-task-scope-"));
  roots.push(root);
  await execFileAsync("git", ["init", root]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Orynt Test"]);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "one.ts"), "one\n");
  await writeFile(path.join(root, "src", "two.ts"), "two\n");
  await execFileAsync("git", ["-C", root, "add", "."]);
  await execFileAsync("git", ["-C", root, "commit", "-m", "initial"]);
  return root;
}

describe("repository task scope guard", () => {
  it("detects a later mutation to an already dirty path", async () => {
    const root = await repository();
    await writeFile(path.join(root, "src", "one.ts"), "first task\n");
    const before = await captureRepositoryTaskScope(root);
    await writeFile(path.join(root, "src", "one.ts"), "second task\n");
    const after = await captureRepositoryTaskScope(root);

    expect(repositoryTaskScopeDelta(before, after)).toEqual(["src/one.ts"]);
  });

  it("rejects read-only mutations and writer paths outside ownership", async () => {
    const baseTask = {
      id: "task",
      title: "Task",
      instruction: "Task",
      kind: "validation" as const,
      dependencies: [],
      requirementIds: ["requirement"],
      authority: "read_only" as const,
      operations: ["read" as const],
      expectedPaths: [],
      doneWhen: ["Done"],
      evidence: [{
        id: "evidence",
        requirementIds: ["requirement"],
        kind: "semantic_review" as const,
        description: "Review",
      }],
    };
    expect(() => assertRepositoryTaskScope(baseTask, ["src/one.ts"])).toThrow(
      "Read-only repository task changed",
    );
    expect(() =>
      assertRepositoryTaskScope({
        ...baseTask,
        kind: "change",
        authority: "single_writer",
        operations: ["write"],
        expectedPaths: ["src/one.ts"],
      }, ["src/two.ts"]),
    ).toThrow("outside its single-writer ownership");
  });
});
