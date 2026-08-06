import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "bun:test";

import { captureRepositoryEvidenceScope } from "./index.js";

const exec = promisify(execFile);

async function fixture(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `${name}-`));
  await exec("git", ["init", "-q", root]);
  await exec("git", ["-C", root, "config", "user.email", "test@example.com"]);
  await exec("git", ["-C", root, "config", "user.name", "Test"]);
  await writeFile(path.join(root, "same.txt"), "base\n");
  await exec("git", ["-C", root, "add", "same.txt"]);
  await exec("git", ["-C", root, "commit", "-qm", "base"]);
  return root;
}

describe("repository evidence scope v1", () => {
  it("isolates dirty content, clones, and basename collisions", async () => {
    const first = await fixture("same-name");
    const secondParent = await mkdtemp(path.join(os.tmpdir(), "other-parent-"));
    const second = path.join(secondParent, path.basename(first));
    await exec("git", ["clone", "-q", first, second]);
    const clean = await captureRepositoryEvidenceScope(first);
    await writeFile(path.join(first, "same.txt"), "dirty one\n");
    const dirtyOne = await captureRepositoryEvidenceScope(first);
    await writeFile(path.join(first, "same.txt"), "dirty two\n");
    const dirtyTwo = await captureRepositoryEvidenceScope(first);
    const clone = await captureRepositoryEvidenceScope(second);
    expect(clean.revisionKey).not.toBe(dirtyOne.revisionKey);
    expect(dirtyOne.revisionKey).not.toBe(dirtyTwo.revisionKey);
    expect(clean.localRepositoryId).not.toBe(clone.localRepositoryId);
    expect(path.basename(first)).toBe(path.basename(second));
  });

  it("includes staged, unstaged, and untracked bytes without changing the index", async () => {
    const root = await fixture("working-state");
    await writeFile(path.join(root, "same.txt"), "staged\n");
    await exec("git", ["-C", root, "add", "same.txt"]);
    await writeFile(path.join(root, "same.txt"), "unstaged\n");
    await mkdir(path.join(root, "extra"));
    await writeFile(path.join(root, "extra", "new.txt"), "untracked one\n");
    const before = await exec("git", ["-C", root, "diff", "--cached", "--binary"]);
    const first = await captureRepositoryEvidenceScope(root);
    await writeFile(path.join(root, "extra", "new.txt"), "untracked two\n");
    const second = await captureRepositoryEvidenceScope(root);
    const after = await exec("git", ["-C", root, "diff", "--cached", "--binary"]);
    expect(first.revisionKey).not.toBe(second.revisionKey);
    expect(after.stdout).toBe(before.stdout);
  });

  it("returns unavailable without path-only revision fallback", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "not-a-repository-"));
    const scope = await captureRepositoryEvidenceScope(root);
    expect(scope.completeness).toBe("unavailable");
    expect(scope.revisionKey).toBeNull();
  });
});
