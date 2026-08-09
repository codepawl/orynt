import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CODEX_EXECUTION_IPC_METHODS,
  DESKTOP_COMMANDS,
  MEMORY_IPC_METHODS,
  ORYNT_ERROR_CODES,
  RUN_IPC_METHODS,
  RUN_EVENTS,
  SETTINGS_IPC_METHODS,
  SKILL_IPC_METHODS,
  SKILL_MANAGER_IPC_METHODS,
  createRpcEvent,
  isRpcEvent,
  isRpcRequest,
  isRpcResponse,
} from "./index";

describe("Orynt IPC contracts", () => {
  it("keeps the native host command allowlist synchronized", async () => {
    const manifest = JSON.parse(await readFile(
      path.resolve(import.meta.dirname, "../desktop-command-allowlist.json"),
      "utf8",
    ));
    expect(manifest).toEqual(DESKTOP_COMMANDS);
  });

  it("validates newline-delimited JSON-RPC request, response, and event envelopes", () => {
    expect(
      isRpcRequest({
        jsonrpc: "2.0",
        id: "run-1",
        method: "run.create",
        params: { goal: "Fix failing test", capabilityId: "coding-apprentice" },
      }),
    ).toBe(
      true,
    );
    expect(isRpcRequest({ jsonrpc: "2.0", id: "", method: "run.create" })).toBe(false);
    expect(isRpcRequest({ jsonrpc: "1.0", id: "run-1", method: "run.create" })).toBe(false);

    expect(isRpcResponse({ jsonrpc: "2.0", id: "run-1", result: { ok: true } })).toBe(true);
    expect(isRpcResponse({ jsonrpc: "2.0", id: "run-1", error: { code: "POLICY_DENIED", message: "Denied" } })).toBe(
      true,
    );
    expect(isRpcResponse({ jsonrpc: "2.0", id: "run-1", error: { code: "", message: "Denied" } })).toBe(false);

    const event = createRpcEvent("run_started", { runId: "r1", sequence: 1 });
    expect(isRpcEvent(event)).toBe(true);
    expect(event).toEqual({ type: "event", event: "run_started", payload: { runId: "r1", sequence: 1 } });
  });

  it("keeps the MVP runtime error vocabulary explicit", () => {
    expect(ORYNT_ERROR_CODES).toContain("APPROVAL_REQUIRED");
    expect(ORYNT_ERROR_CODES).toContain("BUDGET_EXCEEDED");
    expect(ORYNT_ERROR_CODES).toContain("SIDECAR_PROTOCOL_MISMATCH");
    expect(ORYNT_ERROR_CODES).toContain("REPOSITORY_CONTEXT_FAILED");
    expect(ORYNT_ERROR_CODES).not.toContain("SHELL_EXEC_FAILED");
    expect(ORYNT_ERROR_CODES).toEqual(
      expect.arrayContaining([
        "SKILL_MANIFEST_INVALID",
        "SKILL_TRUST_BLOCKED",
        "SKILL_PLAN_STALE",
        "SKILL_TRANSACTION_FAILED",
      ]),
    );
  });

  it("declares durable repository run and settings IPC methods", () => {
    expect(RUN_IPC_METHODS).toEqual([
      "run.create",
      "run.list",
      "run.open",
      "artifact.list",
      "artifact.read",
      "run.cancel",
    ]);
    expect(SETTINGS_IPC_METHODS).toEqual([
      "settings.get",
      "settings.update",
      "codexConnection.save",
      "codexConnection.preflight",
      "codexConnection.login",
      "codexConnection.loginWithAccessToken",
      "codexConnection.delete",
    ]);
  });

  it("declares memory review IPC methods and candidate rule review events", () => {
    expect(MEMORY_IPC_METHODS).toEqual([
      "memory.listEpisodes",
      "memory.listCandidateRules",
      "memory.updateCandidateRuleStatus",
    ]);
    expect(RUN_EVENTS).toEqual(
      expect.arrayContaining([
        "candidate_rule_accepted",
        "candidate_rule_rejected",
        "candidate_rule_superseded",
      ]),
    );

    const event = createRpcEvent("candidate_rule_accepted", {
      candidateRuleId: "candidate-rule-1",
      status: "accepted",
    });

    expect(isRpcEvent(event)).toBe(true);
    expect(event.payload).toMatchObject({ status: "accepted" });
  });

  it("declares skill registry IPC methods and manual skill lifecycle events", () => {
    expect(SKILL_IPC_METHODS).toEqual([
      "skill.list",
      "skill.createCandidate",
      "skill.createReplayPlan",
      "skill.promoteManual",
      "skill.reject",
      "skill.supersede",
      "skill.archive",
    ]);
    expect(RUN_EVENTS).toEqual(
      expect.arrayContaining([
        "skill_candidate_created",
        "skill_promoted_manual",
        "skill_rejected",
        "skill_superseded",
        "skill_archived",
        "skill_replay_plan_requested",
        "skill_replay_preconditions_checked",
        "skill_replay_policy_checked",
        "skill_replay_budget_estimated",
        "skill_replay_plan_created",
        "skill_replay_plan_blocked",
      ]),
    );

    const event = createRpcEvent("skill_promoted_manual", {
      skillId: "skill-package-scope",
      status: "active",
    });

    expect(isRpcEvent(event)).toBe(true);
    expect(event.payload).toMatchObject({ status: "active" });
  });

  it("keeps installed Agent Skill package management separate from learned skills", () => {
    expect(SKILL_MANAGER_IPC_METHODS).toEqual([
      "skillInventory.scan",
      "skillInventory.list",
      "skillInventory.get",
      "skillHub.listSources",
      "skillHub.refresh",
      "skillHub.search",
      "skillHub.get",
      "skillMutation.plan",
      "skillMutation.approve",
      "skillMutation.execute",
      "skillMutation.history",
      "skillMutation.recover",
      "skillContext.snapshot",
    ]);
    expect(SKILL_IPC_METHODS).not.toContain("skillInventory.scan");
    expect(RUN_EVENTS).toContain("skill_context_snapshot_created");
  });

  it("declares controlled Codex execution IPC methods and lifecycle events", () => {
    expect(CODEX_EXECUTION_IPC_METHODS).toEqual([
      "codexExecution.plan",
      "codexExecution.approve",
      "codexExecution.executeApproved",
      "codexExecution.cancel",
    ]);
    expect(RUN_EVENTS).toEqual(
      expect.arrayContaining([
        "codex_execution_planned",
        "codex_execution_approval_required",
        "codex_execution_approved",
        "codex_execution_started",
        "codex_execution_output_recorded",
        "codex_execution_finished",
        "codex_execution_failed",
        "codex_execution_cancel_requested",
        "codex_execution_blocked",
        "codex_execution_result_ready",
      ]),
    );

    const event = createRpcEvent("codex_execution_result_ready", {
      planId: "codex-execution-plan-1",
      importReady: true,
    });

    expect(isRpcEvent(event)).toBe(true);
    expect(event.payload).toMatchObject({ importReady: true });
  });
});
