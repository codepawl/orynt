import path from "node:path";

export const REAL_PROJECT_BATTLE_SCHEMA_VERSION = 1 as const;

export type RealProjectBattleTaskId =
  | "calculator-control"
  | "project-board"
  | "support-desk"
  | "click-equality-regression";

export type RealProjectBattleLane = "orynt_clean" | "orynt_soak" | "raw_codex";
export type RealProjectBattleVerdict = "pass" | "fail" | "blocked" | "infrastructure_error";

export type RealProjectBattleTask = {
  id: RealProjectBattleTaskId;
  title: string;
  kind: "control" | "greenfield_web" | "greenfield_fullstack" | "historical_bug";
  repetitions: number;
  requiresVisualReview: boolean;
  allowedPaths: string[];
  protectedPaths: string[];
  oracleCommands: string[][];
  source?: {
    repository: string;
    baseCommit: string;
    oracleCommit?: string;
  };
};

export type RealProjectBattleCampaign = {
  schemaVersion: typeof REAL_PROJECT_BATTLE_SCHEMA_VERSION;
  id: "orynt-real-project-battle-v1";
  implementer: { model: "gpt-5.6-luna"; reasoningEffort: "medium" };
  lanes: RealProjectBattleLane[];
  tasks: RealProjectBattleTask[];
};

export type RealProjectBattleTrial = {
  schemaVersion: typeof REAL_PROJECT_BATTLE_SCHEMA_VERSION;
  id: string;
  taskId: RealProjectBattleTaskId;
  lane: RealProjectBattleLane;
  repetition: number;
  sourceDigest: string;
  cliSha256: string;
  startedAt: string;
  completedAt: string;
  verdict: RealProjectBattleVerdict;
  processExitCode: number | null;
  timedOut: boolean;
  changedPaths: string[];
  unexpectedPaths: string[];
  protectedPathMutations: string[];
  oracleResults: Array<{ command: string[]; exitCode: number; stdoutPath: string; stderrPath: string }>;
  runtimeArtifacts: string[];
  visualEvidence: string[];
  failureClassification: string | null;
};

export type RealProjectBattleAudit = {
  valid: boolean;
  fatal: string[];
  warnings: string[];
};

export function createRealProjectBattleCampaign(): RealProjectBattleCampaign {
  return {
    schemaVersion: REAL_PROJECT_BATTLE_SCHEMA_VERSION,
    id: "orynt-real-project-battle-v1",
    implementer: { model: "gpt-5.6-luna", reasoningEffort: "medium" },
    lanes: ["orynt_clean", "orynt_soak", "raw_codex"],
    tasks: [
      task({
        id: "calculator-control",
        title: "Calculator control replay",
        kind: "control",
        repetitions: 1,
        requiresVisualReview: true,
        allowedPaths: ["index.html", "script.js", "styles.css", "package.json", "test"],
        oracleCommands: [["bun", "test"]],
      }),
      task({
        id: "project-board",
        title: "Offline project board",
        kind: "greenfield_web",
        repetitions: 3,
        requiresVisualReview: true,
        allowedPaths: ["index.html", "src", "styles.css", "package.json"],
        oracleCommands: [["bun", "test"], ["bun", "run", "build"]],
      }),
      task({
        id: "support-desk",
        title: "Local support desk",
        kind: "greenfield_fullstack",
        repetitions: 3,
        requiresVisualReview: true,
        allowedPaths: ["index.html", "src", "public", "server", "tests", "package.json"],
        oracleCommands: [["bun", "test"], ["bun", "run", "build"]],
      }),
      task({
        id: "click-equality-regression",
        title: "Click strict equality default help regression",
        kind: "historical_bug",
        repetitions: 3,
        requiresVisualReview: false,
        allowedPaths: ["src/click/core.py", "tests/test_options.py"],
        oracleCommands: [["python", "-m", "pytest", "-q", "tests/test_options.py"]],
        source: {
          repository: "https://github.com/pallets/click.git",
          baseCommit: "04ef3a6f473deb2499721a8d11f92a7d2c0912f2",
          oracleCommit: "d340b0c",
        },
      }),
    ],
  };
}

export function auditRealProjectBattleTrial(
  campaign: RealProjectBattleCampaign,
  trial: RealProjectBattleTrial,
  expectedBinding: { sourceDigest: string; cliSha256: string },
): RealProjectBattleAudit {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const taskDefinition = campaign.tasks.find(({ id }) => id === trial.taskId);
  if (!taskDefinition) fatal.push(`unknown task: ${trial.taskId}`);
  if (!campaign.lanes.includes(trial.lane)) fatal.push(`unknown lane: ${trial.lane}`);
  if (trial.sourceDigest !== expectedBinding.sourceDigest) fatal.push("source digest mismatch");
  if (trial.cliSha256 !== expectedBinding.cliSha256) fatal.push("packaged CLI hash mismatch");
  if (trial.protectedPathMutations.length > 0) fatal.push("protected path mutation");
  if (trial.unexpectedPaths.length > 0) fatal.push("mutation outside allowed paths");
  if (trial.timedOut) fatal.push("trial timed out");
  if (trial.processExitCode === null) fatal.push("missing terminal process result");
  if (trial.oracleResults.length === 0) fatal.push("missing external oracle result");
  if (trial.oracleResults.some(({ exitCode }) => exitCode !== 0)) fatal.push("external oracle failed");
  if (trial.verdict === "pass" && fatal.length > 0) fatal.push("pass verdict contradicts evidence");
  if (taskDefinition?.requiresVisualReview && trial.visualEvidence.length === 0) {
    warnings.push("visual review evidence is pending");
  }
  if (trial.runtimeArtifacts.length === 0 && trial.lane !== "raw_codex") {
    fatal.push("missing Orynt runtime artifacts");
  }
  return { valid: fatal.length === 0, fatal: [...new Set(fatal)], warnings };
}

export function normalizeBattlePath(candidate: string): string {
  const normalized = candidate.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (normalized.length === 0 || path.posix.isAbsolute(normalized)) {
    throw new Error(`Invalid repository-relative path: ${candidate}`);
  }
  const clean = path.posix.normalize(normalized);
  if (clean === ".." || clean.startsWith("../")) {
    throw new Error(`Path escapes repository: ${candidate}`);
  }
  return clean;
}

export function pathIsAllowed(candidate: string, allowedPaths: string[]): boolean {
  const clean = normalizeBattlePath(candidate);
  return allowedPaths.some((allowed) => {
    const boundary = normalizeBattlePath(allowed);
    return clean === boundary || clean.startsWith(`${boundary}/`);
  });
}

function task(
  input: Omit<RealProjectBattleTask, "protectedPaths"> & { protectedPaths?: string[] },
): RealProjectBattleTask {
  return {
    ...input,
    protectedPaths: input.protectedPaths ?? [
      ".env",
      ".git",
      ".github",
      "node_modules",
      "bun.lock",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
    ],
  };
}
