import { describe, expect, it } from "bun:test";

import type { AgentFunctionTool, AgentToolCall } from "@codepawl/model-runtime";

import { OryntMcpBridge, type OryntMcpBridgeHandle } from "./mcpBridge";

const readTool: AgentFunctionTool = {
  type: "function",
  name: "read_file",
  description: "read a repository file",
  strict: true,
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
};

async function bridge(
  executeTool: (call: AgentToolCall) => Promise<{ output: string; isError?: boolean }>,
): Promise<{ handle: OryntMcpBridgeHandle; call: (body: unknown, token?: string) => Promise<Response> }> {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const handle = await new OryntMcpBridge({
    tools: [readTool],
    executeTool,
    listen: async (given) => {
      handler = given;
      return { url: "http://127.0.0.1:0/mcp", close: () => undefined };
    },
  }).start();
  return {
    handle,
    call: (body, token = handle.token) =>
      handler!(
        new Request("http://127.0.0.1:0/mcp", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      ),
  };
}

describe("orynt mcp bridge", () => {
  it("emits an mcp-config the claude CLI can consume", async () => {
    const { handle } = await bridge(async () => ({ output: "" }));
    const config = JSON.parse(handle.mcpConfig) as {
      mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }>;
    };
    expect(config.mcpServers.orynt!.type).toBe("http");
    expect(config.mcpServers.orynt!.headers.authorization).toBe(
      `Bearer ${handle.token}`,
    );
  });

  it("rejects a request without the bearer token", async () => {
    const { call } = await bridge(async () => ({ output: "" }));
    const response = await call({ jsonrpc: "2.0", id: 1, method: "ping" }, "wrong");
    expect(response.status).toBe(401);
  });

  it("echoes the client's protocol version on initialize", async () => {
    const { call } = await bridge(async () => ({ output: "" }));
    const body = (await (
      await call({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      })
    ).json()) as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe("2025-03-26");
  });

  it("advertises Orynt tools with the MCP inputSchema key", async () => {
    const { call } = await bridge(async () => ({ output: "" }));
    const body = (await (
      await call({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    ).json()) as {
      result: { tools: { name: string; inputSchema: unknown }[] };
    };
    expect(body.result.tools).toEqual([
      {
        name: "read_file",
        description: "read a repository file",
        inputSchema: readTool.parameters,
      },
    ]);
  });

  it("routes tools/call through Orynt's executor", async () => {
    const seen: AgentToolCall[] = [];
    const { call } = await bridge(async (toolCall) => {
      seen.push(toolCall);
      return { output: "file contents" };
    });
    const body = (await (
      await call({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "read_file", arguments: { path: "a.ts" } },
      })
    ).json()) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(seen[0]!.name).toBe("read_file");
    expect(seen[0]!.arguments).toEqual({ path: "a.ts" });
    expect(body.result.content[0]!.text).toBe("file contents");
    expect(body.result.isError).toBeUndefined();
  });

  it("reports an unknown tool as a tool error, not a protocol error", async () => {
    const { call } = await bridge(async () => ({ output: "" }));
    const body = (await (
      await call({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nope", arguments: {} },
      })
    ).json()) as { result: { isError: boolean }; error?: unknown };
    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
  });

  it("turns an executor throw into an error result the model can recover from", async () => {
    const { call } = await bridge(async () => {
      throw new Error("gateway denied");
    });
    const body = (await (
      await call({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "read_file", arguments: {} },
      })
    ).json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]!.text).toContain("gateway denied");
  });

  it("propagates an isError tool result", async () => {
    const { call } = await bridge(async () => ({
      output: "denied",
      isError: true,
    }));
    const body = (await (
      await call({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "read_file", arguments: {} },
      })
    ).json()) as { result: { isError: boolean } };
    expect(body.result.isError).toBe(true);
  });

  it("rejects an unsupported method", async () => {
    const { call } = await bridge(async () => ({ output: "" }));
    const body = (await (
      await call({ jsonrpc: "2.0", id: 7, method: "resources/list" })
    ).json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });
});
