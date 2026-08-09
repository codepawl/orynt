#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
if (!process.argv.includes("--confirm-live")) {
  throw new Error(
    "Live release evidence uses provider quota and requires --confirm-live.",
  );
}
const evidenceRoot = path.join(repositoryRoot, "docs", "release", "evidence");
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "orynt-release-live-"),
);
await mkdir(evidenceRoot, { recursive: true });

try {
  await run("bun", ["package:cli"]);
  await run(process.execPath, [
    "scripts/contextvm-live-evidence.mjs",
    "--confirm-live",
    "--model",
    "gpt-5.6-luna",
    "--output",
    path.join(evidenceRoot, "contextvm-live-v1.json"),
  ], { timeoutMs: 30 * 60_000 });
  await run("bun", [
    "bench:prompt-understanding:live",
    "--",
    "--output",
    path.join(temporaryRoot, "prompt-understanding"),
    "--model",
    "gpt-5.6-luna",
    "--evidence-output",
    path.join(evidenceRoot, "prompt-understanding-live-v1.json"),
  ]);
  await run(process.execPath, [
    "scripts/cli-live-e2e.mjs",
    "--confirm-live",
    "--output",
    path.join(evidenceRoot, "cli-live-e2e-v1.json"),
  ], { timeoutMs: 90 * 60_000 });
  await run(process.execPath, ["scripts/validate-release-live-evidence.mjs"]);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function run(
  command,
  args,
  { extraEnv = {}, timeoutMs = 30 * 60_000 } = {},
) {
  await new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: repositoryRoot,
        env: { ...process.env, ...extraEnv },
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        if (error) reject(error);
        else resolve();
      },
    );
    child.once("error", reject);
  });
}
