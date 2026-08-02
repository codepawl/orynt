#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

const DISABLED_FEATURES = [
  "apps",
  "auth_elicitation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "code_mode_host",
  "computer_use",
  "image_generation",
  "in_app_browser",
  "memories",
  "multi_agent",
  "multi_agent_v2",
  "plugin_sharing",
  "plugins",
  "remote_plugin",
  "shell_snapshot",
  "shell_tool",
  "skill_mcp_dependency_install",
  "skill_search",
  "standalone_web_search",
  "tool_suggest",
  "unified_exec",
  "workspace_dependencies",
];

const DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "actionName", "arguments"],
  properties: {
    kind: {
      type: "string",
      enum: ["respond", "clarify", "act", "refuse"],
    },
    actionName: {
      type: "string",
      enum: [
        "respond",
        "request_clarification",
        "search_web",
        "read_resource",
        "update_resource",
        "send_message",
        "schedule_event",
        "refuse",
      ],
    },
    arguments: {
      type: "object",
      additionalProperties: false,
      required: [
        "answer",
        "missingFields",
        "query",
        "resource",
        "content",
        "recipient",
        "scheduledAt",
        "refusalCategory",
      ],
      properties: {
        answer: { anyOf: [{ type: "string" }, { type: "null" }] },
        missingFields: {
          anyOf: [
            { type: "null" },
            {
              type: "array",
              items: { type: "string" },
              maxItems: 8,
            },
          ],
        },
        query: { anyOf: [{ type: "string" }, { type: "null" }] },
        resource: { anyOf: [{ type: "string" }, { type: "null" }] },
        content: { anyOf: [{ type: "string" }, { type: "null" }] },
        recipient: { anyOf: [{ type: "string" }, { type: "null" }] },
        scheduledAt: { anyOf: [{ type: "string" }, { type: "null" }] },
        refusalCategory: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    },
  },
};

function nowNs() {
  return process.hrtime.bigint();
}

function emit(type, payload = {}) {
  process.stdout.write(`${JSON.stringify({ type, monotonicNs: nowNs().toString(), ...payload })}\n`);
}

function decision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (Object.keys(value).sort().join(",") !== "actionName,arguments,kind") return undefined;
  if (!["respond", "clarify", "act", "refuse"].includes(value.kind)) return undefined;
  if (
    ![
      "respond",
      "request_clarification",
      "search_web",
      "read_resource",
      "update_resource",
      "send_message",
      "schedule_event",
      "refuse",
    ].includes(value.actionName)
  ) return undefined;
  if (!value.arguments || typeof value.arguments !== "object" || Array.isArray(value.arguments)) return undefined;
  const argumentKeys = [
    "answer",
    "missingFields",
    "query",
    "resource",
    "content",
    "recipient",
    "scheduledAt",
    "refusalCategory",
  ];
  if (Object.keys(value.arguments).sort().join(",") !== [...argumentKeys].sort().join(",")) return undefined;
  for (const key of argumentKeys) {
    const item = value.arguments[key];
    if (key === "missingFields") {
      if (item !== null && (!Array.isArray(item) || item.some((entry) => typeof entry !== "string"))) return undefined;
    } else if (item !== null && typeof item !== "string") {
      return undefined;
    }
  }
  return value;
}

function firstJsonObject(text) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start < 0) {
      if (character === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return decision(JSON.parse(text.slice(start, index + 1)));
        } catch {
          start = -1;
        }
      }
    }
  }
  return undefined;
}

function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function messageTextFromEvent(value) {
  const event = record(value);
  const item = record(event.item);
  return item.type === "agent_message" && typeof item.text === "string" ? item.text : undefined;
}

async function readRequest() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("missing adapter request");
  const request = JSON.parse(raw);
  if (
    !request ||
    typeof request !== "object" ||
    typeof request.prompt !== "string" ||
    typeof request.modelId !== "string" ||
    typeof request.thinkingEffort !== "string"
  ) {
    throw new Error("invalid adapter request");
  }
  return request;
}

async function runCodex(request) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "orynt-decision-adapter-"));
  const schemaPath = path.join(temporaryRoot, "decision.schema.json");
  const lastMessagePath = path.join(temporaryRoot, "last-message.json");
  await writeFile(schemaPath, `${JSON.stringify(DECISION_SCHEMA)}\n`, { mode: 0o600 });

  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    ...DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
    "--sandbox",
    "read-only",
    "-m",
    request.modelId,
    "-c",
    `model_reasoning_effort=${JSON.stringify(request.thinkingEffort)}`,
    "-C",
    temporaryRoot,
    "--skip-git-repo-check",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    lastMessagePath,
    "-",
  ];

  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn(request.codexPath || "codex", args, {
        cwd: temporaryRoot,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      const decoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");
      let buffer = "";
      let stderr = "";
      let committed = false;
      let firstDelta = false;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        if (process.platform !== "win32" && child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            child.kill("SIGTERM");
          }
        } else {
          child.kill("SIGTERM");
        }
      }, Math.max(1, Number(request.timeoutMs) || 120_000));

      const inspectLine = (line) => {
        if (!line.trim()) return;
        try {
          const text = messageTextFromEvent(JSON.parse(line));
          if (text === undefined) return;
          if (!firstDelta) {
            firstDelta = true;
            emit("first_delta");
          }
          if (!committed) {
            const parsed = firstJsonObject(text);
            if (parsed) {
              committed = true;
              emit("decision_committed", { decision: parsed });
            }
          }
        } catch {
          // Non-JSON diagnostics remain bounded in stderr/result errors.
        }
      };

      child.stdout.on("data", (chunk) => {
        buffer += decoder.write(chunk);
        const lines = buffer.split(/\r?\n/u);
        buffer = lines.pop() ?? "";
        for (const line of lines) inspectLine(line);
      });
      child.stderr.on("data", (chunk) => {
        stderr = `${stderr}${stderrDecoder.write(chunk)}`.slice(-8_000);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", async (code, signal) => {
        clearTimeout(timeout);
        buffer += decoder.end();
        if (buffer.trim()) inspectLine(buffer);
        stderr = `${stderr}${stderrDecoder.end()}`.slice(-8_000);
        if (timedOut) {
          reject(new Error("decision timed out"));
          return;
        }
        if (code !== 0) {
          reject(new Error(`codex exited with ${code ?? signal ?? "unknown"}: ${stderr.trim().slice(0, 1_000)}`));
          return;
        }
        try {
          const finalText = await readFile(lastMessagePath, "utf8");
          const parsed = firstJsonObject(finalText);
          if (!parsed) {
            resolve(undefined);
            return;
          }
          if (!committed) emit("decision_committed", { decision: parsed, commitSource: "final" });
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
      emit("provider_dispatched");
      child.stdin.end(request.prompt);
    });
    return output;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

emit("ready", {
  adapter: "orynt",
  schemaVersion: 1,
  pid: process.pid,
});

try {
  const request = await readRequest();
  emit("prompt_accepted");
  const result = await runCodex(request);
  emit("finished", { decision: result });
} catch (error) {
  emit("error", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
