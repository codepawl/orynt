#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { verifyCliBuildManifest } from "./cli-build-manifest.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(repositoryRoot, "dist", "cli-build-manifest.json");

// `build:cli` is reached three times in one CI job: the ContextVM gate, the
// release check, and `package:cli`. The manifest already records the exact
// source and output digests the last build produced, so a build that is still
// current can be reused instead of repeated. Anything the manifest cannot
// vouch for rebuilds, which is the same behaviour a clean checkout gets.
const force = process.env.ORYNT_BUILD_CLI_FORCE === "1";
if (!force && await buildIsCurrent()) {
  process.stdout.write("CLI build is current; reusing dist.\n");
} else {
  await run("bun", ["run", "--filter", "@codepawl/cli", "build"]);
  await run("bun", ["run", "scripts/cli-build-manifest.mjs"]);
}

async function buildIsCurrent() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return false;
  }
  try {
    await verifyCliBuildManifest(repositoryRoot, manifest);
    return true;
  } catch {
    // A stale, missing, or unreadable output is a reason to build, not to fail.
    return false;
  }
}

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
      else reject(new Error(`CLI build failed (${signal ?? code}): ${command} ${args.join(" ")}`));
    });
  });
}
