#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const evidencePath = path.join(
  repositoryRoot,
  "docs",
  "release",
  "evidence",
  "cli-live-browser-v1.json",
);
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
const digest = await trackedSourceDigest();
const recordedAt = Date.parse(evidence.recordedAt);
const now = Date.now();

if (
  evidence.schemaVersion !== 1 ||
  evidence.suite !== "cli_live_codex_browser" ||
  evidence.confirmedLive !== true ||
  evidence.synthetic !== false ||
  evidence.provider !== "codex" ||
  evidence.transport !== "app_server" ||
  evidence.browser !== "real_isolated_chrome_cdp" ||
  evidence.scenarioCount !== 12 ||
  evidence.passedScenarioCount !== 12 ||
  evidence.unsafeActionCount !== 0 ||
  evidence.gatewayEvidenceCount < 12 ||
  evidence.passed !== true ||
  !Array.isArray(evidence.results) ||
  evidence.results.length !== 12 ||
  evidence.results.some((result) => result.passed !== true) ||
  evidence.sourceDigest !== digest
  || !Number.isFinite(recordedAt)
  || recordedAt > now + 5 * 60_000
  || now - recordedAt > 7 * 24 * 60 * 60 * 1_000
) {
  throw new Error(
    "Live Codex + Chrome release evidence is missing, failed, or stale. Rerun with --confirm-live.",
  );
}
process.stdout.write(`Live browser evidence is current: ${evidencePath}\n`);

async function trackedSourceDigest() {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 },
  );
  const files = Buffer.from(stdout).toString("utf8").split("\0").filter(Boolean)
    .filter((file) => !file.startsWith("docs/release/evidence/"));
  const digest = createHash("sha256");
  for (const file of files.sort()) {
    digest.update(file).update("\0");
    const content = await readFile(path.join(repositoryRoot, file)).catch(
      (error) => {
        if (error?.code === "ENOENT") return Buffer.from("<deleted>");
        throw error;
      },
    );
    digest.update(content).update("\0");
  }
  return digest.digest("hex");
}
