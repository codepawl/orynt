#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const gitleaksExecutable =
  process.env.GITLEAKS_BIN?.trim() ||
  path.join(repositoryRoot, "dist", "tools", "gitleaks", "8.30.1", "gitleaks");

await run("bun", ["audit", "--prod", "--audit-level=high"]);
await run(gitleaksExecutable, [
  "detect",
  "--source",
  ".",
  "--log-opts=--all",
  "--redact",
  "--no-banner",
]);
const sourceSnapshot = await snapshotCurrentSources();
try {
  await run(gitleaksExecutable, [
    "dir",
    sourceSnapshot,
    "--redact",
    "--no-banner",
  ]);
  const packagedRuntime = path.join(repositoryRoot, "dist", "cli", "npm");
  if (await lstat(packagedRuntime).then(() => true, () => false)) {
    await run(gitleaksExecutable, [
      "dir",
      packagedRuntime,
      "--redact",
      "--no-banner",
    ]);
  }
} finally {
  await rm(sourceSnapshot, { recursive: true, force: true });
}
process.stdout.write("Dependency and full-history secret audits passed.\n");

async function snapshotCurrentSources() {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-source-audit-"));
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  for (const relative of Buffer.from(stdout).toString("utf8").split("\0")) {
    if (!relative) continue;
    const source = path.join(repositoryRoot, relative);
    const metadata = await lstat(source).catch(() => undefined);
    if (!metadata?.isFile()) continue;
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  return root;
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", (error) => {
      if (error.code === "ENOENT" && command === gitleaksExecutable) {
        reject(
          new Error(
            "The verified Gitleaks binary is missing; run `bun run release:tools:install` before the release audit.",
          ),
        );
        return;
      }
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(
        new Error(
          `Release audit failed (${signal ?? code}): ${command} ${args.join(" ")}`,
        ),
      );
    });
  });
}
