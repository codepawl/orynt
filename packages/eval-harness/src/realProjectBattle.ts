import path from "node:path";

import {
  calculateCacheHitRatio,
  calculateFreshInputTokens,
} from "@codepawl/shared";

export const REAL_PROJECT_BATTLE_SCHEMA_VERSION = 5 as const;

/**
 * Spend budgets are expressed in fresh prompt tokens — the part of the prompt
 * the provider processed at full price — rather than whole-prompt tokens, so
 * that improving prompt-cache reuse registers as the improvement it is.
 *
 * These limits are provisional. They were inherited from the whole-prompt
 * budgets they replace and have not yet been re-derived from a measured
 * baseline; fresh tokens are always less than or equal to whole-prompt tokens,
 * so a limit carried over unchanged is looser than the one it replaces. The
 * whole-prompt ceilings below are therefore retained as a secondary guard until
 * a Calculator baseline run sets real numbers.
 */
const FRESH_INPUT_TOKEN_MEDIAN_LIMIT = 300_000;
const FRESH_INPUT_TOKEN_TRIAL_LIMIT = 360_000;
const WHOLE_PROMPT_TOKEN_TRIAL_CEILING = 360_000;

export const PRODUCT_UI_VISUAL_CRITERIA = [
  "UIQ-1",
  "UIQ-2",
  "UIQ-3",
  "UIQ-4",
  "UIQ-5",
  "UIQ-6",
] as const;
export type ProductUiVisualCriterionId =
  (typeof PRODUCT_UI_VISUAL_CRITERIA)[number];
export type ProductUiVisualReview = {
  schemaVersion: 1;
  scores: Array<{
    criterionId: ProductUiVisualCriterionId;
    score: number;
    evidence: string;
  }>;
  findings: Array<{
    severity: "major" | "minor";
    criterionId: ProductUiVisualCriterionId;
    evidence: string;
    recommendation: string;
  }>;
  summary: string;
};

export type RealProjectBattleTaskId =
  | "calculator-control"
  | "project-board"
  | "support-desk"
  | "click-equality-regression";

export type RealProjectBattleLane = "orynt_clean" | "orynt_soak" | "raw_codex";
export type RealProjectBattleVerdict =
  | "pass"
  | "fail"
  | "blocked"
  | "infrastructure_error";
export type RealProjectBattleOracleId =
  | "calculator-browser-v1"
  | "project-board-browser-v1"
  | "support-desk-browser-api-v1"
  | "click-strict-equality-v1";

export type RealProjectBattleTask = {
  id: RealProjectBattleTaskId;
  title: string;
  kind: "control" | "greenfield_web" | "greenfield_fullstack" | "historical_bug";
  repetitions: number;
  repetitionsByLane?: Partial<Record<RealProjectBattleLane, number>>;
  requiresVisualReview: boolean;
  allowedPaths: string[];
  protectedPaths: string[];
  oracleId: RealProjectBattleOracleId;
  prompt: string;
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
  visualReviewer: {
    model: "gpt-5.6-luna";
    reasoningEffort: "low";
    timeoutMs: 50_000;
  };
  providerTransport: "codex-cli";
  lanes: RealProjectBattleLane[];
  tasks: RealProjectBattleTask[];
};

export type RealProjectBattleTrial = {
  schemaVersion: typeof REAL_PROJECT_BATTLE_SCHEMA_VERSION;
  id: string;
  taskId: RealProjectBattleTaskId;
  lane: RealProjectBattleLane;
  repetition: number;
  seedCommit: string;
  sourceDigest: string;
  cliSha256: string;
  buildManifestSha256: string;
  oracleSha256: string;
  modelBinding: { model: string; reasoningEffort: string };
  actualModelBinding?: { model: string; reasoningEffort: string };
  performance?: {
    durationMs: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    invocationCount: number;
    implementationInvocationCount: number;
    recoveryInvocationCount: number;
    reviewerInvocationCount: number;
  };
  executionDiagnostics?: {
    absolutePathRejectionCount: number;
    reconnectCount: number;
  };
  providerTransport: string;
  startedAt: string;
  completedAt: string;
  totalWallMs: number;
  verdict: RealProjectBattleVerdict;
  processExitCode: number | null;
  timedOut: boolean;
  agentChangedPaths: string[];
  runtimeManagedPaths: Array<{
    path: string;
    sha256: string;
  }>;
  unexpectedPaths: string[];
  protectedPathMutations: string[];
  oracleResults: Array<{
    oracleId: RealProjectBattleOracleId;
    exitCode: number;
    stdoutPath: string;
    stderrPath: string;
  }>;
  runtimeArtifacts: string[];
  runtimeEvidenceValid: boolean;
  visualEvidence: string[];
  visualVerdict:
    | "pass"
    | "fail"
    | "pending"
    | "not_available"
    | "not_required";
  visualNote: string | null;
  visualReview?: {
    binding: { model: string; reasoningEffort: string };
    durationMs: number;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    reasoningOutputTokens: number | null;
    review: ProductUiVisualReview | null;
    failure: string | null;
  };
  failureClassification: string | null;
  processFailure: {
    classification: string;
    code: string | null;
    message: string;
  } | null;
};

export type RealProjectBattleAudit = {
  valid: boolean;
  complete: boolean;
  fatal: string[];
  warnings: string[];
};

export type CalculatorPragmaticGateV1 = {
  profile: "calculator_pragmatic_v1";
  status: "pass" | "fail" | "incomplete";
  reasons: string[];
  requiredTrialIds: string[];
  metrics: {
    cleanMedianWallMs: number | null;
    /** Gated. Whole prompt minus the part served from the provider cache. */
    cleanMedianFreshInputTokens: number | null;
    /** Diagnostic. Whole prompt, including cache reads and cache writes. */
    cleanMedianInputTokens: number | null;
    /** Diagnostic. Cache reuse across the clean trials, `0` through `1`. */
    cleanMedianCacheHitRatio: number | null;
    cleanMaxWallMs: number | null;
    cleanMaxFreshInputTokens: number | null;
    cleanMaxInputTokens: number | null;
    soakWallMs: number | null;
    soakFreshInputTokens: number | null;
    soakInputTokens: number | null;
  };
};

export type ProjectBoardCanaryGateV1 = {
  profile: "project_board_canary_v1";
  status: "pass" | "fail" | "incomplete";
  requiredTrialId: "project-board-orynt_clean-r1";
  reasons: string[];
  warnings: string[];
  metrics: {
    oryntDurationMs: number | null;
    totalWallMs: number | null;
    /** Gated. Whole prompt minus the part served from the provider cache. */
    totalFreshInputTokens: number | null;
    /** Diagnostic. Whole prompt, including cache reads and cache writes. */
    totalInputTokens: number | null;
    /** Diagnostic. Cache reuse across the run, `0` through `1`. */
    cacheHitRatio: number | null;
    visualReviewDurationMs: number | null;
    absolutePathRejectionCount: number | null;
    reconnectCount: number | null;
  };
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle] ?? null;
  return Math.round(((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2);
}

/**
 * Evaluates the bounded Calculator exit gate used before moving to a larger
 * real-project battle. This intentionally does not replace Standard-5.
 */
export function evaluateCalculatorPragmaticGate(
  trials: RealProjectBattleTrial[],
): CalculatorPragmaticGateV1 {
  const requiredTrialIds = [
    "calculator-control-orynt_clean-r1",
    "calculator-control-orynt_clean-r2",
    "calculator-control-orynt_soak-r1",
  ];
  const selected = requiredTrialIds.map((id) =>
    trials.find((trial) => trial.id === id)
  );
  const clean = selected.slice(0, 2).filter(
    (trial): trial is RealProjectBattleTrial => Boolean(trial),
  );
  const soak = selected[2];
  const cleanPerformance = clean.flatMap((trial) =>
    trial.performance ? [trial.performance] : []
  );
  const cleanCacheHitRatios = cleanPerformance.flatMap((performance) => {
    const ratio = calculateCacheHitRatio(performance);
    return ratio === null ? [] : [ratio];
  });
  const metrics = {
    cleanMedianWallMs: median(clean.map(({ totalWallMs }) => totalWallMs)),
    cleanMedianFreshInputTokens: median(
      cleanPerformance.map((performance) =>
        calculateFreshInputTokens(performance)
      ),
    ),
    cleanMedianInputTokens: median(
      cleanPerformance.map(({ inputTokens }) => inputTokens),
    ),
    cleanMedianCacheHitRatio:
      cleanCacheHitRatios.length > 0
        ? cleanCacheHitRatios.reduce((total, ratio) => total + ratio, 0) /
          cleanCacheHitRatios.length
        : null,
    cleanMaxWallMs:
      clean.length > 0
        ? Math.max(...clean.map(({ totalWallMs }) => totalWallMs))
        : null,
    cleanMaxFreshInputTokens:
      clean.every(({ performance }) => performance)
        ? Math.max(
          ...cleanPerformance.map((performance) =>
            calculateFreshInputTokens(performance)
          ),
        )
        : null,
    cleanMaxInputTokens:
      clean.every(({ performance }) => performance)
        ? Math.max(...cleanPerformance.map(({ inputTokens }) => inputTokens))
        : null,
    soakWallMs: soak?.totalWallMs ?? null,
    soakFreshInputTokens: soak?.performance
      ? calculateFreshInputTokens(soak.performance)
      : null,
    soakInputTokens: soak?.performance?.inputTokens ?? null,
  };
  const reasons: string[] = [];
  const missing = requiredTrialIds.filter(
    (_id, index) => selected[index] === undefined,
  );
  if (missing.length > 0) {
    reasons.push(`missing required trials: ${missing.join(", ")}`);
    return {
      profile: "calculator_pragmatic_v1",
      status: "incomplete",
      reasons,
      requiredTrialIds,
      metrics,
    };
  }
  for (const trial of selected as RealProjectBattleTrial[]) {
    if (trial.verdict !== "pass") reasons.push(`${trial.id}: verdict is not pass`);
    if (trial.visualVerdict !== "pass") {
      reasons.push(`${trial.id}: visual review is not pass`);
    }
    if (!trial.runtimeEvidenceValid) {
      reasons.push(`${trial.id}: runtime evidence is invalid`);
    }
    if (
      trial.processExitCode !== 0 ||
      trial.timedOut ||
      trial.oracleResults.some(({ exitCode }) => exitCode !== 0)
    ) {
      reasons.push(`${trial.id}: execution or oracle failed`);
    }
    if (
      trial.unexpectedPaths.length > 0 ||
      trial.protectedPathMutations.length > 0
    ) {
      reasons.push(`${trial.id}: repository scope drift`);
    }
    if (
      trial.actualModelBinding?.model !== "gpt-5.6-luna" ||
      trial.actualModelBinding.reasoningEffort !== "medium"
    ) {
      reasons.push(`${trial.id}: actual model binding drift`);
    }
    const performance = trial.performance;
    if (!performance) {
      reasons.push(`${trial.id}: performance envelope is missing`);
      continue;
    }
    if (
      performance.invocationCount > 3 ||
      performance.implementationInvocationCount !== 1 ||
      performance.recoveryInvocationCount !== 0 ||
      performance.reviewerInvocationCount !== 0
    ) {
      reasons.push(`${trial.id}: model invocation budget exceeded`);
    }
  }
  if (
    metrics.cleanMedianWallMs === null ||
    metrics.cleanMedianWallMs > 300_000
  ) {
    reasons.push("clean median wall time exceeds 300 seconds");
  }
  if (
    metrics.cleanMedianFreshInputTokens === null ||
    metrics.cleanMedianFreshInputTokens > FRESH_INPUT_TOKEN_MEDIAN_LIMIT
  ) {
    reasons.push(
      `clean median fresh input exceeds ${FRESH_INPUT_TOKEN_MEDIAN_LIMIT} tokens`,
    );
  }
  if (
    metrics.cleanMaxWallMs === null ||
    metrics.cleanMaxWallMs > 360_000 ||
    metrics.cleanMaxFreshInputTokens === null ||
    metrics.cleanMaxFreshInputTokens > FRESH_INPUT_TOKEN_TRIAL_LIMIT ||
    metrics.cleanMaxInputTokens === null ||
    metrics.cleanMaxInputTokens > WHOLE_PROMPT_TOKEN_TRIAL_CEILING
  ) {
    reasons.push("a clean trial exceeds the pragmatic per-trial limit");
  }
  if (
    metrics.soakWallMs === null ||
    metrics.soakWallMs > 360_000 ||
    metrics.soakFreshInputTokens === null ||
    metrics.soakFreshInputTokens > FRESH_INPUT_TOKEN_TRIAL_LIMIT ||
    metrics.soakInputTokens === null ||
    metrics.soakInputTokens > WHOLE_PROMPT_TOKEN_TRIAL_CEILING
  ) {
    reasons.push("the soak smoke exceeds the pragmatic per-trial limit");
  }
  return {
    profile: "calculator_pragmatic_v1",
    status: reasons.length === 0 ? "pass" : "fail",
    reasons,
    requiredTrialIds,
    metrics,
  };
}

export function evaluateProjectBoardCanaryGate(
  trials: RealProjectBattleTrial[],
): ProjectBoardCanaryGateV1 {
  const requiredTrialId = "project-board-orynt_clean-r1" as const;
  const trial = trials.find(({ id }) => id === requiredTrialId);
  const emptyMetrics = {
    oryntDurationMs: null,
    totalWallMs: null,
    totalFreshInputTokens: null,
    totalInputTokens: null,
    cacheHitRatio: null,
    visualReviewDurationMs: null,
    absolutePathRejectionCount: null,
    reconnectCount: null,
  };
  if (!trial) {
    return {
      profile: "project_board_canary_v1",
      status: "incomplete",
      requiredTrialId,
      reasons: [`missing required trial: ${requiredTrialId}`],
      warnings: [],
      metrics: emptyMetrics,
    };
  }
  const performance = trial.performance;
  // A visual review that reported prompt tokens but no cache breakdown is
  // counted as entirely fresh. Assuming cache reuse we did not observe would
  // understate spend.
  const visualReviewUsage = {
    inputTokens: trial.visualReview?.inputTokens ?? 0,
    cachedInputTokens: trial.visualReview?.cachedInputTokens ?? 0,
  };
  const totalInputTokens = performance
    ? performance.inputTokens + visualReviewUsage.inputTokens
    : null;
  const totalCachedInputTokens = performance
    ? performance.cachedInputTokens + visualReviewUsage.cachedInputTokens
    : null;
  const totalFreshInputTokens =
    totalInputTokens === null || totalCachedInputTokens === null
      ? null
      : calculateFreshInputTokens({
        inputTokens: totalInputTokens,
        cachedInputTokens: totalCachedInputTokens,
      });
  const metrics = {
    oryntDurationMs: performance?.durationMs ?? null,
    totalWallMs: trial.totalWallMs,
    totalFreshInputTokens,
    totalInputTokens,
    cacheHitRatio:
      totalInputTokens === null || totalCachedInputTokens === null
        ? null
        : calculateCacheHitRatio({
          inputTokens: totalInputTokens,
          cachedInputTokens: totalCachedInputTokens,
        }),
    visualReviewDurationMs: trial.visualReview?.durationMs ?? null,
    absolutePathRejectionCount:
      trial.executionDiagnostics?.absolutePathRejectionCount ?? null,
    reconnectCount: trial.executionDiagnostics?.reconnectCount ?? null,
  };
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (trial.taskId !== "project-board" || trial.lane !== "orynt_clean") {
    reasons.push("required trial binding is invalid");
  }
  if (
    trial.verdict !== "pass" ||
    trial.processExitCode !== 0 ||
    trial.timedOut
  ) {
    reasons.push("trial execution did not pass");
  }
  if (
    trial.oracleResults.length !== 1 ||
    trial.oracleResults.some(({ exitCode }) => exitCode !== 0)
  ) {
    reasons.push("functional or source-readability oracle did not pass");
  }
  if (
    !trial.runtimeEvidenceValid ||
    trial.runtimeArtifacts.length === 0 ||
    trial.unexpectedPaths.length > 0 ||
    trial.protectedPathMutations.length > 0
  ) {
    reasons.push("runtime evidence or repository scope is invalid");
  }
  if (
    trial.visualVerdict !== "pass" ||
    !trial.visualReview?.review ||
    trial.visualReview.failure
  ) {
    reasons.push("model visual review did not pass");
  }
  if (!performance) {
    reasons.push("performance envelope is missing");
  } else {
    if (performance.durationMs > 300_000) {
      reasons.push("Orynt execution exceeds 300 seconds");
    }
    if (
      performance.invocationCount > 3 ||
      performance.implementationInvocationCount !== 1 ||
      performance.recoveryInvocationCount !== 0 ||
      performance.reviewerInvocationCount !== 0
    ) {
      reasons.push("Orynt invocation budget is invalid");
    }
  }
  if (trial.totalWallMs > 360_000) {
    reasons.push("trial exceeds 360 seconds");
  }
  if (
    totalFreshInputTokens === null ||
    totalFreshInputTokens > FRESH_INPUT_TOKEN_TRIAL_LIMIT
  ) {
    reasons.push(
      `trial fresh input exceeds ${FRESH_INPUT_TOKEN_TRIAL_LIMIT} tokens`,
    );
  }
  if (
    totalInputTokens === null ||
    totalInputTokens > WHOLE_PROMPT_TOKEN_TRIAL_CEILING
  ) {
    reasons.push(
      `trial whole-prompt input exceeds ${WHOLE_PROMPT_TOKEN_TRIAL_CEILING} tokens`,
    );
  }
  if (
    trial.executionDiagnostics?.absolutePathRejectionCount === undefined
  ) {
    reasons.push("execution diagnostics are missing");
  } else if (
    trial.executionDiagnostics.absolutePathRejectionCount > 0
  ) {
    reasons.push("absolute-path patch rejection recurred");
  }
  if ((trial.executionDiagnostics?.reconnectCount ?? 0) > 0) {
    warnings.push("provider reconnect occurred");
  }
  return {
    profile: "project_board_canary_v1",
    status: reasons.length === 0 ? "pass" : "fail",
    requiredTrialId,
    reasons,
    warnings,
    metrics,
  };
}

export function createRealProjectBattleCampaign(): RealProjectBattleCampaign {
  return {
    schemaVersion: REAL_PROJECT_BATTLE_SCHEMA_VERSION,
    id: "orynt-real-project-battle-v1",
    implementer: { model: "gpt-5.6-luna", reasoningEffort: "medium" },
    visualReviewer: {
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      timeoutMs: 50_000,
    },
    providerTransport: "codex-cli",
    lanes: ["orynt_clean", "orynt_soak", "raw_codex"],
    tasks: [
      task({
        id: "calculator-control",
        title: "Calculator control replay",
        kind: "control",
        repetitions: 1,
        repetitionsByLane: {
          orynt_clean: 2,
          orynt_soak: 2,
          raw_codex: 1,
        },
        requiresVisualReview: true,
        allowedPaths: [
          "index.html",
          "package.json",
          "src/app.js",
          "src/calculator.js",
          "styles.css",
          "tests/calculator.test.js",
        ],
        oracleId: "calculator-browser-v1",
        prompt: [
          "Build a dependency-free static calculator.",
          "Provide semantic digit, decimal, operation, equals, and all-clear controls; an aria-live display; visible focus states; responsive desktop and mobile layouts; and keyboard input.",
          "Export pure arithmetic logic from src/calculator.js. Division by zero must show Error and recover after all-clear or new input.",
          "Use data-testid values calculator, display, key-0 through key-9, key-decimal, key-add, key-subtract, key-multiply, key-divide, key-equals, and key-clear.",
          "package.json must expose a test script and tests/calculator.test.js must cover arithmetic and error recovery.",
        ].join(" "),
      }),
      task({
        id: "project-board",
        title: "Offline project board",
        kind: "greenfield_web",
        repetitions: 3,
        requiresVisualReview: true,
        allowedPaths: ["index.html", "src", "styles.css", "package.json"],
        oracleId: "project-board-browser-v1",
        prompt: [
          "Build an offline project board using vanilla HTML, CSS, and ES modules with Backlog, In Progress, and Done columns.",
          "Users must create, edit, move, and delete tasks. Persist the board under localStorage key orynt.project-board.v1.",
          "Include keyboard-accessible controls, visible focus, responsive desktop and mobile layouts, and an aria-live status region.",
          "Expose stable data-testid values board-root, add-task, task-title, task-description, task-submit, task-card, column-backlog, column-in-progress, column-done, move-next, edit-task, and delete-task.",
          "Use exactly one page-level board-root, add-task, column-backlog, column-in-progress, and column-done element. Whenever the task form is open, task-title, task-description, and task-submit must each resolve to exactly one element.",
          "task-card may repeat, but every task card must contain exactly one edit-task and delete-task control, and every task card that can advance must contain exactly one move-next control.",
          "package.json may provide a start script but the implementation must not depend on a framework or network service.",
        ].join(" "),
      }),
      task({
        id: "support-desk",
        title: "Local support desk",
        kind: "greenfield_fullstack",
        repetitions: 3,
        requiresVisualReview: true,
        allowedPaths: ["index.html", "src", "public", "server", "tests", "package.json"],
        oracleId: "support-desk-browser-api-v1",
        prompt: [
          "Build a local support desk using Bun.serve and bun:sqlite.",
          "Implement GET and POST /api/tickets plus PATCH /api/tickets/:id. Tickets have title, description, priority, and status; invalid input returns HTTP 400.",
          "Read PORT and ORYNT_SUPPORT_DB from the environment. package.json must expose start and test scripts.",
          "The browser UI must create tickets, list them, filter by status, and update status. Use data-testid values support-desk, ticket-title, ticket-description, ticket-priority, ticket-submit, ticket-card, status-filter, and status-control.",
          "Include responsive desktop/mobile styling, keyboard access, visible focus, and an aria-live status region.",
        ].join(" "),
      }),
      task({
        id: "click-equality-regression",
        title: "Click strict equality default help regression",
        kind: "historical_bug",
        repetitions: 3,
        requiresVisualReview: false,
        allowedPaths: ["src/click/core.py", "tests/test_options.py"],
        oracleId: "click-strict-equality-v1",
        prompt: [
          "Fix Click help rendering when an option default has strict __eq__ behavior that raises while comparing to a string.",
          "The non-string object must render through str(default), while an empty string must still render as [default: \"\"].",
          "Add a focused regression test and modify no files outside src/click/core.py and tests/test_options.py.",
        ].join(" "),
        source: {
          repository: "https://github.com/pallets/click.git",
          baseCommit: "04ef3a6f473deb2499721a8d11f92a7d2c0912f2",
          oracleCommit: "d340b0c",
        },
      }),
    ],
  };
}

export function repetitionsForBattleLane(
  task: RealProjectBattleTask,
  lane: RealProjectBattleLane,
): number {
  return task.repetitionsByLane?.[lane] ?? task.repetitions;
}

export function auditRealProjectBattleTrial(
  campaign: RealProjectBattleCampaign,
  trial: RealProjectBattleTrial,
  expectedBinding: {
    sourceDigest: string;
    cliSha256: string;
    buildManifestSha256?: string;
    oracleSha256?: string;
  },
): RealProjectBattleAudit {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const taskDefinition = campaign.tasks.find(({ id }) => id === trial.taskId);
  if (!taskDefinition) fatal.push(`unknown task: ${trial.taskId}`);
  if (!campaign.lanes.includes(trial.lane)) fatal.push(`unknown lane: ${trial.lane}`);
  if (trial.sourceDigest !== expectedBinding.sourceDigest) fatal.push("source digest mismatch");
  if (trial.cliSha256 !== expectedBinding.cliSha256) fatal.push("packaged CLI hash mismatch");
  if (
    expectedBinding.buildManifestSha256 &&
    trial.buildManifestSha256 !== expectedBinding.buildManifestSha256
  ) {
    fatal.push("CLI build manifest hash mismatch");
  }
  if (expectedBinding.oracleSha256 && trial.oracleSha256 !== expectedBinding.oracleSha256) {
    fatal.push("hidden oracle hash mismatch");
  }
  if (
    trial.modelBinding.model !== campaign.implementer.model ||
    trial.modelBinding.reasoningEffort !== campaign.implementer.reasoningEffort
  ) {
    fatal.push("implementer model binding mismatch");
  }
  if (
    trial.actualModelBinding &&
    (
      trial.actualModelBinding.model !== campaign.implementer.model ||
      trial.actualModelBinding.reasoningEffort !==
        campaign.implementer.reasoningEffort
    )
  ) {
    fatal.push("actual implementer model binding mismatch");
  }
  if (
    trial.schemaVersion >= 4 &&
    trial.lane !== "raw_codex" &&
    (!trial.actualModelBinding || !trial.performance)
  ) {
    fatal.push("missing Orynt performance envelope");
  }
  if (trial.providerTransport !== campaign.providerTransport) {
    fatal.push("provider transport binding mismatch");
  }
  if (trial.protectedPathMutations.length > 0) fatal.push("protected path mutation");
  if (trial.unexpectedPaths.length > 0) fatal.push("mutation outside allowed paths");
  if (
    trial.runtimeManagedPaths.some(
      ({ path: managedPath, sha256 }) =>
        managedPath !== ".codex/orynt-beta-verify.mjs" ||
        !/^[a-f0-9]{64}$/u.test(sha256),
    )
  ) {
    fatal.push("invalid runtime-managed path evidence");
  }
  if (
    trial.lane !== "raw_codex" &&
    (
      trial.runtimeManagedPaths.length !== 1 ||
      trial.runtimeManagedPaths[0]?.path !== ".codex/orynt-beta-verify.mjs"
    )
  ) {
    fatal.push("missing Orynt runtime-managed verifier");
  }
  if (trial.lane === "raw_codex" && trial.runtimeManagedPaths.length > 0) {
    fatal.push("raw Codex trial contains Orynt runtime-managed paths");
  }
  if (trial.timedOut) fatal.push("trial timed out");
  if (trial.processExitCode === null) fatal.push("missing terminal process result");
  if (trial.oracleResults.length !== 1) fatal.push("missing external oracle result");
  if (trial.oracleResults.some(({ exitCode }) => exitCode !== 0)) fatal.push("external oracle failed");
  if (!trial.runtimeEvidenceValid && trial.lane !== "raw_codex") {
    fatal.push("invalid Orynt runtime evidence");
  }
  if (trial.runtimeArtifacts.length === 0 && trial.lane !== "raw_codex") {
    fatal.push("missing Orynt runtime artifacts");
  }
  if (trial.verdict === "pass" && fatal.length > 0) {
    fatal.push("pass verdict contradicts evidence");
  }
  if (taskDefinition?.requiresVisualReview) {
    if (trial.visualEvidence.length < 2) fatal.push("missing desktop or mobile visual evidence");
    if (trial.visualVerdict === "pending") warnings.push("model visual verdict is pending");
    if (
      trial.visualVerdict === "not_available" &&
      trial.verdict === "pass"
    ) {
      fatal.push("passing trial has no visual evidence");
    }
    if (trial.visualVerdict === "fail") fatal.push("model visual review failed");
    if (trial.schemaVersion >= 5 && !trial.visualReview) {
      fatal.push("missing model visual review");
    }
    if (trial.visualReview?.failure) {
      fatal.push("model visual review unavailable");
    }
    if (
      trial.visualReview &&
      (
        trial.visualReview.binding.model !== campaign.visualReviewer.model ||
        trial.visualReview.binding.reasoningEffort !==
          campaign.visualReviewer.reasoningEffort
      )
    ) {
      fatal.push("visual reviewer model binding mismatch");
    }
    if (
      trial.visualReview &&
      trial.visualReview.durationMs > campaign.visualReviewer.timeoutMs
    ) {
      fatal.push("visual reviewer exceeded its latency budget");
    }
  }
  if (trial.schemaVersion >= 5 && trial.lane !== "raw_codex") {
    if ((trial.performance?.durationMs ?? Number.POSITIVE_INFINITY) > 300_000) {
      fatal.push("Orynt execution exceeded 300 seconds");
    }
    if (trial.totalWallMs > 360_000) {
      fatal.push("trial exceeded 360 seconds");
    }
    const totalInput =
      (trial.performance?.inputTokens ?? Number.POSITIVE_INFINITY) +
      (trial.visualReview?.inputTokens ?? 0);
    if (totalInput > 360_000) {
      fatal.push("trial exceeded 360000 input tokens");
    }
    if (!trial.executionDiagnostics) {
      fatal.push("missing execution diagnostics");
    } else {
      if (trial.executionDiagnostics.absolutePathRejectionCount > 0) {
        fatal.push("absolute-path patch rejection detected");
      }
      if (trial.executionDiagnostics.reconnectCount > 0) {
        warnings.push("provider reconnect detected");
      }
    }
  }
  const complete =
    fatal.length === 0 &&
    (!taskDefinition?.requiresVisualReview || trial.visualVerdict === "pass");
  return {
    valid: fatal.length === 0,
    complete,
    fatal: [...new Set(fatal)],
    warnings,
  };
}

export function evaluateProductUiVisualReview(
  review: ProductUiVisualReview,
): { verdict: "pass" | "fail"; average: number; reasons: string[] } {
  const reasons: string[] = [];
  const byCriterion = new Map(
    review.scores.map((score) => [score.criterionId, score]),
  );
  if (
    review.scores.length !== PRODUCT_UI_VISUAL_CRITERIA.length ||
    byCriterion.size !== PRODUCT_UI_VISUAL_CRITERIA.length
  ) {
    reasons.push("each required visual criterion must appear exactly once");
  }
  for (const criterionId of PRODUCT_UI_VISUAL_CRITERIA) {
    const score = byCriterion.get(criterionId)?.score;
    if (!Number.isInteger(score) || score! < 1 || score! > 5) {
      reasons.push(`${criterionId} has an invalid score`);
      continue;
    }
    if (score! < 3) reasons.push(`${criterionId} is below the minimum score`);
    if (
      (criterionId === "UIQ-4" || criterionId === "UIQ-6") &&
      score! < 4
    ) {
      reasons.push(`${criterionId} is below the product-quality threshold`);
    }
  }
  if (review.findings.some(({ severity }) => severity === "major")) {
    reasons.push("visual review contains a major finding");
  }
  const validScores = PRODUCT_UI_VISUAL_CRITERIA.flatMap((criterionId) => {
    const score = byCriterion.get(criterionId)?.score;
    return typeof score === "number" ? [score] : [];
  });
  const average =
    validScores.length === PRODUCT_UI_VISUAL_CRITERIA.length
      ? validScores.reduce((total, score) => total + score, 0) /
        validScores.length
      : 0;
  if (average < 3.8) reasons.push("average visual score is below 3.8");
  return {
    verdict: reasons.length === 0 ? "pass" : "fail",
    average,
    reasons,
  };
}

export function evaluateAuthoredSourceReadability(
  relativePath: string,
  source: string,
): string[] {
  const problems: string[] = [];
  const byteLength = Buffer.byteLength(source);
  const lines = source.split(/\r?\n/u);
  if (byteLength > 1_024 && lines.length < 5) {
    problems.push(
      `${relativePath} appears manually minified: ${byteLength} bytes across ${lines.length} lines`,
    );
  }
  const longestLine = lines.reduce(
    (longest, line) => Math.max(longest, line.length),
    0,
  );
  if (longestLine > 400) {
    problems.push(
      `${relativePath} contains an authored line longer than 400 characters`,
    );
  }
  return problems;
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
  input: Omit<RealProjectBattleTask, "protectedPaths"> & {
    protectedPaths?: string[];
  },
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
