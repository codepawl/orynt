#!/usr/bin/env bun
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const triples = {
  "linux:x64": "x86_64-unknown-linux-gnu",
  "linux:arm64": "aarch64-unknown-linux-gnu",
  "darwin:x64": "x86_64-apple-darwin",
  "darwin:arm64": "aarch64-apple-darwin",
  "win32:x64": "x86_64-pc-windows-msvc",
  "win32:arm64": "aarch64-pc-windows-msvc",
};

const triple = process.env.TAURI_ENV_TARGET_TRIPLE ||
  triples[`${process.platform}:${process.arch}`];
if (!triple) {
  throw new Error(`Unsupported desktop target: ${process.platform}/${process.arch}`);
}

const executableName = `orynt-desktop-sidecar-${triple}${
  triple.includes("windows") ? ".exe" : ""
}`;
const output = path.join(
  repositoryRoot,
  "apps/desktop/src-tauri/binaries",
  executableName,
);
await mkdir(path.dirname(output), { recursive: true });

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    "build",
    "apps/desktop/sidecar.ts",
    "--compile",
    "--minify",
    "--outfile",
    output,
  ], {
    cwd: repositoryRoot,
    stdio: "inherit",
    shell: false,
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`Sidecar build failed (${signal ?? code})`));
  });
});

if (process.platform !== "win32") await chmod(output, 0o755);
process.stdout.write(`${output}\n`);
