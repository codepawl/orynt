#!/usr/bin/env bun
import { spawn } from "node:child_process";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const deterministicOnly = process.argv.includes("--deterministic");
const nativeExecutable = path.join(
  "dist",
  "cli",
  "native-payload",
  process.platform === "win32" ? "orynt.exe" : "orynt",
);
const commands = [
  ["bun", ["run", "release:check"]],
  ["bun", ["run", "check:desktop"]],
  ["bun", ["run", "package:cli:native"]],
  [process.execPath, ["scripts/package-cli-smoke.mjs", "--executable", nativeExecutable]],
  ["bun", ["run", "package:desktop:unsigned"]],
  ["bun", ["run", "release:audit"]],
  ...(!deterministicOnly
    ? [["bun", ["run", "release:evidence:validate"]]]
    : []),
];

for (const [command, args] of commands) {
  process.stdout.write(`release gate · ${command} ${args.join(" ")}\n`);
  await run(command, args);
}

process.stdout.write(
  deterministicOnly
    ? "Deterministic release gate passed.\n"
    : "Release gate passed with current source-bound live evidence.\n",
);

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
      else {
        reject(
          new Error(
            `Release gate failed (${signal ?? code}): ${command} ${args.join(" ")}`,
          ),
        );
      }
    });
  });
}
