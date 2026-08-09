import { randomBytes } from "node:crypto";

import type {
  AgentFunctionTool,
  AgentToolCall,
  AgentToolResult,
} from "@codepawl/model-runtime";

import type { JsonRecord } from "./sse.js";

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export type OryntMcpBridgeOptions = {
  tools: readonly AgentFunctionTool[];
  executeTool: (call: AgentToolCall) => Promise<AgentToolResult>;
  serverName?: string;
  /** Injected for tests. Defaults to `Bun.serve` on an ephemeral loopback port. */
  listen?: (
    handler: (request: Request) => Promise<Response>,
  ) => Promise<{ url: string; close: () => void | Promise<void> }>;
};

export type OryntMcpBridgeHandle = {
  url: string;
  token: string;
  /** Ready-to-pass `--mcp-config` payload for the `claude` CLI. */
  mcpConfig: string;
  close: () => Promise<void>;
};

function jsonRpcResult(id: unknown, result: JsonRecord): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * Exposes Orynt's own tool executor to a spawned `claude` process as an MCP
 * server over loopback HTTP.
 *
 * Track B disables Claude Code's built-in Read/Edit/Bash tools so that every
 * action still crosses Orynt's gateway. The tools therefore have to reach the
 * child some other way, and MCP is the only channel the CLI offers. Serving it
 * in-process keeps `executeTool` — and the approval boundary behind it — on
 * this side of the process line.
 */
export class OryntMcpBridge {
  private readonly token = randomBytes(32).toString("hex");
  private readonly toolsByName = new Map<string, AgentFunctionTool>();

  constructor(private readonly options: OryntMcpBridgeOptions) {
    for (const tool of options.tools) this.toolsByName.set(tool.name, tool);
  }

  async start(): Promise<OryntMcpBridgeHandle> {
    const listen = this.options.listen ?? defaultListen;
    const server = await listen((request) => this.handle(request));
    const name = this.options.serverName ?? "orynt";
    return {
      url: server.url,
      token: this.token,
      mcpConfig: JSON.stringify({
        mcpServers: {
          [name]: {
            type: "http",
            url: server.url,
            headers: { authorization: `Bearer ${this.token}` },
          },
        },
      }),
      close: async () => {
        await server.close();
      },
    };
  }

  private async handle(request: Request): Promise<Response> {
    // The port is ephemeral and loopback-only, but anything else on the host
    // could still reach it; the bearer token is what actually gates access.
    if (
      request.headers.get("authorization") !== `Bearer ${this.token}` ||
      request.method !== "POST"
    ) {
      return new Response("unauthorized", { status: 401 });
    }
    let message: JsonRecord;
    try {
      message = record(await request.json());
    } catch {
      return jsonRpcError(null, -32700, "invalid JSON");
    }
    const id = message.id;
    switch (message.method) {
      case "initialize": {
        const params = record(message.params);
        const protocolVersion =
          typeof params.protocolVersion === "string"
            ? params.protocolVersion
            : DEFAULT_PROTOCOL_VERSION;
        return jsonRpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: this.options.serverName ?? "orynt",
            version: "1",
          },
        });
      }
      case "notifications/initialized":
        // A notification carries no id and expects no body.
        return new Response(null, { status: 202 });
      case "ping":
        return jsonRpcResult(id, {});
      case "tools/list":
        return jsonRpcResult(id, {
          tools: [...this.toolsByName.values()].map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.parameters,
          })),
        });
      case "tools/call":
        return this.callTool(id, record(message.params));
      default:
        return jsonRpcError(
          id,
          -32601,
          `unsupported method: ${String(message.method)}`,
        );
    }
  }

  private async callTool(id: unknown, params: JsonRecord): Promise<Response> {
    const name = typeof params.name === "string" ? params.name : "";
    if (!this.toolsByName.has(name)) {
      // Reported as a tool error rather than a protocol error so the model can
      // recover instead of the turn failing.
      return jsonRpcResult(id, {
        isError: true,
        content: [
          { type: "text", text: JSON.stringify({ error: `unknown tool: ${name}` }) },
        ],
      });
    }
    const call: AgentToolCall = {
      callId: `mcp-${String(id)}`,
      name,
      arguments: params.arguments ?? {},
    };
    try {
      const result = await this.options.executeTool(call);
      return jsonRpcResult(id, {
        content: [{ type: "text", text: result.output }],
        ...(result.isError ? { isError: true } : {}),
      });
    } catch (error) {
      return jsonRpcResult(id, {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      });
    }
  }
}

async function defaultListen(
  handler: (request: Request) => Promise<Response>,
): Promise<{ url: string; close: () => void }> {
  const serve = (
    globalThis as unknown as {
      Bun?: {
        serve: (options: {
          port: number;
          hostname: string;
          fetch: (request: Request) => Promise<Response>;
        }) => { port: number; stop: (closeActive?: boolean) => void };
      };
    }
  ).Bun?.serve;
  if (!serve) {
    throw new Error("The Orynt MCP bridge requires the Bun runtime");
  }
  const server = serve({ port: 0, hostname: "127.0.0.1", fetch: handler });
  return {
    url: `http://127.0.0.1:${server.port}/mcp`,
    close: () => server.stop(true),
  };
}
