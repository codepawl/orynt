#!/usr/bin/env node

import readline from "node:readline";

import { ResponsesAgentRuntime } from "../packages/model-runtime/dist/index.js";

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

const runtime = new ResponsesAgentRuntime();
const sessions = new Map();
emit("ready", null, { adapter: "orynt-responses", schemaVersion: 3, pid: process.pid });

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  const request = JSON.parse(line);
  const requestId = String(request.requestId);
  emit("prompt_accepted", requestId);
  const key = `${request.modelId}:${request.thinkingEffort}`;
  let session = sessions.get(key);
  try {
    if (!session) {
      session = await runtime.startSession({
        sessionId: `decision:${key}`,
        role: "coordinator",
        model: request.modelId,
        effort: request.thinkingEffort,
        instructions: [
          "You are a deterministic decision router.",
          "Use only the scenario supplied by the user.",
          "Do not call tools and return only the strict JSON object.",
        ].join("\n"),
        outputSchema: request.outputSchema,
        maxOutputTokens: 512,
        maxToolCalls: 0,
        promptCacheKey: `orynt-decision:${key}`,
      });
      sessions.set(key, session);
    }
    emit("provider_dispatched", requestId);
    let accumulated = "";
    let firstDelta = false;
    let committed;
    const result = await session.runTurn({
      text: request.prompt,
      timeoutMs: request.timeoutMs,
      onActivity: (activity) => {
        if (activity.kind !== "text_delta") return;
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
    await session.resetContext?.();
    emit("finished", requestId, {
      decision: committed ?? null,
      transport: result.transport,
      runtimeTiming: result.timing,
    });
  } catch (error) {
    sessions.delete(key);
    await session?.close().catch(() => undefined);
    emit("error", requestId, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

await runtime.close();
