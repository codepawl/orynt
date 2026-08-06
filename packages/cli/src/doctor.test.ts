import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "bun:test";
import { createDefaultModelTierConfiguration } from "@codepawl/shared";

import {
  collectDoctorReport,
  doctorExitCode,
  renderDoctorReport,
  type DoctorReportV1,
} from "./doctor";
import type { CodexEnvironmentProbe } from "./codexSetup";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

async function fixture(): Promise<{
  root: string;
  repositoryPath: string;
  stateRoot: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "orynt-doctor-test-"));
  temporaryRoots.push(root);
  const repositoryPath = path.join(root, "repository");
  const stateRoot = path.join(root, "state", "orynt");
  await mkdir(repositoryPath, { recursive: true });
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await execFileAsync("git", ["init", "--quiet"], { cwd: repositoryPath });
  await execFileAsync(
    "git",
    ["config", "user.email", "orynt-doctor@example.test"],
    { cwd: repositoryPath },
  );
  await execFileAsync(
    "git",
    ["config", "user.name", "Orynt Doctor"],
    { cwd: repositoryPath },
  );
  await writeFile(path.join(repositoryPath, "README.md"), "# Doctor fixture\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: repositoryPath });
  await execFileAsync("git", ["commit", "--quiet", "-m", "fixture"], {
    cwd: repositoryPath,
  });
  return { root, repositoryPath, stateRoot };
}

function readyCodex(): CodexEnvironmentProbe {
  return {
    status: {
      ready: true,
      code: "CODEX_READY",
      detail: "Logged in using ChatGPT · app-server ready",
      nextAction: "none",
      provider: "codex",
      transport: "app_server",
      version: "0.146.0",
      authenticated: true,
      dynamicTools: true,
    },
    stages: [
      {
        id: "cli",
        label: "Codex CLI",
        status: "pass",
        summary: "0.146.0",
        evidence: { version: "0.146.0" },
        cause: null,
        remediation: null,
        durationMs: 2,
      },
      {
        id: "app_server",
        label: "App server",
        status: "pass",
        summary: "stdio transport ready",
        evidence: { transport: "stdio" },
        cause: null,
        remediation: null,
        durationMs: 2,
      },
      {
        id: "authentication",
        label: "Authentication",
        status: "pass",
        summary: "Logged in using ChatGPT",
        evidence: { authenticated: true },
        cause: null,
        remediation: null,
        durationMs: 2,
      },
    ],
  };
}

function selectableModels() {
  return [
    {
      id: "gpt-5.6-luna",
      label: "Luna",
      supportedThinkingEfforts: ["medium" as const],
    },
    {
      id: "gpt-5.6-terra",
      label: "Terra",
      supportedThinkingEfforts: ["medium" as const],
    },
    {
      id: "gpt-5.6-sol",
      label: "Sol",
      supportedThinkingEfforts: ["high" as const],
    },
  ];
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

describe("Orynt doctor", () => {
  it("collects core readiness, configured tiers, and optional status", async () => {
    const current = await fixture();
    const report = await collectDoctorReport(
      {
        repositoryPath: current.repositoryPath,
        stateRoot: current.stateRoot,
        isTTY: true,
        color: false,
        term: "xterm-256color",
        width: 96,
        height: 32,
        modelTierConfiguration: createDefaultModelTierConfiguration(),
      },
      {
        probeCodexEnvironment: async () => readyCodex(),
        listModels: async () => selectableModels(),
        loadPreferences: async () => ({
          schemaVersion: 10,
          activityDetails: "important",
          appearance: {
            color: true,
            motion: true,
            richText: true,
            themeId: "quiet-studio",
          },
          shortcuts: {
            clear: ["ctrl+l"],
            undo: ["ctrl+z"],
            redo: ["ctrl+y"],
          },
          statusline: {
            enabled: true,
            profile: true,
            role: true,
            model: true,
            effort: true,
            shortcuts: false,
          },
        }),
        intelligenceStatus: async () => ({
          health: "empty",
          memory: { schemaVersion: 3, revision: 0, itemCount: 0 },
          improvements: {
            schemaVersion: 2,
            revision: 0,
            activeTargetCount: 0,
          },
        }),
      },
    );

    expect(report.status).toBe("healthy");
    expect(doctorExitCode(report)).toBe(0);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace.repository",
          status: "pass",
        }),
        expect.objectContaining({
          id: "storage.state",
          status: "pass",
        }),
        expect.objectContaining({
          id: "provider.tier.heavy",
          summary: "gpt-5.6-sol · high",
          status: "pass",
        }),
        expect.objectContaining({
          id: "optional.browser",
          status: "skip",
        }),
      ]),
    );
    const human = renderDoctorReport(report, {
      color: false,
      width: 96,
    });
    expect(human).toContain("Orynt doctor");
    expect(human).toContain("Healthy");
    expect(human).toContain("Live model execution was not tested");
    const narrow = renderDoctorReport(report, {
      color: false,
      width: 36,
    });
    expect(
      narrow.split("\n").every((line) => line.length <= 36),
    ).toBe(true);
  });

  it("warns for dirty source changes without failing core health", async () => {
    const current = await fixture();
    await writeFile(path.join(current.repositoryPath, "dirty.txt"), "dirty\n");
    const report = await collectDoctorReport(
      {
        repositoryPath: current.repositoryPath,
        stateRoot: current.stateRoot,
        isTTY: false,
        color: false,
      },
      {
        probeCodexEnvironment: async () => readyCodex(),
        listModels: async () => selectableModels(),
        intelligenceStatus: async () => ({
          health: "empty",
          memory: { schemaVersion: 3, revision: 0, itemCount: 0 },
          improvements: {
            schemaVersion: 2,
            revision: 0,
            activeTargetCount: 0,
          },
        }),
      },
    );

    expect(report.status).toBe("degraded");
    expect(doctorExitCode(report)).toBe(0);
    const dirty = report.checks.find(
      ({ id }) => id === "workspace.changes",
    );
    expect(dirty).toMatchObject({
      status: "warn",
      required: false,
      evidence: { changedEntries: 1 },
    });
    expect(renderDoctorReport(report, { color: false })).toContain(
      "isolated worktree",
    );
  });

  it("fails required provider checks and skips dependent catalog checks", async () => {
    const current = await fixture();
    const environment = readyCodex();
    environment.status = {
      ...environment.status,
      ready: false,
      code: "CODEX_AUTH_REQUIRED",
      detail: "No authenticated Codex session.",
      nextAction: "login",
      authenticated: false,
      dynamicTools: false,
      remediationCommand: "orynt setup",
    };
    environment.stages[2] = {
      ...environment.stages[2]!,
      status: "fail",
      summary: "sign-in required",
      cause: "No authenticated Codex session.",
      remediation: {
        description: "Authenticate Codex through Orynt setup.",
        command: "orynt setup",
      },
    };
    const listModels = vi.fn(async () => selectableModels());
    const report = await collectDoctorReport(
      {
        repositoryPath: current.repositoryPath,
        stateRoot: current.stateRoot,
        isTTY: false,
        color: false,
      },
      {
        probeCodexEnvironment: async () => environment,
        listModels,
        intelligenceStatus: async () => ({
          health: "empty",
          memory: { schemaVersion: 3, revision: 0, itemCount: 0 },
          improvements: {
            schemaVersion: 2,
            revision: 0,
            activeTargetCount: 0,
          },
        }),
      },
    );

    expect(report.status).toBe("unhealthy");
    expect(doctorExitCode(report)).toBe(1);
    expect(listModels).not.toHaveBeenCalled();
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "provider.authentication",
          status: "fail",
        }),
        expect.objectContaining({
          id: "provider.catalog",
          status: "skip",
        }),
      ]),
    );
  });

  it("keeps diagnosing after repository and local-state failures", async () => {
    const current = await fixture();
    const report = await collectDoctorReport(
      {
        repositoryPath: path.join(current.root, "missing-repository"),
        stateRoot: current.stateRoot,
        isTTY: false,
        color: false,
      },
      {
        probeCodexEnvironment: async () => readyCodex(),
        listModels: async () => selectableModels(),
        loadPreferences: async () => {
          throw new Error("Invalid Orynt CLI preferences");
        },
        intelligenceStatus: async () => ({
          health: "empty",
          memory: { schemaVersion: 3, revision: 0, itemCount: 0 },
          improvements: {
            schemaVersion: 2,
            revision: 0,
            activeTargetCount: 0,
          },
        }),
      },
    );

    expect(doctorExitCode(report)).toBe(1);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace.repository",
          status: "fail",
        }),
        expect.objectContaining({
          id: "storage.state",
          status: "fail",
          cause: "Invalid Orynt CLI preferences",
        }),
        expect.objectContaining({
          id: "provider.catalog",
          status: "pass",
        }),
      ]),
    );
  });

  it("continues all explicitly confirmed live tier probes", async () => {
    const current = await fixture();
    const runLiveTier = vi.fn(async (tier: string) => {
      if (tier === "medium") throw new Error("quota unavailable");
    });
    const report = await collectDoctorReport(
      {
        repositoryPath: current.repositoryPath,
        stateRoot: current.stateRoot,
        isTTY: false,
        color: false,
        live: true,
      },
      {
        probeCodexEnvironment: async () => readyCodex(),
        listModels: async () => selectableModels(),
        runLiveTier,
        intelligenceStatus: async () => ({
          health: "empty",
          memory: { schemaVersion: 3, revision: 0, itemCount: 0 },
          improvements: {
            schemaVersion: 2,
            revision: 0,
            activeTargetCount: 0,
          },
        }),
      },
    );

    expect(runLiveTier).toHaveBeenCalledTimes(3);
    expect(report.status).toBe("unhealthy");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "live.tier.medium",
          status: "fail",
          cause: "quota unavailable",
        }),
        expect.objectContaining({
          id: "live.tier.heavy",
          status: "pass",
        }),
      ]),
    );
  });

  it("escapes terminal controls in human diagnostics", () => {
    const malicious = "\u001b]52;c;owned\u0007\r\n\u202espoof";
    const report: DoctorReportV1 = {
      schemaVersion: 1,
      kind: "orynt_doctor_report",
      generatedAt: "2026-08-04T00:00:00.000Z",
      status: "unhealthy",
      summary: {
        passed: 0,
        warnings: 0,
        failed: 1,
        skipped: 0,
        durationMs: 1,
      },
      context: {
        oryntVersion: "0.1.0",
        bunVersion: "1.3.14",
        platform: "linux",
        architecture: "x64",
        repositoryPath: "/work/orynt",
        stateRoot: "/state/orynt",
      },
      checks: [{
        id: "provider.probe",
        group: "provider",
        label: "Codex CLI",
        status: "fail",
        required: true,
        summary: malicious,
        evidence: { detail: malicious },
        cause: malicious,
        remediation: null,
        durationMs: 1,
      }],
    };
    const output = renderDoctorReport(report, {
      color: false,
      verbose: true,
    });
    expect(output).not.toContain("\u001b");
    expect(output).not.toContain("\u0007");
    expect(output).not.toContain("\r");
    expect(output).not.toContain("\u202e");
    expect(output).toContain("\\u001b]52;c;owned");
  });
});
