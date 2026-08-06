import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "bun:test";

import {
  builtCli,
  cliEnvironment,
  createControlledCodex,
  createFixtureRepository,
  parseJsonLines,
  readInvocationLog,
  runCli,
} from "./cli-e2e-lib.mjs";

const fixtureRoots = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-cli-e2e-"));
  fixtureRoots.push(root);
  const stateHome = path.join(root, "state");
  const invocationLog = path.join(root, "codex-invocations.jsonl");
  const repositoryPath = await createFixtureRepository(root);
  const binRoot = await createControlledCodex(root);
  return {
    root,
    stateHome,
    invocationLog,
    repositoryPath,
    binRoot,
    env: (mode = "action") =>
      cliEnvironment({ stateHome, binRoot, mode, invocationLog }),
  };
}

test("executable reports stable help, version, and invalid-argument exits", async () => {
  const current = await fixture();
  const help = await runCli(builtCli, ["--help"], { env: current.env() });
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: orynt/);
  const version = await runCli(builtCli, ["--version"], { env: current.env() });
  assert.equal(version.code, 0);
  assert.match(version.stdout, /^0\.1\.0\s*$/u);
  const invalid = await runCli(builtCli, ["--unsafe"], { env: current.env() });
  assert.equal(invalid.code, 2);
  assert.match(invalid.stdout, /Unknown option/);
  assert.equal((await readInvocationLog(current.invocationLog)).length, 0);
});

test("read-only command routing stays inside isolated state", async () => {
  const current = await fixture();
  const commands = [
    [["setup", "--check", "--json"], /"ready":true/u],
    [["doctor", "--json"], /"kind": "orynt_doctor_report"/u],
    [["usage", "--json"], /"kind": "orynt_provider_usage"/u],
    [["browser", "doctor"], /browser doctor/u],
    [["skills"], /Usage: orynt skills/u],
    [["improve", "status"], /"mode": "shadow_review"/u],
    [["intelligence", "status", "--json"], /"schemaVersion"/u],
    [["assets"], /Usage: orynt assets generate/u],
  ];
  for (const [argv, expected] of commands) {
    const result = await runCli(builtCli, argv, {
      cwd: current.repositoryPath,
      env: current.env(),
    });
    assert.equal(result.code, 0, `${argv.join(" ")}\n${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, expected);
    assert.doesNotMatch(result.stdout, /private@example\.test/u);
  }
  await access(path.join(current.stateHome, "orynt"));
});

test("headless execution fails closed before creating a run", async () => {
  const current = await fixture();
  const missingGrant = await runCli(
    builtCli,
    ["run", "--jsonl", "fix", "it"],
    { cwd: current.repositoryPath, env: current.env("clarify") },
  );
  assert.equal(missingGrant.code, 2);
  assert.match(missingGrant.stdout, /--approve-once/);
  assert.equal((await readInvocationLog(current.invocationLog)).length, 0);

  const ambiguous = await runCli(
    builtCli,
    ["run", "--jsonl", "--approve-once", "fix", "it"],
    { cwd: current.repositoryPath, env: current.env("clarify") },
  );
  assert.equal(ambiguous.code, 2, ambiguous.stderr);
  const lines = parseJsonLines(ambiguous.stdout);
  assert.equal(lines.at(-1)?.code, "PROMPT_CLARIFICATION_REQUIRED");
  await assert.rejects(access(path.join(current.stateHome, "orynt", "artifacts")));
});

test("headless JSONL crosses planner, approval, sandbox, verifier, and artifacts", async () => {
  const current = await fixture();
  const goal = [
    "In this disposable fixture repository, edit only packages/value.txt",
    "so it contains exactly deterministic cli e2e pass, then run bun run scripts/pass.mjs.",
  ].join(" ");
  const result = await runCli(
    builtCli,
    ["run", "--jsonl", "--approve-once", "-C", current.repositoryPath, goal],
    {
      cwd: current.repositoryPath,
      env: current.env("action"),
      timeoutMs: 180_000,
    },
  );
  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  const lines = parseJsonLines(result.stdout);
  assert.ok(lines.length > 2);
  assert.ok(lines.slice(0, -1).every(({ kind }) => kind === "event"));
  const final = lines.at(-1);
  assert.equal(final.kind, "result");
  assert.equal(final.status, "pass");
  assert.ok(path.isAbsolute(final.artifactManifestPath));
  const manifest = JSON.parse(await readFile(final.artifactManifestPath, "utf8"));
  assert.ok(manifest.eventTypes.includes("codex_execution_approved"));
  assert.ok(manifest.eventTypes.includes("verification_passed"));
  assert.equal(manifest.artifacts.repositoryDiff?.kind, "repository_diff");
  const repositoryDiff = JSON.parse(
    await readFile(manifest.artifacts.repositoryDiff.path, "utf8"),
  );
  assert.deepEqual(repositoryDiff.totals, {
    files: 1,
    additions: 1,
    deletions: 1,
    binaryFiles: 0,
  });
  assert.match(
    repositoryDiff.files[0]?.patch ?? "",
    /-initial value[\s\S]*\+deterministic cli e2e pass/u,
  );
  assert.equal(
    await readFile(path.join(current.repositoryPath, "packages", "value.txt"), "utf8"),
    "initial value\n",
    "source checkout must stay immutable",
  );
});
