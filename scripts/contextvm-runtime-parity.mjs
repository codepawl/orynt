import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const fixture = path.resolve(import.meta.dirname, "contextvm-runtime-fixture.mjs");

async function run(command, args) {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-parity-output-"));
  const outputPath = path.join(outputRoot, "result.json");
  const child = spawn(command, args, {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, CONTEXTVM_PARITY_OUTPUT: outputPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const [code] = await Promise.all([
    new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }),
    new Promise((resolve) => child.stdout.once("end", resolve)),
  ]);
  if (code !== 0) {
    throw new Error(`${command} fixture failed (${code}): ${stderr.trim()}`);
  }
  try {
    const fileOutput = await readFile(outputPath, "utf8");
    const line = fileOutput.trim().split(/\r?\n/u).at(-1);
    if (!line) throw new Error(`${command} fixture produced no result`);
    return JSON.parse(line);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
}

// Bun's child-process stream bridge can close one of two concurrent SQLite
// fixtures before its final stdout chunk is observable. Run sequentially so
// parity measures the runtimes, not the host stream race.
const bunResult = await run(process.execPath, [fixture]);
const nodeResult = await run("node", [fixture]);

if (JSON.stringify(bunResult) !== JSON.stringify(nodeResult)) {
  throw new Error(
    `ContextVM runtime mismatch:\nBun: ${JSON.stringify(bunResult)}\nNode: ${JSON.stringify(nodeResult)}`,
  );
}
if (nodeResult.verification !== "pass") {
  throw new Error(
    `ContextVM runtime verification failed: ${JSON.stringify(nodeResult.failedChecks)}`,
  );
}
process.stdout.write(
  `ContextVM Bun/Node parity passed: ${JSON.stringify(nodeResult)}\n`,
);
