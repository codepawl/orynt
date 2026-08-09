import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { RepositorySemanticTaskV1 } from "@codepawl/shared";

const execFileAsync = promisify(execFile);

export type RepositoryTaskScopeSnapshot = {
  worktreePath: string;
  entries: Record<string, string>;
};

function safeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    value === value.trim() &&
    !path.isAbsolute(value) &&
    !value.includes("\\") &&
    !value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  );
}

async function statusPaths(worktreePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", worktreePath, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { encoding: "buffer", timeout: 15_000, maxBuffer: 10_000_000 },
  );
  const records = Buffer.from(stdout).toString("utf8").split("\0");
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.length < 4 || record[2] !== " ") {
      throw new Error("Repository task scope guard received invalid Git status output.");
    }
    const status = record.slice(0, 2);
    const currentPath = record.slice(3);
    if (safeRelativePath(currentPath)) paths.push(currentPath);
    if (status.includes("R") || status.includes("C")) {
      const sourcePath = records[index + 1];
      index += 1;
      if (sourcePath && safeRelativePath(sourcePath)) paths.push(sourcePath);
    }
  }
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

async function entryDigest(worktreePath: string, relativePath: string): Promise<string> {
  const candidate = path.resolve(worktreePath, relativePath);
  const relative = path.relative(worktreePath, candidate);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !safeRelativePath(relativePath)
  ) {
    throw new Error("Repository task scope guard path escaped the sandbox.");
  }
  try {
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) {
      return `symlink:${await readlink(candidate)}`;
    }
    if (info.isDirectory()) {
      return `directory:${info.mode}`;
    }
    if (!info.isFile()) {
      return `special:${info.mode}:${info.size}`;
    }
    const digest = createHash("sha256");
    digest.update(`${info.mode}:`);
    digest.update(await readFile(candidate));
    return `file:${digest.digest("hex")}`;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "missing";
    }
    throw error;
  }
}

export async function captureRepositoryTaskScope(
  worktreePath: string,
): Promise<RepositoryTaskScopeSnapshot> {
  const resolved = await realpath(worktreePath);
  const entries: Record<string, string> = {};
  for (const relativePath of await statusPaths(resolved)) {
    entries[relativePath] = await entryDigest(resolved, relativePath);
  }
  return { worktreePath: resolved, entries };
}

export function repositoryTaskScopeDelta(
  before: RepositoryTaskScopeSnapshot,
  after: RepositoryTaskScopeSnapshot,
): string[] {
  if (before.worktreePath !== after.worktreePath) {
    throw new Error("Repository task scope snapshots belong to different sandboxes.");
  }
  return [...new Set([
    ...Object.keys(before.entries),
    ...Object.keys(after.entries),
  ])]
    .filter((entry) => before.entries[entry] !== after.entries[entry])
    .sort((left, right) => left.localeCompare(right));
}

export function exactAuthorizedChangedPaths(
  results: ReadonlyArray<{ changedPaths: readonly string[] }>,
): string[] {
  return [...new Set(results.flatMap((result) => result.changedPaths))]
    .sort((left, right) => left.localeCompare(right));
}

export function assertRepositoryTaskScope(
  task: RepositorySemanticTaskV1,
  changedPaths: string[],
): void {
  if (task.authority === "read_only" && changedPaths.length > 0) {
    throw new RepositoryTaskScopeError(
      "read_only_mutation",
      task.id,
      changedPaths,
      "Read-only repository task changed sandbox files.",
    );
  }
  const unauthorized = changedPaths.filter((entry) =>
    !task.expectedPaths.some(
      (ownedPath) => entry === ownedPath || entry.startsWith(`${ownedPath}/`),
    )
  );
  if (unauthorized.length > 0) {
    throw new RepositoryTaskScopeError(
      "unauthorized_path",
      task.id,
      unauthorized,
      "Repository task changed paths outside its single-writer ownership.",
    );
  }
}

export class RepositoryTaskScopeError extends Error {
  readonly code: "read_only_mutation" | "unauthorized_path";
  readonly taskId: string;
  readonly paths: string[];
  readonly retryable = false;

  constructor(
    code: RepositoryTaskScopeError["code"],
    taskId: string,
    paths: string[],
    message: string,
  ) {
    super(message);
    this.name = "RepositoryTaskScopeError";
    this.code = code;
    this.taskId = taskId;
    this.paths = [...paths];
  }
}

export async function restoreRepositoryTaskOwnedPaths(input: {
  worktreePath: string;
  baseRef: string;
  expectedPaths: string[];
}): Promise<void> {
  const worktreePath = await realpath(input.worktreePath);
  const expectedPaths = [...new Set(input.expectedPaths)];
  if (expectedPaths.length === 0 || expectedPaths.some((entry) => !safeRelativePath(entry))) {
    throw new Error("Repository task restore requires exact repository-relative paths.");
  }
  await execFileAsync(
    "git",
    ["-C", worktreePath, "restore", "--source", input.baseRef, "--staged", "--worktree", "--", ...expectedPaths],
    { encoding: "utf8", timeout: 15_000, maxBuffer: 1_000_000 },
  ).catch(async () => {
    for (const relativePath of expectedPaths) {
      const candidate = path.resolve(worktreePath, relativePath);
      const relative = path.relative(worktreePath, candidate);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Repository task restore path escaped the sandbox.");
      }
      await rm(candidate, { recursive: true, force: true });
    }
    await execFileAsync(
      "git",
      ["-C", worktreePath, "restore", "--source", input.baseRef, "--staged", "--worktree", "--", ...expectedPaths],
      { encoding: "utf8", timeout: 15_000, maxBuffer: 1_000_000 },
    ).catch(() => undefined);
  });
}
