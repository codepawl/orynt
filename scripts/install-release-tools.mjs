#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const gitleaksVersion = "8.30.1";
export const gitleaksLinuxX64Sha256 =
  "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const executable = path.join(
  repositoryRoot,
  "dist",
  "tools",
  "gitleaks",
  gitleaksVersion,
  "gitleaks",
);

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error(
    "GITLEAKS_PLATFORM_UNSUPPORTED: the pinned release-tool bootstrap supports Linux x64 only.",
  );
}

if (await verifiedExecutable(executable)) {
  process.stdout.write(`${executable}\n`);
  process.exit(0);
}

const toolRoot = path.dirname(executable);
const archiveName = `gitleaks_${gitleaksVersion}_linux_x64.tar.gz`;
const archive = path.join(toolRoot, archiveName);
const temporaryExecutable = `${executable}.tmp`;
await mkdir(toolRoot, { recursive: true });
await rm(temporaryExecutable, { force: true });

const response = await fetch(
  `https://github.com/gitleaks/gitleaks/releases/download/v${gitleaksVersion}/${archiveName}`,
);
if (!response.ok) {
  throw new Error(
    `GITLEAKS_DOWNLOAD_FAILED: HTTP ${response.status} while downloading the pinned release tool.`,
  );
}
const bytes = new Uint8Array(await response.arrayBuffer());
const digest = createHash("sha256").update(bytes).digest("hex");
if (digest !== gitleaksLinuxX64Sha256) {
  throw new Error(
    `GITLEAKS_INTEGRITY_FAILED: expected ${gitleaksLinuxX64Sha256}, received ${digest}.`,
  );
}
await writeFile(archive, bytes, { mode: 0o600 });
try {
  await run("tar", ["-xzf", archive, "-C", toolRoot, "gitleaks"]);
  await chmod(executable, 0o755);
  if (!(await verifiedExecutable(executable))) {
    throw new Error("GITLEAKS_INSTALL_FAILED: extracted executable failed its version check.");
  }
} finally {
  await rm(archive, { force: true });
  await rm(temporaryExecutable, { force: true });
}

process.stdout.write(`${executable}\n`);

async function verifiedExecutable(file) {
  return readFile(file)
    .then(() => run(file, ["version"], { quiet: true }))
    .then(() => true, () => false);
}

async function run(command, args, { quiet = false } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: quiet ? "ignore" : "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${signal ?? code}): ${command} ${args.join(" ")}`));
    });
  });
}
