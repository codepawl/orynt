#!/usr/bin/env bun
import { spawn } from "node:child_process";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const commands = [
  [process.execPath, ["scripts/host-stdio-preflight.mjs"]],
  ["bun", ["run", "copy:check"]],
  ["bun", ["run", "docs:check"]],
  ["bun", ["run", "test"]],
  ["bun", ["run", "test:lsp"]],
  ["bun", ["run", "bench:lsp"]],
  ["bun", ["run", "build:cli"]],
  ["bun", ["run", "test:e2e-cli"]],
  ["bun", ["run", "test:core"]],
  ["bun", ["run", "test:core:codex-fixture"]],
  ["bun", ["run", "walkthrough:smoke"]],
  ["bun", ["run", "bench:prompt-understanding"]],
  ["bun", ["run", "test:release-tools"]],
  ["bun", ["run", "package:cli"]],
  [process.execPath, ["scripts/package-cli-smoke.mjs"]],
  [process.execPath, ["scripts/release-legal.mjs"]],
  ["git", ["diff", "--check"]],
];

for (const [command, args] of commands) {
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
