import { spawn } from "node:child_process";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

const ANSI =
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;

function stagedError(message, stage) {
  return Object.assign(new Error(message), { stage });
}

export function visibleTerminalOutput(output) {
  return output.replace(ANSI, "");
}

export async function createNodeCliWrapper({
  root,
  name,
  entry,
  args,
}) {
  const wrapperPath = path.join(root, name);
  await writeFile(
    wrapperPath,
    `#!/usr/bin/env bun
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ${JSON.stringify([entry, ...args])}, {
  env: process.env,
  stdio: "inherit",
  shell: false,
});
child.once("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
`,
    { mode: 0o755 },
  );
  await chmod(wrapperPath, 0o755);
  return wrapperPath;
}

export async function runOrderedPty({
  wrapperPath,
  transcriptPath,
  cwd,
  env,
  timeoutMs,
  steps,
}) {
  if (process.platform !== "linux") {
    throw new Error("Ordered CLI PTY execution requires Linux.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      "/usr/bin/script",
      ["-qefc", wrapperPath, transcriptPath],
      {
        cwd,
        env,
        detached: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const startedAt = performance.now();
    const timings = {};
    let output = "";
    let cursor = 0;
    let stepIndex = 0;
    let settled = false;

    const signalGroup = (signal) => {
      try {
        if (child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // The short-lived PTY process group may already be gone.
      }
    };
    const terminate = () => {
      signalGroup("SIGTERM");
      const hardTimer = setTimeout(() => signalGroup("SIGKILL"), 500);
      hardTimer.unref();
    };
    const advance = () => {
      const visible = visibleTerminalOutput(output);
      while (stepIndex < steps.length) {
        const step = steps[stepIndex];
        const expression = new RegExp(
          step.waitFor.source,
          step.waitFor.flags.replace(/[gy]/gu, ""),
        );
        const match = expression.exec(visible.slice(cursor));
        if (!match) break;
        cursor += (match.index ?? 0) + match[0].length;
        timings[step.id] = Math.round(performance.now() - startedAt);
        stepIndex += 1;
        if (step.send !== undefined) {
          child.stdin.write(step.send.replace(/\n/gu, "\r"));
        }
      }
    };
    const ingest = (chunk) => {
      output += String(chunk);
      advance();
    };
    child.stdout.on("data", ingest);
    child.stderr.on("data", ingest);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminate();
      const nextStep = steps[stepIndex];
      reject(
        stagedError(
          `PTY timed out at ${nextStep?.id ?? "process-exit"} (${stepIndex}/${steps.length} steps)\n${
            visibleTerminalOutput(output).slice(-12_000)
          }`,
          nextStep?.id ?? "process-exit",
        ),
      );
    }, timeoutMs);
    timer.unref();

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      terminate();
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const visible = visibleTerminalOutput(output);
      if (stepIndex !== steps.length) {
        reject(
          stagedError(
            `PTY exited before ${steps[stepIndex]?.id ?? "the final step"} (${stepIndex}/${steps.length} steps): ${
              code ?? signal ?? "unknown"
            }\n${visible.slice(-12_000)}`,
            steps[stepIndex]?.id ?? "process-exit",
          ),
        );
        return;
      }
      resolve({
        code,
        signal,
        raw: output,
        visible,
        completedSteps: stepIndex,
        timings,
      });
    });
  });
}
