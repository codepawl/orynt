import { describe, expect, it } from "bun:test";

import type { OryntCdpBrowserRuntime } from "@codepawl/browser-runtime";

import {
  BrowserGatewayAdapter,
  createGatewayBrowserToolAuthority,
  type BrowserGatewayActionRequest,
} from "./browserAdapter";

describe("BrowserGatewayAdapter", () => {
  it("records bounded tab evidence and redacts sensitive URL parameters", async () => {
    const runtime = {
      listPages: async () => [{
        id: "page-1",
        title: "Account",
        url: "https://example.test/callback?code=sensitive&view=compact#private",
        type: "page",
      }],
    } as unknown as OryntCdpBrowserRuntime;
    const adapter = new BrowserGatewayAdapter(runtime);
    const result = await adapter.execute(request({ operation: "tabs" }));

    expect(result.status).toBe("executed");
    expect(result.evidence[0].metadata).toMatchObject({
      operation: "tabs",
      pageCount: 1,
      pages: [{
        url: "https://example.test/callback?code=%5BREDACTED%5D&view=compact",
      }],
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(JSON.stringify(result)).not.toContain("#private");
  });

  it("routes every model action through the supervised gateway boundary", async () => {
    let routed: BrowserGatewayActionRequest | undefined;
    const authority = createGatewayBrowserToolAuthority(async (action) => {
      routed = action as BrowserGatewayActionRequest;
      return {
        actionId: action.id,
        status: "approval_required",
        permission: {
          actionId: action.id,
          tier: "review",
          decision: "approval_requested",
          policyVersion: "policy-1",
          reasons: ["State-changing action requires approval."],
        },
        evidence: [],
        reason: "State-changing action requires approval.",
      };
    }, {
      runId: "run-1",
      workspaceId: "workspace-1",
      userId: "user-1",
    }, async () => [{
      actionKind: "navigate",
      origin: "https://example.test",
      risk: "review",
      reasons: [],
      summary: "Navigate on https://example.test",
      untrustedContent: "",
    }]);

    await expect(authority.execute("browser_act", {
      pageId: "page-1",
      action: { kind: "navigate", url: "https://example.test" },
    })).rejects.toThrow(/approval_required/);
    expect(routed).toMatchObject({
      surface: "browser",
      stateChanging: true,
      payload: { operation: "act" },
    });
    await expect(authority.execute("browser_act", {
      pageId: "page-1",
      action: { kind: "evaluate", expression: "document.cookie" },
    })).rejects.toThrow(/Unsupported typed browser action/);
  });

  it("carries semantic origin and sensitive-target risk into gateway policy without typed values", async () => {
    let routed: BrowserGatewayActionRequest | undefined;
    const authority = createGatewayBrowserToolAuthority(
      async (action) => {
        routed = action as BrowserGatewayActionRequest;
        return {
          actionId: action.id,
          status: "takeover_required",
          permission: {
            actionId: action.id,
            tier: "sensitive",
            decision: "takeover_required",
            policyVersion: "policy-1",
            reasons: action.riskReasons ?? [],
          },
          evidence: [],
          reason: "Sensitive target requires takeover.",
        };
      },
      {
        runId: "run-1",
        workspaceId: "workspace-1",
        userId: "user-1",
      },
      async () => [{
        actionKind: "type",
        origin: "https://example.test",
        target: {
          role: "textbox",
          name: "Password",
          tag: "input",
          inputType: "password",
        },
        risk: "takeover",
        reasons: ["Credential target requires takeover."],
        summary: "Type 12 character(s) into textbox “Password” on https://example.test",
        untrustedContent: "Password",
      }],
    );

    await expect(authority.execute("browser_act", {
      pageId: "page-1",
      action: {
        kind: "type",
        observationId: "observation-1",
        ref: "r1",
        text: "private-value",
      },
    })).rejects.toThrow(/takeover_required/);
    expect(routed).toMatchObject({
      riskHint: "sensitive",
      instruction:
        "Type 12 character(s) into textbox “Password” on https://example.test",
      payload: {
        operation: "act",
        intents: [{ risk: "takeover" }],
      },
    });
    expect(routed?.instruction).not.toContain("private-value");
  });

  it("accepts exactly one bounded batch shape", async () => {
    const authority = createGatewayBrowserToolAuthority(async (action) => ({
      actionId: action.id,
      status: "approval_required",
      permission: {
        actionId: action.id,
        tier: "review",
        decision: "approval_requested",
        policyVersion: "policy-1",
        reasons: ["approval"],
      },
      evidence: [],
      reason: "approval",
    }), {
      runId: "run-1",
      workspaceId: "workspace-1",
      userId: "user-1",
    }, async () => [{
      actionKind: "press",
      origin: "https://example.test",
      risk: "review",
      reasons: [],
      summary: "Press Tab on https://example.test",
      untrustedContent: "",
    }]);
    await expect(authority.execute("browser_act", {
      pageId: "page-1",
      action: { kind: "press", key: "Tab" },
      batch: {
        id: "batch-1",
        actions: [{ action: { kind: "press", key: "Tab" } }],
      },
    })).rejects.toThrow(/exactly one/i);
  });
});

function request(payload: BrowserGatewayActionRequest["payload"]): BrowserGatewayActionRequest {
  return {
    id: "browser-action-1",
    runId: "run-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    surface: "browser",
    actionType: payload.operation,
    instruction: "Inspect the current browser page.",
    stateChanging: false,
    expectedEvidence: ["trace"],
    policyAction: {
      id: "policy-browser-1",
      kind: "command",
      summary: "Inspect the current browser page",
      command: "browser observe",
    },
    payload,
  };
}
