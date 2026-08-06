#!/usr/bin/env bun

import readline from "node:readline";

import { CodexAppServerRuntime } from "../packages/codex-adapter/dist/appServer.js";

function nowNs() {
  return process.hrtime.bigint();
}

function emit(type, requestId, payload = {}) {
  process.stdout.write(`${JSON.stringify({
    type,
    requestId,
    monotonicNs: nowNs().toString(),
    ...payload,
  })}\n`);
}

function validDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (Object.keys(value).sort().join(",") !== "actionName,arguments,kind") return undefined;
  if (!["respond", "clarify", "act", "refuse"].includes(value.kind)) return undefined;
  if (![
    "respond",
    "request_clarification",
    "search_web",
    "read_resource",
    "update_resource",
    "send_message",
    "schedule_event",
    "refuse",
  ].includes(value.actionName)) return undefined;
  const args = value.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const keys = ["answer", "missingFields", "query", "resource", "content", "recipient", "scheduledAt", "refusalCategory"];
  if (Object.keys(args).sort().join(",") !== [...keys].sort().join(",")) return undefined;
  return value;
}

function firstJsonObject(text) {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        try {
          const parsed = validDecision(JSON.parse(text.slice(start, index + 1)));
          if (parsed) return parsed;
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

const runtime = new CodexAppServerRuntime();
await runtime.start();
emit("ready", null, { adapter: "orynt-app-server", schemaVersion: 2, pid: process.pid });

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  const request = JSON.parse(line);
  const requestId = String(request.requestId);
  emit("prompt_accepted", requestId);
  let accumulated = "";
  let firstDelta = false;
  let committed;
  try {
    const result = await runtime.runTurn({
      prompt: request.prompt,
      cwd: request.cwd,
      model: request.modelId,
      effort: request.thinkingEffort,
      outputSchema: request.outputSchema,
      sandbox: "read-only",
      timeoutMs: request.timeoutMs,
      onTurnAccepted: () => emit("provider_dispatched", requestId),
      onActivity: (activity) => {
        if (activity.kind !== "delta") return;
        if (!firstDelta) {
          firstDelta = true;
          emit("first_delta", requestId);
        }
        accumulated += activity.text;
        if (!committed) {
          committed = firstJsonObject(accumulated);
          if (committed) emit("decision_committed", requestId, { decision: committed });
        }
      },
    });
    committed ??= firstJsonObject(result.text);
    if (committed && !firstJsonObject(accumulated)) {
      emit("decision_committed", requestId, { decision: committed, commitSource: "completed" });
    }
    emit("finished", requestId, { decision: committed ?? null });
  } catch (error) {
    emit("error", requestId, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

await runtime.shutdown();
