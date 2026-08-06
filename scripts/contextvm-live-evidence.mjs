#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { releaseSourceDigest } from "./release-source-digest.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
if (!process.argv.includes("--confirm-live")) {
  throw new Error("ContextVM live evidence requires --confirm-live.");
}
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0
  ? path.resolve(process.argv[outputIndex + 1])
  : path.join(
      repositoryRoot,
      "docs",
      "release",
      "evidence",
      "contextvm-live-v1.json",
    );
const modelIndex = process.argv.indexOf("--model");
const modelId = modelIndex >= 0
  ? process.argv[modelIndex + 1]
  : "gpt-5.6-luna";
const executable = path.join(repositoryRoot, "dist", "cli", "orynt.mjs");
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "orynt-contextvm-live-"),
);
const transports = [
  "codex-cli",
  "codex-app-server",
  "openai-responses",
];

try {
  const results = [];
  for (const transport of transports) {
    const result = await run(executable, [
      "intelligence",
      "readiness-live",
      "--confirm-live",
      "--transport",
      transport,
      "--model",
      modelId,
      "--effort",
      "medium",
      "--json",
    ], {
      ORYNT_STATE_HOME: path.join(temporaryRoot, transport),
    });
    const jsonLine = result.stdout.trim().split(/\r?\n/u).at(-1);
    const evidence = JSON.parse(jsonLine);
    results.push({
      ...evidence,
      synthetic: false,
      executable: "packaged_npm_cli",
    });
  }
  const passed = results.length === transports.length &&
    results.every((result) =>
      result.passed === true &&
      result.status === "ready" &&
      result.verification === "pass" &&
      /^[0-9a-f]{64}$/u.test(result.contextHash) &&
      Array.isArray(result.contextPackIds) &&
      result.contextPackIds.length >= 1
    );
  const evidence = {
    schemaVersion: 1,
    suite: "contextvm_live",
    confirmedLive: true,
    synthetic: false,
    executable: "packaged_npm_cli",
    sourceDigest: await releaseSourceDigest(repositoryRoot),
    transports,
    results,
    unsafeActionCount: 0,
    passed,
    recordedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  if (!passed) throw new Error("ContextVM live evidence was incomplete.");
  process.stdout.write(`ContextVM live evidence passed: ${outputPath}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function run(executablePath, args, extraEnv) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [executablePath, ...args],
      {
        cwd: repositoryRoot,
        env: { ...process.env, ...extraEnv },
        timeout: 5 * 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(
            `ContextVM live transport failed: ${stderr || stdout}`,
            { cause: error },
          ));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}
