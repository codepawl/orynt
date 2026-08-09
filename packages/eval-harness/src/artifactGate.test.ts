import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { evaluateControlledRunArtifacts, evaluateReleaseArtifacts } from "./artifactGate";

async function fixture(trace: unknown) {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-artifact-gate-"));
  await writeFile(path.join(root, "cognitive-trace.json"), JSON.stringify(trace));
  const manifest = path.join(root, "manifest.json");
  await writeFile(manifest, JSON.stringify({ schemaVersion: 2, artifacts: [{ kind: "cognitive_trace", path: "cognitive-trace.json" }] }));
  return manifest;
}

describe("controlled-run artifact gate", () => {
  it("accepts a finalized failed run without requiring pass-only cognitive evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-artifact-failure-"));
    await writeFile(
      path.join(root, "run-events.json"),
      JSON.stringify([
        { type: "run_started" },
        { type: "verification_finished" },
        { type: "run_finished" },
      ]),
    );
    const manifestPath = path.join(root, "artifact-manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 2,
        status: "fail",
        outcome: {
          status: "fail",
          stage: "verification",
          classification: "verification",
          code: "validation_failed",
        },
        artifacts: [{ kind: "event_log", path: "run-events.json" }],
      }),
    );

    expect(await evaluateControlledRunArtifacts(manifestPath)).toEqual({
      passed: true,
      failures: [],
    });

    await writeFile(
      path.join(root, "run-events.json"),
      JSON.stringify([{ type: "run_started" }]),
    );
    const incomplete = await evaluateControlledRunArtifacts(manifestPath);
    expect(incomplete.failures.map(({ code }) => code)).toContain(
      "failure_terminal_event_missing",
    );
  });

  it("accepts ordered, approved, verified and budget-compliant evidence", async () => {
    const manifest = await fixture({
      revision: 3,
      status: "completed",
      events: [
        { revision: 1, type: "approval_requested" },
        { revision: 2, type: "approval.approved" },
        { revision: 3, type: "action.dispatched" },
        { revision: 4, type: "verification.completed" },
        { revision: 5, type: "run.completed" },
      ],
      verification: { status: "pass" },
      learning: { evidenceRefs: ["verifier.json"] },
      usage: { steps: 1, modelTokens: 10, toolCalls: 1 },
      budget: { maxSteps: 2, maxModelTokens: 20 },
    });
    expect(await evaluateControlledRunArtifacts(manifest)).toEqual({ passed: true, failures: [] });
  });

  it("rejects a completed trace with no execution lifecycle", async () => {
    const manifest = await fixture({
      revision: 0,
      status: "completed",
      events: [],
      verification: { status: "pass" },
    });
    const result = await evaluateControlledRunArtifacts(manifest);
    expect(result.passed).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "execution_evidence_missing", "approval_before_use", "event_sequence_incomplete",
    ]));
  });

  it("fails closed for execution before approval and leaked nonce", async () => {
    const manifest = await fixture({
      revision: 2,
      status: "completed",
      events: [
        { revision: 1, type: "action.dispatched" },
        { revision: 0, type: "approval.approved" },
      ],
      approval: { status: "approved", nonce: "private" },
      verification: { status: "fail" },
    });
    const result = await evaluateControlledRunArtifacts(manifest);
    expect(result.passed).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual(expect.arrayContaining([
      "revision_order", "approval_before_use", "verifier_pass", "private_nonce_exposed",
    ]));
  });

  it("requires recomputable v4 artifact metadata for release", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "orynt-artifact-release-"));
    const tracePath = path.join(root, "cognitive-trace.json");
    await writeFile(tracePath, JSON.stringify({
      revision: 5,
      status: "completed",
      events: [
        { revision: 1, type: "approval.requested" },
        { revision: 2, type: "approval.approved" },
        { revision: 3, type: "action.dispatched" },
        { revision: 4, type: "verification.completed" },
        { revision: 5, type: "run.completed" },
      ],
      verification: { status: "pass" },
    }));
    const memoryPath = path.join(root, "memory-retrieval.json");
    await writeFile(memoryPath, JSON.stringify({ items: [] }));
    const entry = async (filePath: string) => {
      const bytes = await readFile(filePath);
      return {
        path: path.basename(filePath),
        sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        byteLength: bytes.byteLength,
        mediaType: "application/json",
        redaction: "redacted" as const,
      };
    };
    const manifestPath = path.join(root, "artifact-manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 4,
      artifacts: {
        cognitiveTrace: await entry(tracePath),
        memoryRetrieval: await entry(memoryPath),
      },
      selectedAgentSkills: null,
    }));
    expect(await evaluateReleaseArtifacts(manifestPath)).toEqual({ passed: true, failures: [] });

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.artifacts.cognitiveTrace.sha256 = `sha256:${"0".repeat(64)}`;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const corrupted = await evaluateReleaseArtifacts(manifestPath);
    expect(corrupted.failures.map((failure) => failure.code)).toContain("artifact_integrity");
  });
});
