export type ToolState = "requested" | "running" | "completed" | "failed";
export type SafeToolActivity = {
  id: string;
  name: string;
  state: ToolState;
  summary: string;
  elapsedMs?: number;
};
export type ChatEvent =
  | { type: "run_started"; sessionId: string; runId: string }
  | { type: "text_delta"; sessionId: string; runId: string; text: string }
  | { type: "tool"; sessionId: string; runId: string; tool: SafeToolActivity }
  | { type: "completed"; sessionId: string; runId: string }
  | { type: "cancelled"; sessionId: string; runId: string }
  | { type: "failed"; sessionId: string; runId: string; message: string };
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tool?: SafeToolActivity;
  error?: boolean;
};
