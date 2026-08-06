#!/usr/bin/env bun
import { createInterface } from "node:readline";
import path from "node:path";

import {
  isDesktopCommand,
  type DesktopSidecarEventV1,
  type DesktopSidecarRequestV1,
  type DesktopSidecarResponseV1,
} from "@codepawl/ipc-contracts";
import { DesktopRuntime } from "@codepawl/desktop-runtime";

import { executeDesktopMemoryOperation } from "../../scripts/desktop-memory-manager.mjs";
import { executeDesktopRepositoryOperation } from "../../scripts/desktop-repository-run.mjs";
import { executeDesktopSkillOperation } from "../../scripts/desktop-skill-manager.mjs";

const dataRoot = process.env.ORYNT_DESKTOP_STATE_ROOT;
const repositoryRoot = process.env.ORYNT_DESKTOP_RESOURCES_ROOT;
const runtimeSkillRoot = process.env.ORYNT_DESKTOP_BUILTINS_ROOT;

if (!dataRoot || !repositoryRoot || !runtimeSkillRoot) {
  throw new Error("Tauri sidecar paths are incomplete");
}

function send(message: DesktopSidecarResponseV1 | DesktopSidecarEventV1): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function failure(id: string, error: unknown): DesktopSidecarResponseV1 {
  return {
    version: 1,
    type: "response",
    id,
    ok: false,
    error: {
      code: error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "DESKTOP_RUNTIME_FAILED",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

const runtime = new DesktopRuntime({
  dataRoot: path.resolve(dataRoot),
  repositoryRoot: path.resolve(repositoryRoot),
  runtimeSkillRoot: path.resolve(runtimeSkillRoot),
  repositoryOperation: (request, hooks) =>
    executeDesktopRepositoryOperation(request, hooks),
  memoryOperation: executeDesktopMemoryOperation,
  skillOperation: executeDesktopSkillOperation,
  emitRunEvent: (payload) => send({
    version: 1,
    type: "event",
    event: "run-event",
    payload,
  }),
  environment: process.env,
});

await runtime.initialize();

const lines = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false,
});

for await (const line of lines) {
  if (!line.trim()) continue;
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    console.error("Ignoring malformed sidecar JSON");
    continue;
  }
  if (!message || typeof message !== "object") continue;
  const envelope = message as Record<string, unknown>;
  if (envelope.version !== 1) continue;
  if (envelope.type === "shutdown") {
    lines.close();
    break;
  }
  if (
    envelope.type !== "request" ||
    typeof envelope.id !== "string" ||
    !isDesktopCommand(envelope.command) ||
    !envelope.args ||
    typeof envelope.args !== "object" ||
    Array.isArray(envelope.args)
  ) {
    if (typeof envelope.id === "string") {
      send(failure(envelope.id, Object.assign(
        new Error("Desktop sidecar request is invalid"),
        { code: "DESKTOP_REQUEST_INVALID" },
      )));
    }
    continue;
  }
  const request = envelope as unknown as DesktopSidecarRequestV1;
  try {
    send({
      version: 1,
      type: "response",
      id: request.id,
      ok: true,
      result: await runtime.execute(request.command, request.args),
    });
  } catch (error) {
    send(failure(request.id, error));
  }
}
