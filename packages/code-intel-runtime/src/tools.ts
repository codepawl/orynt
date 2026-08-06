import type {
  AgentFunctionTool,
  AgentToolCall,
  AgentToolExecutor,
  AgentToolResult,
} from "@codepawl/model-runtime";

import {
  CodeIntelProtocolError,
  type MutationPreview,
  type SemanticSelector,
} from "./contracts.js";
import type { MutationRuntime } from "./mutation.js";
import {
  createMutationApprovalBundle,
  type MutationApprovalBundle,
  type MutationVerificationCommand,
} from "./mutation.js";
import { CodeIntelService } from "./service.js";

const SELECTOR_SCHEMA = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "handle"],
      properties: {
        kind: { const: "handle" },
        handle: { type: "string" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "qualifiedName"],
      properties: {
        kind: { const: "symbol" },
        qualifiedName: { type: "string" },
        path: { type: "string" },
        symbolKind: { type: "integer" },
        language: { type: "string" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "path", "text"],
      properties: {
        kind: { const: "anchor" },
        path: { type: "string" },
        text: { type: "string" },
        occurrence: { type: "integer", minimum: 0 },
        cursorOffsetInText: { type: "integer", minimum: 0 },
        contextHash: { type: "string" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "path", "line", "column", "coordinates"],
      properties: {
        kind: { const: "position" },
        path: { type: "string" },
        line: { type: "integer", minimum: 1 },
        column: { type: "integer", minimum: 1 },
        coordinates: { const: "one_based_unicode_scalar" },
      },
    },
  ],
} as const;

const BUDGET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    maxItems: { type: "integer", minimum: 1, maximum: 100 },
    maxChars: { type: "integer", minimum: 512, maximum: 50000 },
    maxSnippetLines: { type: "integer", minimum: 1, maximum: 120 },
    includeDeclaration: { type: "boolean" },
    includeGenerated: { type: "boolean" },
    includeTests: { enum: ["include", "exclude", "only"] },
  },
} as const;

export const CODE_INTEL_TOOLS: AgentFunctionTool[] = [
  {
    type: "function",
    name: "code_status",
    description:
      "Report persistent semantic-code-intelligence readiness, server epoch, and workspace revision.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    type: "function",
    name: "code_search",
    description:
      "Search symbols across detected language servers and return bounded, provenance-rich candidates.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        path: { type: "string" },
        language: { type: "string" },
        adapterId: { type: "string" },
        cursor: { type: "string" },
        budget: BUDGET_SCHEMA,
      },
    },
  },
  {
    type: "function",
    name: "code_inspect",
    description:
      "Resolve and inspect one semantic symbol, its hover/type, definition, and bounded declaration.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["selector"],
      properties: {
        selector: SELECTOR_SCHEMA,
        includeBody: { type: "boolean" },
        budget: BUDGET_SCHEMA,
      },
    },
  },
  {
    type: "function",
    name: "code_relations",
    description:
      "Find semantic references, callers, or callees for an unambiguous symbol.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["selector", "relation"],
      properties: {
        selector: SELECTOR_SCHEMA,
        relation: { enum: ["references", "callers", "callees"] },
        cursor: { type: "string" },
        budget: BUDGET_SCHEMA,
      },
    },
  },
  {
    type: "function",
    name: "code_diagnostics",
    description:
      "Return normalized diagnostics for synchronized documents with explicit partial coverage.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string" },
        severity: { type: "integer", minimum: 1, maximum: 4 },
        mode: { enum: ["latest", "delta"] },
        baselineToken: { type: "string" },
        budget: BUDGET_SCHEMA,
      },
    },
  },
  {
    type: "function",
    name: "code_context",
    description:
      "Collect one deterministic, bounded semantic context pack for explain, modify, debug, or review work.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["goal", "selector"],
      properties: {
        goal: { enum: ["explain", "modify", "debug", "review"] },
        selector: SELECTOR_SCHEMA,
        include: {
          type: "array",
          maxItems: 5,
          items: {
            enum: [
              "definition",
              "signature",
              "references",
              "callers",
              "diagnostics",
            ],
          },
        },
        budget: BUDGET_SCHEMA,
      },
    },
  },
  {
    type: "function",
    name: "code_refactor",
    description:
      "Create exact, read-only rename or code-action previews. This tool never modifies files.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["operation"],
      properties: {
        operation: {
          enum: [
            "rename_preview",
            "list_code_actions",
            "preview_code_action",
            "get_preview",
          ],
        },
        selector: SELECTOR_SCHEMA,
        newName: { type: "string" },
        onlyKinds: {
          type: "array",
          maxItems: 20,
          items: { type: "string" },
        },
        actionHandle: { type: "string" },
        previewId: { type: "string" },
        previewDigest: { type: "string" },
      },
    },
  },
];

export const CODE_REFACTOR_APPLY_TOOL: AgentFunctionTool = {
  type: "function",
  name: "code_refactor_apply",
  description:
    "Apply one exact, unexpired code-refactor preview after explicit user approval of its digest.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["previewId", "previewDigest"],
    properties: {
      previewId: { type: "string" },
      previewDigest: { type: "string" },
    },
  },
};

export type CodeIntelToolExecutorOptions = {
  signal?: AbortSignal;
  mutationRuntime?: MutationRuntime;
  approveMutation?: (
    preview: MutationPreview,
    approval: MutationApprovalBundle,
  ) => Promise<boolean>;
  verificationCommands?: (
    preview: MutationPreview,
  ) => Promise<MutationVerificationCommand[]>;
  verifyMutation?: (
    approval: MutationApprovalBundle,
    signal?: AbortSignal,
  ) => Promise<{
    mode: "diagnostics_only" | "commands";
    commands: Array<{
      argvDigest: string;
      exitCode: number;
      durationMs: number;
    }>;
  }>;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Code-intelligence tool arguments must be an object.");
  }
  return value as Record<string, unknown>;
}

export class CodeIntelToolExecutor implements AgentToolExecutor {
  constructor(
    private readonly service: CodeIntelService,
    private readonly options: CodeIntelToolExecutorOptions = {},
  ) {}

  tools(): AgentFunctionTool[] {
    const tools = [...CODE_INTEL_TOOLS];
    if (this.options.mutationRuntime && this.options.approveMutation) {
      tools.push(CODE_REFACTOR_APPLY_TOOL);
    }
    return tools.map((tool) => structuredClone(tool));
  }

  async execute(call: AgentToolCall): Promise<AgentToolResult> {
    const args = object(call.arguments);
    try {
      const result = await this.dispatch(call.name, args);
      return {
        output: JSON.stringify(result),
        isError:
          "status" in result &&
          ["error", "stale"].includes(String(result.status)),
      };
    } catch (error) {
      return {
        output: JSON.stringify(this.service.failure(error)),
        isError: true,
      };
    }
  }

  private async dispatch(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (name) {
      case "code_status":
        return await this.service.status();
      case "code_search":
        return await this.service.search({
          query: String(args.query ?? ""),
          ...(typeof args.path === "string" ? { path: args.path } : {}),
          ...(typeof args.language === "string"
            ? { language: args.language }
            : {}),
          ...(typeof args.adapterId === "string"
            ? { adapterId: args.adapterId }
            : {}),
          ...(typeof args.cursor === "string" ? { cursor: args.cursor } : {}),
          ...(args.budget ? { budget: object(args.budget) } : {}),
          signal: this.options.signal,
        });
      case "code_inspect":
        return await this.service.inspect({
          selector: args.selector as SemanticSelector,
          ...(typeof args.includeBody === "boolean"
            ? { includeBody: args.includeBody }
            : {}),
          ...(args.budget ? { budget: object(args.budget) } : {}),
          signal: this.options.signal,
        });
      case "code_relations":
        return await this.service.relations({
          selector: args.selector as SemanticSelector,
          relation: args.relation as "references" | "callers" | "callees",
          ...(typeof args.cursor === "string" ? { cursor: args.cursor } : {}),
          ...(args.budget ? { budget: object(args.budget) } : {}),
          signal: this.options.signal,
        });
      case "code_diagnostics":
        return await this.service.diagnostics({
          ...(typeof args.path === "string" ? { path: args.path } : {}),
          ...(typeof args.severity === "number"
            ? { severity: args.severity }
            : {}),
          ...(args.mode === "latest" || args.mode === "delta"
            ? { mode: args.mode }
            : {}),
          ...(typeof args.baselineToken === "string"
            ? { baselineToken: args.baselineToken }
            : {}),
          ...(args.budget ? { budget: object(args.budget) } : {}),
        });
      case "code_context":
        return await this.service.context({
          goal: args.goal as "explain" | "modify" | "debug" | "review",
          selector: args.selector as SemanticSelector,
          ...(Array.isArray(args.include)
            ? {
                include: args.include as Array<
                  | "definition"
                  | "signature"
                  | "references"
                  | "callers"
                  | "diagnostics"
                >,
              }
            : {}),
          ...(args.budget ? { budget: object(args.budget) } : {}),
          signal: this.options.signal,
        });
      case "code_refactor": {
        switch (args.operation) {
          case "rename_preview":
            return await this.service.renamePreview({
              selector: args.selector as SemanticSelector,
              newName: String(args.newName ?? ""),
              signal: this.options.signal,
            });
          case "list_code_actions":
            return await this.service.listCodeActions({
              selector: args.selector as SemanticSelector,
              ...(Array.isArray(args.onlyKinds)
                ? { onlyKinds: args.onlyKinds.map(String) }
                : {}),
              signal: this.options.signal,
            });
          case "preview_code_action":
            return await this.service.codeActionPreview({
              actionHandle: String(args.actionHandle ?? ""),
              signal: this.options.signal,
            });
          case "get_preview":
            return this.service.mutationPreview(
              String(args.previewId ?? ""),
              String(args.previewDigest ?? ""),
            ) as unknown as Record<string, unknown>;
          default:
            throw new CodeIntelProtocolError(
              "INTERNAL_PROTOCOL_ERROR",
              "Unknown code-refactor operation.",
              false,
            );
        }
      }
      case "code_refactor_apply": {
        if (!this.options.mutationRuntime || !this.options.approveMutation) {
          throw new CodeIntelProtocolError(
            "APPROVAL_REQUIRED",
            "Mutation apply is unavailable without an approval boundary.",
            false,
          );
        }
        const previewId = String(args.previewId ?? "");
        const previewDigest = String(args.previewDigest ?? "");
        const preview = this.service.mutationPreview(
          previewId,
          previewDigest,
        );
        const approval = createMutationApprovalBundle({
          preview,
          commands: await this.options.verificationCommands?.(preview) ?? [],
        });
        if (!await this.options.approveMutation(preview, approval)) {
          throw new CodeIntelProtocolError(
            "APPROVAL_REJECTED",
            "The user rejected this exact mutation preview.",
            false,
            { previewId, previewDigest },
          );
        }
        return await this.service.applyPreview({
          previewId,
          previewDigest,
          runtime: this.options.mutationRuntime,
          approval,
          signal: this.options.signal,
          ...(this.options.verifyMutation
            ? {
                verify: (approved, signal) =>
                  this.options.verifyMutation!(approved, signal),
              }
            : {}),
        });
      }
      default:
        throw new Error(`Unknown code-intelligence tool: ${name}`);
    }
  }
}
