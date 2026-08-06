import { describe, expect, it } from "bun:test";

import {
  createDefaultRunBudget,
  InMemoryRunStore,
  redactSensitivePayload,
  redactSensitiveText,
} from "./runSpine.js";

describe("shared redaction policy", () => {
  it("redacts every supported credential occurrence in one value", () => {
    const result = redactSensitiveText([
      "sk-AAAAAAAAAAAA",
      "ghp_BBBBBBBBBBBB",
      "glpat-CCCCCCCCCCCC",
      "npm_DDDDDDDDDDDD",
      "AKIA1234567890ABCDEF",
      "eyJabcdefgh.ijklmnop.qrstuvwx",
    ].join(" "));

    expect(result.value).not.toMatch(/AAAA|BBBB|CCCC|DDDD|AKIA|eyJ/u);
    expect(result.redaction).toMatchObject({
      applied: true,
      policyVersion: 2,
      redactionCount: 6,
    });
  });

  it("redacts labeled and nested secrets without treating token budgets as credentials", () => {
    const result = redactSensitivePayload({
      maxTokens: 4_096,
      inputTokens: 12,
      modelId: "model password=hunter2",
      nested: {
        refreshToken: "opaque-value",
        note: "api_key='top-secret'",
      },
    });

    expect(result.payload).toEqual({
      maxTokens: 4_096,
      inputTokens: 12,
      modelId: "model password: [REDACTED]",
      nested: {
        refreshToken: "[REDACTED]",
        note: "api_key: [REDACTED]",
      },
    });
    expect(result.redaction.redactionCount).toBe(3);
  });

  it("redacts complete private-key blocks", () => {
    const value = [
      "before",
      "-----BEGIN PRIVATE KEY-----",
      "not-a-real-key",
      "-----END PRIVATE KEY-----",
      "after",
    ].join("\n");

    expect(redactSensitiveText(value).value).toBe(
      "before\n[REDACTED_PRIVATE_KEY]\nafter",
    );
  });
});

describe("run event durability boundary", () => {
  it("does not accept an event when its durable pre-append hook fails", () => {
    const store = new InMemoryRunStore({
      beforeAppend: () => {
        throw new Error("journal unavailable");
      },
    });
    const run = store.createRun({
      capabilityId: "test",
      taskId: "task",
      workspaceId: "workspace",
      goal: "test durability",
      budget: createDefaultRunBudget(),
    });
    expect(() => store.appendEvent(run.id, {
      type: "action_proposed",
      actor: { kind: "runtime", id: "test" },
      payload: { summary: "mutating action proposed" },
    })).toThrow("journal unavailable");
    expect(store.listEvents(run.id)).toEqual([]);
  });
});
