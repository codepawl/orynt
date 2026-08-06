#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, open, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const executable = process.argv[2];
if (!executable) {
  throw new Error("Usage: bun run scripts/cli-codex-setup-smoke.mjs <orynt-executable>");
}

const root = await mkdtemp(path.join(os.tmpdir(), "orynt-codex-setup-smoke-"));
const emptyPath = path.join(root, "empty-path");
const stateRoot = path.join(root, "state");
let runIndex = 0;
await mkdir(emptyPath, { recursive: true });
await mkdir(stateRoot, { recursive: true });

try {
  const help = await run(["setup", "--help"]);
  if (help.code !== 0 || !help.stdout.includes("Usage: orynt setup")) {
    throw new Error(
      `Packaged setup help failed (code=${String(help.code)}, signal=${String(help.signal)}): ${
        help.stderr || help.stdout || "<no output>"
      }`,
    );
  }

  const check = await run(["setup", "--check", "--json"]);
  if (check.code !== 1) {
    throw new Error(
      `Missing-Codex setup check returned code=${String(check.code)}, signal=${String(check.signal)}: ${
        check.stderr || check.stdout || "<no output>"
      }`,
    );
  }
  const lines = check.stdout.trim().split(/\r?\n/u).filter(Boolean);
  const status = JSON.parse(lines.at(-1) ?? "{}");
  if (
    status.schemaVersion !== 1 ||
    status.kind !== "codex_setup_status" ||
    status.ready !== false ||
    status.code !== "CODEX_CLI_MISSING" ||
    status.nextAction !== "install"
  ) {
    throw new Error(`Unexpected setup status: ${JSON.stringify(status)}`);
  }
  process.stdout.write("Codex setup package smoke passed.\n");
} finally {
  await rm(root, { recursive: true, force: true });
}

async function run(argv) {
  const index = runIndex++;
  const stdoutPath = path.join(root, `stdout-${index}.log`);
  const stderrPath = path.join(root, `stderr-${index}.log`);
  const stdoutFile = await open(stdoutPath, "w");
  const stderrFile = await open(stderrPath, "w");
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(path.resolve(executable), argv, {
        env: {
          ...process.env,
          PATH: emptyPath,
          ORYNT_NO_UPDATE_CHECK: "1",
          ORYNT_STATE_HOME: stateRoot,
        },
        shell: false,
        // Node single-executable applications can lose buffered output when their
        // stdout/stderr are child-process IPC pipes. Real files keep this release
        // smoke deterministic while still capturing exact output.
        stdio: ["ignore", stdoutFile.fd, stderrFile.fd],
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolve({ code, signal });
      });
    });
    await stdoutFile.close();
    await stderrFile.close();
    return {
      ...result,
      stdout: await readFile(stdoutPath, "utf8"),
      stderr: await readFile(stderrPath, "utf8"),
    };
  } finally {
    await stdoutFile.close().catch(() => {});
    await stderrFile.close().catch(() => {});
  }
}
