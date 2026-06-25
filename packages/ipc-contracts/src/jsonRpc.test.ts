import { describe, expect, it } from "vitest";

import {
  CODEPAWL_ERROR_CODES,
  createRpcEvent,
  isRpcEvent,
  isRpcRequest,
  isRpcResponse,
} from "./index";

describe("CodePawl IPC contracts", () => {
  it("validates newline-delimited JSON-RPC request, response, and event envelopes", () => {
    expect(isRpcRequest({ jsonrpc: "2.0", id: "run-1", method: "run.create", params: { task: "Fill form" } })).toBe(
      true,
    );
    expect(isRpcRequest({ jsonrpc: "2.0", id: "", method: "run.create" })).toBe(false);
    expect(isRpcRequest({ jsonrpc: "1.0", id: "run-1", method: "run.create" })).toBe(false);

    expect(isRpcResponse({ jsonrpc: "2.0", id: "run-1", result: { ok: true } })).toBe(true);
    expect(isRpcResponse({ jsonrpc: "2.0", id: "run-1", error: { code: "POLICY_DENIED", message: "Denied" } })).toBe(
      true,
    );
    expect(isRpcResponse({ jsonrpc: "2.0", id: "run-1", error: { code: "", message: "Denied" } })).toBe(false);

    const event = createRpcEvent("run.step_added", { runId: "r1", stepIndex: 2 });
    expect(isRpcEvent(event)).toBe(true);
    expect(event).toEqual({ type: "event", event: "run.step_added", payload: { runId: "r1", stepIndex: 2 } });
  });

  it("keeps the MVP runtime error vocabulary explicit", () => {
    expect(CODEPAWL_ERROR_CODES).toContain("APPROVAL_REQUIRED");
    expect(CODEPAWL_ERROR_CODES).toContain("BUDGET_EXCEEDED");
    expect(CODEPAWL_ERROR_CODES).toContain("SIDECAR_PROTOCOL_MISMATCH");
    expect(CODEPAWL_ERROR_CODES).not.toContain("SHELL_EXEC_FAILED");
  });
});
