import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";
import { GitRepositorySandboxManager } from "@codepawl/repository-sandbox";
import {
  createConservativeCodingApprenticePolicy,
  createDefaultModelTierConfiguration,
  redactSensitivePayload,
  type ModelTier,
  type ModelTierConfigurationV1,
} from "@codepawl/shared";

import { readBrowserSessionDescriptor } from "./browser.js";
import type {
  CodexEnvironmentProbe,
  CodexProbeStage,
} from "./codexSetup.js";
import type { CliPreferences } from "./state.js";
import {
  type TerminalTheme,
  type TerminalThemeId,
} from "./terminal-theme.js";
import {
  createTerminalDesignSystem,
  wrapTerminalParagraph,
} from "./terminal-presentation.js";
import { terminalSafeText } from "./ui.js";
import type { CliModelOption } from "./ui.js";
import { ORYNT_VERSION } from "./version.js";

const execFileAsync = promisify(execFile);
const REQUIRED_BUN_VERSION = "1.3.14";
const GROUP_ORDER = [
  "runtime",
  "workspace",
  "storage",
  "provider",
  "optional",
  "live",
] as const;

export type DoctorGroup = (typeof GROUP_ORDER)[number];
export type DoctorCheckStatus = "pass" | "warn" | "fail" | "skip";
export type DoctorStatus = "healthy" | "degraded" | "unhealthy";

export type DoctorRemediation = {
  description: string;
  command: string | null;
};

export type DoctorCheckV1 = {
  id: string;
  group: DoctorGroup;
  label: string;
  status: DoctorCheckStatus;
  required: boolean;
  summary: string;
  evidence: Record<string, string | number | boolean | null>;
  cause: string | null;
  remediation: DoctorRemediation | null;
  durationMs: number;
};

export type DoctorReportV1 = {
  schemaVersion: 1;
  kind: "orynt_doctor_report";
  generatedAt: string;
  status: DoctorStatus;
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  context: {
    oryntVersion: string;
    bunVersion: string;
    platform: NodeJS.Platform;
    architecture: string;
    repositoryPath: string;
    stateRoot: string;
  };
  checks: DoctorCheckV1[];
};

export type DoctorRequest = {
  repositoryPath: string;
  modelTierConfiguration?: ModelTierConfigurationV1;
  live?: boolean;
  verbose?: boolean;
};

export type DoctorCollectorInput = DoctorRequest & {
  stateRoot: string;
  isTTY: boolean;
  color: boolean;
  term?: string;
  width?: number;
  height?: number;
  themeId?: TerminalThemeId;
  now?: () => number;
};

export type DoctorCollectorDependencies = {
  probeCodexEnvironment: () => Promise<CodexEnvironmentProbe>;
  listModels: () => Promise<CliModelOption[]>;
  loadPreferences?: () => Promise<CliPreferences>;
  intelligenceStatus?: () => Promise<{
    health: string;
    memory: { schemaVersion: number; revision: number; itemCount: number };
    improvements: {
      schemaVersion: number;
      revision: number;
      activeTargetCount: number;
    };
  }>;
  codeIntelStatus?: () => {
    enabled: boolean;
    failure?: string;
    sessions: number;
    state?: string;
    serverFingerprint?: string;
  };
  runLiveTier?: (
    tier: ModelTier,
    binding: ModelTierConfigurationV1["tiers"][ModelTier],
  ) => Promise<void>;
};

function elapsed(startedAt: number, now: () => number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

function safeDetail(value: unknown, fallback: string): string {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const redacted = redactSensitivePayload(raw).payload;
  const text = typeof redacted === "string" ? redacted : fallback;
  return text.replace(/\s+/gu, " ").trim().slice(0, 1_000) || fallback;
}

function check(
  input: Omit<DoctorCheckV1, "durationMs"> & { durationMs?: number },
): DoctorCheckV1 {
  return { ...input, durationMs: input.durationMs ?? 0 };
}

function skipped(
  id: string,
  group: DoctorGroup,
  label: string,
  summary: string,
  cause: string,
  required = true,
): DoctorCheckV1 {
  return check({
    id,
    group,
    label,
    status: "skip",
    required,
    summary,
    evidence: {},
    cause,
    remediation: null,
  });
}

function providerCheck(stage: CodexProbeStage): DoctorCheckV1 {
  return check({
    id: `provider.${stage.id}`,
    group: "provider",
    label: stage.label,
    status: stage.status,
    required: true,
    summary: stage.summary,
    evidence: stage.evidence,
    cause: stage.cause,
    remediation: stage.remediation,
    durationMs: stage.durationMs,
  });
}

function porcelainEntryCount(output: string): number {
  const records = output.split("\0").filter(Boolean);
  let count = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    count += 1;
    if (/[RC]/u.test(record.slice(0, 2))) index += 1;
  }
  return count;
}

async function runtimeChecks(
  input: DoctorCollectorInput,
  now: () => number,
): Promise<DoctorCheckV1[]> {
  const bunStarted = now();
  const bunVersion = process.versions.bun ?? "0.0.0";
  const bunParts = bunVersion.split(".").map((part) => Number.parseInt(part, 10));
  const requiredParts = REQUIRED_BUN_VERSION.split(".").map((part) =>
    Number.parseInt(part, 10)
  );
  const bunReady = bunParts.some((part, index) =>
    part > (requiredParts[index] ?? 0) &&
    bunParts.slice(0, index).every(
      (earlier, earlierIndex) => earlier === requiredParts[earlierIndex],
    )
  ) || bunParts.every((part, index) => part === requiredParts[index]);
  const terminalWarning = input.isTTY && !input.term;
  return [
    check({
      id: "runtime.orynt",
      group: "runtime",
      label: "Orynt",
      status: "pass",
      required: true,
      summary: `v${ORYNT_VERSION}`,
      evidence: { version: ORYNT_VERSION },
      cause: null,
      remediation: null,
    }),
    check({
      id: "runtime.bun",
      group: "runtime",
      label: "Bun",
      status: bunReady ? "pass" : "fail",
      required: true,
      summary: `${bunVersion} · ${process.platform} ${process.arch}`,
      evidence: {
        version: bunVersion,
        requiredVersion: REQUIRED_BUN_VERSION,
        platform: process.platform,
        architecture: process.arch,
      },
      cause:
        bunReady
          ? null
          : `Orynt requires Bun ${REQUIRED_BUN_VERSION} or newer.`,
      remediation:
        bunReady
          ? null
          : {
              description: `Install Bun ${REQUIRED_BUN_VERSION} or newer, then rerun Orynt doctor.`,
              command: null,
            },
      durationMs: elapsed(bunStarted, now),
    }),
    check({
      id: "runtime.terminal",
      group: "runtime",
      label: "Terminal",
      status: terminalWarning ? "warn" : "pass",
      required: false,
      summary: input.isTTY
        ? `interactive · ${input.color ? "ANSI color" : "plain"}${input.term ? ` · ${input.term}` : ""}`
        : "non-interactive · plain output",
      evidence: {
        interactive: input.isTTY,
        color: input.color,
        term: input.term ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        theme: input.themeId ?? null,
      },
      cause: terminalWarning
        ? "TERM is not set for an interactive terminal."
        : null,
      remediation: terminalWarning
        ? {
            description: "Set TERM to a value supported by the active terminal.",
            command: null,
          }
        : null,
    }),
  ];
}

async function workspaceChecks(
  input: DoctorCollectorInput,
  now: () => number,
): Promise<DoctorCheckV1[]> {
  const checks: DoctorCheckV1[] = [];
  const gitStarted = now();
  let gitVersion = "";
  try {
    const { stdout } = await execFileAsync("git", ["--version"], {
      timeout: 10_000,
      maxBuffer: 100_000,
    });
    gitVersion = String(stdout).trim();
    checks.push(check({
      id: "workspace.git",
      group: "workspace",
      label: "Git",
      status: "pass",
      required: true,
      summary: gitVersion || "available",
      evidence: { version: gitVersion || null },
      cause: null,
      remediation: null,
      durationMs: elapsed(gitStarted, now),
    }));
  } catch (error) {
    checks.push(check({
      id: "workspace.git",
      group: "workspace",
      label: "Git",
      status: "fail",
      required: true,
      summary: "not available",
      evidence: {},
      cause: safeDetail(error, "Git is not available on PATH."),
      remediation: {
        description: "Install Git and ensure it is available on PATH.",
        command: "git --version",
      },
      durationMs: elapsed(gitStarted, now),
    }));
    checks.push(
      skipped(
        "workspace.repository",
        "workspace",
        "Repository",
        "not inspected",
        "Git is unavailable.",
      ),
      skipped(
        "workspace.worktree",
        "workspace",
        "Worktree",
        "not inspected",
        "Git is unavailable.",
      ),
      skipped(
        "workspace.changes",
        "workspace",
        "Working tree",
        "not inspected",
        "Git is unavailable.",
        false,
      ),
    );
    return checks;
  }

  const repositoryStarted = now();
  try {
    const sandboxRoot = path.join(os.tmpdir(), "orynt", "repository-sandboxes");
    const policy = createConservativeCodingApprenticePolicy(
      input.repositoryPath,
      sandboxRoot,
    );
    const inspection = await new GitRepositorySandboxManager({
      sandboxRoot,
    }).inspectRepository(
      {
        runId: "doctor",
        taskId: "repository-readiness",
        repositoryPath: input.repositoryPath,
        baseRef: "HEAD",
      },
      policy,
    );
    checks.push(check({
      id: "workspace.repository",
      group: "workspace",
      label: "Repository",
      status: "pass",
      required: true,
      summary: `${inspection.currentBranch ?? "detached HEAD"} · ${inspection.currentCommit.slice(0, 12)}`,
      evidence: {
        requestedPath: input.repositoryPath,
        gitRoot: inspection.gitRoot,
        branch: inspection.currentBranch,
        commit: inspection.currentCommit,
        remoteCount: inspection.remotes.length,
      },
      cause: null,
      remediation: null,
      durationMs: elapsed(repositoryStarted, now),
    }));
    const worktreeStarted = now();
    try {
      await execFileAsync(
        "git",
        ["-C", inspection.gitRoot, "worktree", "list", "--porcelain"],
        { timeout: 10_000, maxBuffer: 2_000_000 },
      );
      checks.push(check({
        id: "workspace.worktree",
        group: "workspace",
        label: "Worktree",
        status: "pass",
        required: true,
        summary: "isolated Git worktrees available",
        evidence: { gitRoot: inspection.gitRoot },
        cause: null,
        remediation: null,
        durationMs: elapsed(worktreeStarted, now),
      }));
    } catch (error) {
      checks.push(check({
        id: "workspace.worktree",
        group: "workspace",
        label: "Worktree",
        status: "fail",
        required: true,
        summary: "Git worktree inspection failed",
        evidence: { gitRoot: inspection.gitRoot },
        cause: safeDetail(error, "Git worktree support is unavailable."),
        remediation: {
          description: "Repair or update Git, then rerun Orynt doctor.",
          command: "git -C <repository-path> worktree list --porcelain",
        },
        durationMs: elapsed(worktreeStarted, now),
      }));
    }
    let changedEntries: number | null = null;
    if (inspection.isDirty) {
      try {
        const { stdout } = await execFileAsync(
          "git",
          [
            "-C",
            inspection.gitRoot,
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
          ],
          { timeout: 10_000, maxBuffer: 2_000_000 },
        );
        changedEntries = porcelainEntryCount(String(stdout));
      } catch {
        // Repository inspection already proved the tree is dirty. The count is
        // useful evidence, but its absence must not hide the warning.
      }
    }
    checks.push(check({
      id: "workspace.changes",
      group: "workspace",
      label: "Working tree",
      status: inspection.isDirty ? "warn" : "pass",
      required: false,
      summary: inspection.isDirty
        ? `${changedEntries ?? "some"} uncommitted change${changedEntries === 1 ? "" : "s"} detected`
        : "clean",
      evidence: {
        dirty: inspection.isDirty,
        changedEntries,
      },
      cause: inspection.isDirty
        ? "Repository actions run from HEAD in an isolated worktree; uncommitted source changes are not copied into that worktree."
        : null,
      remediation: inspection.isDirty
        ? {
            description: "Commit intended inputs before an Orynt repository action, or keep them outside the sandbox intentionally.",
            command: "git status --short",
          }
        : null,
    }));
  } catch (error) {
    const details =
      error instanceof Error &&
      "details" in error &&
      typeof error.details === "object" &&
      error.details !== null
        ? error.details as {
            code?: string;
            message?: string;
            evidence?: string[];
          }
        : undefined;
    checks.push(check({
      id: "workspace.repository",
      group: "workspace",
      label: "Repository",
      status: "fail",
      required: true,
      summary: details?.code?.replaceAll("_", " ") ?? "not ready",
      evidence: {
        requestedPath: input.repositoryPath,
        detail: details?.evidence?.join(" · ") ?? null,
      },
      cause: safeDetail(
        details?.message ?? error,
        "The selected path is not a usable Git repository.",
      ),
      remediation: {
        description: "Choose an existing Git repository with at least one commit.",
        command: "orynt doctor --repo <repository-path>",
      },
      durationMs: elapsed(repositoryStarted, now),
    }));
    checks.push(
      skipped(
        "workspace.worktree",
        "workspace",
        "Worktree",
        "not inspected",
        "Repository inspection failed.",
      ),
      skipped(
        "workspace.changes",
        "workspace",
        "Working tree",
        "not inspected",
        "Repository inspection failed.",
        false,
      ),
    );
  }
  return checks;
}

async function storageChecks(
  input: DoctorCollectorInput,
  dependencies: DoctorCollectorDependencies,
  now: () => number,
): Promise<DoctorCheckV1[]> {
  const checks: DoctorCheckV1[] = [];
  const stateStarted = now();
  let preferences: CliPreferences | undefined;
  try {
    preferences = await dependencies.loadPreferences?.();
    const probeRoot = await mkdtemp(path.join(input.stateRoot, ".doctor-"));
    await rm(probeRoot, { recursive: true, force: true });
    checks.push(check({
      id: "storage.state",
      group: "storage",
      label: "Local state",
      status: "pass",
      required: true,
      summary: `writable${preferences ? ` · preferences v${preferences.schemaVersion}` : ""}`,
      evidence: {
        path: input.stateRoot,
        preferencesSchemaVersion: preferences?.schemaVersion ?? null,
      },
      cause: null,
      remediation: null,
      durationMs: elapsed(stateStarted, now),
    }));
  } catch (error) {
    checks.push(check({
      id: "storage.state",
      group: "storage",
      label: "Local state",
      status: "fail",
      required: true,
      summary: "not usable",
      evidence: { path: input.stateRoot },
      cause: safeDetail(error, "Orynt local state is not readable and writable."),
      remediation: {
        description: "Repair ownership, permissions, or the invalid Orynt preferences file, then rerun doctor.",
        command: null,
      },
      durationMs: elapsed(stateStarted, now),
    }));
  }

  const intelligenceStarted = now();
  try {
    const status = dependencies.intelligenceStatus
      ? await dependencies.intelligenceStatus()
      : await new LocalIntelligenceRuntime(input.stateRoot).status();
    checks.push(check({
      id: "storage.intelligence",
      group: "storage",
      label: "Intelligence",
      status: "pass",
      required: true,
      summary: `${status.health} · ${status.memory.itemCount} memory item(s) · ${status.improvements.activeTargetCount} active improvement(s)`,
      evidence: {
        health: status.health,
        memorySchemaVersion: status.memory.schemaVersion,
        memoryRevision: status.memory.revision,
        memoryItems: status.memory.itemCount,
        improvementSchemaVersion: status.improvements.schemaVersion,
        improvementRevision: status.improvements.revision,
        activeImprovements: status.improvements.activeTargetCount,
      },
      cause: null,
      remediation: null,
      durationMs: elapsed(intelligenceStarted, now),
    }));
  } catch (error) {
    checks.push(check({
      id: "storage.intelligence",
      group: "storage",
      label: "Intelligence",
      status: "fail",
      required: true,
      summary: "canonical state is blocked",
      evidence: { path: input.stateRoot },
      cause: safeDetail(error, "Canonical intelligence state is invalid."),
      remediation: {
        description: "Inspect the local intelligence status before changing or deleting any state.",
        command: "orynt intelligence status --json",
      },
      durationMs: elapsed(intelligenceStarted, now),
    }));
  }

  const tempStarted = now();
  try {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "orynt-doctor-"));
    await rm(temporary, { recursive: true, force: true });
    checks.push(check({
      id: "storage.temp",
      group: "storage",
      label: "Temporary files",
      status: "pass",
      required: true,
      summary: "writable and cleanup succeeded",
      evidence: { path: os.tmpdir() },
      cause: null,
      remediation: null,
      durationMs: elapsed(tempStarted, now),
    }));
  } catch (error) {
    checks.push(check({
      id: "storage.temp",
      group: "storage",
      label: "Temporary files",
      status: "fail",
      required: true,
      summary: "not usable",
      evidence: { path: os.tmpdir() },
      cause: safeDetail(error, "The temporary directory is not writable."),
      remediation: {
        description: "Repair the active temporary directory or configure a writable TMPDIR.",
        command: null,
      },
      durationMs: elapsed(tempStarted, now),
    }));
  }
  return checks;
}

function configuredTierChecks(
  configuration: ModelTierConfigurationV1,
  models: CliModelOption[],
): DoctorCheckV1[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  return (["light", "medium", "heavy"] as const).map((tier) => {
    const binding = configuration.tiers[tier];
    const model = byId.get(binding.modelId);
    const effortSupported =
      model &&
      (
        model.supportedThinkingEfforts.length === 0 ||
        model.supportedThinkingEfforts.includes(binding.thinkingEffort)
      );
    const available = Boolean(model && effortSupported);
    return check({
      id: `provider.tier.${tier}`,
      group: "provider",
      label: `${tier[0]?.toUpperCase()}${tier.slice(1)} tier`,
      status: available ? "pass" : "fail",
      required: true,
      summary: `${binding.modelId} · ${binding.thinkingEffort}`,
      evidence: {
        provider: binding.providerId,
        model: binding.modelId,
        thinkingEffort: binding.thinkingEffort,
        modelAvailable: Boolean(model),
        effortSupported: Boolean(effortSupported),
      },
      cause: available
        ? null
        : model
          ? `The configured thinking effort ${binding.thinkingEffort} is not supported by ${binding.modelId}.`
          : `The configured model ${binding.modelId} is not present in the Codex model catalog.`,
      remediation: available
        ? null
        : {
            description: "Choose an available model and thinking effort in Orynt agent settings.",
            command: null,
          },
    });
  });
}

async function providerChecks(
  input: DoctorCollectorInput,
  dependencies: DoctorCollectorDependencies,
  now: () => number,
): Promise<DoctorCheckV1[]> {
  let environment: CodexEnvironmentProbe;
  try {
    environment = await dependencies.probeCodexEnvironment();
  } catch (error) {
    return [
      check({
        id: "provider.probe",
        group: "provider",
        label: "Codex CLI",
        status: "fail",
        required: true,
        summary: "probe failed",
        evidence: {},
        cause: safeDetail(error, "Could not inspect Codex CLI."),
        remediation: {
          description: "Run the Codex diagnostic command, then rerun Orynt doctor.",
          command: "codex doctor --summary",
        },
      }),
      skipped(
        "provider.catalog",
        "provider",
        "Model catalog",
        "not inspected",
        "Codex environment probe failed.",
      ),
      ...(["light", "medium", "heavy"] as const).map((tier) =>
        skipped(
          `provider.tier.${tier}`,
          "provider",
          `${tier[0]?.toUpperCase()}${tier.slice(1)} tier`,
          "not inspected",
          "Codex model catalog is unavailable.",
        )
      ),
    ];
  }
  const checks = environment.stages.map(providerCheck);
  if (!environment.status.ready) {
    checks.push(
      skipped(
        "provider.catalog",
        "provider",
        "Model catalog",
        "not inspected",
        "Codex CLI is not ready.",
      ),
      ...(["light", "medium", "heavy"] as const).map((tier) =>
        skipped(
          `provider.tier.${tier}`,
          "provider",
          `${tier[0]?.toUpperCase()}${tier.slice(1)} tier`,
          "not inspected",
          "Codex model catalog is unavailable.",
        )
      ),
    );
    return checks;
  }
  const catalogStarted = now();
  try {
    const models = await dependencies.listModels();
    checks.push(check({
      id: "provider.catalog",
      group: "provider",
      label: "Model catalog",
      status: "pass",
      required: true,
      summary: `${models.length} selectable model(s)`,
      evidence: { modelCount: models.length },
      cause: null,
      remediation: null,
      durationMs: elapsed(catalogStarted, now),
    }));
    checks.push(
      ...configuredTierChecks(
        input.modelTierConfiguration ?? createDefaultModelTierConfiguration(),
        models,
      ),
    );
  } catch (error) {
    checks.push(check({
      id: "provider.catalog",
      group: "provider",
      label: "Model catalog",
      status: "fail",
      required: true,
      summary: "unavailable",
      evidence: {},
      cause: safeDetail(error, "Could not load the Codex model catalog."),
      remediation: {
        description: "Inspect Codex diagnostics and network policy, then rerun doctor.",
        command: "codex doctor --summary",
      },
      durationMs: elapsed(catalogStarted, now),
    }));
    checks.push(
      ...(["light", "medium", "heavy"] as const).map((tier) =>
        skipped(
          `provider.tier.${tier}`,
          "provider",
          `${tier[0]?.toUpperCase()}${tier.slice(1)} tier`,
          "not inspected",
          "Codex model catalog is unavailable.",
        )
      ),
    );
  }
  return checks;
}

async function optionalChecks(
  input: DoctorCollectorInput,
  dependencies: DoctorCollectorDependencies,
): Promise<DoctorCheckV1[]> {
  const browser = await readBrowserSessionDescriptor(input.stateRoot);
  const codeIntel = dependencies.codeIntelStatus?.();
  return [
    check({
      id: "optional.browser",
      group: "optional",
      label: "Browser",
      status: "skip",
      required: false,
      summary: browser
        ? `${browser.mode} session configured · ${browser.allowedOrigins.length} allowed origin(s) · orynt browser doctor`
        : "not configured · orynt browser doctor",
      evidence: {
        configured: Boolean(browser),
        mode: browser?.mode ?? null,
        allowedOriginCount: browser?.allowedOrigins.length ?? 0,
      },
      cause: "Optional browser connectivity is not probed by core doctor.",
      remediation: {
        description: "Run the dedicated browser readiness check when browser work is needed.",
        command: "orynt browser doctor",
      },
    }),
    check({
      id: "optional.code-intelligence",
      group: "optional",
      label: "Code intelligence",
      status: codeIntel?.failure ? "warn" : codeIntel?.enabled ? "pass" : "skip",
      required: false,
      summary: codeIntel?.failure
        ? `degraded · ${safeDetail(codeIntel.failure, "adapter unavailable")}`
        : codeIntel?.enabled
          ? `${codeIntel.state ?? "warming"} · ${codeIntel.sessions} persistent session(s)`
          : "not started · starts lazily for TypeScript/JavaScript repository work",
      evidence: {
        enabled: codeIntel?.enabled ?? false,
        sessions: codeIntel?.sessions ?? 0,
        state: codeIntel?.state ?? null,
        serverFingerprint: codeIntel?.serverFingerprint ?? null,
      },
      cause: codeIntel?.failure ?? (
        codeIntel?.enabled
          ? null
          : "The optional language-server runtime has not been requested in this process."
      ),
      remediation: codeIntel?.failure
        ? {
            description: "Use the npm distribution with its pinned TypeScript language-server dependencies.",
            command: null,
          }
        : null,
    }),
    check({
      id: "optional.skills",
      group: "optional",
      label: "Skills",
      status: "skip",
      required: false,
      summary: "inventory not scanned · orynt skills list",
      evidence: {},
      cause: "Core doctor does not start the skill-manager sidecar.",
      remediation: {
        description: "Inspect installed and project skills separately.",
        command: "orynt skills list",
      },
    }),
    check({
      id: "optional.capabilities",
      group: "optional",
      label: "Capabilities",
      status: "skip",
      required: false,
      summary: "runtime attachment not started · /settings intelligence",
      evidence: {},
      cause: "Capabilities are selected per turn and are not attached by core doctor.",
      remediation: {
        description: "Inspect current intelligence and capability settings in an interactive session.",
        command: null,
      },
    }),
  ];
}

async function liveChecks(
  input: DoctorCollectorInput,
  dependencies: DoctorCollectorDependencies,
  now: () => number,
  prerequisitesReady: boolean,
): Promise<DoctorCheckV1[]> {
  if (!input.live) return [];
  if (!prerequisitesReady) {
    return (["light", "medium", "heavy"] as const).map((tier) =>
      skipped(
        `live.tier.${tier}`,
        "live",
        `${tier[0]?.toUpperCase()}${tier.slice(1)} tier`,
        "not attempted",
        "Core Codex or configured model-tier readiness failed.",
      )
    );
  }
  if (!dependencies.runLiveTier) {
    return [
      check({
        id: "live.host",
        group: "live",
        label: "Live model tiers",
        status: "fail",
        required: true,
        summary: "unavailable in this host",
        evidence: {},
        cause: "The live doctor runner is unavailable.",
        remediation: null,
      }),
    ];
  }
  const configuration =
    input.modelTierConfiguration ?? createDefaultModelTierConfiguration();
  const results: DoctorCheckV1[] = [];
  for (const tier of ["light", "medium", "heavy"] as const) {
    const binding = configuration.tiers[tier];
    const startedAt = now();
    try {
      await dependencies.runLiveTier(tier, binding);
      results.push(check({
        id: `live.tier.${tier}`,
        group: "live",
        label: `${tier[0]?.toUpperCase()}${tier.slice(1)} tier`,
        status: "pass",
        required: true,
        summary: `ready · ${binding.modelId} · ${binding.thinkingEffort}`,
        evidence: {
          model: binding.modelId,
          thinkingEffort: binding.thinkingEffort,
          sentinelMatched: true,
        },
        cause: null,
        remediation: null,
        durationMs: elapsed(startedAt, now),
      }));
    } catch (error) {
      results.push(check({
        id: `live.tier.${tier}`,
        group: "live",
        label: `${tier[0]?.toUpperCase()}${tier.slice(1)} tier`,
        status: "fail",
        required: true,
        summary: `failed · ${binding.modelId} · ${binding.thinkingEffort}`,
        evidence: {
          model: binding.modelId,
          thinkingEffort: binding.thinkingEffort,
          sentinelMatched: false,
        },
        cause: safeDetail(error, `${tier} live model probe failed.`),
        remediation: {
          description: "Inspect Codex diagnostics, quota, model access, and network policy.",
          command: "codex doctor --summary",
        },
        durationMs: elapsed(startedAt, now),
      }));
    }
  }
  return results;
}

function reportStatus(checks: DoctorCheckV1[]): DoctorStatus {
  if (checks.some((item) => item.required && item.status === "fail")) {
    return "unhealthy";
  }
  if (checks.some((item) => item.status === "warn")) return "degraded";
  return "healthy";
}

export async function collectDoctorReport(
  input: DoctorCollectorInput,
  dependencies: DoctorCollectorDependencies,
): Promise<DoctorReportV1> {
  const now = input.now ?? performance.now.bind(performance);
  const startedAt = now();
  const [runtime, workspace, storage, provider, optional] = await Promise.all([
    runtimeChecks(input, now),
    workspaceChecks(input, now),
    storageChecks(input, dependencies, now),
    providerChecks(input, dependencies, now),
    optionalChecks(input, dependencies),
  ]);
  const live = await liveChecks(
    input,
    dependencies,
    now,
    provider.every(
      (item) => !item.required || item.status === "pass",
    ),
  );
  const checks = [
    ...runtime,
    ...workspace,
    ...storage,
    ...provider,
    ...optional,
    ...live,
  ];
  return {
    schemaVersion: 1,
    kind: "orynt_doctor_report",
    generatedAt: new Date().toISOString(),
    status: reportStatus(checks),
    summary: {
      passed: checks.filter(({ status }) => status === "pass").length,
      warnings: checks.filter(({ status }) => status === "warn").length,
      failed: checks.filter(({ status }) => status === "fail").length,
      skipped: checks.filter(({ status }) => status === "skip").length,
      durationMs: elapsed(startedAt, now),
    },
    context: {
      oryntVersion: ORYNT_VERSION,
      bunVersion: process.versions.bun ?? "unknown",
      platform: process.platform,
      architecture: process.arch,
      repositoryPath: path.resolve(input.repositoryPath),
      stateRoot: path.resolve(input.stateRoot),
    },
    checks,
  };
}

export function doctorExitCode(report: DoctorReportV1): 0 | 1 {
  return report.checks.some(
    (item) => item.required && item.status === "fail",
  )
    ? 1
    : 0;
}

function groupLabel(group: DoctorGroup): string {
  return {
    runtime: "Runtime",
    workspace: "Workspace",
    storage: "Storage",
    provider: "Provider",
    optional: "Optional",
    live: "Live model access",
  }[group];
}

function statusSymbol(
  status: DoctorCheckStatus,
  theme: TerminalTheme,
): string {
  if (status === "pass") return theme.paint("success", "✓");
  if (status === "warn") return theme.paint("attention", "!");
  if (status === "fail") return theme.paint("danger", "✕");
  return theme.paint("muted", "–");
}

function wrapLine(value: string, width: number, indent: string): string[] {
  return wrapTerminalParagraph(value, width, {
    firstIndent: indent,
    continuationIndent: indent,
  });
}

function evidenceLines(
  item: DoctorCheckV1,
  width: number,
  theme: TerminalTheme,
): string[] {
  const lines: string[] = [];
  if (item.cause) {
    lines.push(
      ...wrapLine(
        `${theme.paint("attention", "Cause")}  ${terminalSafeText(item.cause)}`,
        width,
        "      ",
      ),
    );
  }
  for (const [label, value] of Object.entries(item.evidence)) {
    if (value === null || value === "") continue;
    lines.push(
      ...wrapLine(
        `${theme.paint("metadata", terminalSafeText(label))}  ${terminalSafeText(String(value))}`,
        width,
        "      ",
      ),
    );
  }
  if (item.remediation) {
    lines.push(
      ...wrapLine(
        `${theme.paint("focus", "Fix")}  ${terminalSafeText(item.remediation.description)}`,
        width,
        "      ",
      ),
    );
    if (item.remediation.command) {
      lines.push(
        ...wrapLine(
          `${theme.paint("inlineCode", "$")} ${terminalSafeText(item.remediation.command)}`,
          width,
          "      ",
        ),
      );
    }
  }
  if (item.durationMs > 0) {
    lines.push(
      `      ${theme.paint("metadata", `duration ${item.durationMs} ms`)}`,
    );
  }
  return lines;
}

export function renderDoctorReport(
  report: DoctorReportV1,
  options: {
    color: boolean;
    themeId?: TerminalThemeId;
    width?: number;
    verbose?: boolean;
  },
): string {
  const design = createTerminalDesignSystem(options.color, options.themeId);
  const theme = design.theme;
  const width = Math.max(36, Math.floor(options.width ?? 88));
  const statusRole =
    report.status === "healthy"
      ? "success"
      : report.status === "degraded"
        ? "attention"
        : "danger";
  const statusLabel =
    report.status === "healthy"
      ? "Healthy"
      : report.status === "degraded"
        ? "Ready with warnings"
        : "Not ready";
  const countsPlain =
    `${report.summary.passed} passed · ${report.summary.warnings} warning${report.summary.warnings === 1 ? "" : "s"} · ${report.summary.failed} failed · ${report.summary.durationMs} ms`;
  const counts = [
    design.span("success", `${report.summary.passed} passed`),
    design.span("attention", `${report.summary.warnings} warning${report.summary.warnings === 1 ? "" : "s"}`),
    design.span("danger", `${report.summary.failed} failed`),
    design.span("duration", `${report.summary.durationMs} ms`),
  ].join(design.span("separator", " · "));
  const lines = [
    `${design.heading("Orynt doctor")} ${design.span("metadata", `v${report.context.oryntVersion}`)}`,
    ...(statusLabel.length + 3 + countsPlain.length <= width
      ? [`${theme.paint(statusRole, statusLabel)} · ${counts}`]
      : [
          theme.paint(statusRole, statusLabel),
          ...wrapLine(counts, width, "  "),
        ]),
  ];
  for (const group of GROUP_ORDER) {
    const groupChecks = report.checks.filter((item) => item.group === group);
    if (groupChecks.length === 0) continue;
    lines.push("", design.heading(groupLabel(group)));
    const labelWidth = Math.min(
      18,
      Math.max(10, ...groupChecks.map(({ label }) => label.length)),
    );
    for (const item of groupChecks) {
      const label = item.label.padEnd(labelWidth);
      const prefix = `  ${statusSymbol(item.status, theme)} ${design.span("label", label)}`;
      const summary = terminalSafeText(item.summary);
      if (4 + labelWidth + 2 + summary.length <= width) {
        lines.push(`${prefix}${design.span("separator", "  ")}${design.renderProductText(summary)}`);
      } else {
        lines.push(prefix.trimEnd());
        lines.push(...wrapLine(summary, width, "      "));
      }
      if (
        options.verbose ||
        item.status === "warn" ||
        item.status === "fail"
      ) {
        lines.push(...evidenceLines(item, width, theme));
      }
    }
  }
  if (!report.checks.some(({ group }) => group === "live")) {
    const footer = wrapLine(
      terminalSafeText(
        "Live model execution was not tested · use `orynt doctor --live --confirm-live` when quota-backed proof is needed.",
      ),
      width,
      "",
    );
    lines.push(
      "",
      ...footer.map((line) => theme.paint("metadata", line)),
    );
  }
  return lines.map((line) => design.renderProductText(line)).join("\n");
}

export function doctorHelp(): string {
  return [
    "Usage: orynt doctor [--verbose] [--json]",
    "       orynt doctor --live --confirm-live [--verbose] [--json]",
    "",
    "Runs core environment, repository, state, Codex, and configured model-tier checks.",
    "The default doctor does not make model calls. --live uses provider quota.",
    "",
    "Exit codes:",
    "  0  Core checks passed; warnings and optional skips may remain",
    "  1  One or more required checks failed",
    "  2  Invalid arguments or the doctor could not start",
  ].join("\n");
}
