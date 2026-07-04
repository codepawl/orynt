#!/usr/bin/env node
import { runDesktopRepositoryBeta } from "../packages/coding-apprentice/dist/index.js";

async function readJsonStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new Error("stdin JSON input is required");
  }
  return JSON.parse(raw);
}

function requireString(input, key) {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

async function main() {
  const input = await readJsonStdin();
  const result = await runDesktopRepositoryBeta({
    goal: requireString(input, "goal"),
    taskId: requireString(input, "taskId"),
    workspaceId: requireString(input, "workspaceId"),
    repositoryPath: requireString(input, "repositoryPath"),
    sandboxRoot: requireString(input, "sandboxRoot"),
    artifactRoot: requireString(input, "artifactRoot"),
    memoryRoot: typeof input.memoryRoot === "string" && input.memoryRoot.trim() ? input.memoryRoot.trim() : undefined,
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
