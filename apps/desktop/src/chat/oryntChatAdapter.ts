import type { ThreadMessageLike } from "@assistant-ui/react";
import type { RunEvent } from "@codepawl/shared";

export type OryntChatRole = "user" | "assistant" | "status" | "error";
export type OryntChatRunStatus =
  | "idle"
  | "thinking"
  | "running_tool"
  | "completed"
  | "cancelled"
  | "failed";
export type OryntToolState = "requested" | "running" | "completed" | "failed";

export type OryntChatTool = {
  id: string;
  name: string;
  state: OryntToolState;
  summary: string;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
};

export type OryntChatMessage = {
  id: string;
  role: OryntChatRole;
  text: string;
  runId?: string;
  tool?: OryntChatTool;
};

const SENSITIVE_KEY =
  /(?:authorization|cookie|credential|password|secret|token|api[_-]?key|environment|headers?)/iu;
const SECRET_VALUE =
  /(?:sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._~+/-]+=*)/giu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(SECRET_VALUE, "[REDACTED]") : undefined;
}

function safePayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  if (SENSITIVE_KEY.test(key)) return undefined;
  return safeString(payload[key]);
}

function toolState(status: string | undefined): OryntToolState {
  if (status === "started" || status === "in_progress" || status === "running") {
    return "running";
  }
  if (status === "failed" || status === "error") return "failed";
  if (status === "completed" || status === "finished") return "completed";
  return "requested";
}

function elapsedMs(payload: Record<string, unknown>): number | undefined {
  const value = payload.durationMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function runStatusFromEvent(event: RunEvent): OryntChatRunStatus {
  if (event.type === "run_finished") return "completed";
  if (event.type === "codex_execution_cancel_requested") return "cancelled";
  if (
    event.type === "codex_execution_failed" ||
    event.type === "verification_failed" ||
    event.type.endsWith("_failed")
  ) {
    return "failed";
  }
  if (
    event.type === "codex_tool_activity" ||
    event.type.startsWith("verification_command")
  ) {
    return "running_tool";
  }
  return "thinking";
}

export function messageFromRunEvent(event: RunEvent): OryntChatMessage | null {
  const payload = isRecord(event.payload) ? event.payload : {};
  if (event.type === "codex_agent_message") {
    const text =
      safePayloadString(payload, "message") ??
      safePayloadString(payload, "summary");
    if (!text) return null;
    const itemId = safePayloadString(payload, "itemId") ?? event.id;
    return {
      id: `${event.runId}-assistant-${itemId}`,
      role: "assistant",
      text,
      runId: event.runId,
    };
  }
  if (
    event.type === "codex_tool_activity" ||
    event.type.startsWith("verification_command")
  ) {
    const itemId = safePayloadString(payload, "itemId") ?? event.id;
    const name =
      safePayloadString(payload, "toolName") ??
      safePayloadString(payload, "displayName") ??
      "Orynt tool";
    const state = toolState(safePayloadString(payload, "status"));
    const summary =
      safePayloadString(payload, "detail") ??
      safePayloadString(payload, "summary") ??
      `${name} ${state}`;
    return {
      id: `${event.runId}-tool-${itemId}`,
      role: state === "failed" ? "error" : "status",
      text: summary,
      runId: event.runId,
      tool: {
        id: itemId,
        name,
        state,
        summary,
        elapsedMs: elapsedMs(payload),
        ...(state === "running" ? { startedAt: event.timestamp } : {}),
        ...(state === "completed" || state === "failed"
          ? { completedAt: event.timestamp }
          : {}),
      },
    };
  }
  if (event.type === "run_finished") {
    return {
      id: `${event.runId}-completed`,
      role: "status",
      text: safePayloadString(payload, "summary") ?? "Completed",
      runId: event.runId,
    };
  }
  if (event.type === "codex_execution_cancel_requested") {
    return {
      id: `${event.runId}-cancelled`,
      role: "status",
      text: "Cancelled",
      runId: event.runId,
    };
  }
  if (runStatusFromEvent(event) === "failed") {
    return {
      id: `${event.runId}-failed-${event.id}`,
      role: "error",
      text: safePayloadString(payload, "summary") ?? "The Orynt run failed.",
      runId: event.runId,
    };
  }
  return null;
}

export function upsertChatMessage(
  messages: readonly OryntChatMessage[],
  next: OryntChatMessage,
): OryntChatMessage[] {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) return [...messages, next];
  const current = messages[index]!;
  const replacement = {
    ...current,
    ...next,
    tool:
      current.tool && next.tool
        ? { ...current.tool, ...next.tool }
        : next.tool,
  };
  return messages.map((message, messageIndex) =>
    messageIndex === index ? replacement : message,
  );
}

export function toThreadMessage(
  message: OryntChatMessage,
): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: [{ type: "text", text: message.text }],
    status:
      message.role === "error"
        ? {
            type: "incomplete" as const,
            reason: "error" as const,
            error: { message: message.text },
          }
        : { type: "complete" as const, reason: "stop" as const },
    metadata: {
      custom: {
        oryntRole: message.role,
        ...(message.runId ? { runId: message.runId } : {}),
        ...(message.tool ? { tool: message.tool } : {}),
      },
    },
  };
}

export function textFromAppendContent(
  content: readonly { type: string; text?: string }[],
): string {
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("")
    .trim();
}
