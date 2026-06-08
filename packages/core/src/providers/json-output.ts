import { z } from "zod";
import type { PatchPlan, ScopeAnalysisResult } from "../state/schema";

const PREVIEW_MAX_CHARS = 240;

export type ProviderParseCategory =
  | "empty_content"
  | "truncated_output"
  | "malformed_json"
  | "no_json_object"
  | "ambiguous_json_objects"
  | "schema_validation";

export interface ProviderOutputContext {
  readonly provider: string;
  readonly model: string;
  readonly purpose: string;
  readonly finishReason?: string;
}

export interface ProviderSchemaRepair {
  readonly chunkIndex: number;
  readonly field: "file" | "description";
  readonly alias: "path" | "summary" | "reason" | "details";
}

export interface ParsedPatchPlanResponse {
  readonly patchPlan: PatchPlan;
  readonly repairs: ReadonlyArray<ProviderSchemaRepair>;
}

export class ProviderJsonOutputError extends Error {
  public readonly provider: string;
  public readonly model: string;
  public readonly purpose: string;
  public readonly category: ProviderParseCategory;
  public readonly preview: string;
  public readonly detail: string;
  public readonly schemaValidationPath: string | null;
  public readonly contentLength: number;
  public readonly finishReason: string | undefined;

  constructor(
    context: ProviderOutputContext,
    category: ProviderParseCategory,
    preview: string,
    detail: string,
    schemaValidationPath: string | null = null,
    contentLength: number = 0
  ) {
    super(
      `Provider response parse failed. provider=${context.provider} model=${context.model} ` +
      `purpose=${context.purpose} category=${category} finish_reason=${context.finishReason ?? "unknown"} ` +
      `schema_path=${schemaValidationPath ?? "none"} content_length=${contentLength} ` +
      `preview="${preview}" detail=${detail}`
    );
    this.name = "ProviderJsonOutputError";
    this.provider = context.provider;
    this.model = context.model;
    this.purpose = context.purpose;
    this.category = category;
    this.preview = preview;
    this.detail = detail;
    this.schemaValidationPath = schemaValidationPath;
    this.contentLength = contentLength;
    this.finishReason = context.finishReason;
  }
}

const ScopeAnalysisSchema = z.object({
  rationale: z.string(),
  affectedModules: z.array(z.string()),
  proposedFilesToModify: z.array(z.string()),
  proposedFilesToCreate: z.array(z.string()),
}).strict();

const PatchChunkSchema = z.object({
  type: z.enum(["create", "modify", "delete"]),
  file: z.string(),
  description: z.string(),
}).strict();

const PatchPlanSchema = z.object({
  rationale: z.string(),
  chunks: z.array(PatchChunkSchema).max(5, "patch_plan accepts at most 5 chunks"),
}).strict();

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path
        .map((part) => typeof part === "number" ? `[${part}]` : String(part))
        .join(".");
      return `${path.replace(/\.\[/g, "[") || "<root>"}: ${issue.message}`;
    })
    .join("; ");
}

function formatZodPath(pathParts: ReadonlyArray<PropertyKey>): string {
  return pathParts
    .map((part) => typeof part === "number" ? `[${part}]` : String(part))
    .join(".")
    .replace(/\.\[/g, "[") || "<root>";
}

function redactPreview(content: string): string {
  return content
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[REDACTED]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED_TOKEN]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_MAX_CHARS);
}

function stripMarkdownFence(content: string): string[] {
  const candidates: string[] = [];
  const fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(content)) !== null) {
    candidates.push(match[1]?.trim() ?? "");
  }
  return candidates;
}

function findBalancedObjectCandidates(content: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (char === "}") {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(content.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function hasUnbalancedJsonObject(content: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth++;
    if (char === "}" && depth > 0) depth--;
  }

  return depth > 0 || inString;
}

function parseJsonCandidate(candidate: string): unknown | null {
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function parseObjectCandidate(candidate: string): Record<string, unknown> | null {
  const parsed = parseJsonCandidate(candidate);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

export function extractProviderJsonObject(content: string, context: ProviderOutputContext): unknown {
  const trimmed = content.trim();
  const preview = redactPreview(content);
  if (trimmed.length === 0) {
    throw new ProviderJsonOutputError(
      context,
      "empty_content",
      preview,
      "response content was empty",
      null,
      content.length
    );
  }
  if (context.finishReason === "length") {
    throw new ProviderJsonOutputError(
      context,
      "truncated_output",
      preview,
      "provider reported finish_reason=length",
      null,
      content.length
    );
  }

  const direct = parseJsonCandidate(trimmed);
  if (direct !== null) return direct;

  const candidates = [
    ...stripMarkdownFence(content),
    ...findBalancedObjectCandidates(content),
  ];
  const parsed = candidates
    .map(parseObjectCandidate)
    .filter((candidate): candidate is Record<string, unknown> => candidate !== null);

  const unique = new Map(parsed.map((candidate) => [JSON.stringify(candidate), candidate]));
  if (unique.size === 1) {
    return [...unique.values()][0];
  }
  if (unique.size > 1) {
    throw new ProviderJsonOutputError(
      context,
      "ambiguous_json_objects",
      preview,
      "multiple valid JSON objects were present",
      null,
      content.length
    );
  }

  const category: ProviderParseCategory = hasUnbalancedJsonObject(content)
    ? "truncated_output"
    : content.includes("{") ? "malformed_json" : "no_json_object";
  throw new ProviderJsonOutputError(
    context,
    category,
    preview,
    "no valid JSON object could be extracted",
    null,
    content.length
  );
}

export function parseScopeAnalysisResponse(content: string, context: ProviderOutputContext): ScopeAnalysisResult {
  const parsed = extractProviderJsonObject(content, context);
  const result = ScopeAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProviderJsonOutputError(
      context,
      "schema_validation",
      redactPreview(content),
      formatZodError(result.error),
      formatZodPath(result.error.issues[0]?.path ?? []),
      content.length
    );
  }
  return result.data;
}

function repairPatchPlanAliases(value: unknown): { value: unknown; repairs: ProviderSchemaRepair[] } {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Array.isArray((value as { chunks?: unknown }).chunks)
  ) {
    return { value, repairs: [] };
  }

  const repairs: ProviderSchemaRepair[] = [];
  const plan = value as Record<string, unknown>;
  const chunks = (plan["chunks"] as unknown[]).map((chunk, chunkIndex) => {
    if (typeof chunk !== "object" || chunk === null || Array.isArray(chunk)) {
      return chunk;
    }

    const repaired = { ...(chunk as Record<string, unknown>) };
    if (repaired["file"] === undefined && typeof repaired["path"] === "string") {
      repaired["file"] = repaired["path"];
      delete repaired["path"];
      repairs.push({ chunkIndex, field: "file", alias: "path" });
    }

    const descriptionAliases = ["summary", "reason", "details"] as const;
    for (const alias of descriptionAliases) {
      if (repaired["description"] === undefined && typeof repaired[alias] === "string") {
        repaired["description"] = repaired[alias];
        delete repaired[alias];
        repairs.push({ chunkIndex, field: "description", alias });
        break;
      }
    }

    return repaired;
  });

  return {
    value: {
      ...plan,
      chunks,
    },
    repairs,
  };
}

export function parsePatchPlanResponse(content: string, context: ProviderOutputContext): ParsedPatchPlanResponse {
  const parsed = extractProviderJsonObject(content, context);
  const repaired = repairPatchPlanAliases(parsed);
  const result = PatchPlanSchema.safeParse(repaired.value);
  if (!result.success) {
    throw new ProviderJsonOutputError(
      context,
      "schema_validation",
      redactPreview(content),
      formatZodError(result.error),
      formatZodPath(result.error.issues[0]?.path ?? []),
      content.length
    );
  }
  return {
    patchPlan: result.data,
    repairs: repaired.repairs,
  };
}
