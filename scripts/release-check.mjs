#!/usr/bin/env bun
import { spawn } from "node:child_process";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const commands = [
  ["host-stdio-preflight", process.execPath, ["scripts/host-stdio-preflight.mjs"]],
  ["copy:check", "bun", ["run", "copy:check"]],
  ["docs:check", "bun", ["run", "docs:check"]],
  ["test", "bun", ["run", "test"]],
  ["test:lsp", "bun", ["run", "test:lsp"]],
  ["bench:lsp", "bun", ["run", "bench:lsp"]],
  ["build:cli", "bun", ["run", "build:cli"]],
  ["test:e2e-cli", "bun", ["run", "test:e2e-cli"]],
  ["test:core", "bun", ["run", "test:core"]],
  ["test:core:codex-fixture", "bun", ["run", "test:core:codex-fixture"]],
  ["walkthrough:smoke", "bun", ["run", "walkthrough:smoke"]],
  ["bench:prompt-understanding", "bun", ["run", "bench:prompt-understanding"]],
  ["test:release-tools", "bun", ["run", "test:release-tools"]],
  ["package:cli", "bun", ["run", "package:cli"]],
  ["package-cli-smoke", process.execPath, ["scripts/package-cli-smoke.mjs"]],
  ["release-legal", process.execPath, ["scripts/release-legal.mjs"]],
  ["git-diff-check", "git", ["diff", "--check"]],
];

// A workflow that already owns a step in a separate job can name it here so it
// does not run twice in the same pipeline. Skipping is opt-in and CI only: a
// plain `bun run release:check` sets nothing and runs every step. An unknown
// name is a typo that would silently drop coverage, so it fails instead.
const skipped = new Set(
  (process.env.ORYNT_RELEASE_CHECK_SKIP ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
);
const known = new Set(commands.map(([id]) => id));
for (const id of skipped) {
  if (!known.has(id)) {
    throw new Error(`ORYNT_RELEASE_CHECK_SKIP names an unknown release check: ${id}`);
  }
}

for (const [id, command, args] of commands) {
  if (skipped.has(id)) {
    process.stdout.write(`release:check · skipped ${id} (owned by another job)\n`);
    continue;
  }
  process.stdout.write(`release:check · ${command} ${args.join(" ")}\n`);
  await run(command, args);
}
process.stdout.write("Deterministic release checks passed.\n");

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(
        new Error(
          `Release check failed (${signal ?? code}): ${command} ${args.join(" ")}`,
        ),
      );
    });
  });
}
