import { describe, expect, it, vi } from "bun:test";

import { createDefaultCapabilityRuntimeSettings } from "@codepawl/shared";

import { createAgentRuntimeSession } from "./index";

describe("shared agent runtime session", () => {
  it("discloses and executes only tools selected for the turn", async () => {
    const execute = vi.fn(async () => ({ output: "{\"ok\":true}" }));
    const session = createAgentRuntimeSession({
      inventory: {
        list: async () => [
          {
            schemaVersion: 1,
            id: "browser.read",
            version: "1",
            digest: "browser-read-v1",
            kind: "tool_namespace",
            namespace: "browser",
            title: "Browser read",
            summary: "Inspect browser tabs and pages",
            tags: ["browser", "inspect"],
            inputKinds: ["prompt"],
            outputKinds: ["browser_observation"],
            environment: ["cli"],
            trust: "builtin",
            risk: "read_only",
            health: "healthy",
            auth: "not_required",
            source: {
              id: "browser-runtime",
              uri: "orynt-runtime://browser/read",
              immutable: true,
            },
            provenanceRefs: [],
            repositoryScopes: [],
            toolNames: ["browser.browser_tabs", "browser.browser_observe"],
          },
        ],
      },
      toolBindings: [
        {
          capabilityId: "browser.read",
          tools: [
            {
              type: "function",
              name: "browser_tabs",
              description: "List tabs",
              strict: true,
              parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
            },
            {
              type: "function",
              name: "browser_observe",
              description: "Observe a page",
              strict: true,
              parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
            },
          ],
          execute,
        },
      ],
      runTurn: async ({ prepared }) => {
        const toolResult = await prepared.executeTool({
          callId: "call-1",
          name: "browser_tabs",
          arguments: {},
        });
        return { result: toolResult.output };
      },
    });

    const result = await session.runTurn({
      schemaVersion: 1,
      runId: "run-1",
      taskId: "task-1",
      prompt: "Inspect the browser",
      repositoryPath: "/tmp/repository",
      environment: ["cli"],
      connectedCapabilityIds: [],
      capabilitySettings: {
        ...createDefaultCapabilityRuntimeSettings(),
        maxToolsPerNamespace: 1,
      },
    });

    expect(result.prepared.tools.map(({ name }) => name)).toEqual([
      "browser_tabs",
    ]);
    expect(result.result).toBe("{\"ok\":true}");
    expect(execute).toHaveBeenCalledOnce();
  });
});
