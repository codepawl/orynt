import { describe, expect, it } from "bun:test";

import {
  BROWSER_AGENT_TOOLS,
  BrowserAgentToolExecutor,
  MAX_OBSERVATION_BYTES,
  MAX_OBSERVATION_NODES,
  OryntCdpBrowserRuntime,
  browserLaunchArguments,
  boundNodes,
  type CdpConnection,
} from "./index";

class FakeConnection implements CdpConnection {
  readonly calls: Array<{ method: string; params: Record<string, unknown>; sessionId?: string }> = [];
  closed = false;

  async send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    this.calls.push({ method, params, ...(sessionId ? { sessionId } : {}) });
    if (method === "Target.getTargets") {
      return {
        targetInfos: [{
          targetId: "page-1",
          type: "page",
          title: "Fixture",
          url: "https://example.test/",
        }],
      };
    }
    if (method === "Target.attachToTarget") return { sessionId: "session-1" };
    if (method === "Accessibility.getFullAXTree") {
      return {
        nodes: [{
          nodeId: "ax-1",
          ignored: false,
          role: { value: "button" },
          name: { value: "Continue" },
          backendDOMNodeId: 42,
          properties: [],
        }],
      };
    }
    if (method === "DOMSnapshot.captureSnapshot") return {};
    if (method === "DOM.describeNode") {
      return {
        node: {
          localName: "button",
          attributes: ["type", "button"],
        },
      };
    }
    if (method === "DOM.resolveNode") return { object: { objectId: "object-42" } };
    if (method === "DOM.getBoxModel") {
      return { model: { border: [10, 20, 110, 20, 110, 60, 10, 60] } };
    }
    if (method === "Page.captureScreenshot") return { data: "cG5n" };
    if (method === "Runtime.callFunctionOn") return { result: { value: "ok" } };
    if (method === "Runtime.evaluate") {
      return {
        result: {
          value:
            String(params.expression).includes("__oryntMutationBuffer")
              ? false
              : true,
        },
      };
    }
    return {};
  }

  async close() {
    this.closed = true;
  }
}

describe("Orynt CDP browser runtime", () => {
  it("keeps the permissive CDP Origin handshake bound to loopback", () => {
    const args = browserLaunchArguments({
      userDataDir: "/tmp/orynt-browser-profile",
      initialUrl: "http://127.0.0.1:3000",
    });
    expect(args).toContain("--remote-debugging-address=127.0.0.1");
    expect(args).toContain("--remote-debugging-port=0");
    expect(args).toContain("--remote-allow-origins=*");
    expect(args).not.toContain("--remote-debugging-address=0.0.0.0");
  });

  it("exposes only four typed model tools and no raw evaluation surface", () => {
    expect(BROWSER_AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      "browser_tabs",
      "browser_observe",
      "browser_act",
      "browser_wait",
    ]);
    expect(JSON.stringify(BROWSER_AGENT_TOOLS)).not.toMatch(/javascript|runtime\.evaluate|cookie/i);
    expect(BROWSER_AGENT_TOOLS.every((tool) => tool.type === "function" && tool.strict)).toBe(true);
  });

  it("routes model tool calls through an injected authority and fails closed on unknown tools", async () => {
    const calls: string[] = [];
    const executor = new BrowserAgentToolExecutor({
      execute: async (name) => {
        calls.push(name);
        return { pages: [] };
      },
    });
    const result = await executor.execute({
      callId: "call-1",
      name: "browser_tabs",
      arguments: {},
    });
    const unknown = await executor.execute({
      callId: "call-2",
      name: "browser_eval",
      arguments: { expression: "document.cookie" },
    });
    expect(JSON.parse(result.output)).toEqual({ pages: [] });
    expect(calls).toEqual(["browser_tabs"]);
    expect(unknown.isError).toBe(true);
  });

  it("attaches with flat target sessions and returns bounded AX references", async () => {
    const connection = new FakeConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/test",
      allowedOrigins: ["https://example.test"],
    });

    const observation = await runtime.observe({ pageId: "page-1" });

    expect(runtime.sessionMode).toBe("attached");
    expect(observation).toMatchObject({
      pageId: "page-1",
      schemaVersion: 2,
      revision: 1,
      mode: "snapshot",
      nodes: [{ ref: "r1", role: "button", name: "Continue", backendDOMNodeId: 42 }],
      truncated: false,
    });
    expect(connection.calls).toContainEqual(expect.objectContaining({
      method: "Target.setAutoAttach",
      params: expect.objectContaining({ flatten: true }),
    }));
    expect(connection.calls.map((call) => call.method)).toContain("Accessibility.disable");
  });

  it("captures at most three revision-bound candidate crops", async () => {
    const connection = new FakeConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/test",
      allowedOrigins: ["https://example.test"],
    });
    const observation = await runtime.observe({ pageId: "page-1" });
    const crops = await runtime.captureVisionCrops({
      observationId: observation.observationId,
      refs: ["r1"],
    });
    expect(crops).toEqual([expect.objectContaining({
      observationId: observation.observationId,
      revision: observation.revision,
      ref: "r1",
      mimeType: "image/png",
      base64: "cG5n",
    })]);
    expect(connection.calls).toContainEqual(expect.objectContaining({
      method: "Page.captureScreenshot",
      params: expect.objectContaining({
        clip: expect.objectContaining({ scale: 1 }),
      }),
    }));
    await expect(runtime.captureVisionCrops({
      observationId: observation.observationId,
      refs: ["r1", "r2", "r3", "r4"],
    })).rejects.toThrow(/one to three/iu);
  });

  it("rejects stale observation references without sending an action", async () => {
    const connection = new FakeConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://localhost:9222/devtools/browser/test",
      allowedOrigins: ["https://example.test"],
    });

    const result = await runtime.act("page-1", {
      kind: "click",
      observationId: "missing",
      ref: "r1",
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/stale|invalid/i);
    expect(connection.calls.filter((call) => call.method === "Runtime.callFunctionOn")).toHaveLength(0);
  });

  it("resolves a current ref, checks actionability, and records before/after evidence", async () => {
    const connection = new FakeConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/test",
      allowedOrigins: ["https://example.test"],
    });
    const before = await runtime.observe({ pageId: "page-1" });

    const result = await runtime.act("page-1", {
      kind: "click",
      observationId: before.observationId,
      ref: "r1",
    });

    expect(result).toMatchObject({
      status: "executed",
      verified: true,
      evidence: { beforeObservationId: before.observationId },
    });
    expect(connection.calls).toContainEqual(expect.objectContaining({
      method: "DOM.resolveNode",
      params: { backendNodeId: 42 },
    }));
  });

  it("fails closed outside the explicit origin scope without exposing page nodes", async () => {
    const connection = new FakeConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/test",
      allowedOrigins: ["https://allowed.test"],
    });

    const observation = await runtime.observe({ pageId: "page-1" });

    expect(observation).toMatchObject({
      scopeBlocked: true,
      title: "",
      nodes: [],
      url: "https://example.test/",
    });
    expect(connection.calls.map(({ method }) => method)).not.toContain(
      "Accessibility.getFullAXTree",
    );
  });

  it("classifies credential targets for takeover without copying typed values into the summary", async () => {
    class PasswordConnection extends FakeConnection {
      override async send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
        if (method === "Accessibility.getFullAXTree") {
          this.calls.push({ method, params, ...(sessionId ? { sessionId } : {}) });
          return {
            nodes: [{
              ignored: false,
              role: { value: "textbox" },
              name: { value: "Account credential" },
              backendDOMNodeId: 42,
              properties: [],
            }],
          };
        }
        if (method === "DOM.describeNode") {
          this.calls.push({ method, params, ...(sessionId ? { sessionId } : {}) });
          return {
            node: {
              localName: "input",
              attributes: ["type", "password"],
            },
          };
        }
        return super.send(method, params, sessionId);
      }
    }
    const connection = new PasswordConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/test",
      allowedOrigins: ["https://example.test"],
    });
    const observation = await runtime.observe({ pageId: "page-1" });
    const intent = await runtime.inspectAction("page-1", {
      kind: "type",
      observationId: observation.observationId,
      ref: observation.nodes[0].ref,
      text: "do-not-echo-this",
    });

    expect(intent.risk).toBe("takeover");
    expect(intent.target?.inputType).toBe("password");
    expect(intent.summary).toContain("16 character(s)");
    expect(intent.summary).not.toContain("do-not-echo-this");
  });

  it("returns an empty delta when the page revision has not changed", async () => {
    const connection = new FakeConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/test",
      allowedOrigins: ["https://example.test"],
    });
    const initial = await runtime.observe({ pageId: "page-1" });
    const delta = await runtime.observe({
      pageId: "page-1",
      mode: "delta",
      sinceRevision: initial.revision,
    });

    expect(delta).toMatchObject({
      mode: "delta",
      revision: initial.revision,
      nodes: [],
      delta: {
        baseRevision: initial.revision,
        added: [],
        changed: [],
        removedFingerprints: [],
      },
    });
    expect(
      connection.calls.filter(
        ({ method }) => method === "Accessibility.getFullAXTree",
      ),
    ).toHaveLength(1);
  });

  it("executes a bounded batch and emits partial-safe trace evidence", async () => {
    const connection = new FakeConnection();
    const runtime = new OryntCdpBrowserRuntime(async () => connection);
    await runtime.attach({
      webSocketUrl: "ws://127.0.0.1:9222/devtools/browser/test",
      allowedOrigins: ["https://example.test"],
    });
    const observation = await runtime.observe({ pageId: "page-1" });
    const result = await runtime.actBatch("page-1", {
      id: "batch-1",
      expectedRevision: observation.revision,
      actions: [{
        action: {
          kind: "click",
          observationId: observation.observationId,
          ref: observation.nodes[0].ref,
        },
        postcondition: { kind: "text_present", value: "completed" },
      }],
    });

    expect(result).toMatchObject({
      status: "executed",
      verified: true,
      executedActionCount: 1,
      trace: {
        schemaVersion: 2,
        batchId: "batch-1",
        actionCount: 1,
      },
    });
  });

  it("bounds observations by node count and serialized bytes", () => {
    const nodes = Array.from({ length: 400 }, (_, index) => ({
      role: "button",
      name: `Button ${index} ${"x".repeat(300)}`,
    }));
    const result = boundNodes(nodes);

    expect(result.nodes.length).toBeLessThanOrEqual(MAX_OBSERVATION_NODES);
    expect(Buffer.byteLength(JSON.stringify(result.nodes))).toBeLessThanOrEqual(MAX_OBSERVATION_BYTES);
    expect(result.truncated).toBe(true);
  });
});
