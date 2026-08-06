#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import path from "node:path";

import { releaseSourceDigest } from "./release-source-digest.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const evidenceRoot = path.join(repositoryRoot, "docs", "release", "evidence");
const sourceDigest = await releaseSourceDigest(repositoryRoot);
const maximumAgeMs = 7 * 24 * 60 * 60 * 1_000;
const now = Date.now();
const specifications = [
  {
    file: "contextvm-live-v1.json",
    suite: "contextvm_live",
    validate: (value) =>
      value.synthetic === false &&
      value.executable === "packaged_npm_cli" &&
      value.unsafeActionCount === 0 &&
      Array.isArray(value.transports) &&
      value.transports.join(",") ===
        "codex-cli,codex-app-server,openai-responses" &&
      Array.isArray(value.results) &&
      value.results.length === 3 &&
      value.results.every((result) =>
        result.synthetic === false &&
        result.executable === "packaged_npm_cli" &&
        result.passed === true &&
        result.status === "ready" &&
        result.verification === "pass" &&
        typeof result.contextHash === "string" &&
        /^[0-9a-f]{64}$/u.test(result.contextHash) &&
        Array.isArray(result.contextPackIds) &&
        result.contextPackIds.length >= 1
      ),
  },
  {
    file: "cli-live-e2e-v1.json",
    suite: "cli_live_e2e",
    validate: (value) =>
      value.synthetic === false &&
      value.executable === "packaged_npm_cli" &&
      value.diagnostic === false &&
      value.releaseEligible === true &&
      value.scenarioCount === 5 &&
      value.passedScenarioCount === 5 &&
      value.unsafeActionCount === 0 &&
      Array.isArray(value.results) &&
      value.results.length === 5 &&
      value.results.every((result) => result.passed === true) &&
      value.results.some(
        (result) =>
          result.id === "model-tier-doctor" &&
          result.readyTiers?.join(",") === "light,medium,heavy",
      ) &&
      value.results.some(
        (result) =>
          result.id === "verified-repository-mutation" &&
          result.approvalRecorded === true &&
          result.verificationStatus === "pass" &&
          result.repositoryDiffRecorded === true,
      ) &&
      value.results.some(
        (result) =>
          result.id === "read-only-repository-answer" &&
          result.transport === "linux_pty" &&
          result.headingObserved === true &&
          result.composerReturned === true &&
          result.cleanExit === true &&
          result.sourceChanged === false,
      ) &&
      value.results.some(
        (result) =>
          result.id === "browser-allow-deny-and-evidence" &&
          result.cliBrowserLifecycle === true &&
          result.denyVerified === true &&
          result.unsafeActionCount === 0,
      ),
  },
  {
    file: "prompt-understanding-live-v1.json",
    suite: "prompt_understanding_live",
    validate: (value) => value.gates?.passed === true,
  },
];

for (const specification of specifications) {
  const filePath = path.join(evidenceRoot, specification.file);
  const evidence = JSON.parse(await readFile(filePath, "utf8"));
  const recordedAt = Date.parse(evidence.recordedAt);
  if (
    evidence.schemaVersion !== 1 ||
    evidence.suite !== specification.suite ||
    evidence.confirmedLive !== true ||
    evidence.passed !== true ||
    evidence.sourceDigest !== sourceDigest ||
    !Number.isFinite(recordedAt) ||
    recordedAt > now + 5 * 60_000 ||
    now - recordedAt > maximumAgeMs ||
    !specification.validate(evidence)
  ) {
    throw new Error(
      `Live release evidence is missing, failed, expired, or source-stale: ${specification.file}`,
    );
  }
}
process.stdout.write("All source-bound live release evidence is current.\n");
