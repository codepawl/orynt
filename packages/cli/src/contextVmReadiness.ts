import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CodexAppServerRuntime } from "@codepawl/codex-adapter";
import { ResponsesAgentRuntime } from "@codepawl/model-runtime";
import {
  parseContextVmMemoryDecisionV2,
  type ContextVmDecisionDriverV2,
  type ContextVmMemoryDecisionV2,
} from "@codepawl/shared";

const READINESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "status", "missing"],
  properties: {
    schemaVersion: { type: "integer", enum: [2] },
    status: { type: "string", enum: ["READY", "NEED_MEMORY"] },
    missing: {
      anyOf: [
        { type: "null" },
        {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "kind",
              "entities",
              "relation",
              "timeRange",
              "requiredSourceTypes",
              "minimumEvidenceQuality",
            ],
            properties: {
              kind: { type: "string", minLength: 1, maxLength: 128 },
              entities: {
                type: "array",
                maxItems: 32,
                items: { type: "string", minLength: 1, maxLength: 256 },
              },
              relation: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "string",
                    enum: [
                      "depends_on", "caused_by", "supports", "contradicts",
                      "supersedes", "implements", "tests", "blocks", "resolves",
                      "derived_from", "mentions", "part_of", "owned_by",
                    ],
                  },
                ],
              },
              timeRange: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["start", "end"],
                    properties: {
                      start: { type: "string" },
                      end: { type: "string" },
                    },
                  },
                ],
              },
              requiredSourceTypes: {
                type: "array",
                maxItems: 8,
                items: {
                  type: "string",
                  enum: [
                    "decision", "user_message", "tool_result", "test_result",
                    "file_change", "code", "artifact",
                  ],
                },
              },
              minimumEvidenceQuality: {
                type: "string",
                enum: ["derived", "accepted", "verified"],
              },
            },
          },
        },
      ],
    },
  },
} as const;

function readinessPrompt(
  input: Parameters<ContextVmDecisionDriverV2>[0],
): string {
  return [
    "You are ContextVM's readiness classifier.",
    "Return only one strict JSON object matching the supplied schema.",
    "You cannot answer the user, call tools, grant authority, or propose an action.",
    "Return READY only when the supplied Context Pack is sufficient for the role to begin its real inference.",
    "Otherwise return NEED_MEMORY with only the minimal structured missing-memory requests.",
    "Judge whether inference can begin, not whether the role already has every fact needed to finish the user's request.",
    "Do not request repository files, tool results, or task evidence that the real role can discover with its allowed tools after inference begins.",
    input.invocation.role === "prompt_understanding"
      ? "For prompt_understanding, the trusted current user request is sufficient to begin intent classification; do not request evidence needed only to fulfill that request."
      : "For coordinator, planner, helper, implementer, reviewer, and recovery roles, request memory only when missing prior context prevents the role from beginning safely.",
    "For READY, set missing to null. For NEED_MEMORY, set missing to a non-empty array.",
    `Role: ${input.invocation.role}`,
    `Round: ${input.round}`,
    "Context Pack manifest:",
    JSON.stringify({
      status: input.pack.manifest.status,
      coverageScore: input.pack.manifest.coverageScore,
      evidenceQualityScore: input.pack.manifest.evidenceQualityScore,
      unresolvedDependencies: input.pack.manifest.unresolvedDependencies,
      gaps: input.pack.manifest.gaps,
    }),
    "Context Pack:",
    input.pack.rendered,
  ].join("\n\n");
}

export function parseContextVmReadinessOutput(
  text: string,
): ContextVmMemoryDecisionV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    throw decisionValidationError(
      "ContextVM readiness provider returned malformed JSON.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw decisionValidationError(
      "ContextVM readiness provider returned a non-object decision.",
    );
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "missing" ||
    keys[1] !== "schemaVersion" ||
    keys[2] !== "status"
  ) {
    throw decisionValidationError(
      "ContextVM readiness provider returned an invalid wire shape.",
    );
  }
  try {
    if (record.status === "READY") {
      if (record.missing !== null) {
        throw new Error("READY requires missing to be null");
      }
      return parseContextVmMemoryDecisionV2({
        schemaVersion: record.schemaVersion,
        status: record.status,
      });
    }
    if (!Array.isArray(record.missing)) {
      throw new Error("NEED_MEMORY requires a missing array");
    }
    return parseContextVmMemoryDecisionV2(record);
  } catch (error) {
    throw decisionValidationError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function decisionValidationError(message: string): Error {
  return Object.assign(new Error(message), {
    name: "ContextVmDecisionValidationError",
  });
}

async function codexCliDecision(
  input: Parameters<ContextVmDecisionDriverV2>[0],
): Promise<ContextVmMemoryDecisionV2> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-contextvm-ready-"));
  const schemaPath = path.join(root, "readiness.schema.json");
  const outputPath = path.join(root, "readiness.json");
  await writeFile(schemaPath, `${JSON.stringify(READINESS_SCHEMA)}\n`, {
    mode: 0o600,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("codex", [
        "exec",
        "--json",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "-m",
        input.invocation.modelId,
        "-c",
        `model_reasoning_effort=${JSON.stringify(input.invocation.thinkingEffort)}`,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        "-",
      ], {
        cwd: root,
        stdio: ["pipe", "ignore", "pipe"],
      });
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
      const abort = () => child.kill("SIGKILL");
      input.signal?.addEventListener("abort", abort, { once: true });
      child.stderr.on("data", (chunk) => {
        stderr = `${stderr}${String(chunk)}`.slice(-4_000);
      });
      child.once("error", reject);
      child.once("close", (code) => {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", abort);
        if (input.signal?.aborted) {
          reject(Object.assign(new Error("ContextVM readiness cancelled"), {
            name: "AbortError",
          }));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(
            `ContextVM Codex CLI readiness failed (${code}): ${stderr.trim()}`,
          ));
        }
      });
      child.stdin.end(readinessPrompt(input));
    });
    return parseContextVmReadinessOutput(await readFile(outputPath, "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function appServerDecision(
  input: Parameters<ContextVmDecisionDriverV2>[0],
): Promise<ContextVmMemoryDecisionV2> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-contextvm-ready-"));
  const runtime = new CodexAppServerRuntime();
  try {
    const result = await runtime.runTurn({
      prompt: readinessPrompt(input),
      cwd: root,
      model: input.invocation.modelId,
      effort: input.invocation.thinkingEffort,
      outputSchema: READINESS_SCHEMA as unknown as Record<string, unknown>,
      tools: [],
      sandbox: "read-only",
      timeoutMs: 30_000,
      signal: input.signal,
    });
    return parseContextVmReadinessOutput(result.text);
  } finally {
    await runtime.shutdown();
    await rm(root, { recursive: true, force: true });
  }
}

async function responsesDecision(
  input: Parameters<ContextVmDecisionDriverV2>[0],
): Promise<ContextVmMemoryDecisionV2> {
  const runtime = new ResponsesAgentRuntime();
  const session = await runtime.startSession({
    sessionId: `contextvm-readiness:${createHash("sha256")
      .update(input.invocation.invocationId)
      .digest("hex")}`,
    role: "coordinator",
    model: input.invocation.modelId,
    effort: input.invocation.thinkingEffort,
    instructions: "Classify ContextVM readiness only. Do not answer or call tools.",
    tools: [],
    outputSchema: READINESS_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: 1_024,
    maxToolCalls: 0,
  });
  try {
    const result = await session.runTurn({
      text: readinessPrompt(input),
      timeoutMs: 30_000,
      signal: input.signal,
    });
    return parseContextVmReadinessOutput(result.text);
  } finally {
    await session.close();
    await runtime.close();
  }
}

export function createContextVmReadinessDriver(): ContextVmDecisionDriverV2 {
  return async (input) => {
    switch (input.invocation.transport) {
      case "codex-cli":
        return codexCliDecision(input);
      case "codex-app-server":
        return appServerDecision(input);
      case "openai-responses":
        return responsesDecision(input);
      case "scripted":
        throw new Error("Scripted ContextVM readiness is test-only.");
    }
  };
}

export { READINESS_SCHEMA as CONTEXTVM_READINESS_SCHEMA_V2 };
