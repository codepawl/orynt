import { describe, expect, it } from "bun:test";

import {
  CONTEXTVM_READINESS_SCHEMA_V2,
  parseContextVmReadinessOutput,
} from "./contextVmReadiness";

describe("ContextVM production readiness output", () => {
  it("uses a recursively strict Structured Outputs schema", () => {
    const inspect = (value: unknown): void => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const record = value as Record<string, unknown>;
      if (record.type === "object") {
        const properties = Object.keys(
          record.properties as Record<string, unknown>,
        ).sort();
        expect([...(record.required as string[])].sort()).toEqual(properties);
        expect(record.additionalProperties).toBe(false);
      }
      for (const nested of Object.values(record)) {
        if (Array.isArray(nested)) {
          nested.forEach(inspect);
        } else {
          inspect(nested);
        }
      }
    };
    inspect(CONTEXTVM_READINESS_SCHEMA_V2);
  });

  it("accepts readiness-only READY and bounded NEED_MEMORY", () => {
    expect(parseContextVmReadinessOutput(
      '{"schemaVersion":2,"status":"READY","missing":null}',
    )).toEqual({ schemaVersion: 2, status: "READY" });
    expect(parseContextVmReadinessOutput(JSON.stringify({
      schemaVersion: 2,
      status: "NEED_MEMORY",
      missing: [{
        kind: "repository_revision",
        entities: ["HEAD"],
        relation: null,
        timeRange: null,
        requiredSourceTypes: ["artifact"],
        minimumEvidenceQuality: "verified",
      }],
    }))).toMatchObject({
      schemaVersion: 2,
      status: "NEED_MEMORY",
    });
  });

  it("rejects malformed JSON, answers, and unknown fields", () => {
    expect(() => parseContextVmReadinessOutput("READY")).toThrow(
      "malformed JSON",
    );
    expect(() => parseContextVmReadinessOutput(JSON.stringify({
      schemaVersion: 2,
      status: "READY",
      missing: null,
      answer: "execute",
    }))).toThrow();
    expect(() => parseContextVmReadinessOutput(JSON.stringify({
      schemaVersion: 2,
      status: "READY",
      missing: [],
    }))).toThrow("READY requires missing to be null");
    expect(() => parseContextVmReadinessOutput(JSON.stringify({
      schemaVersion: 2,
      status: "NEED_MEMORY",
      missing: null,
    }))).toThrow("NEED_MEMORY requires a missing array");
  });
});
