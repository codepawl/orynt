import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createMockRunState, MVP_BLOCKED_SURFACES } from "@codepawl/shared";
import { getLandingUrl } from "./landingUrl";
import {
  Archive,
  Blocks,
  BookOpen,
  Camera,
  Check,
  ChevronsUpDown,
  ChevronRight,
  CircleUserRound,
  Copy,
  CreditCard,
  Cpu,
  Database,
  Download,
  EllipsisVertical,
  FolderPlus,
  FolderOpen,
  GitBranch,
  Gauge,
  Globe2,
  Gift,
  Info,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Plug,
  Plus,
  Puzzle,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  Share,
  Shield,
  ShieldCheck,
  Search,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { runEventTaskPhase, type CandidateRule, type MemoryReviewSnapshot, type MockRunState, type RunEvent, type SkillDefinition, type SkillRegistrySnapshot, type SkillReplayPlan, type SurfaceKind } from "@codepawl/shared";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, FocusEvent, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import lightbulbLogoOnDark from "../../../assets/pictures/lightbulb-mark-on-dark.svg";

import { SkillsManager } from "./features/skills/SkillsManager";
import { MemoryManager } from "./features/memory/MemoryManager";
import { orynt } from "./oryntClient";
import type {
  ArtifactEvidenceContent,
  ArtifactEvidenceStatus,
  ArtifactEvidenceSummary,
  CodexLoginMethod,
  CodexConnectionPreflightResult,
  CodexConnectionReference,
  DesktopRunSnapshot,
  ModelAuthMethod,
  ModelCatalogOption,
  ModelConnectionPreflightResult,
  ModelConnectionReference,
  ModelProviderId,
  PersistedRunRecord,
  PersistedRunSummary,
  SettingsSnapshot,
  ThinkingEffort,
  InstalledAgentSkill,
} from "./oryntClient";
import "./styles.css";

type Workspace = {
  id: string;
  label: string;
  description: string;
  badge: string;
  archived?: boolean;
};

type ThreadMessageDetailKind = "thinking" | "tool" | "command" | "model" | "memory" | "done" | "system" | "error";


type ThreadMessage = {
  id: string;
  role: "user" | "system" | "agent" | "approval";
  content?: string;
  label?: string;
  showContext?: boolean;
  detailKind?: ThreadMessageDetailKind;
  runId?: string;
  detailItems?: string[];
};

type ThreadStateSnapshot = {
  workspaces: Workspace[];
  threadMessagesByWorkspace: Record<string, ThreadMessage[]>;
  nextWorkspaceThreadIndex: number;
  activeWorkspaceId: string;
};

type AgentResponseRating = "good" | "bad";

type AppNotificationTone = "success" | "info" | "warning" | "error";

type AppNotification = {
  id: number;
  message: string;
  tone: AppNotificationTone;
};

type AgentResponseTextSelection = {
  messageId: string;
  text: string;
};


const initialWorkspaces = [
  { id: "draft", label: "New task", description: "", badge: "new" },
] satisfies Workspace[];

type ThreadStartCopy = {
  title: string;
  description: string;
};

const threadStartCopyOptions: ThreadStartCopy[] = [
  {
    title: "Start a supervised task",
    description: "Describe the outcome. Orynt plans the task, acts through the available surface, and keeps evidence attached for review.",
  },
  {
    title: "Tell Orynt what to do",
    description: "Give the task, constraints, and success signal. This beta can act only inside the selected local directory.",
  },
  {
    title: "Plan, act, verify",
    description: "Orynt keeps action attempts scoped, records the run log, and separates generated output from verification evidence.",
  },
  {
    title: "Keep actions reviewable",
    description: "Every risky task step stays approval-gated, traceable, and backed by artifacts you can reopen later.",
  },
  {
    title: "Use the current surface",
    description: "The product model is task-first; the current beta surface is a selected local directory with explicit approval.",
  },
];

function randomThreadStartCopy(): ThreadStartCopy {
  return threadStartCopyOptions[Math.floor(Math.random() * threadStartCopyOptions.length)] ?? threadStartCopyOptions[0];
}

const surfaceLabels: Record<SurfaceKind, string> = {
  repository: "Repository",
  browser: "Browser",
  desktop: "Desktop",
  files: "Files",
  terminal: "Terminal",
};

const surfaceDescriptions: Record<SurfaceKind, string> = {
  repository: "Allow repository reads, diffs, and scoped code changes.",
  browser: "Unavailable in private beta; no browser automation runs from this app.",
  desktop: "Unavailable in private beta; no computer-wide desktop control runs from this app.",
  files: "Unavailable in private beta; only the selected local directory is in scope.",
  terminal: "Unavailable in private beta; no arbitrary shell or terminal control runs from this app.",
};

const messageBlockMetaDescription = "Show or hide compact block labels above agent and approval messages.";
const betaUnavailableSurfaces = ["Browser", "Desktop", "Files", "Terminal", "Cloud", "Billing"] as const;
const betaUnavailableSurfaceDescriptions: Record<(typeof betaUnavailableSurfaces)[number], string> = {
  Browser: "Browser automation is not available from this private beta workspace.",
  Desktop: "Computer-wide desktop control remains unavailable.",
  Files: "Only the selected local directory is in scope.",
  Terminal: "Arbitrary shell and terminal control remain unavailable.",
  Cloud: "Hosted cloud runs are not enabled for this local-first beta.",
  Billing: "Billing actions stay disabled while this release uses local beta access.",
};
const renderedRunEventTypes: Partial<Record<RunEvent["type"], true>> = {
  run_started: true,
  goal_received: true,
  sandbox_create_requested: true,
  sandbox_create_allowed: true,
  sandbox_created: true,
  codex_detected: true,
  codex_missing: true,
  codex_contract_requested: true,
  codex_contract_created: true,
  codex_manual_next_step: true,
  codex_execution_planned: true,
  codex_execution_approval_required: true,
  codex_execution_approved: true,
  codex_execution_started: true,
  codex_reasoning_summary: true,
  codex_agent_message: true,
  codex_execution_output_recorded: true,
  codex_execution_finished: true,
  codex_execution_failed: true,
  codex_execution_blocked: true,
  codex_execution_result_ready: true,
  codex_result_import_requested: true,
  codex_sandbox_diff_inspected: true,
  codex_manual_log_imported: true,
  codex_result_redacted: true,
  codex_result_imported: true,
  verification_planned: true,
  verification_policy_checked: true,
  verification_started: true,
  verification_command_started: true,
  verification_command_finished: true,
  verification_diff_checked: true,
  verification_recorded: true,
  verification_passed: true,
  verification_failed: true,
  memory_extraction_started: true,
  memory_episode_written: true,
  candidate_rule_proposed: true,
  memory_extraction_finished: true,
  run_finished: true,
};

const permissionModeOptions = [
  { value: "safe", label: "Safe", helper: "Ask before protected paths, destructive commands, network access, and secret access." },
  { value: "ask-first", label: "Ask first", helper: "Pause before every repository-affecting action in this workspace." },
  { value: "locked", label: "Locked", helper: "Keep the cockpit read-only until the operator re-enables controlled actions." },
] as const;

const thinkingEffortOptions = [
  { value: "minimal", label: "Minimal", helper: "Smallest reasoning budget for very direct changes." },
  { value: "none", label: "None", helper: "Disable reasoning effort when the selected model supports it." },
  { value: "low", label: "Low", helper: "Faster, lighter planning for simple changes." },
  { value: "medium", label: "Medium", helper: "Balanced reasoning for normal repository work." },
  { value: "high", label: "High", helper: "Deeper planning for complex or risky changes." },
  { value: "xhigh", label: "X High", helper: "Maximum available reasoning effort for the selected model." },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const values = value.map((item) => compactValue(item)).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join(", ") : null;
  }
  return null;
}

function truncateUiText(value: string, limit = 420): string {
  const normalized = value.replace(/\s+\n/g, "\n").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit).trimEnd()}…` : normalized;
}

function formatElapsedClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDurationMs(durationMs: number | null): string | null {
  if (durationMs === null) {
    return null;
  }
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${Math.max(0, Math.round(durationMs))}ms`;
}

function runEventKind(type: RunEvent["type"]): ThreadMessageDetailKind {
  if (type === "codex_reasoning_summary") {
    return "thinking";
  }
  if (type.startsWith("codex_execution") || type.startsWith("codex_contract") || type.startsWith("codex_result") || type === "codex_manual_next_step" || type === "codex_agent_message") {
    return "model";
  }
  if (type.startsWith("verification_command")) {
    return "command";
  }
  if (type.startsWith("sandbox") || type.startsWith("verification") || type === "codex_sandbox_diff_inspected") {
    return "tool";
  }
  if (type.startsWith("memory") || type.startsWith("candidate_rule")) {
    return "memory";
  }
  if (type === "run_finished") {
    return "done";
  }
  return "thinking";
}

const runEventKindLabels: Record<ThreadMessageDetailKind, string> = {
  thinking: "Thinking",
  tool: "Tool",
  command: "Command",
  model: "Model",
  memory: "Memory",
  done: "Done",
  system: "System",
  error: "Error",
};

function formatRunEventTitle(type: RunEvent["type"]): string {
  return type.replaceAll("_", " ");
}

function formatTaskRunPhaseLabel(type: RunEvent["type"]): string {
  const phase = runEventTaskPhase(type);
  return phase[0].toUpperCase() + phase.slice(1);
}

function runEventDetailItems(event: RunEvent): string[] {
  const payload = isRecord(event.payload) ? event.payload : {};
  const details: string[] = [];
  const actor = event.actor.displayName ?? event.actor.id;
  if (actor) {
    details.push(`Actor: ${actor}`);
  }
  const commandRecord = isRecord(payload.command) ? payload.command : {};
  const evidenceRecord = isRecord(payload.evidence) ? payload.evidence : {};
  const command =
    payloadString(payload, "command") ??
    payloadString(payload, "displayName") ??
    payloadString(commandRecord, "displayName") ??
    payloadString(commandRecord, "command") ??
    payloadString(evidenceRecord, "command") ??
    payloadString(evidenceRecord, "label");
  if (command) {
    details.push(`Command: ${truncateUiText(command, 240)}`);
  }
  const argv = compactValue(payload.argv);
  if (argv) {
    details.push(`Args: ${truncateUiText(argv, 260)}`);
  }
  const status = payloadString(payload, "status");
  if (status) {
    details.push(`Status: ${status}`);
  }
  const exitCode = payloadNumber(payload, "exitCode") ?? payloadNumber(evidenceRecord, "exitCode");
  if (exitCode !== null) {
    details.push(`Exit code: ${exitCode}`);
  }
  const duration = formatDurationMs(payloadNumber(payload, "durationMs") ?? payloadNumber(evidenceRecord, "durationMs"));
  if (duration) {
    details.push(`Duration: ${duration}`);
  }
  const stdout = payloadString(payload, "stdout") ?? payloadString(payload, "stdoutSummary") ?? payloadString(evidenceRecord, "stdout");
  if (stdout) {
    details.push(`stdout: ${truncateUiText(stdout)}`);
  }
  const stderr = payloadString(payload, "stderr") ?? payloadString(payload, "stderrSummary") ?? payloadString(evidenceRecord, "stderr");
  if (stderr) {
    details.push(`stderr: ${truncateUiText(stderr)}`);
  }
  const modelResponse = payloadString(payload, "lastMessagePreview");
  if (modelResponse) {
    details.push(`Model response: ${truncateUiText(modelResponse, 700)}`);
  }
  const failureReasons = compactValue(payload.failureReasons);
  if (failureReasons) {
    details.push(`Failure reasons: ${failureReasons}`);
  }
  if (event.safety?.reasons.length) {
    details.push(`Policy: ${event.safety.reasons.join("; ")}`);
  }
  if (event.verdict) {
    details.push(`Verdict: ${event.verdict.status} — ${event.verdict.reason}`);
  }
  if (event.artifacts.length > 0) {
    details.push(`Artifacts: ${event.artifacts.map((artifact) => artifact.label).join(", ")}`);
  }
  if (event.redaction.applied) {
    details.push(`Redaction: ${event.redaction.redactedPaths.join(", ") || "applied"}`);
  }
  return details;
}

function runEventToThreadMessage(event: RunEvent): ThreadMessage {
  const payload = isRecord(event.payload) ? event.payload : {};
  const summary = payloadString(payload, "summary") ?? formatRunEventTitle(event.type);
  const kind = runEventKind(event.type);
  return {
    id: event.id,
    runId: event.runId,
    role: "system",
    detailKind: kind,
    content: `${formatTaskRunPhaseLabel(event.type)}: ${formatRunEventTitle(event.type)} — ${summary}`,
    detailItems: runEventDetailItems(event),
  };
}

function isRepositoryHarnessCompletionFallbackMessage(message: ThreadMessage): boolean {
  return (
    message.role === "agent" &&
    Boolean(message.runId) &&
    message.id.includes("agent-run-complete") &&
    (message.content ?? "").startsWith("Repository harness run completed for ")
  );
}

function isInternalAgentRunMessage(message: ThreadMessage): boolean {
  return isRepositoryHarnessCompletionFallbackMessage(message);
}

function noFinalModelResponseContent(runId?: string): string {
  const runReference = runId ? ` for run ${runId}` : "";
  return `I finished the repository run${runReference}, but it did not return a final model response. Open Agent details or the persisted evidence to inspect the run events, artifacts, and verification output.`;
}

function toUiPermissionMode(mode: SettingsSnapshot["permissionMode"]): PermissionModeOption {
  if (mode === "manual") {
    return "ask-first";
  }
  return "safe";
}

function toSettingsPermissionMode(mode: PermissionModeOption): SettingsSnapshot["permissionMode"] {
  if (mode === "ask-first" || mode === "locked") {
    return "manual";
  }
  return "safe";
}

function toUiThinkingEffort(effort: ThinkingEffort | undefined): ThinkingEffortOption {
  if (!effort) {
    return "medium";
  }
  return thinkingEffortOptions.some((option) => option.value === effort) ? effort : "medium";
}

function supportedThinkingEffortsForModel(model: SetupModelOption | null | undefined): ThinkingEffortOption[] {
  const supportedEfforts = model?.supportedThinkingEfforts ?? [];
  return supportedEfforts.filter((effort): effort is ThinkingEffortOption => thinkingEffortOptions.some((option) => option.value === effort));
}

function thinkingEffortOptionsForModel(model: SetupModelOption | null | undefined) {
  const supportedEfforts = supportedThinkingEffortsForModel(model);
  return thinkingEffortOptions.filter((option) => supportedEfforts.includes(option.value));
}

function resolveThinkingEffortForModel(model: SetupModelOption | null | undefined, currentEffort: ThinkingEffortOption): ThinkingEffortOption {
  const supportedEfforts = supportedThinkingEffortsForModel(model);
  if (supportedEfforts.length === 0) {
    return currentEffort;
  }
  if (supportedEfforts.includes(currentEffort)) {
    return currentEffort;
  }
  const defaultEffort = model?.defaultThinkingEffort;
  if (defaultEffort && supportedEfforts.includes(defaultEffort)) {
    return defaultEffort;
  }
  if (supportedEfforts.includes("medium")) {
    return "medium";
  }
  return supportedEfforts[0] ?? currentEffort;
}

function codexConnectionIsReady(settings: SettingsSnapshot | null): boolean {
  return settings?.codexConnection?.status === "ready";
}

function codexConnectionStatusLabel(reference: CodexConnectionReference | null | undefined): string {
  if (!reference) {
    return "Codex connection required";
  }
  if (reference.status === "ready") {
    return "Ready";
  }
  if (reference.status === "missing") {
    return "Missing";
  }
  if (reference.status === "authRequired") {
    return "Login required";
  }
  if (reference.status === "failed") {
    return "Connection failed";
  }
  return "Check required";
}

function codexConnectionStatusMessage(reference: CodexConnectionReference | null | undefined): string {
  if (!reference) {
    return "Codex connection is required before real supervised tasks.";
  }
  return reference.lastPreflight?.reasons[0] ?? "Run the Codex CLI provider check before real supervised tasks.";
}

function messageFromUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function repositoryRunnerErrorMessage(error: unknown): string {
  const rawMessage = messageFromUnknownError(error, "Unknown repository runner error.").replace(/\s+/g, " ").trim();
  const withoutStack = rawMessage.replace(/\s+at\s+[A-Za-z_$][\w$.[\]<>]*(?:\s|\().*$/s, "").trim();
  return withoutStack.replace(/^repository run failed:\s*/i, "").replace(/^Error:\s*/i, "") || "Unknown repository runner error.";
}

function isRepositoryPathSelectionError(message: string): boolean {
  return message === "repositoryPath must point to a selected local directory";
}

type SetupNoticeTone = "info" | "success" | "warning" | "error";

function setupLogTextClassName(tone: SetupNoticeTone): string {
  return `setup-log-text setup-log-text-${tone}`;
}

function preflightTone(ready: boolean, status: string): SetupNoticeTone {
  if (ready) {
    return "success";
  }
  return status === "failed" || status === "missing" ? "error" : "warning";
}

function LoadingSpinner() {
  return <LoaderCircle className="ui-icon loading-spinner" aria-hidden="true" strokeWidth={2} />;
}

function LoadingButtonContent({
  children,
  isLoading,
  loadingLabel,
}: {
  children: ReactNode;
  isLoading: boolean;
  loadingLabel: string;
}) {
  if (!isLoading) {
    return <>{children}</>;
  }
  return (
    <span className="loading-button-content">
      <LoadingSpinner />
      <span>{loadingLabel}</span>
    </span>
  );
}

function codexPreflightSetupMessage(result: CodexConnectionPreflightResult, fallback: string): string {
  if (result.ready) {
    return result.reasons[0] ?? fallback;
  }
  if (result.status === "authRequired") {
    return "No authenticated Codex CLI session was detected. Open Codex login here to run `codex login` in a terminal, or run it manually, then return to setup.";
  }
  return result.reasons[0] ?? fallback;
}

function modelConnectionFromSettings(settings: SettingsSnapshot | null): ModelConnectionReference | null {
  return settings?.modelConnection ?? null;
}

function modelConnectionIsReady(settings: SettingsSnapshot | null): boolean {
  return modelConnectionFromSettings(settings)?.status === "ready";
}

function modelConnectionStatusLabel(reference: ModelConnectionReference | null | undefined): string {
  if (!reference) {
    return "Provider setup required";
  }
  if (reference.status === "ready") {
    return "Ready";
  }
  if (reference.status === "missing") {
    return "Missing";
  }
  if (reference.status === "authRequired") {
    return "Login required";
  }
  if (reference.status === "failed") {
    return "Connection failed";
  }
  return "Check required";
}

function modelConnectionStatusMessage(reference: ModelConnectionReference | null | undefined): string {
  if (!reference) {
    return "Choose a provider and run the provider check before real supervised tasks.";
  }
  return reference.lastPreflight?.reasons[0] ?? "Save provider setup and run the provider check before real supervised tasks.";
}

function artifactStatusLabel(status: ArtifactEvidenceStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "unavailable":
      return "Unavailable";
    case "corrupted":
      return "Corrupted";
  }
}

const composerAttachmentOptionGroups = [
  [
    { id: "files", label: "Add files or photos", Icon: Paperclip, disabled: true, helper: "Unavailable in beta" },
    { id: "screenshot", label: "Take a screenshot", Icon: Camera, disabled: true, helper: "Unavailable in beta" },
    { id: "project", label: "Add to project", Icon: FolderPlus, hasSubmenu: true },
    { id: "github", label: "Add from GitHub", Icon: GitBranch, disabled: true, helper: "Unavailable in beta" },
  ],
  [
    { id: "skills", label: "Skills", Icon: Blocks, hasSubmenu: true },
    { id: "connectors", label: "Connectors", Icon: Plug, hasSubmenu: true },
    { id: "plugins", label: "Add plugins...", Icon: Puzzle },
  ],
  [{ id: "web-search", label: "Web search", Icon: Globe2, checked: false, disabled: true, helper: "Unavailable in beta" }],
] as const;

const messageBlockMetaStorageKey = "orynt:message-block-meta-visible:v1";
const legacyMessageBlockMetaStorageKey = "codepawl:message-block-meta-visible:v1";
const privateBetaOnboardingStorageKey = "orynt:private-beta-onboarding:v1";
const legacyPrivateBetaOnboardingStorageKey = "codepawl:private-beta-onboarding:v1";
const threadStateStorageKey = "orynt:thread-state:v1";
const modelsDevProviderCatalogStoragePrefix = "orynt:models-dev-provider-catalog:v1:";
const modelsDevCatalogMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const mobileWorkspaceMediaQuery = "(max-width: 720px)";

function readPrivateBetaOnboardingDismissed() {
  try {
    return (
      window.localStorage.getItem(privateBetaOnboardingStorageKey) === "dismissed" ||
      window.localStorage.getItem(legacyPrivateBetaOnboardingStorageKey) === "dismissed"
    );
  } catch {
    return false;
  }
}

function readMessageBlockMetaVisible() {
  try {
    return (
      window.localStorage.getItem(messageBlockMetaStorageKey) === "true" ||
      window.localStorage.getItem(legacyMessageBlockMetaStorageKey) === "true"
    );
  } catch {
    return false;
  }
}

function readMobileWorkspaceViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(mobileWorkspaceMediaQuery).matches;
}

const workTypeOptions: Array<{ value: SettingsSnapshot["operatorProfile"]["workType"]; label: string }> = [
  { value: "engineering", label: "Engineering" },
  { value: "data-science", label: "Data science" },
  { value: "qa-automation", label: "QA automation" },
  { value: "indie-builder", label: "Indie builder" },
];

const appearanceOptions: Array<{ value: SettingsSnapshot["uiPreferences"]["appearance"]; label: string; ariaLabel: string; Icon: LucideIcon }> = [
  { value: "system", label: "System", ariaLabel: "Use system appearance", Icon: Monitor },
  { value: "light", label: "Light", ariaLabel: "Use light appearance", Icon: Sun },
  { value: "dark", label: "Dark", ariaLabel: "Use dark appearance", Icon: Moon },
];

const chatFontOptions: Array<{ value: SettingsSnapshot["uiPreferences"]["chatFont"]; label: string }> = [
  { value: "orynt-sans", label: "Orynt Sans" },
  { value: "orynt-serif", label: "Orynt Serif" },
  { value: "system", label: "System" },
];

const motionOptions: Array<{ value: SettingsSnapshot["uiPreferences"]["motion"]; label: string; ariaLabel: string }> = [
  { value: "system", label: "System", ariaLabel: "Use system motion" },
  { value: "reduced", label: "Reduced", ariaLabel: "Use reduced motion" },
];

const voiceLanguageOptions: Array<{ value: SettingsSnapshot["voicePreferences"]["language"]; label: string }> = [{ value: "english", label: "English" }];

const voiceStyleOptions: Array<{ value: SettingsSnapshot["voicePreferences"]["style"]; label: string }> = [
  { value: "buttery", label: "Buttery" },
  { value: "precise", label: "Precise" },
  { value: "direct", label: "Direct" },
];

const voiceSpeedOptions: Array<{ value: SettingsSnapshot["voicePreferences"]["speed"]; label: string }> = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
];

type SetupModelOption = {
  defaultThinkingEffort?: ThinkingEffort | null;
  id: string;
  label: string;
  description?: string | null;
  ownedBy?: string | null;
  source?: ModelProviderId;
  supportedThinkingEfforts?: ThinkingEffort[] | null;
};

type SetupProviderOption = {
  id: ModelProviderId;
  label: string;
  description: string;
  authMethods: ModelAuthMethod[];
  defaultAuthMethod: ModelAuthMethod;
  defaultEnvKey?: string;
};

type OryntDropdownOption = {
  description?: string;
  label: string;
  value: string;
};

type OryntDropdownPlacement = "dropdown" | "dropup";

type CachedProviderModelCatalog = {
  fetchedAt: string;
  models: ModelCatalogOption[];
  providerId: ModelProviderId;
};

type ModelsDevProvider = {
  models?: Record<string, ModelsDevModel>;
};

type ModelsDevModel = {
  description?: string;
  id?: string;
  last_updated?: string;
  modalities?: {
    output?: string[];
  };
  name?: string;
  owned_by?: string;
  reasoning?: boolean;
  release_date?: string;
};

const dropdownMenuGap = 8;
const dropdownViewportPadding = 12;

const setupProviderOptions: SetupProviderOption[] = [
  {
    id: "codex-cli",
    label: "Codex CLI",
    description: "Uses your local Codex CLI session.",
    authMethods: ["codexCliSession"],
    defaultAuthMethod: "codexCliSession",
  },
  {
    id: "openai-api",
    label: "OpenAI API",
    description: "Uses OPENAI_API_KEY from your environment.",
    authMethods: ["apiKeyEnv"],
    defaultAuthMethod: "apiKeyEnv",
    defaultEnvKey: "OPENAI_API_KEY",
  },
];

function modelsDevProviderIdForSetupProvider(_providerId: ModelProviderId): string {
  return "openai";
}

function modelsDevCacheKey(providerId: ModelProviderId): string {
  return `${modelsDevProviderCatalogStoragePrefix}${providerId}`;
}

function readCachedProviderModelCatalog(providerId: ModelProviderId): CachedProviderModelCatalog | null {
  try {
    const raw = window.localStorage.getItem(modelsDevCacheKey(providerId));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.providerId !== providerId || typeof parsed.fetchedAt !== "string" || !Array.isArray(parsed.models)) {
      return null;
    }
    const fetchedAtMs = Date.parse(parsed.fetchedAt);
    if (!Number.isFinite(fetchedAtMs) || Date.now() - fetchedAtMs > modelsDevCatalogMaxAgeMs) {
      return null;
    }
    return parsed as CachedProviderModelCatalog;
  } catch {
    return null;
  }
}

function writeCachedProviderModelCatalog(providerId: ModelProviderId, models: ModelCatalogOption[]): CachedProviderModelCatalog {
  const cached = {
    fetchedAt: new Date().toISOString(),
    models,
    providerId,
  } satisfies CachedProviderModelCatalog;
  try {
    window.localStorage.setItem(modelsDevCacheKey(providerId), JSON.stringify(cached));
  } catch {
    // Cache writes are an optimization only.
  }
  return cached;
}

function modelsDevModelSupportsRepositoryRuns(modelId: string, model: ModelsDevModel): boolean {
  const normalizedId = modelId.trim().toLowerCase();
  if (!normalizedId) {
    return false;
  }
  if (model.modalities?.output && !model.modalities.output.includes("text")) {
    return false;
  }
  return ![
    "audio-",
    "babbage",
    "dall-e",
    "embedding",
    "image-",
    "omni-moderation",
    "text-embedding-",
    "tts-",
    "whisper-",
  ].some((prefix) => normalizedId.startsWith(prefix));
}

function modelsDevThinkingEffortsForModel(modelId: string): Pick<ModelCatalogOption, "supportedThinkingEfforts" | "defaultThinkingEffort"> {
  if (modelId === "gpt-5.5") {
    return { supportedThinkingEfforts: ["none", "low", "medium", "high", "xhigh"], defaultThinkingEffort: "medium" };
  }
  if (modelId === "gpt-5.5-pro") {
    return { supportedThinkingEfforts: ["medium", "high", "xhigh"], defaultThinkingEffort: "high" };
  }
  if (["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2"].includes(modelId)) {
    return { supportedThinkingEfforts: ["none", "low", "medium", "high", "xhigh"], defaultThinkingEffort: "none" };
  }
  if (modelId === "gpt-5.4-pro") {
    return { supportedThinkingEfforts: ["medium", "high", "xhigh"], defaultThinkingEffort: "medium" };
  }
  if (modelId === "gpt-5.1") {
    return { supportedThinkingEfforts: ["none", "low", "medium", "high"], defaultThinkingEffort: "none" };
  }
  if (modelId === "gpt-5") {
    return { supportedThinkingEfforts: ["minimal", "low", "medium", "high"], defaultThinkingEffort: "medium" };
  }
  if (modelId === "gpt-5-pro") {
    return { supportedThinkingEfforts: ["high"], defaultThinkingEffort: "high" };
  }
  return { supportedThinkingEfforts: null, defaultThinkingEffort: null };
}

function modelsDevProviderToOptions(providerId: ModelProviderId, provider: ModelsDevProvider): ModelCatalogOption[] {
  const models = Object.entries(provider.models ?? {})
    .filter(([modelId, model]) => modelsDevModelSupportsRepositoryRuns(modelId, model))
    .map(([modelId, model]) => {
      const thinkingEfforts = modelsDevThinkingEffortsForModel(modelId);
      return {
        id: model.id?.trim() || modelId,
        label: model.name?.trim() || modelId,
        description: model.description ?? null,
        ownedBy: model.owned_by ?? null,
        source: providerId,
        ...thinkingEfforts,
        releaseDate: model.release_date ?? model.last_updated ?? "",
      };
    })
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate) || left.label.localeCompare(right.label));

  return models.map(({ releaseDate: _releaseDate, ...model }) => model);
}

async function fetchModelsDevProviderCatalog(providerId: ModelProviderId): Promise<CachedProviderModelCatalog | null> {
  if (typeof fetch !== "function") {
    return null;
  }
  try {
    const response = await fetch("https://models.dev/api.json", { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return null;
    }
    const catalog: unknown = await response.json();
    if (!isRecord(catalog)) {
      return null;
    }
    const provider = catalog[modelsDevProviderIdForSetupProvider(providerId)];
    if (!isRecord(provider)) {
      return null;
    }
    const models = modelsDevProviderToOptions(providerId, provider as ModelsDevProvider);
    if (models.length === 0) {
      return null;
    }
    return writeCachedProviderModelCatalog(providerId, models);
  } catch {
    return null;
  }
}

function setupProviderById(providerId: ModelProviderId | null | undefined): SetupProviderOption | null {
  return setupProviderOptions.find((provider) => provider.id === providerId) ?? null;
}

function setupModelById(models: SetupModelOption[], modelId: string | null | undefined): SetupModelOption | null {
  if (!modelId) {
    return null;
  }
  return models.find((model) => model.id === modelId) ?? null;
}

function dropdownBoundaryForTrigger(trigger: HTMLElement) {
  let top = dropdownViewportPadding;
  let bottom = window.innerHeight - dropdownViewportPadding;
  let ancestor = trigger.parentElement;

  while (ancestor && ancestor !== document.documentElement) {
    const style = window.getComputedStyle(ancestor);
    const overflow = `${style.overflow} ${style.overflowY}`;
    if (/(auto|scroll|hidden|clip)/.test(overflow)) {
      const rect = ancestor.getBoundingClientRect();
      top = Math.max(top, rect.top + dropdownViewportPadding);
      bottom = Math.min(bottom, rect.bottom - dropdownViewportPadding);
    }
    ancestor = ancestor.parentElement;
  }

  if (bottom <= top) {
    return { top: dropdownViewportPadding, bottom: window.innerHeight - dropdownViewportPadding };
  }

  return { top, bottom };
}

function resolveOryntDropdownLayout(trigger: HTMLElement, menu: HTMLElement): { maxHeight: number; placement: OryntDropdownPlacement } {
  const triggerRect = trigger.getBoundingClientRect();
  const boundary = dropdownBoundaryForTrigger(trigger);
  const spaceBelow = boundary.bottom - triggerRect.bottom - dropdownMenuGap;
  const spaceAbove = triggerRect.top - boundary.top - dropdownMenuGap;
  const desiredHeight = Math.max(72, Math.min(menu.scrollHeight || 260, window.innerHeight - dropdownViewportPadding * 2));
  const placement = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove ? "dropdown" : "dropup";
  const availableSpace = placement === "dropdown" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(72, Math.min(desiredHeight, availableSpace));

  return { maxHeight: Math.round(maxHeight), placement };
}

type OryntDropdownProps = {
  ariaLabel: string;
  className?: string;
  density?: "compact" | "comfortable";
  disabled?: boolean;
  id: string;
  onChange: (value: string) => void;
  options: OryntDropdownOption[];
  placeholder: string;
  value: string;
};

export function OryntDropdown({
  ariaLabel,
  className,
  density = "compact",
  disabled = false,
  id,
  onChange,
  options,
  placeholder,
  value,
}: OryntDropdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const placementFrameRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState<string>("");
  const [menuPlacement, setMenuPlacement] = useState<OryntDropdownPlacement>("dropdown");
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const displayLabel = selectedOption?.label ?? placeholder;
  const listboxId = `${id}-listbox`;
  const highlightedOptionIndex = isOpen ? options.findIndex((option) => option.value === highlightedValue) : -1;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (isOpen) {
      setHighlightedValue(value || options[0]?.value || "");
    }
  }, [isOpen, options, value]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuMaxHeight(null);
      return undefined;
    }

    const updatePlacement = () => {
      if (!triggerRef.current || !menuRef.current) {
        return;
      }
      const nextLayout = resolveOryntDropdownLayout(triggerRef.current, menuRef.current);
      setMenuPlacement((current) => (current === nextLayout.placement ? current : nextLayout.placement));
      setMenuMaxHeight((current) => (current === nextLayout.maxHeight ? current : nextLayout.maxHeight));
    };

    const schedulePlacementUpdate = () => {
      if (placementFrameRef.current !== null) {
        return;
      }
      placementFrameRef.current = window.requestAnimationFrame(() => {
        placementFrameRef.current = null;
        updatePlacement();
      });
    };

    updatePlacement();
    window.addEventListener("resize", schedulePlacementUpdate, { passive: true });
    window.addEventListener("scroll", schedulePlacementUpdate, { capture: true, passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(schedulePlacementUpdate);
      if (rootRef.current) {
        resizeObserver.observe(rootRef.current);
      }
      if (menuRef.current) {
        resizeObserver.observe(menuRef.current);
      }
    }

    return () => {
      window.removeEventListener("resize", schedulePlacementUpdate);
      window.removeEventListener("scroll", schedulePlacementUpdate, { capture: true });
      resizeObserver?.disconnect();
      if (placementFrameRef.current !== null) {
        window.cancelAnimationFrame(placementFrameRef.current);
        placementFrameRef.current = null;
      }
    };
  }, [isOpen, options.length]);

  const selectOption = (nextValue: string) => {
    if (disabled || !options.some((option) => option.value === nextValue)) {
      return;
    }
    setHighlightedValue(nextValue);
    setIsOpen(false);
    triggerRef.current?.blur();
    onChange(nextValue);
  };

  const handleOptionPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, nextValue: string) => {
    event.preventDefault();
    event.stopPropagation();
    selectOption(nextValue);
  };

  const moveHighlight = (direction: 1 | -1) => {
    if (options.length === 0) {
      return;
    }
    const currentIndex = Math.max(
      0,
      options.findIndex((option) => option.value === (highlightedValue || value)),
    );
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    setHighlightedValue(options[nextIndex]?.value ?? "");
  };


  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      const nextValue = highlightedValue || value || options[0]?.value;
      if (nextValue !== undefined) {
        selectOption(nextValue);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className={`orynt-dropdown orynt-dropdown-density-${density}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        aria-activedescendant={highlightedOptionIndex >= 0 ? `${id}-option-${highlightedOptionIndex}` : undefined}
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={disabled ? false : isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`input-focus-standalone settings-select orynt-dropdown-trigger${selectedOption ? "" : " orynt-dropdown-trigger-placeholder"}`}
        disabled={disabled}
        id={id}
        onClick={() => {
          if (!disabled) {
            setIsOpen((current) => !current);
          }
        }}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span>{displayLabel}</span>
        <ChevronsUpDown className="orynt-dropdown-icon" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          className={`orynt-dropdown-menu orynt-dropdown-menu-${menuPlacement}`}
          data-placement={menuPlacement}
          id={listboxId}
          ref={menuRef}
          role="listbox"
          aria-label={`${ariaLabel} options`}
          style={menuMaxHeight ? { maxHeight: `${menuMaxHeight}px` } : undefined}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = option.value === highlightedValue;
            const optionId = `${id}-option-${index}`;
            return (
              <button
                aria-selected={isSelected}
                className={`orynt-dropdown-option${isHighlighted ? " orynt-dropdown-option-highlighted" : ""}${isSelected ? " orynt-dropdown-option-selected" : ""}`}
                id={optionId}
                key={option.value}
                onClick={() => selectOption(option.value)}
                onMouseEnter={() => setHighlightedValue(option.value)}
                onPointerDown={(event) => handleOptionPointerDown(event, option.value)}
                role="option"
                type="button"
              >
                <strong className="orynt-dropdown-option-title">{option.label}</strong>
                {option.description ? <small className="orynt-dropdown-option-description">{option.description}</small> : null}
                {isSelected ? <Check className="orynt-dropdown-check" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SettingsLabelWithInfo({
  info,
  infoLabel,
  label,
}: {
  info: string;
  infoLabel: string;
  label: string;
}) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipId = `${infoLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-tooltip`;

  return (
    <span className="settings-label-with-info">
      <span>{label}</span>
      <button
        aria-describedby={isTooltipVisible ? tooltipId : undefined}
        aria-label={infoLabel}
        className="settings-info-button"
        onBlur={() => setIsTooltipVisible(false)}
        onFocus={() => setIsTooltipVisible(true)}
        onMouseEnter={() => setIsTooltipVisible(true)}
        onMouseLeave={() => setIsTooltipVisible(false)}
        type="button"
      >
        <Info className="settings-info-icon" aria-hidden="true" />
      </button>
      {isTooltipVisible ? (
        <span className="settings-info-tooltip" id={tooltipId} role="tooltip">
          {info}
        </span>
      ) : null}
    </span>
  );
}

const settingsSections = [
  { id: "general", label: "General", group: "Settings", keywords: ["profile", "appearance", "operator", "message", "labels", "display", "voice", "font", "motion"], Icon: SettingsIcon },
  { id: "model", label: "Model", group: "Settings", keywords: ["provider", "model", "codex", "openai", "thinking", "effort"], Icon: Cpu },
  { id: "memory", label: "Memory", group: "Settings", keywords: ["memory", "semantic", "rules", "episodes", "trash", "retention"], Icon: Database },
  { id: "status", label: "Status", group: "Settings", keywords: ["status", "beta", "surface", "repository", "browser", "desktop", "files", "terminal", "cloud", "billing"], Icon: ShieldCheck },
  { id: "account", label: "Account", group: "Settings", keywords: ["identity", "session", "workspace", "devices"], Icon: CircleUserRound },
  { id: "billing", label: "Billing", group: "Settings", keywords: ["plan", "invoice", "subscription", "local"], Icon: CreditCard },
] as const;

type AccountMenuItem = {
  action: "future" | "logout" | "settings" | "skills";
  hasSubmenu?: boolean;
  Icon: LucideIcon;
  id: string;
  label: string;
};

const accountMenuGroups = [
  [{ id: "settings", label: "Settings", Icon: SettingsIcon, action: "settings" }],
  [
    { id: "language", label: "Language", Icon: Languages, action: "future", hasSubmenu: true },
    { id: "help", label: "Get help", Icon: BookOpen, action: "future" },
  ],
  [
    { id: "upgrade", label: "Upgrade plan", Icon: CreditCard, action: "future" },
    { id: "apps", label: "Get apps and extensions", Icon: Download, action: "skills" },
    { id: "gift", label: "Gift Orynt", Icon: Gift, action: "future" },
    { id: "learn", label: "Learn more", Icon: Info, action: "future", hasSubmenu: true },
  ],
  [{ id: "logout", label: "Log out", Icon: LogOut, action: "logout" }],
] satisfies AccountMenuItem[][];

type PermissionModeOption = (typeof permissionModeOptions)[number]["value"];
type ThinkingEffortOption = (typeof thinkingEffortOptions)[number]["value"];
type ComposerMetaMenuPlacement = "dropdown" | "dropup";
type SettingsSectionId = (typeof settingsSections)[number]["id"];
type SurfaceToggleState = Record<SurfaceKind, boolean>;

const composerPermissionMenuEstimatedHeight = 160;
const composerAttachmentMenuEstimatedHeight = 344;
const composerMenuGap = 8;

function resolveComposerMenuPlacement(trigger: HTMLElement, estimatedMenuHeight: number): ComposerMetaMenuPlacement {
  const triggerRect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;

  return spaceBelow >= estimatedMenuHeight + composerMenuGap || spaceBelow >= spaceAbove ? "dropdown" : "dropup";
}

type ShellModalProps = {
  bodyClassName?: string;
  children: ReactNode;
  id: string;
  label: string;
  modalClassName?: string;
  onClose: () => void;
  variant?: "plain" | "atmospheric";
};

type ChatBubbleTone = "neutral" | "user" | "agent" | "approval" | "metric" | "panel";
type ChatBubbleAlign = "start" | "center" | "end";
type ChatBubbleWidth = "compact" | "full";

type ChatBubbleProps = {
  actions?: ReactNode;
  align?: ChatBubbleAlign;
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  footer?: ReactNode;
  headerAccessory?: ReactNode;
  title?: string;
  tone?: ChatBubbleTone;
  width?: ChatBubbleWidth;
};

type MessageBlockProps = {
  align?: ChatBubbleAlign;
  children: ReactNode;
  messageId?: string;
  meta?: string;
  role: ThreadMessage["role"];
  showMeta?: boolean;
};

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function titleCaseStatus(status: string): string {
  const normalized = status.replaceAll("_", " ");
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function normalizeSelectedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
function isLocalGreetingPrompt(prompt: string): boolean {
  return /^(hi|hello|hey|yo|sup|howdy|say\s+(?:hi|hello))[.!?\s]*$/i.test(prompt.trim());
}

function isLocalSmokeTestPrompt(prompt: string): boolean {
  return /^(?:test|testing|smoke\s*test|ping)(?:\s+(?:nè|ne|nha|nhé|nhe|thử|thu|xem|coi|lại|lai|đi|di))*[.!?\s]*$/iu.test(normalizeSelectedText(prompt));
}

function localShortPromptResponse(prompt: string): string | null {
  if (isLocalGreetingPrompt(prompt)) {
    return "Hi — send a repository task when you want me to inspect or change the selected project.";
  }
  if (isLocalSmokeTestPrompt(prompt)) {
    return "Test received — send a repository task when you want me to inspect or change the selected project.";
  }
  return null;
}

function safeMarkdownLinkHref(rawHref: string): string | null {
  const href = rawHref.trim();
  if (!href) {
    return null;
  }
  if (href.startsWith("#")) {
    return href;
  }
  return /^(https?:|mailto:)/i.test(href) ? href : null;
}

function renderMarkdownInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let textBuffer = "";

  const flushText = () => {
    if (textBuffer) {
      nodes.push(textBuffer);
      textBuffer = "";
    }
  };

  const readDelimited = (marker: string) => {
    if (!text.startsWith(marker, index)) {
      return false;
    }
    const end = text.indexOf(marker, index + marker.length);
    if (end <= index + marker.length - 1) {
      return false;
    }
    const value = text.slice(index + marker.length, end);
    flushText();
    const key = `${keyPrefix}-${nodes.length}`;
    if (marker === "`") {
      nodes.push(<code key={key}>{value}</code>);
    } else if (marker === "~~") {
      nodes.push(<del key={key}>{renderMarkdownInline(value, key)}</del>);
    } else if (marker === "**" || marker === "__") {
      nodes.push(<strong key={key}>{renderMarkdownInline(value, key)}</strong>);
    } else {
      nodes.push(<em key={key}>{renderMarkdownInline(value, key)}</em>);
    }
    index = end + marker.length;
    return true;
  };

  while (index < text.length) {
    const char = text[index];
    if (char === "\\" && index + 1 < text.length) {
      textBuffer += text[index + 1];
      index += 2;
      continue;
    }
    if (char === "[") {
      const labelEnd = text.indexOf("](", index + 1);
      const hrefEnd = labelEnd >= 0 ? text.indexOf(")", labelEnd + 2) : -1;
      if (labelEnd > index && hrefEnd > labelEnd) {
        const rawHref = text.slice(labelEnd + 2, hrefEnd).trim();
        const href = safeMarkdownLinkHref(rawHref);
        if (href) {
          flushText();
          const key = `${keyPrefix}-${nodes.length}`;
          nodes.push(
            <a key={key} href={href} target={href.startsWith("#") ? undefined : "_blank"} rel={href.startsWith("#") ? undefined : "noreferrer"}>
              {renderMarkdownInline(text.slice(index + 1, labelEnd), key)}
            </a>,
          );
          index = hrefEnd + 1;
          continue;
        }
        if (rawHref.startsWith("/") || /^file:/i.test(rawHref)) {
          flushText();
          const key = `${keyPrefix}-${nodes.length}`;
          nodes.push(<span key={key}>{renderMarkdownInline(text.slice(index + 1, labelEnd), key)}</span>);
          index = hrefEnd + 1;
          continue;
        }
      }
    }
    if (readDelimited("**") || readDelimited("__") || readDelimited("~~") || readDelimited("`") || readDelimited("*") || readDelimited("_")) {
      continue;
    }
    textBuffer += char;
    index += 1;
  }
  flushText();
  return nodes;
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function markdownLineStartsBlock(line: string, nextLine?: string): boolean {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^-{3,}\s*$/.test(line.trim()) ||
    /^>\s?/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    Boolean(nextLine && line.includes("|") && isMarkdownTableDivider(nextLine))
  );
}

type MarkdownListItem = {
  checked?: boolean;
  content: string;
  indent: number;
  kind: "ordered" | "unordered";
  ordinal?: number;
};

function parseMarkdownListItem(line: string): MarkdownListItem | null {
  const match = line.match(/^(\s*)(?:(\d+)[.)]|[-*+])\s+(.+)$/);
  if (!match) {
    return null;
  }
  const content = match[3];
  const task = content.match(/^\[([ xX])]\s+(.+)$/);
  return {
    checked: task ? task[1].toLowerCase() === "x" : undefined,
    content: task ? task[2] : content,
    indent: match[1].replace(/\t/g, "  ").length,
    kind: match[2] ? "ordered" : "unordered",
    ordinal: match[2] ? Number(match[2]) : undefined,
  };
}

function renderMarkdownList(lines: string[], startIndex: number, keyPrefix: string): { nextIndex: number; node: ReactNode } {
  const firstItem = parseMarkdownListItem(lines[startIndex]);
  if (!firstItem) {
    throw new Error("Expected a markdown list item.");
  }

  const parseList = (index: number, indent: number, kind: MarkdownListItem["kind"], prefix: string): { nextIndex: number; node: ReactNode } => {
    const items: Array<{ item: MarkdownListItem; children: ReactNode[] }> = [];

    while (index < lines.length) {
      const item = parseMarkdownListItem(lines[index]);
      if (!item || item.indent !== indent || item.kind !== kind) {
        break;
      }
      index += 1;
      const children: ReactNode[] = [];
      while (index < lines.length) {
        const child = parseMarkdownListItem(lines[index]);
        if (!child || child.indent <= indent) {
          break;
        }
        const nested = parseList(index, child.indent, child.kind, `${prefix}-${items.length}-${children.length}`);
        children.push(nested.node);
        index = nested.nextIndex;
      }
      items.push({ item, children });
    }

    const isTaskList = kind === "unordered" && items.some(({ item }) => item.checked !== undefined);
    const content = items.map(({ item, children }, itemIndex) => (
      <li key={`${prefix}-item-${itemIndex}`} value={kind === "ordered" ? item.ordinal : undefined}>
        {item.checked !== undefined ? <input aria-label={item.checked ? "Completed task" : "Incomplete task"} checked={item.checked} disabled type="checkbox" /> : null}
        <span>{renderMarkdownInline(item.content, `${prefix}-item-${itemIndex}`)}</span>
        {children}
      </li>
    ));

    return {
      nextIndex: index,
      node:
        kind === "ordered" ? (
          <ol key={prefix} start={items[0]?.item.ordinal}>
            {content}
          </ol>
        ) : (
          <ul key={prefix} className={isTaskList ? "agent-response-task-list" : undefined}>
            {content}
          </ul>
        ),
    };
  };

  return parseList(startIndex, firstItem.indent, firstItem.kind, keyPrefix);
}

function renderMarkdownContent(markdown: string): ReactNode[] {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(
        <pre className="agent-response-code-block" key={`md-${blocks.length}`}>
          <code className={fence[1] ? `language-${fence[1]}` : undefined}>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const headingContent = renderMarkdownInline(heading[2].trim(), `md-${blocks.length}`);
      blocks.push(
        heading[1].length === 1 ? (
          <h1 key={`md-${blocks.length}`}>{headingContent}</h1>
        ) : heading[1].length === 2 ? (
          <h2 key={`md-${blocks.length}`}>{headingContent}</h2>
        ) : heading[1].length === 3 ? (
          <h3 key={`md-${blocks.length}`}>{headingContent}</h3>
        ) : heading[1].length === 4 ? (
          <h4 key={`md-${blocks.length}`}>{headingContent}</h4>
        ) : heading[1].length === 5 ? (
          <h5 key={`md-${blocks.length}`}>{headingContent}</h5>
        ) : (
          <h6 key={`md-${blocks.length}`}>{headingContent}</h6>
        ),
      );
      index += 1;
      continue;
    }

    if (/^-{3,}\s*$/.test(line.trim())) {
      blocks.push(<div className="agent-response-rule" key={`md-${blocks.length}`} role="separator" />);
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableDivider(lines[index + 1])) {
      const headers = splitMarkdownTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitMarkdownTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="agent-response-table-scroll" key={`md-${blocks.length}`}>
          <table>
            <thead>
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`h-${headerIndex}`}>{renderMarkdownInline(header, `md-${blocks.length}-h-${headerIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`r-${rowIndex}`}>
                  {headers.map((_, cellIndex) => (
                    <td key={`c-${cellIndex}`}>{renderMarkdownInline(row[cellIndex] ?? "", `md-${blocks.length}-r-${rowIndex}-c-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`md-${blocks.length}`}>{renderMarkdownContent(quoteLines.join("\n"))}</blockquote>);
      continue;
    }

    if (parseMarkdownListItem(line)) {
      const list = renderMarkdownList(lines, index, `md-${blocks.length}`);
      blocks.push(list.node);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !markdownLineStartsBlock(lines[index], lines[index + 1])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`md-${blocks.length}`}>{renderMarkdownInline(paragraphLines.join(" "), `md-${blocks.length}`)}</p>);
  }

  return blocks.length > 0 ? blocks : [<p key="md-empty">{markdown}</p>];
}

function summarizeCandidateRuleStatuses(candidateRules: CandidateRule[]): MemoryReviewSnapshot["summary"]["candidateRuleStatusCounts"] {
  return {
    candidate: candidateRules.filter((rule) => rule.status === "candidate").length,
    accepted: candidateRules.filter((rule) => rule.status === "accepted").length,
    rejected: candidateRules.filter((rule) => rule.status === "rejected").length,
    superseded: candidateRules.filter((rule) => rule.status === "superseded").length,
  };
}

function summarizeSkillStatuses(skills: SkillDefinition[]): SkillRegistrySnapshot["summary"]["statusCounts"] {
  return {
    candidate: skills.filter((skill) => skill.status === "candidate").length,
    active: skills.filter((skill) => skill.status === "active").length,
    rejected: skills.filter((skill) => skill.status === "rejected").length,
    superseded: skills.filter((skill) => skill.status === "superseded").length,
    archived: skills.filter((skill) => skill.status === "archived").length,
  };
}

function updateMemoryReviewRule(snapshot: MemoryReviewSnapshot, updatedRule: CandidateRule): MemoryReviewSnapshot {
  const candidateRules = snapshot.candidateRules.map((rule) => (rule.id === updatedRule.id ? updatedRule : rule));
  return {
    ...snapshot,
    candidateRules,
    summary: {
      ...snapshot.summary,
      candidateRuleCount: candidateRules.filter((rule) => rule.status === "candidate").length,
      candidateRuleStatusCounts: summarizeCandidateRuleStatuses(candidateRules),
    },
  };
}

function updateSkillRegistrySkill(snapshot: SkillRegistrySnapshot, updatedSkill: SkillDefinition): SkillRegistrySnapshot {
  const skills = snapshot.skills.map((skill) => (skill.id === updatedSkill.id ? updatedSkill : skill));
  return {
    ...snapshot,
    skills,
    summary: {
      ...snapshot.summary,
      skillCount: skills.length,
      statusCounts: summarizeSkillStatuses(skills),
    },
  };
}

function formatThreadComposerPlaceholder(label: string): string {
  return label === "New task" ? "Describe what Orynt should do..." : `Describe the next task for ${label}...`;
}

function threadTitleFromPrompt(prompt: string): string {
  return truncateUiText(prompt.replace(/\s+/g, " ").trim(), 48);
}

function agentResponseText(message: ThreadMessage): string {
  return message.content?.trim() ?? "";
}


async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function createInitialThreadMessages(): Record<string, ThreadMessage[]> {
  return {
    draft: [],
  };
}

function createDemoThreadMessages(runState: MockRunState): Record<string, ThreadMessage[]> {
  return {
    draft: [
      { id: "draft-user-starter", role: "user", content: runState.activeTask.title },
      {
        id: "draft-runtime-policy",
        role: "system",
        label: "System notice · Runtime policy",
        content: "Controlled repository runtime only. Browser automation is unavailable in this private beta.",
      },
      {
        id: "draft-verifier-handoff",
        role: "system",
        label: "System notice · Verifier handoff",
        content: "Verifier evidence stays separate from result import.",
      },
      { id: "draft-agent-response", role: "agent", label: "Agent response", content: runState.skillDraft.name, showContext: true },
      { id: "draft-approval", role: "approval" },
    ],
  };
}

function createUxrayAgentResponsePreviewThreadState(): ThreadStateSnapshot {
  const workspace = { ...initialWorkspaces[0], label: "Response preview", description: "Local visual review fixture", badge: "preview" };
  return {
    workspaces: [workspace],
    threadMessagesByWorkspace: {
      [workspace.id]: [
        { id: "uxray-preview-user", role: "user", content: "Render a source-backed implementation summary." },
        {
          id: "uxray-preview-agent",
          role: "agent",
          label: "Agent response",
          content:
            "## Completed\n\nImplemented the response rendering repair and preserved the final model answer as the primary transcript content.\n\n## Verification\n\n1. Run the focused desktop test.\n2. Inspect the rendered response structure.\n   - Confirm nested steps remain grouped.\n   - Confirm source details stay outside the answer.\n3. Keep the repository completion metadata in Agent details.",
        },
      ],
    },
    nextWorkspaceThreadIndex: 2,
    activeWorkspaceId: workspace.id,
  };
}

function createInitialThreadState(): ThreadStateSnapshot {
  return {
    workspaces: [...initialWorkspaces],
    threadMessagesByWorkspace: createInitialThreadMessages(),
    nextWorkspaceThreadIndex: 2,
    activeWorkspaceId: "draft",
  };
}

function createDemoThreadState(runState: MockRunState): ThreadStateSnapshot {
  return {
    workspaces: [...initialWorkspaces],
    threadMessagesByWorkspace: createDemoThreadMessages(runState),
    nextWorkspaceThreadIndex: 2,
    activeWorkspaceId: "draft",
  };
}

function sanitizePersistedThreadMessage(value: unknown): ThreadMessage | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.role !== "string") {
    return null;
  }
  if (value.role !== "user" && value.role !== "system" && value.role !== "agent" && value.role !== "approval") {
    return null;
  }
  return {
    id: value.id,
    role: value.role,
    ...(typeof value.content === "string" ? { content: value.content } : {}),
    ...(typeof value.label === "string" ? { label: value.label } : {}),
    ...(typeof value.showContext === "boolean" ? { showContext: value.showContext } : {}),
    ...(typeof value.runId === "string" ? { runId: value.runId } : {}),
    ...(typeof value.detailKind === "string" &&
    (value.detailKind === "thinking" ||
      value.detailKind === "tool" ||
      value.detailKind === "command" ||
      value.detailKind === "model" ||
      value.detailKind === "memory" ||
      value.detailKind === "done" ||
      value.detailKind === "system")
      ? { detailKind: value.detailKind }
      : {}),
    ...(Array.isArray(value.detailItems) && value.detailItems.every((item) => typeof item === "string")
      ? { detailItems: value.detailItems }
      : {}),
  };
}

function sanitizePersistedWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    return null;
  }
  return {
    id: value.id,
    label: value.label,
    description: typeof value.description === "string" ? value.description : "",
    badge: typeof value.badge === "string" ? value.badge : "saved",
    ...(typeof value.archived === "boolean" ? { archived: value.archived } : {}),
  };
}

function readPersistedThreadState(): ThreadStateSnapshot | null {
  try {
    const raw = window.localStorage.getItem(threadStateStorageKey);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.workspaces) || !isRecord(parsed.threadMessagesByWorkspace)) {
      return null;
    }
    const messagesByWorkspace: Record<string, ThreadMessage[]> = {};
    for (const [workspaceId, messages] of Object.entries(parsed.threadMessagesByWorkspace)) {
      if (!Array.isArray(messages)) {
        continue;
      }
      const safeMessages = messages.map(sanitizePersistedThreadMessage).filter((message): message is ThreadMessage => message !== null);
      if (safeMessages.length > 0) {
        messagesByWorkspace[workspaceId] = safeMessages;
      }
    }
    const workspaces = parsed.workspaces
      .map(sanitizePersistedWorkspace)
      .filter((workspace): workspace is Workspace => workspace !== null && (messagesByWorkspace[workspace.id]?.length ?? 0) > 0);
    if (workspaces.length === 0) {
      return null;
    }
    const activeWorkspaceId =
      typeof parsed.activeWorkspaceId === "string" && workspaces.some((workspace) => workspace.id === parsed.activeWorkspaceId)
        ? parsed.activeWorkspaceId
        : workspaces[0].id;
    return {
      workspaces,
      threadMessagesByWorkspace: messagesByWorkspace,
      nextWorkspaceThreadIndex: typeof parsed.nextWorkspaceThreadIndex === "number" && Number.isFinite(parsed.nextWorkspaceThreadIndex)
        ? Math.max(2, Math.floor(parsed.nextWorkspaceThreadIndex))
        : 2,
      activeWorkspaceId,
    };
  } catch {
    return null;
  }
}

function writePersistedThreadState(state: ThreadStateSnapshot): void {
  try {
    const savedWorkspaces = state.workspaces.filter((workspace) => (state.threadMessagesByWorkspace[workspace.id]?.length ?? 0) > 0);
    if (savedWorkspaces.length === 0) {
      window.localStorage.removeItem(threadStateStorageKey);
      return;
    }
    const savedMessages = savedWorkspaces.reduce<Record<string, ThreadMessage[]>>((messages, workspace) => {
      messages[workspace.id] = state.threadMessagesByWorkspace[workspace.id] ?? [];
      return messages;
    }, {});
    const activeWorkspaceId = savedWorkspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
      ? state.activeWorkspaceId
      : savedWorkspaces[0].id;
    window.localStorage.setItem(
      threadStateStorageKey,
      JSON.stringify({
        workspaces: savedWorkspaces,
        threadMessagesByWorkspace: savedMessages,
        nextWorkspaceThreadIndex: state.nextWorkspaceThreadIndex,
        activeWorkspaceId,
      }),
    );
  } catch {
    // Local persistence is a convenience; the active in-memory thread should keep working.
  }
}

function ChatBubble({
  actions,
  align = "start",
  ariaLabel,
  children,
  className,
  footer,
  headerAccessory,
  title,
  tone = "neutral",
  width = "full",
}: ChatBubbleProps) {
  const bubbleClassName = [`chat-bubble`, `chat-bubble-${tone}`, `chat-bubble-align-${align}`, `chat-bubble-width-${width}`, className].filter(Boolean).join(" ");
  const hasHeader = Boolean(title || headerAccessory);

  return (
    <article className={bubbleClassName} aria-label={ariaLabel}>
      {hasHeader ? (
        <div className="chat-bubble-header">
          <div>
            {title ? <h3 className="chat-bubble-title">{title}</h3> : null}
          </div>
          {headerAccessory ? <span className="chat-bubble-header-accessory">{headerAccessory}</span> : null}
        </div>
      ) : null}
      {children ? <div className="chat-bubble-body">{children}</div> : null}
      {footer ? <div className="chat-bubble-footer">{footer}</div> : null}
      {actions ? <div className="chat-bubble-actions">{actions}</div> : null}
    </article>
  );
}

function MessageBlock({ align = "start", children, messageId, meta, role, showMeta = false }: MessageBlockProps) {
  const blockClassName = [`message-block`, `message-block-${role}`, `message-block-align-${align}`].join(" ");

  return (
    <div className={blockClassName} data-message-id={messageId}>
      {meta && showMeta ? <span className="message-block-meta">{meta}</span> : null}
      {children}
    </div>
  );
}

function AgentDetails({ messages }: { messages: ThreadMessage[] }) {
  if (messages.length === 0) {
    return null;
  }

  const traceEventCount = `${messages.length} ${messages.length === 1 ? "trace event" : "trace events"}`;
  const latestNotice = messages.at(-1);
  const latestNoticeLabel = latestNotice?.detailKind ? runEventKindLabels[latestNotice.detailKind] : "Notice";
  const latestNoticePreview = latestNotice?.content ? truncateUiText(latestNotice.content, 140) : `${latestNoticeLabel} is streaming`;

  return (
    <details className="agent-details">
      <summary>
        <span className="agent-details-summary-copy">
          <span className="agent-details-summary-title">
            <span>Agent details</span>
            <strong>{traceEventCount}</strong>
          </span>
          <small>Latest: {latestNoticePreview}</small>
        </span>
      </summary>
      <ol className="agent-details-list" aria-label="Agent details">
        {messages.map((message) => (
          <li className={`agent-details-item agent-details-item-${message.detailKind ?? "system"}`} key={message.id}>
            <p className="agent-details-row">
              <span>{message.detailKind ? runEventKindLabels[message.detailKind] : "Notice"}</span>
              <strong>{message.content}</strong>
            </p>
            {message.detailItems?.length ? (
              <ol className="agent-details-subtask-list" aria-label={`${message.content ?? "Agent event"} details`}>
                {message.detailItems.map((detail) => (
                  <li className="agent-details-subtask-item" key={detail}>
                    <p className="agent-details-subtask-row">{detail}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ShellModal({ bodyClassName, children, id, label, modalClassName, onClose, variant = "plain" }: ShellModalProps) {
  const titleId = `${id}-title`;
  const closeLabel = `Dismiss ${label.toLowerCase()}`;
  const shellModalClassName = [variant === "atmospheric" ? "shell-modal shell-modal-atmospheric" : "shell-modal", modalClassName].filter(Boolean).join(" ");
  const shellModalBodyClassName = ["shell-modal-body", bodyClassName].filter(Boolean).join(" ");
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRef.current?.focus({ preventScroll: true });
    return () => previouslyFocused?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="shell-modal-backdrop" aria-label="Modal backdrop" onClick={onClose}>
      <section
        className={shellModalClassName}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={modalRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key === "Tab") {
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
              ),
            ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
            if (focusable.length === 0) {
              event.preventDefault();
              event.currentTarget.focus();
              return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className="shell-modal-header">
          <div>
            <strong id={titleId}>{label}</strong>
          </div>
          <button className="shell-modal-close" type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
            <X className="ui-icon" aria-hidden="true" strokeWidth={2} />
          </button>
        </header>
        <div className={shellModalBodyClassName}>{children}</div>
      </section>
    </div>
  );
}

function NoRunSelected() {
  return (
    <section className="empty-state empty-state-run" aria-label="No run selected">
      <strong>No run selected</strong>
      <p>Select a local repository task or start the fake Codex walkthrough to inspect a controlled run.</p>
      <span>No Codex process runs until an execution plan is approved, and verification remains a separate stage after result import.</span>
    </section>
  );
}

function App({
  initialRunState,
  initialSelectedRunId,
  seedDemoThread = false,
  seedUxrayAgentResponse = false,
}: {
  initialRunState?: MockRunState;
  initialSelectedRunId?: string | null;
  seedDemoThread?: boolean;
  seedUxrayAgentResponse?: boolean;
} = {}) {
  const runState = useMemo(() => initialRunState ?? createMockRunState(), [initialRunState]);
  const initialThreadState = useMemo(
    () => (seedUxrayAgentResponse ? createUxrayAgentResponsePreviewThreadState() : seedDemoThread ? createDemoThreadState(runState) : readPersistedThreadState() ?? createInitialThreadState()),
    [runState, seedDemoThread, seedUxrayAgentResponse],
  );
  const [approvalStatus, setApprovalStatus] = useState("Waiting for operator approval");
  const [desktopRunSnapshot, setDesktopRunSnapshot] = useState<DesktopRunSnapshot | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(initialSelectedRunId === undefined ? runState.traceSummary.runId : initialSelectedRunId);
  const [memoryReview, setMemoryReview] = useState<MemoryReviewSnapshot>(runState.memoryReview);
  const [skillRegistry, setSkillRegistry] = useState<SkillRegistrySnapshot>(runState.skillRegistry);
  const [selectedSkillReplayPlan, setSelectedSkillReplayPlan] = useState<SkillReplayPlan | null>(null);
  const [persistedRuns, setPersistedRuns] = useState<PersistedRunSummary[]>([]);
  const [openedPersistedRun, setOpenedPersistedRun] = useState<PersistedRunRecord | null>(null);
  const [artifactEvidence, setArtifactEvidence] = useState<ArtifactEvidenceSummary[]>([]);
  const [selectedArtifactEvidence, setSelectedArtifactEvidence] = useState<ArtifactEvidenceContent | null>(null);
  const [artifactEvidenceMessage, setArtifactEvidenceMessage] = useState("");
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [codexConnectionMessage, setCodexConnectionMessage] = useState("");
  const [modelConnectionMessage, setModelConnectionMessage] = useState("");
  const [modelConnectionMessageTone, setModelConnectionMessageTone] = useState<SetupNoticeTone>("info");
  const [codexLoginBackupUrl, setCodexLoginBackupUrl] = useState<string | null>(null);
  const [codexManualLoginActionsRevealed, setCodexManualLoginActionsRevealed] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<ModelProviderId | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [apiKeyEnvName, setApiKeyEnvName] = useState("OPENAI_API_KEY");
  const [modelCatalogProviderId, setModelCatalogProviderId] = useState<ModelProviderId | null>(null);
  const [modelCatalogOptions, setModelCatalogOptions] = useState<ModelCatalogOption[]>([]);
  const [modelCatalogStatus, setModelCatalogStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [modelCatalogIsLive, setModelCatalogIsLive] = useState(false);
  const [modelCatalogMessage, setModelCatalogMessage] = useState("");
  const [modelCatalogMessageTone, setModelCatalogMessageTone] = useState<SetupNoticeTone>("info");
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const [composerReadinessMessage, setComposerReadinessMessage] = useState("");
  const [copiedAgentResponseId, setCopiedAgentResponseId] = useState<string | null>(null);
  const [sharedAgentResponseId, setSharedAgentResponseId] = useState<string | null>(null);
  const [agentResponseRatings, setAgentResponseRatings] = useState<Record<string, AgentResponseRating>>({});
  const [openAgentResponseMenuId, setOpenAgentResponseMenuId] = useState<string | null>(null);
  const [agentResponseSelection, setAgentResponseSelection] = useState<AgentResponseTextSelection | null>(null);
  const [readingAgentResponseId, setReadingAgentResponseId] = useState<string | null>(null);
  const [nextAgentRetryIndex, setNextAgentRetryIndex] = useState(2);
  const [composerValue, setComposerValue] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [composerScaleMode, setComposerScaleMode] = useState<"normal" | "full">("normal");
  const [composerSubmittedAtMs, setComposerSubmittedAtMs] = useState<number | null>(null);
  const [generatingElapsedSeconds, setGeneratingElapsedSeconds] = useState(0);
  const [pendingMessageScrollId, setPendingMessageScrollId] = useState<string | null>(null);
  const [threadMessagesByWorkspace, setThreadMessagesByWorkspace] = useState<Record<string, ThreadMessage[]>>(
    initialThreadState.threadMessagesByWorkspace,
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialThreadState.workspaces);
  const [nextWorkspaceThreadIndex, setNextWorkspaceThreadIndex] = useState(initialThreadState.nextWorkspaceThreadIndex);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialThreadState.activeWorkspaceId);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [isWorkspaceSearchOpen, setIsWorkspaceSearchOpen] = useState(false);
  const [openWorkspaceMenuId, setOpenWorkspaceMenuId] = useState<string | null>(null);
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const [workspaceRenameValue, setWorkspaceRenameValue] = useState("");
  const [editingThreadHeaderId, setEditingThreadHeaderId] = useState<string | null>(null);
  const [threadHeaderTitleValue, setThreadHeaderTitleValue] = useState("");
  const [threadHeaderDescriptionValue, setThreadHeaderDescriptionValue] = useState("");
  const [deleteWorkspaceId, setDeleteWorkspaceId] = useState<string | null>(null);
  const [showWorkspaceArchive, setShowWorkspaceArchive] = useState(false);
  const [isWorkspacePanelCollapsed, setIsWorkspacePanelCollapsed] = useState(false);
  const [isMobileWorkspaceViewport, setIsMobileWorkspaceViewport] = useState(readMobileWorkspaceViewport);
  const [isMobileWorkspaceDrawerOpen, setIsMobileWorkspaceDrawerOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [showSettingsSidebar, setShowSettingsSidebar] = useState(false);
  const [showSkillsManager, setShowSkillsManager] = useState(false);
  const [eligibleAgentSkills, setEligibleAgentSkills] = useState<InstalledAgentSkill[]>([]);
  const [selectedAgentSkillIds, setSelectedAgentSkillIds] = useState<string[]>([]);
  const [showSetupDialog, setShowSetupDialog] = useState(() => !seedUxrayAgentResponse && !readPrivateBetaOnboardingDismissed());
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("general");
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [showMessageBlockMeta, setShowMessageBlockMeta] = useState(readMessageBlockMetaVisible);
  const [hasDismissedPrivateBetaOnboarding, setHasDismissedPrivateBetaOnboarding] = useState(() => seedUxrayAgentResponse || readPrivateBetaOnboardingDismissed());
  const [operatorFullName, setOperatorFullName] = useState("Operator");
  const [operatorCallSign, setOperatorCallSign] = useState("Operator");
  const [operatorWorkType, setOperatorWorkType] = useState<SettingsSnapshot["operatorProfile"]["workType"]>("engineering");
  const [appearancePreference, setAppearancePreference] = useState<SettingsSnapshot["uiPreferences"]["appearance"]>("dark");
  const [chatFontPreference, setChatFontPreference] = useState<SettingsSnapshot["uiPreferences"]["chatFont"]>("orynt-sans");
  const [motionPreference, setMotionPreference] = useState<SettingsSnapshot["uiPreferences"]["motion"]>("system");
  const [voiceLanguage, setVoiceLanguage] = useState<SettingsSnapshot["voicePreferences"]["language"]>("english");
  const [voiceStyle, setVoiceStyle] = useState<SettingsSnapshot["voicePreferences"]["style"]>("buttery");
  const [voiceSpeed, setVoiceSpeed] = useState<SettingsSnapshot["voicePreferences"]["speed"]>("normal");
  const [setupRepositoryPath, setSetupRepositoryPath] = useState("");
  const [setupRepositoryMessage, setSetupRepositoryMessage] = useState("");
  const [setupRepositoryMessageTone, setSetupRepositoryMessageTone] = useState<SetupNoticeTone>("info");
  const [hasAttemptedRepositoryAutoDetect, setHasAttemptedRepositoryAutoDetect] = useState(false);
  const [retentionRunHistoryDays, setRetentionRunHistoryDays] = useState(30);
  const [retentionArtifactRetentionDays, setRetentionArtifactRetentionDays] = useState(30);
  const [retentionCleanupEnabled, setRetentionCleanupEnabled] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionModeOption>(() => {
    const currentMode = runState.permissionPolicy.mode;
    return permissionModeOptions.some((option) => option.value === currentMode) ? (currentMode as PermissionModeOption) : "safe";
  });
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffortOption>("medium");
  const [isComposerMetaMenuOpen, setIsComposerMetaMenuOpen] = useState(false);
  const [composerMetaMenuPlacement, setComposerMetaMenuPlacement] = useState<ComposerMetaMenuPlacement>("dropdown");
  const [isComposerAttachmentMenuOpen, setIsComposerAttachmentMenuOpen] = useState(false);
  const [isComposerSkillsMenuOpen, setIsComposerSkillsMenuOpen] = useState(false);
  const [composerAttachmentMenuPlacement, setComposerAttachmentMenuPlacement] = useState<ComposerMetaMenuPlacement>("dropdown");
  const [composerQuickDialog, setComposerQuickDialog] = useState<"model" | "effort" | null>(null);
  const [composerQuickMenuPlacement, setComposerQuickMenuPlacement] = useState<ComposerMetaMenuPlacement>("dropdown");
  const [composerEffortPopoverCenter, setComposerEffortPopoverCenter] = useState<number | null>(null);
  const [surfaceToggles, setSurfaceToggles] = useState<SurfaceToggleState>(() => ({
    repository: true,
    browser: !MVP_BLOCKED_SURFACES.includes("browser"),
    desktop: !MVP_BLOCKED_SURFACES.includes("desktop"),
    files: !MVP_BLOCKED_SURFACES.includes("files"),
    terminal: !MVP_BLOCKED_SURFACES.includes("terminal"),
  }));
  const accountMenuButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const workspaceSearchInputRef = useRef<HTMLInputElement>(null);
  const composerMetaButtonRef = useRef<HTMLButtonElement>(null);
  const composerMetaMenuRef = useRef<HTMLDivElement>(null);
  const composerAttachmentButtonRef = useRef<HTMLButtonElement>(null);
  const composerAttachmentMenuRef = useRef<HTMLDivElement>(null);
  const composerModelButtonRef = useRef<HTMLButtonElement>(null);
  const composerEffortButtonRef = useRef<HTMLButtonElement>(null);
  const composerQuickMenuRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const modelCatalogRequestIdRef = useRef(0);
  const codexSetupAutoCheckKeyRef = useRef<string | null>(null);
  const codexManualLoginActionsRevealedRef = useRef(false);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const activeThreadRef = useRef<HTMLElement>(null);
  const nextNotificationIdRef = useRef(1);
  const setupAutoCompleteInFlightRef = useRef(false);
  const isPendingAction = (key: string) => pendingActions.has(key);
  const withPendingAction = async <T,>(key: string, task: () => Promise<T>): Promise<T | null> => {
    if (pendingActionsRef.current.has(key)) {
      return null;
    }
    pendingActionsRef.current.add(key);
    setPendingActions(new Set(pendingActionsRef.current));
    try {
      return await task();
    } finally {
      pendingActionsRef.current.delete(key);
      setPendingActions(new Set(pendingActionsRef.current));
    }
  };
  const shouldHydrateClientState = initialRunState === undefined;
  const permissionModeCopy = permissionModeOptions.find((option) => option.value === permissionMode) ?? permissionModeOptions[0];
  const thinkingEffortCopy = thinkingEffortOptions.find((option) => option.value === thinkingEffort) ?? thinkingEffortOptions.find((option) => option.value === "medium") ?? thinkingEffortOptions[0];
  const orderedSurfaces = Object.keys(surfaceLabels) as SurfaceKind[];
  const normalizedSettingsSearchQuery = settingsSearchQuery.trim().toLowerCase();
  const visibleSettingsSections = settingsSections.filter((section) => {
    if (!normalizedSettingsSearchQuery) {
      return true;
    }

    return [section.label, section.group, ...section.keywords].some((value) => value.toLowerCase().includes(normalizedSettingsSearchQuery));
  });
  const activeSettingsSectionLabel = settingsSections.find((section) => section.id === activeSettingsSection)?.label ?? "General";
  const landingUrl = getLandingUrl();
  const codexConnection = settingsSnapshot?.codexConnection ?? null;
  const modelConnection = modelConnectionFromSettings(settingsSnapshot);
  const isModelConnectionReady = modelConnectionIsReady(settingsSnapshot);
  const selectedProvider = setupProviderById(selectedProviderId);
  const activeModelCatalogOptions = selectedProvider && modelCatalogProviderId === selectedProvider.id ? modelCatalogOptions : [];
  const selectedModel = selectedProvider ? setupModelById(activeModelCatalogOptions, selectedModelId) : null;
  const isComposerSubmitPending = isPendingAction("composer-submit");
  const isApprovalApprovedPending = isPendingAction("approval:approved");
  const isApprovalDeniedPending = isPendingAction("approval:denied");
  const isApprovalPending = isApprovalApprovedPending || isApprovalDeniedPending;
  const isSetupSavePending = isPendingAction("setup:save-directory");
  const isSetupCompletePending = isPendingAction("setup:complete");
  const isSetupDetectPending = isPendingAction("setup:detect-directory");
  const isSetupBrowsePending = isPendingAction("setup:browse-directory");
  const isModelConnectionSavePending = isPendingAction("model-connection:save");
  const isSelectedProviderCheckPending = selectedProvider ? isPendingAction(`provider-check:${selectedProvider.id}`) || isPendingAction(`model-connection:preflight:${selectedProvider.id}`) : false;
  const isSelectedProviderModelFetchPending = selectedProvider ? isPendingAction(`model-fetch:${selectedProvider.id}`) : false;
  const isCodexBrowserLoginPending = isPendingAction("codex-login:browser");
  const isCodexDeviceCodeLoginPending = isPendingAction("codex-login:deviceCode");
  const isCodexLoginPending = isCodexBrowserLoginPending || isCodexDeviceCodeLoginPending;
  const isCodexProviderSelected = selectedProvider?.id === "codex-cli";
  const isCodexAutoCheckPending = isCodexProviderSelected && !codexManualLoginActionsRevealed && (isSelectedProviderCheckPending || isSelectedProviderModelFetchPending);
  const isSelectedProviderLiveCatalogReady = Boolean(selectedProvider && modelCatalogProviderId === selectedProvider.id && modelCatalogStatus === "ready" && modelCatalogIsLive);
  const canSaveSelectedModelConnection = Boolean(selectedProvider && selectedModel && modelCatalogStatus === "ready" && modelCatalogIsLive && !isSelectedProviderCheckPending && !isSelectedProviderModelFetchPending);
  const shouldShowProviderSetupActions = Boolean(
    selectedProvider &&
      (selectedProvider.id !== "codex-cli" ||
        isCodexAutoCheckPending ||
        !isSelectedProviderLiveCatalogReady ||
        canSaveSelectedModelConnection),
  );
  const selectedModelThinkingEffortOptions = thinkingEffortOptionsForModel(selectedModel);
  const selectedModelSupportsThinkingEffort = selectedModelThinkingEffortOptions.length > 0;
  const selectedModelThinkingEffort = resolveThinkingEffortForModel(selectedModel, thinkingEffort);
  const selectedModelThinkingEffortCopy = thinkingEffortOptions.find((option) => option.value === selectedModelThinkingEffort) ?? thinkingEffortCopy;
  const composerModelLabel = modelConnection?.modelLabel ?? selectedModel?.label ?? "Choose model";
  const composerSupportedThinkingEfforts =
    modelConnection?.supportedThinkingEfforts?.filter((effort): effort is ThinkingEffortOption => thinkingEffortOptions.some((option) => option.value === effort)) ?? [];
  const composerThinkingEffortOptions =
    selectedModelThinkingEffortOptions.length > 0
      ? selectedModelThinkingEffortOptions
      : composerSupportedThinkingEfforts.length > 0
        ? thinkingEffortOptions.filter((option) => composerSupportedThinkingEfforts.includes(option.value))
        : thinkingEffortOptions;
  const activeConnectionMessage = modelConnectionMessage || codexConnectionMessage || modelConnectionStatusMessage(modelConnection);
  const setupModelBlockerMessage = (() => {
    if (isModelConnectionReady) {
      return "";
    }
    if (modelConnection?.status === "failed" || modelConnection?.status === "missing" || modelConnection?.status === "authRequired") {
      return modelConnectionStatusMessage(modelConnection);
    }
    if (selectedProvider && modelCatalogStatus === "ready" && !selectedModel) {
      return "Choose a model and save provider setup before starting a run.";
    }
    if (selectedProvider && selectedModel) {
      return "Save provider setup and run the provider check before starting a run.";
    }
    return "Choose a provider, run its readiness check, and save provider setup before starting a run.";
  })();
  const savedRepositoryPath = settingsSnapshot?.defaultRepositoryPath.trim() ?? "";
  const effectiveRepositoryPath = repositoryPath.trim() || savedRepositoryPath || setupRepositoryPath.trim();
  const setupWarningMessage = showSetupDialog
    ? ""
    : !effectiveRepositoryPath
      ? "Select a local directory before starting a run."
      : !isModelConnectionReady
        ? setupModelBlockerMessage
        : !hasDismissedPrivateBetaOnboarding
          ? "Complete setup before starting a task."
          : "";
  const composerStatusMessage = composerReadinessMessage || setupWarningMessage ? "" : !isModelConnectionReady ? activeConnectionMessage : "";
  const updateComposerEffortPopoverCenter = () => {
    const button = composerEffortButtonRef.current;
    const container = button?.closest(".composer-attachment");
    if (!button || !container) {
      setComposerEffortPopoverCenter(null);
      return;
    }

    const triggerRect = button.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const popoverWidth = Math.min(Math.max(180, composerThinkingEffortOptions.length * 52 + 24), window.innerWidth - 24);
    const desiredCenter = triggerRect.left - containerRect.left + triggerRect.width / 2;
    const minCenter = 12 - containerRect.left + popoverWidth / 2;
    const maxCenter = window.innerWidth - 12 - containerRect.left - popoverWidth / 2;
    setComposerEffortPopoverCenter(Math.min(Math.max(desiredCenter, minCenter), maxCenter));
  };

  const pushNotification = (tone: AppNotificationTone, message: string) => {
    const notification: AppNotification = {
      id: nextNotificationIdRef.current,
      message,
      tone,
    };
    nextNotificationIdRef.current += 1;
    setNotifications([notification]);
  };

  const completeReadySetup = async () => {
    if (setupAutoCompleteInFlightRef.current) {
      return null;
    }
    setupAutoCompleteInFlightRef.current = true;
    try {
      try {
        window.localStorage.setItem(privateBetaOnboardingStorageKey, "dismissed");
      } catch {
        // Welcome completion is persisted in Tauri settings when available.
      }
      const settings = await orynt.updateSettings({ welcomeCompleted: true });
      applySettingsSnapshot(settings);
      setHasDismissedPrivateBetaOnboarding(true);
      setShowSetupDialog(false);
      setComposerReadinessMessage("");
      pushNotification("success", "Setup complete. Orynt is ready for supervised tasks.");
      return settings;
    } catch (error) {
      setupAutoCompleteInFlightRef.current = false;
      throw error;
    }
  };

  const applySettingsSnapshot = (settings: SettingsSnapshot) => {
    const operatorProfile = settings.operatorProfile ?? {
      fullName: "Operator",
      callSign: "Operator",
      workType: "engineering" as const,
    };
    const uiPreferences = settings.uiPreferences ?? {
      appearance: "dark" as const,
      chatFont: "orynt-sans" as const,
      motion: "system" as const,
      showMessageBlockMeta: false,
    };
    const voicePreferences = settings.voicePreferences ?? {
      language: "english" as const,
      style: "buttery" as const,
      speed: "normal" as const,
    };
    const normalizedModelConnection = modelConnectionFromSettings(settings);
    const normalizedSettings = {
      ...settings,
      modelConnection: normalizedModelConnection,
      operatorProfile,
      uiPreferences,
      voicePreferences,
    };
    setSettingsSnapshot(normalizedSettings);
    if (normalizedModelConnection) {
      const provider = setupProviderById(normalizedModelConnection.providerId);
      if (!provider) {
        setSelectedProviderId(null);
        setSelectedModelId(null);
        setApiKeyEnvName("OPENAI_API_KEY");
        setModelCatalogProviderId(null);
        setModelCatalogOptions([]);
        setModelCatalogStatus("idle");
        setModelCatalogIsLive(false);
        setModelCatalogMessage("");
        setModelCatalogMessageTone("info");
        setModelConnectionMessage("");
        setModelConnectionMessageTone("info");
      } else {
        const savedModelOption: ModelCatalogOption = {
          id: normalizedModelConnection.modelId,
          label: normalizedModelConnection.modelLabel,
          source: normalizedModelConnection.providerId,
          supportedThinkingEfforts: normalizedModelConnection.supportedThinkingEfforts ?? null,
          defaultThinkingEffort: normalizedModelConnection.defaultThinkingEffort ?? null,
        };
        setSelectedProviderId(provider.id);
        setSelectedModelId(normalizedModelConnection.modelId);
        setApiKeyEnvName(normalizedModelConnection.envKey ?? provider.defaultEnvKey ?? "OPENAI_API_KEY");
        const cachedCatalog = readCachedProviderModelCatalog(provider.id);
        const hydratedModelCatalogOptions = cachedCatalog
          ? [savedModelOption, ...cachedCatalog.models.filter((model) => model.id !== savedModelOption.id)]
          : [savedModelOption];
        setModelCatalogProviderId(provider.id);
        setModelCatalogOptions(hydratedModelCatalogOptions);
        setModelCatalogStatus("ready");
        setModelCatalogIsLive(false);
        setModelCatalogMessage("");
        setModelCatalogMessageTone("info");
        setModelConnectionMessage(modelConnectionStatusMessage(normalizedModelConnection));
        setModelConnectionMessageTone(normalizedModelConnection.status === "ready" ? "success" : normalizedModelConnection.status === "failed" || normalizedModelConnection.status === "missing" ? "error" : "warning");
      }
    } else {
      setSelectedProviderId(null);
      setSelectedModelId(null);
      setApiKeyEnvName("OPENAI_API_KEY");
      setModelCatalogProviderId(null);
      setModelCatalogOptions([]);
      setModelCatalogStatus("idle");
      setModelCatalogIsLive(false);
      setModelCatalogMessage("");
      setModelCatalogMessageTone("info");
      setModelConnectionMessage("");
      setModelConnectionMessageTone("info");
    }
    setPermissionMode(toUiPermissionMode(settings.permissionMode));
    setThinkingEffort(toUiThinkingEffort(settings.thinkingEffort));
    setSetupRepositoryPath(settings.defaultRepositoryPath);
    setRetentionRunHistoryDays(settings.retentionPolicy.runHistoryDays);
    setRetentionArtifactRetentionDays(settings.retentionPolicy.artifactRetentionDays);
    setRetentionCleanupEnabled(settings.retentionPolicy.cleanupEnabled);
    setOperatorFullName(operatorProfile.fullName);
    setOperatorCallSign(operatorProfile.callSign);
    setOperatorWorkType(operatorProfile.workType);
    setAppearancePreference(uiPreferences.appearance);
    setChatFontPreference(uiPreferences.chatFont);
    setMotionPreference(uiPreferences.motion);
    setShowMessageBlockMeta(uiPreferences.showMessageBlockMeta);
    setVoiceLanguage(voicePreferences.language);
    setVoiceStyle(voicePreferences.style);
    setVoiceSpeed(voicePreferences.speed);
  };

  const refreshPersistedRuns = async () => {
    const runs = await orynt.listPersistedRuns();
    setPersistedRuns(runs);
  };

  const refreshSettingsSnapshot = async ({ closeCompletedSetup = true }: { closeCompletedSetup?: boolean } = {}) => {
    const settings = await orynt.getSettings();
    applySettingsSnapshot(settings);
    if (settings.defaultRepositoryPath && !repositoryPath.trim()) {
      setRepositoryPath(settings.defaultRepositoryPath);
    }
    if (settings.welcomeCompleted && closeCompletedSetup) {
      setHasDismissedPrivateBetaOnboarding(true);
      setShowSetupDialog(false);
    }
    return settings;
  };

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (seedDemoThread) {
      return;
    }
    writePersistedThreadState({
      workspaces,
      threadMessagesByWorkspace,
      nextWorkspaceThreadIndex,
      activeWorkspaceId,
    });
  }, [activeWorkspaceId, nextWorkspaceThreadIndex, seedDemoThread, threadMessagesByWorkspace, workspaces]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      return;
    }
    if (composerScaleMode === "full") {
      textarea.style.height = "";
      return;
    }
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 24), 144)}px`;
  }, [composerScaleMode, composerValue]);

  useEffect(() => {
    if (!isComposerSubmitPending || composerSubmittedAtMs === null) {
      setGeneratingElapsedSeconds(0);
      return undefined;
    }
    const syncElapsed = () => {
      setGeneratingElapsedSeconds(Math.max(0, Math.floor((Date.now() - composerSubmittedAtMs) / 1000)));
    };
    syncElapsed();
    const timer = window.setInterval(syncElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [composerSubmittedAtMs, isComposerSubmitPending]);

  useEffect(() => {
    if (notifications.length === 0) {
      return undefined;
    }
    const timers = notifications.map((notification) =>
      window.setTimeout(() => {
        setNotifications((currentNotifications) => currentNotifications.filter((currentNotification) => currentNotification.id !== notification.id));
      }, 4500),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [notifications]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(mobileWorkspaceMediaQuery);
    const syncMobileViewport = () => {
      setIsMobileWorkspaceViewport(media.matches);
      if (!media.matches) {
        setIsMobileWorkspaceDrawerOpen(false);
      }
    };

    syncMobileViewport();
    media.addEventListener("change", syncMobileViewport);

    return () => {
      media.removeEventListener("change", syncMobileViewport);
    };
  }, []);

  useEffect(() => {
    if (!isMobileWorkspaceDrawerOpen) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileWorkspaceDrawerOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileWorkspaceDrawerOpen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    orynt.onRunEvent((event) => {
      if (event.type === "run_started") {
        setCurrentRunId(event.runId);
      }
      if (event.type === "action_blocked_or_approved") {
        const summary = (event.payload as { summary?: unknown }).summary;
        setApprovalStatus(typeof summary === "string" ? summary : event.type.replaceAll("_", " "));
      }
      if (renderedRunEventTypes[event.type]) {
        const threadId = activeWorkspaceIdRef.current;
        const runEventMessage = runEventToThreadMessage(event);
        setThreadMessagesByWorkspace((current) => {
          const currentMessages = current[threadId] ?? [];
          if (currentMessages.some((message) => message.id === event.id)) {
            return current;
          }
          return {
            ...current,
            [threadId]: [...currentMessages, runEventMessage],
          };
        });
      }
    }).then((listener) => {
      if (mounted) {
        unlisten = listener;
        return;
      }

      listener();
    });

    return () => {
      mounted = false;
      unlisten?.();
      orynt.resetMockListenersForTest();
    };
  }, []);

  useEffect(() => {
    if (!shouldHydrateClientState) {
      return;
    }
    let mounted = true;
    orynt.listSkills().then((skills) => {
      if (!mounted) {
        return;
      }
      setSkillRegistry((current) => ({
        ...current,
        skills,
        summary: {
          ...current.summary,
          skillCount: skills.length,
          statusCounts: summarizeSkillStatuses(skills),
        },
      }));
    });
    return () => {
      mounted = false;
    };
  }, [shouldHydrateClientState]);

  useEffect(() => {
    if (!shouldHydrateClientState) {
      return;
    }
    let mounted = true;
    orynt.listInstalledAgentSkills(repositoryPath).then((inventory) => {
      if (mounted) {
        setEligibleAgentSkills(inventory.skills.filter((skill) => skill.enabled && skill.eligible && skill.health !== "blocked"));
      }
    }).catch(() => {
      // The package manager may be unavailable while an older desktop backend is still running.
    });
    return () => {
      mounted = false;
    };
  }, [repositoryPath, shouldHydrateClientState]);

  useEffect(() => {
    if (!shouldHydrateClientState) {
      return;
    }
    let mounted = true;
    Promise.all([orynt.listPersistedRuns(), orynt.getSettings()]).then(([runs, settings]) => {
      if (!mounted) {
        return;
      }
      setPersistedRuns(runs);
      applySettingsSnapshot(settings);
      if (settings.defaultRepositoryPath && !repositoryPath.trim()) {
        setRepositoryPath(settings.defaultRepositoryPath);
      }
      if (settings.welcomeCompleted) {
        setHasDismissedPrivateBetaOnboarding(true);
        setShowSetupDialog(false);
      }
      setCodexConnectionMessage(codexConnectionStatusMessage(settings.codexConnection));
    });

    return () => {
      mounted = false;
    };
  }, [shouldHydrateClientState]);

  useEffect(() => {
    if (!shouldHydrateClientState || !settingsSnapshot || hasAttemptedRepositoryAutoDetect || setupRepositoryPath.trim() || settingsSnapshot.defaultRepositoryPath) {
      return;
    }
    let mounted = true;
    setHasAttemptedRepositoryAutoDetect(true);
    orynt.detectCurrentRepositoryPath().then((path) => {
      if (!mounted || !path) {
        return;
      }
      const detectedPath = path.trim();
      if (!detectedPath) {
        return;
      }
      setSetupRepositoryPath((current) => current || detectedPath);
      setRepositoryPath((current) => current || detectedPath);
      setSetupRepositoryMessage("Detected the current local directory.");
      setSetupRepositoryMessageTone("success");
      void orynt
        .updateSettings({ defaultRepositoryPath: detectedPath })
        .then((settings) => {
          if (!mounted) {
            return;
          }
          applySettingsSnapshot(settings);
          setSetupRepositoryPath(settings.defaultRepositoryPath);
          setRepositoryPath((current) => current || settings.defaultRepositoryPath);
        })
        .catch(() => {
          if (!mounted) {
            return;
          }
          setSetupRepositoryMessage("Detected the current local directory. Complete setup to persist it.");
          setSetupRepositoryMessageTone("warning");
        });
    });

    return () => {
      mounted = false;
    };
  }, [settingsSnapshot, setupRepositoryPath, shouldHydrateClientState]);

  useEffect(() => {
    if (isWorkspaceSearchOpen) {
      workspaceSearchInputRef.current?.focus();
    }
  }, [isWorkspaceSearchOpen]);

  useLayoutEffect(() => {
    if (!pendingMessageScrollId) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const message = Array.from(document.querySelectorAll<HTMLElement>("[data-message-id]")).find(
        (element) => element.dataset.messageId === pendingMessageScrollId,
      );
      if (message && typeof message.scrollIntoView === "function") {
        message.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
      }
      setPendingMessageScrollId(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [pendingMessageScrollId, threadMessagesByWorkspace]);

  useLayoutEffect(() => {
    const messages = activeThreadRef.current?.querySelectorAll<HTMLElement>("[data-message-id]");
    const latestMessage = messages?.item((messages.length ?? 0) - 1);
    if (latestMessage && typeof latestMessage.scrollIntoView === "function") {
      latestMessage.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (accountMenuButtonRef.current?.contains(target) || accountMenuRef.current?.contains(target)) {
        return;
      }

      setIsAccountMenuOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsAccountMenuOpen(false);
      accountMenuButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isComposerMetaMenuOpen && !isComposerAttachmentMenuOpen && !isComposerSkillsMenuOpen && !composerQuickDialog) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (
        composerMetaButtonRef.current?.contains(target) ||
        composerMetaMenuRef.current?.contains(target) ||
        composerAttachmentButtonRef.current?.contains(target) ||
        composerAttachmentMenuRef.current?.contains(target) ||
        composerModelButtonRef.current?.contains(target) ||
        composerEffortButtonRef.current?.contains(target) ||
        composerQuickMenuRef.current?.contains(target)
      ) {
        return;
      }

      setIsComposerMetaMenuOpen(false);
      setIsComposerAttachmentMenuOpen(false);
      setIsComposerSkillsMenuOpen(false);
      setComposerQuickDialog(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsComposerMetaMenuOpen(false);
      setIsComposerAttachmentMenuOpen(false);
      setIsComposerSkillsMenuOpen(false);
      setComposerQuickDialog(null);
      if (composerQuickDialog === "model") {
        composerModelButtonRef.current?.focus();
        return;
      }
      if (composerQuickDialog === "effort") {
        composerEffortButtonRef.current?.focus();
        return;
      }
      if (isComposerAttachmentMenuOpen) {
        composerAttachmentButtonRef.current?.focus();
        return;
      }
      composerMetaButtonRef.current?.focus();
    };

    const handleResize = () => {
      if (isComposerMetaMenuOpen && composerMetaButtonRef.current) {
        setComposerMetaMenuPlacement(resolveComposerMenuPlacement(composerMetaButtonRef.current, composerPermissionMenuEstimatedHeight));
      }
      if (isComposerAttachmentMenuOpen && composerAttachmentButtonRef.current) {
        setComposerAttachmentMenuPlacement(resolveComposerMenuPlacement(composerAttachmentButtonRef.current, composerAttachmentMenuEstimatedHeight));
      }
      if (composerQuickDialog) {
        const quickButton = composerQuickDialog === "model" ? composerModelButtonRef.current : composerEffortButtonRef.current;
        if (quickButton) {
          setComposerQuickMenuPlacement(resolveComposerMenuPlacement(quickButton, composerQuickDialog === "model" ? 520 : 380));
        }
        if (composerQuickDialog === "effort") {
          updateComposerEffortPopoverCenter();
        }
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [composerQuickDialog, isComposerAttachmentMenuOpen, isComposerMetaMenuOpen, isComposerSkillsMenuOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(messageBlockMetaStorageKey, showMessageBlockMeta ? "true" : "false");
    } catch {
      // Local display preferences are best-effort in constrained webviews.
    }
  }, [showMessageBlockMeta]);

  useEffect(() => {
    if (!shouldHydrateClientState) {
      return;
    }
    let mounted = true;
    Promise.all([orynt.listMemoryEpisodes(), orynt.listCandidateRules()]).then(([episodes, candidateRules]) => {
      if (!mounted) {
        return;
      }
      const safeEpisodes = Array.isArray(episodes) ? episodes : [];
      const safeCandidateRules = Array.isArray(candidateRules) ? candidateRules : [];
      setMemoryReview((current) => ({
        ...current,
        latestEpisode: safeEpisodes[0],
        episodes: safeEpisodes,
        candidateRules: safeCandidateRules,
        summary: {
          ...current.summary,
          episodeCount: safeEpisodes.length,
          candidateRuleCount: safeCandidateRules.filter((rule) => rule.status === "candidate").length,
          candidateRuleStatusCounts: summarizeCandidateRuleStatuses(safeCandidateRules),
        },
      }));
    });

    return () => {
      mounted = false;
    };
  }, [shouldHydrateClientState]);

  const submitComposerGoal = async (rawValue = composerValue) => {
    const goal = rawValue.trim();
    if (!goal) {
      return;
    }

    if (!hasDismissedPrivateBetaOnboarding) {
      setComposerReadinessMessage("Finish private beta onboarding before starting a task.");
      setShowSetupDialog(true);
      return;
    }

    if (!effectiveRepositoryPath) {
      setComposerReadinessMessage("Select a local directory before starting a run.");
      setShowSetupDialog(true);
      return;
    }

    const localResponse = localShortPromptResponse(goal);
    if (localResponse) {
      const threadId = activeWorkspace.id;
      const userMessageId = `${threadId}-user-${(threadMessagesByWorkspace[threadId]?.length ?? 0) + 1}`;
      if (activeWorkspace.label === "New task" && (threadMessagesByWorkspace[threadId]?.length ?? 0) === 0) {
        const title = threadTitleFromPrompt(goal);
        setWorkspaces((current) => current.map((space) => (space.id === threadId ? { ...space, label: title, description: "" } : space)));
      }
      setThreadMessagesByWorkspace((current) => {
        const currentMessages = current[threadId] ?? [];
        const nextMessageIndex = currentMessages.length + 1;
        const userMessage: ThreadMessage = {
          id: `${threadId}-user-${nextMessageIndex}`,
          role: "user",
          content: goal,
        };
        const responseMessage: ThreadMessage = {
          id: `${threadId}-agent-local-${nextMessageIndex + 1}`,
          role: "agent",
          label: "Agent response",
          content: localResponse,
        };
        return {
          ...current,
          [threadId]: [...currentMessages, userMessage, responseMessage],
        };
      });
      setPendingMessageScrollId(userMessageId);
      setComposerValue("");
      return;
    }

    const currentSettings = settingsSnapshot ?? (await refreshSettingsSnapshot());
    const currentModelConnection = modelConnectionFromSettings(currentSettings);
    if (!modelConnectionIsReady(currentSettings)) {
      const message = modelConnectionStatusMessage(currentModelConnection);
      setModelConnectionMessage(message);
      setModelConnectionMessageTone(currentModelConnection?.status === "failed" || currentModelConnection?.status === "missing" ? "error" : "warning");
      setComposerReadinessMessage(message);
      setShowSetupDialog(true);
      return;
    }
    setComposerReadinessMessage("");

    setComposerSubmittedAtMs(Date.now());
    setGeneratingElapsedSeconds(0);
    try {
      await withPendingAction("composer-submit", async () => {
      const threadId = activeWorkspace.id;
      const userMessageId = `${threadId}-user-${(threadMessagesByWorkspace[threadId]?.length ?? 0) + 1}`;
      if (activeWorkspace.label === "New task" && (threadMessagesByWorkspace[threadId]?.length ?? 0) === 0) {
        const title = threadTitleFromPrompt(goal);
        setWorkspaces((current) => current.map((space) => (space.id === threadId ? { ...space, label: title, description: "" } : space)));
      }
      setThreadMessagesByWorkspace((current) => {
        const currentMessages = current[threadId] ?? [];
        const nextMessage: ThreadMessage = {
          id: userMessageId,
          role: "user",
          content: goal,
        };
        return {
          ...current,
          [threadId]: [...currentMessages, nextMessage],
        };
      });
      setPendingMessageScrollId(userMessageId);
      setComposerValue("");
      try {
        let preflightFailureMessage: string | null = null;
        let preflightFailureTone: SetupNoticeTone = "warning";
        try {
          const preflight = await orynt.preflightModelConnection();
          const preflightedModelConnection: ModelConnectionReference = {
            ...currentModelConnection!,
            status: preflight.status,
            lastPreflight: preflight,
          };
          applySettingsSnapshot({ ...currentSettings, modelConnection: preflightedModelConnection });
          if (!preflight.ready) {
            preflightFailureMessage = modelConnectionStatusMessage(preflightedModelConnection);
            preflightFailureTone = preflight.status === "failed" || preflight.status === "missing" ? "error" : "warning";
          }
        } catch (error) {
          preflightFailureMessage = messageFromUnknownError(error, "Provider check failed before starting the repository run.");
          preflightFailureTone = "error";
        }
        if (preflightFailureMessage) {
          setModelConnectionMessage(preflightFailureMessage);
          setModelConnectionMessageTone(preflightFailureTone);
          setComposerReadinessMessage(preflightFailureMessage);
          setShowSetupDialog(true);
          throw new Error(`Provider check failed before starting the repository run. ${preflightFailureMessage}`);
        }
        if (selectedAgentSkillIds.length > 0) {
          await orynt.createSkillContextSnapshot(selectedAgentSkillIds, effectiveRepositoryPath);
        }
        const runInput: Parameters<typeof orynt.createRun>[0] & { selectedSkillIds?: string[] } = {
          goal,
          capabilityId: "coding-apprentice",
          taskId: runState.activeTask.id,
          workspaceId: runState.workspace.id,
          repositoryPath: effectiveRepositoryPath,
          budget: {
            maxSteps: runState.runSummary.run.budget.maxSteps,
            maxWallTimeMs: runState.runSummary.run.budget.maxWallTimeMs,
            maxModelTokens: runState.runSummary.run.budget.maxModelTokens,
            maxUsd: runState.usageBudget.runLimitUsd,
            stopOnBudgetExceeded: true,
          },
          selectedSkillIds: [...selectedAgentSkillIds],
        };
        const run = await orynt.createRun(runInput);
        const createdRunId = run.runId ?? run.id;
        setSelectedAgentSkillIds([]);
        setCurrentRunId(createdRunId);
        setDesktopRunSnapshot(run);
        setApprovalStatus(run.summary ?? "Waiting for operator approval.");
        if (run.status === "waiting_for_approval") {
          setThreadMessagesByWorkspace((current) => {
            const currentMessages = current[threadId] ?? [];
            return {
              ...current,
              [threadId]: [
                ...currentMessages,
                {
                  id: `${threadId}-approval-${createdRunId}-${currentMessages.length + 1}`,
                  runId: createdRunId,
                  role: "approval",
                  content: run.summary ?? "Waiting for operator approval.",
                },
              ],
            };
          });
          await refreshPersistedRuns();
          return;
        }
        let runOutcomeDetail = "Open persisted evidence from the run list to inspect events, artifacts, verification, memory, and replay outputs.";
        let finalModelResponse: string | null = null;
        try {
          const persistedRun = await orynt.openPersistedRun(createdRunId);
          const eventTypes = persistedRun.events.map((event) => event.type);
          finalModelResponse =
            persistedRun.events
              .slice()
              .reverse()
              .map((event) => (isRecord(event.payload) ? payloadString(event.payload, "lastMessagePreview") : null))
              .find((message): message is string => Boolean(message?.trim())) ?? null;
          if (eventTypes.includes("codex_execution_started") && eventTypes.includes("codex_execution_finished")) {
            runOutcomeDetail = "Codex CLI execution ran under the selected model connection, then Orynt imported, verified, and persisted the result. Open persisted evidence from the run list to inspect the execution log, artifacts, verification, memory, and replay outputs.";
          } else if (!eventTypes.includes("codex_execution_started")) {
            runOutcomeDetail = "Repository harness completed without controlled Codex execution events; open persisted evidence from the run list to inspect artifacts and verify whether this was a manual harness path.";
          }
        } catch {
          // Persisted evidence may still be refreshing; keep the completion message useful.
        }
        setThreadMessagesByWorkspace((current) => {
          const currentMessages = current[threadId] ?? [];
          const outcomeMessages: ThreadMessage[] = finalModelResponse
            ? [
                {
                  id: `${threadId}-agent-run-complete-${createdRunId}-${currentMessages.length + 1}`,
                  runId: createdRunId,
                  role: "agent",
                  label: "Agent response",
                  content: finalModelResponse,
                },
              ]
            : [
                {
                  id: `${threadId}-run-complete-${createdRunId}-${currentMessages.length + 1}`,
                  runId: createdRunId,
                  role: "system",
                  detailKind: "done",
                  content: `Repository harness run completed for ${goal}.`,
                  detailItems: [`Run ID: ${createdRunId}`, runOutcomeDetail],
                },
                {
                  id: `${threadId}-agent-run-no-final-response-${createdRunId}-${currentMessages.length + 2}`,
                  runId: createdRunId,
                  role: "agent",
                  label: "Agent response",
                  content: noFinalModelResponseContent(createdRunId),
                },
              ];
          return {
            ...current,
            [threadId]: [...currentMessages, ...outcomeMessages],
          };
        });
        await refreshPersistedRuns();
      } catch (error) {
        const runnerMessage = repositoryRunnerErrorMessage(error);
        if (isRepositoryPathSelectionError(runnerMessage)) {
          setComposerReadinessMessage("Select a local directory before starting a run.");
          setSetupRepositoryMessage("Select a local directory before starting a run.");
          setSetupRepositoryMessageTone("warning");
          setShowSetupDialog(true);
          return;
        }
        setThreadMessagesByWorkspace((current) => {
          const currentMessages = current[threadId] ?? [];
          const failureDetailMessage: ThreadMessage = {
            id: `${threadId}-run-failed-${currentMessages.length + 1}`,
            role: "system",
            detailKind: "error",
            content: `Error: repository run failed — ${runnerMessage}`,
            detailItems: [runnerMessage],
          };
          const outcomeMessage: ThreadMessage = {
            id: `${threadId}-agent-run-failed-${currentMessages.length + 2}`,
            role: "agent",
            label: "Agent response",
            content: `Repository harness run failed before Orynt received usable output. ${runnerMessage}`,
          };
          return {
            ...current,
            [threadId]: [...currentMessages, failureDetailMessage, outcomeMessage],
          };
        });
      }
      });
    } finally {
      setComposerSubmittedAtMs(null);
    }
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await submitComposerGoal(String(formData.get("composer-goal") ?? ""));
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      const target = event.currentTarget;
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      const nextValue = `${target.value.slice(0, selectionStart)}\n${target.value.slice(selectionEnd)}`;
      setComposerValue(nextValue);
      window.requestAnimationFrame(() => {
        target.selectionStart = selectionStart + 1;
        target.selectionEnd = selectionStart + 1;
      });
      return;
    }

    event.preventDefault();
    void submitComposerGoal(event.currentTarget.value);
  };

  const handleApproval = async (decision: "approved" | "denied") => {
    if (!currentRunId) {
      return;
    }
    if (
      desktopRunSnapshot?.status === "waiting_for_approval" &&
      !desktopRunSnapshot.taskPlan
    ) {
      setApprovalStatus(
        "This legacy run has no trusted task plan. Create a new run before approving execution.",
      );
      return;
    }
    const approval =
      desktopRunSnapshot?.status === "waiting_for_approval"
        ? desktopRunSnapshot.approval
        : seedDemoThread
          ? { id: "approval-submit-1" }
          : null;
    const expectedRevision =
      desktopRunSnapshot?.status === "waiting_for_approval"
        ? desktopRunSnapshot.checkpointRevision
        : seedDemoThread
          ? 0
          : undefined;
    if (!approval || expectedRevision === undefined) return;
    await withPendingAction(`approval:${decision}`, async () => {
      const snapshot = await orynt.approve({
        runId: currentRunId,
        approvalId: approval.id,
        decision,
        expectedRevision,
      });
      if (snapshot) {
        setDesktopRunSnapshot(snapshot);
        setApprovalStatus(snapshot.summary ?? snapshot.status ?? "Run updated.");
        await refreshPersistedRuns();
        const persisted = await orynt.openPersistedRun(snapshot.runId ?? snapshot.id);
        setOpenedPersistedRun(persisted);
      } else {
        setApprovalStatus(`Approval ${decision} for ${approval.id}`);
      }
    });
  };

  const handleCancelRuntime = async () => {
    if (!desktopRunSnapshot?.runId || desktopRunSnapshot.checkpointRevision === undefined) return;
    const runId = desktopRunSnapshot.runId;
    const expectedRevision = desktopRunSnapshot.checkpointRevision;
    await withPendingAction("runtime:cancel", async () => {
      const snapshot = await orynt.cancelRun({
        runId,
        expectedRevision,
        reason: "Cancelled by the desktop operator.",
      });
      if (snapshot) {
        setDesktopRunSnapshot(snapshot);
        setApprovalStatus(snapshot.summary ?? snapshot.status ?? "Run updated.");
        await refreshPersistedRuns();
      }
    });
  };

  const handleRecoverRuntime = async () => {
    if (!desktopRunSnapshot?.runId || desktopRunSnapshot.checkpointRevision === undefined) return;
    const runId = desktopRunSnapshot.runId;
    const expectedRevision = desktopRunSnapshot.checkpointRevision;
    await withPendingAction("runtime:recover", async () => {
      const snapshot = await orynt.recoverRun({
        runId,
        expectedRevision,
      });
      setDesktopRunSnapshot(snapshot);
      setApprovalStatus(snapshot.summary ?? snapshot.status ?? "Run updated.");
      await refreshPersistedRuns();
    });
  };

  const handleMarkRuntimeFailed = async () => {
    if (!desktopRunSnapshot?.runId || desktopRunSnapshot.checkpointRevision === undefined) return;
    const runId = desktopRunSnapshot.runId;
    const expectedRevision = desktopRunSnapshot.checkpointRevision;
    await withPendingAction("runtime:mark-failed", async () => {
      const snapshot = await orynt.markRunFailed({
        runId,
        expectedRevision,
        reason: "Operator reviewed the uncertain execution and marked it failed.",
      });
      setDesktopRunSnapshot(snapshot);
      setApprovalStatus(snapshot.summary ?? snapshot.status ?? "Run updated.");
      await refreshPersistedRuns();
    });
  };

  const handleCandidateRuleStatus = async (rule: CandidateRule, status: "accepted" | "rejected" | "superseded") => {
    const updatedRule = await orynt.updateCandidateRuleStatus({
      id: rule.id,
      status,
      actor: "operator",
      reason: "Reviewed in Memory Manager.",
      expectedRevision: memoryReview.summary.revision ?? 0,
      runId: currentRunId ?? runState.traceSummary.runId,
      supersededBy: status === "superseded" ? "candidate-rule-replacement-demo" : undefined,
      decidedAt: new Date().toISOString(),
    });
    const summary = await orynt.summarizeMemory(memoryReview.namespace);
    setMemoryReview((current) => ({
      ...updateMemoryReviewRule(current, updatedRule),
      summary,
    }));
  };

  const createSkillDecision = (skill: SkillDefinition, decision: "promote" | "reject" | "supersede" | "archive") => ({
    skillId: skill.id,
    decision,
    actor: "operator",
    reason: "Reviewed in settings.",
    runId: currentRunId ?? runState.traceSummary.runId,
    supersededBy: decision === "supersede" ? "skill-replacement-demo" : undefined,
    decidedAt: new Date().toISOString(),
  });

  const handleSkillDecision = async (skill: SkillDefinition, decision: "promote" | "reject" | "supersede" | "archive") => {
    const input = createSkillDecision(skill, decision);
    const updatedSkill =
      decision === "promote"
        ? await orynt.promoteSkillManually(input)
        : decision === "reject"
          ? await orynt.rejectSkill(input)
          : decision === "supersede"
            ? await orynt.supersedeSkill(input)
            : await orynt.archiveSkill(input);
    setSkillRegistry((current) => updateSkillRegistrySkill(current, updatedSkill));
  };

  const handlePreviewSkillReplay = async (skill: SkillDefinition) => {
    const replayPlan = await orynt.createSkillReplayPlan(skill.id, currentRunId ?? runState.traceSummary.runId);
    setSelectedSkillReplayPlan(replayPlan);
  };

  const handleOpenPersistedRun = async (runId: string) => {
    const run = await orynt.openPersistedRun(runId);
    setOpenedPersistedRun(run);
    setCurrentRunId(run.runId);
    setSelectedArtifactEvidence(null);
    setArtifactEvidenceMessage("");
    if (
      run.runtimeStatus &&
      !["completed", "blocked", "failed", "cancelled"].includes(
        run.runtimeStatus,
      )
    ) {
      try {
        const snapshot = await orynt.statusRun(runId);
        setDesktopRunSnapshot(snapshot);
        setApprovalStatus(snapshot.summary ?? snapshot.status ?? "Run updated.");
      } catch {
        setDesktopRunSnapshot(null);
      }
    } else {
      setDesktopRunSnapshot(null);
    }
    try {
      const evidence = await orynt.listArtifactEvidence(runId);
      setArtifactEvidence(evidence);
    } catch (error) {
      setArtifactEvidence([]);
      setArtifactEvidenceMessage(error instanceof Error ? error.message : "Artifact evidence could not be loaded.");
    }
  };

  const handleViewArtifactEvidence = async (artifactId: string) => {
    if (!openedPersistedRun) {
      return;
    }
    setArtifactEvidenceMessage("");
    try {
      const evidence = await orynt.readArtifactEvidence(openedPersistedRun.runId, artifactId);
      setSelectedArtifactEvidence(evidence);
    } catch (error) {
      setSelectedArtifactEvidence(null);
      setArtifactEvidenceMessage(error instanceof Error ? error.message : "Artifact evidence could not be opened.");
    }
  };

  const handlePermissionModeChange = async (mode: PermissionModeOption) => {
    setPermissionMode(mode);
    const settings = await orynt.updateSettings({ permissionMode: toSettingsPermissionMode(mode) });
    applySettingsSnapshot(settings);
  };

  const handleThinkingEffortChange = async (effort: ThinkingEffortOption) => {
    setThinkingEffort(effort);
    const settings = await orynt.updateSettings({ thinkingEffort: effort });
    applySettingsSnapshot(settings);
  };

  const handleOperatorProfileChange = async (profile: Partial<SettingsSnapshot["operatorProfile"]>) => {
    if (profile.fullName !== undefined) {
      setOperatorFullName(profile.fullName);
    }
    if (profile.callSign !== undefined) {
      setOperatorCallSign(profile.callSign);
    }
    if (profile.workType !== undefined) {
      setOperatorWorkType(profile.workType);
    }
    const settings = await orynt.updateSettings({ operatorProfile: profile });
    applySettingsSnapshot(settings);
  };

  const handleUiPreferencesChange = async (preferences: Partial<SettingsSnapshot["uiPreferences"]>) => {
    if (preferences.appearance !== undefined) {
      setAppearancePreference(preferences.appearance);
    }
    if (preferences.chatFont !== undefined) {
      setChatFontPreference(preferences.chatFont);
    }
    if (preferences.motion !== undefined) {
      setMotionPreference(preferences.motion);
    }
    if (preferences.showMessageBlockMeta !== undefined) {
      setShowMessageBlockMeta(preferences.showMessageBlockMeta);
    }
    const settings = await orynt.updateSettings({ uiPreferences: preferences });
    applySettingsSnapshot(settings);
  };

  const handleVoicePreferencesChange = async (preferences: Partial<SettingsSnapshot["voicePreferences"]>) => {
    if (preferences.language !== undefined) {
      setVoiceLanguage(preferences.language);
    }
    if (preferences.style !== undefined) {
      setVoiceStyle(preferences.style);
    }
    if (preferences.speed !== undefined) {
      setVoiceSpeed(preferences.speed);
    }
    const settings = await orynt.updateSettings({ voicePreferences: preferences });
    applySettingsSnapshot(settings);
  };

  const handleOpenSettingsSection = (sectionId: SettingsSectionId) => {
    setActiveSettingsSection(sectionId);
    setShowSettingsSidebar(true);
    setShowSetupDialog(false);
    setIsAccountMenuOpen(false);
  };

  const handleOpenSetupDialog = () => {
    setShowSetupDialog(true);
    setShowSettingsSidebar(false);
    setIsAccountMenuOpen(false);
  };

  const handleCompleteWelcomeSetup = async () => {
    try {
      await withPendingAction("setup:complete", async () => {
        const defaultRepositoryPath = setupRepositoryPath.trim() || repositoryPath.trim() || settingsSnapshot?.defaultRepositoryPath.trim() || "";
        if (!defaultRepositoryPath) {
          setSetupRepositoryMessage("Select a local directory before completing setup.");
          setSetupRepositoryMessageTone("warning");
          return;
        }
        setSetupRepositoryPath(defaultRepositoryPath);
        setRepositoryPath(defaultRepositoryPath);
        const savedModelConnection = canSaveSelectedModelConnection ? await saveSelectedModelConnectionWithPreflight() : null;
        const settings = await orynt.updateSettings({ defaultRepositoryPath });
        const nextSettings = savedModelConnection && !settings.modelConnection ? { ...settings, modelConnection: savedModelConnection } : settings;
        applySettingsSnapshot(nextSettings);
        setSetupRepositoryPath(nextSettings.defaultRepositoryPath);
        setRepositoryPath(nextSettings.defaultRepositoryPath);
        if (!modelConnectionIsReady(nextSettings)) {
          setModelConnectionMessage("Save provider setup and run the provider check before completing setup.");
          setModelConnectionMessageTone("warning");
          return;
        }
        await completeReadySetup();
      });
    } catch (error) {
      setSetupRepositoryMessage(messageFromUnknownError(error, "Setup settings could not be saved."));
      setSetupRepositoryMessageTone("error");
    }
  };

  const handleDetectSetupRepositoryPath = async () => {
    await withPendingAction("setup:detect-directory", async () => {
      const path = await orynt.detectCurrentRepositoryPath();
      if (!path) {
        setSetupRepositoryMessage("No safe local directory was detected from the app launch path.");
        setSetupRepositoryMessageTone("warning");
        return;
      }
      setSetupRepositoryPath(path);
      setRepositoryPath(path);
      setSetupRepositoryMessage("Detected the current local directory.");
      setSetupRepositoryMessageTone("success");
    });
  };

  const handleBrowseSetupRepositoryPath = async () => {
    await withPendingAction("setup:browse-directory", async () => {
      const browseResult = await orynt.browseRepositoryPath(setupRepositoryPath || repositoryPath || settingsSnapshot?.defaultRepositoryPath);
      if (browseResult.status === "cancelled") {
        setSetupRepositoryMessage("No local directory was selected.");
        setSetupRepositoryMessageTone("warning");
        return;
      }
      if (browseResult.status === "unavailable") {
        setSetupRepositoryMessage(browseResult.message);
        setSetupRepositoryMessageTone("error");
        return;
      }
      setSetupRepositoryPath(browseResult.path);
      setRepositoryPath(browseResult.path);
      setSetupRepositoryMessage("Local directory selected. Complete setup to persist it.");
      setSetupRepositoryMessageTone("success");
    });
  };

  const handleBrowseComposerRepositoryPath = async () => {
    await withPendingAction("composer:browse-directory", async () => {
      const browseResult = await orynt.browseRepositoryPath(repositoryPath || setupRepositoryPath || settingsSnapshot?.defaultRepositoryPath);
      if (browseResult.status === "cancelled") {
        pushNotification("info", "Directory selection cancelled.");
        return;
      }
      if (browseResult.status === "unavailable") {
        pushNotification("warning", browseResult.message);
        return;
      }
      setRepositoryPath(browseResult.path);
      setComposerReadinessMessage("");
      pushNotification("success", "Directory updated.");
    });
  };

  const loadProviderModels = async (providerId: ModelProviderId, envKey = apiKeyEnvName, requestId = ++modelCatalogRequestIdRef.current) => {
    return withPendingAction(`model-fetch:${providerId}`, async () => {
      let hasFallbackCatalog = false;
      const preserveSelectedModel = (models: ModelCatalogOption[]) => {
        if (
          modelConnection?.providerId !== providerId ||
          !modelConnection.modelId ||
          models.some((model) => model.id === modelConnection.modelId)
        ) {
          return models;
        }
        return [
          ...models,
          {
            id: modelConnection.modelId,
            label: modelConnection.modelLabel,
            description: "Unavailable to verify. Refresh the provider catalog and check the connection.",
            source: providerId,
            supportedThinkingEfforts: modelConnection.supportedThinkingEfforts,
            defaultThinkingEffort: modelConnection.defaultThinkingEffort,
          },
        ];
      };
      const applyFallbackCatalog = (catalog: CachedProviderModelCatalog, message: string, tone: SetupNoticeTone = "info") => {
        if (requestId !== modelCatalogRequestIdRef.current || catalog.models.length === 0) {
          return;
        }
        hasFallbackCatalog = true;
        setModelCatalogProviderId(providerId);
        setModelCatalogOptions(preserveSelectedModel(catalog.models));
        setModelCatalogStatus("ready");
        setModelCatalogIsLive(false);
        setModelCatalogMessage(message);
        setModelCatalogMessageTone(tone);
      };

      const cachedCatalog = readCachedProviderModelCatalog(providerId);
      if (cachedCatalog) {
        applyFallbackCatalog(cachedCatalog, "Cached models shown. Refreshing live availability.");
      } else {
        setModelCatalogProviderId(providerId);
        setModelCatalogOptions([]);
        setModelCatalogStatus("loading");
        setModelCatalogIsLive(false);
        setModelCatalogMessage("Fetching live models from the selected provider.");
        setModelCatalogMessageTone("info");
      }


      try {
        const catalog = await orynt.listProviderModels({
          providerId,
          envKey: providerId === "openai-api" ? envKey.trim() || "OPENAI_API_KEY" : null,
        });
        if (requestId !== modelCatalogRequestIdRef.current) {
          return catalog;
        }
        const models = preserveSelectedModel(catalog.models);
        setModelCatalogProviderId(catalog.providerId);
        setModelCatalogOptions(models);
        if (catalog.models.length === 0) {
          setModelCatalogStatus("empty");
          setModelCatalogIsLive(true);
          setModelCatalogMessage("No available models found for this provider.");
          setModelCatalogMessageTone("warning");
        } else {
          writeCachedProviderModelCatalog(providerId, catalog.models);
          setModelCatalogStatus("ready");
          setModelCatalogIsLive(true);
          setModelCatalogMessage(catalog.warnings.join(" "));
          setModelCatalogMessageTone(catalog.warnings.length > 0 ? "warning" : "info");
        }
        return catalog;
      } catch (error) {
        if (requestId !== modelCatalogRequestIdRef.current) {
          return null;
        }
        const message = messageFromUnknownError(error, "Could not fetch live models.");
        if (hasFallbackCatalog) {
          setModelCatalogMessage(`Cached models shown; live refresh failed: ${message}`);
          setModelCatalogMessageTone("warning");
          setModelConnectionMessage(message);
          setModelConnectionMessageTone("warning");
          return null;
        }
        setSelectedModelId(null);
        setModelCatalogOptions([]);
        setModelCatalogStatus("error");
        setModelCatalogIsLive(false);
        setModelCatalogMessage(message);
        setModelCatalogMessageTone("error");
        setModelConnectionMessage(message);
        setModelConnectionMessageTone("error");
        return null;
      }
    });
  };

  const preflightSelectedProviderAndLoadModels = async (provider: SetupProviderOption, envKey = apiKeyEnvName) => {
    const preservedThinkingEffort = thinkingEffort;
    await withPendingAction(`provider-check:${provider.id}`, async () => {
      if (provider.id === "codex-cli" && codexManualLoginActionsRevealedRef.current) {
        return;
      }
      const requestId = ++modelCatalogRequestIdRef.current;
      setModelCatalogProviderId(null);
      setModelCatalogOptions([]);
      setModelCatalogStatus("idle");
      setModelCatalogIsLive(false);
      setModelCatalogMessage("");
      setModelCatalogMessageTone("info");
      setModelConnectionMessage(provider.id === "codex-cli" ? "Checking local Codex CLI identity with `codex login status`. No browser login is being started." : "Checking provider before fetching live models.");
      setModelConnectionMessageTone("info");
      try {
      if (provider.id === "codex-cli") {
        const result: CodexConnectionPreflightResult = await orynt.preflightCodexConnection();
        if (codexManualLoginActionsRevealedRef.current) {
          return;
        }
        if (requestId !== modelCatalogRequestIdRef.current) {
          return;
        }
        const settings = await refreshSettingsSnapshot({ closeCompletedSetup: false });
        setThinkingEffort(preservedThinkingEffort);
        if (requestId !== modelCatalogRequestIdRef.current) {
          return;
        }
        setSelectedProviderId("codex-cli");
        const codexConnection: CodexConnectionReference = {
          ...(settings.codexConnection ?? { connectionId: "codex-cli", label: "Local Codex CLI" }),
          status: result.status,
          lastPreflight: result,
        };
        setSettingsSnapshot({ ...settings, codexConnection });
        const message = codexPreflightSetupMessage(result, codexConnectionStatusLabel(codexConnection));
        setCodexConnectionMessage(message);
        setModelConnectionMessage(message);
        setModelConnectionMessageTone(preflightTone(result.ready, result.status));
        if (result.ready) {
          pushNotification("success", message);
          await loadProviderModels("codex-cli", envKey, requestId);
        }
        return;
      }

      const result = await orynt.preflightModelProvider({
        providerId: provider.id,
        authMethod: "apiKeyEnv",
        envKey: envKey.trim() || "OPENAI_API_KEY",
      });
      if (requestId !== modelCatalogRequestIdRef.current) {
        return;
      }
      setModelConnectionMessage(result.reasons[0] ?? "Provider check completed.");
      setModelConnectionMessageTone(preflightTone(result.ready, result.status));
      if (result.ready) {
        pushNotification("success", result.reasons[0] ?? "Provider check completed.");
        await loadProviderModels(provider.id, envKey, requestId);
      }
    } catch (error) {
      if (requestId !== modelCatalogRequestIdRef.current) {
        return;
      }
      const message = messageFromUnknownError(error, "Provider check failed.");
      setModelConnectionMessage(message);
      setModelConnectionMessageTone("error");
      setModelCatalogStatus("error");
      setModelCatalogIsLive(false);
      setModelCatalogMessage(message);
      setModelCatalogMessageTone("error");
      }
    });
  };

  useEffect(() => {
    if (!showSetupDialog || selectedProviderId !== "codex-cli") {
      codexSetupAutoCheckKeyRef.current = null;
      return;
    }
    if (isSelectedProviderCheckPending || isSelectedProviderModelFetchPending) {
      return;
    }
    if (modelCatalogProviderId === "codex-cli" && modelCatalogIsLive) {
      return;
    }

    const autoCheckKey = `${settingsSnapshot?.modelConnection?.modelId ?? "none"}:${settingsSnapshot?.modelConnection?.status ?? "none"}`;
    if (codexSetupAutoCheckKeyRef.current === autoCheckKey) {
      return;
    }
    codexSetupAutoCheckKeyRef.current = autoCheckKey;
    const provider = setupProviderById("codex-cli");
    if (provider) {
      void preflightSelectedProviderAndLoadModels(provider, provider.defaultEnvKey ?? "OPENAI_API_KEY");
    }
  }, [isSelectedProviderCheckPending, isSelectedProviderModelFetchPending, modelCatalogIsLive, modelCatalogProviderId, selectedProviderId, settingsSnapshot?.modelConnection?.modelId, settingsSnapshot?.modelConnection?.status, showSetupDialog]);

  const handleSelectSetupProvider = (providerId: ModelProviderId | "") => {
    modelCatalogRequestIdRef.current += 1;
    if (!providerId) {
      setSelectedProviderId(null);
      setSelectedModelId(null);
      setApiKeyEnvName("OPENAI_API_KEY");
      setModelCatalogProviderId(null);
      setModelCatalogOptions([]);
      setModelCatalogStatus("idle");
      setModelCatalogIsLive(false);
      setModelCatalogMessage("");
      setModelCatalogMessageTone("info");
      setModelConnectionMessage("");
      setModelConnectionMessageTone("info");
      setCodexLoginBackupUrl(null);
      setCodexManualLoginActionsRevealed(false);
      codexManualLoginActionsRevealedRef.current = false;
      return;
    }
    const provider = setupProviderById(providerId);
    if (!provider) {
      return;
    }
    setSelectedProviderId(provider.id);
    setSelectedModelId(null);
    setApiKeyEnvName(provider.defaultEnvKey ?? "OPENAI_API_KEY");
    setModelCatalogProviderId(null);
    setModelCatalogOptions([]);
    setModelCatalogStatus("idle");
    setModelCatalogIsLive(false);
    setModelCatalogMessage("");
    setModelCatalogMessageTone("info");
    setModelConnectionMessage("");
    setModelConnectionMessageTone("info");
    setCodexLoginBackupUrl(null);
    setCodexManualLoginActionsRevealed(false);
    codexManualLoginActionsRevealedRef.current = false;
    void preflightSelectedProviderAndLoadModels(provider, provider.defaultEnvKey ?? "OPENAI_API_KEY");
  };

  const handleSkipCodexAutoCheck = () => {
    modelCatalogRequestIdRef.current += 1;
    codexManualLoginActionsRevealedRef.current = true;
    setCodexManualLoginActionsRevealed(true);
    setSelectedModelId(null);
    setModelCatalogProviderId(null);
    setModelCatalogOptions([]);
    setModelCatalogStatus("idle");
    setModelCatalogIsLive(false);
    setModelCatalogMessage("");
    setModelCatalogMessageTone("info");
    setCodexLoginBackupUrl(null);
    setModelConnectionMessage("Auto-check skipped. Use Codex CLI login options below, then check again.");
    setModelConnectionMessageTone("info");
  };

  const handleSelectSetupModel = (modelId: string) => {
    setSelectedModelId(modelId || null);
    const model = setupModelById(activeModelCatalogOptions, modelId);
    if (model) {
      setThinkingEffort((currentEffort) => resolveThinkingEffortForModel(model, currentEffort));
    }
    setModelConnectionMessage("");
    setModelConnectionMessageTone("info");
    setCodexLoginBackupUrl(null);
  };

  const saveSelectedModelConnectionWithPreflight = async (override?: { provider?: SetupProviderOption | null; model?: SetupModelOption | null; thinkingEffort?: ThinkingEffort }) => {
    const provider = override?.provider ?? selectedProvider;
    const model = override?.model ?? selectedModel;
    if (!provider || !model) {
      setModelConnectionMessage("Authenticate the provider and choose a live model to continue setup.");
      setModelConnectionMessageTone("warning");
      return null;
    }
    const modelThinkingEffortOptions = thinkingEffortOptionsForModel(model);
    const modelSupportsThinkingEffort = modelThinkingEffortOptions.length > 0;
    const modelThinkingEffort = override?.thinkingEffort ?? resolveThinkingEffortForModel(model, thinkingEffort);
    const savedConnection = await orynt.saveModelConnection({
      providerId: provider.id,
      modelId: model.id,
      modelLabel: model.label,
      authMethod: provider.id === "openai-api" ? "apiKeyEnv" : "codexCliSession",
      envKey: provider.id === "openai-api" ? apiKeyEnvName.trim() || "OPENAI_API_KEY" : null,
      thinkingEffort: modelSupportsThinkingEffort ? modelThinkingEffort : null,
      supportedThinkingEfforts: model.supportedThinkingEfforts ?? null,
      defaultThinkingEffort: model.defaultThinkingEffort ?? null,
    });
    const result: ModelConnectionPreflightResult = await orynt.preflightModelConnection();
    const settings = await orynt.getSettings();
    const connection: ModelConnectionReference = {
      ...(settings.modelConnection ?? savedConnection),
      status: result.status,
      lastPreflight: result,
    };
    const nextSettings = { ...settings, modelConnection: connection };
    applySettingsSnapshot(nextSettings);
    if (nextSettings.defaultRepositoryPath && !repositoryPath.trim()) {
      setRepositoryPath(nextSettings.defaultRepositoryPath);
    }
    const message = result.reasons[0] ?? modelConnectionStatusLabel(connection);
    setModelConnectionMessage(message);
    setModelConnectionMessageTone(preflightTone(result.ready, result.status));
    if (result.ready) {
      pushNotification("success", message);
    }
    return connection;
  };

  const handleSaveModelConnection = async () => {
    await withPendingAction("model-connection:save", async () => {
      try {
        await saveSelectedModelConnectionWithPreflight();
      } catch (error) {
        setModelConnectionMessage(messageFromUnknownError(error, "Provider setup save failed."));
        setModelConnectionMessageTone("error");
      }
    });
  };

  const handleRunModelConnectionPreflight = async () => {
    if (!selectedProvider) {
      setModelConnectionMessage("Choose a provider before running the provider check.");
      setModelConnectionMessageTone("warning");
      return;
    }
    await withPendingAction(`model-connection:preflight:${selectedProvider.id}`, async () => {
      try {
        await preflightSelectedProviderAndLoadModels(selectedProvider, apiKeyEnvName);
      } catch (error) {
        setModelConnectionMessage(messageFromUnknownError(error, "Provider check failed."));
        setModelConnectionMessageTone("error");
      }
    });
  };

  const handleLaunchCodexLogin = async (method: CodexLoginMethod) => {
    await withPendingAction(`codex-login:${method}`, async () => {
      try {
        const result = await orynt.launchCodexLogin({ method });
        setCodexLoginBackupUrl(result.loginUrl ?? null);
        setModelConnectionMessage(
          result.loginUrl
            ? `${result.message} If the browser page did not open, use the backup link below.`
            : `${result.message} Complete sign-in there, then return to setup.`,
        );
        setModelConnectionMessageTone("info");
        pushNotification("info", result.message);
      } catch (error) {
        setCodexLoginBackupUrl(null);
        setModelConnectionMessage(messageFromUnknownError(error, "Could not open Codex login."));
        setModelConnectionMessageTone("error");
      }
    });
  };

  const hasSelectedRun = currentRunId !== null;
  const visibleWorkspaces = workspaces.filter((space) => !space.archived);
  const archivedWorkspaces = workspaces.filter((space) => space.archived);
  const deleteWorkspace = deleteWorkspaceId ? workspaces.find((space) => space.id === deleteWorkspaceId) : undefined;
  const activeWorkspace = visibleWorkspaces.find((space) => space.id === activeWorkspaceId) ?? visibleWorkspaces[0] ?? workspaces[0];
  const threadStartCopy = useMemo(() => randomThreadStartCopy(), [activeWorkspace.id]);
  const activeThreadMessages = threadMessagesByWorkspace[activeWorkspace.id] ?? [];
  const isActiveThreadEmpty = activeThreadMessages.length === 0;
  const normalizedWorkspaceSearchQuery = workspaceSearchQuery.trim().toLowerCase();
  const filteredWorkspaces = normalizedWorkspaceSearchQuery
    ? visibleWorkspaces.filter((space) => space.label.toLowerCase().includes(normalizedWorkspaceSearchQuery))
    : visibleWorkspaces;
  const shouldShowWorkspaceSearch = isWorkspaceSearchOpen || workspaceSearchQuery.trim().length > 0;
  const hasOpenShellModal = showSettingsSidebar || showSkillsManager || showSetupDialog || Boolean(deleteWorkspaceId) || showWorkspaceArchive;
  const shellClassName = [
    "app-shell",
    "app-shell-cockpit",
    showSettingsSidebar ? "app-shell-settings-open" : "app-shell-settings-closed",
    hasOpenShellModal ? "app-shell-modal-open" : "app-shell-modal-closed",
    isWorkspacePanelCollapsed ? "app-shell-workspace-collapsed" : "app-shell-workspace-open",
    isMobileWorkspaceViewport
      ? isMobileWorkspaceDrawerOpen
        ? "app-shell-mobile-workspace-open"
        : "app-shell-mobile-workspace-closed"
      : "app-shell-desktop-workspace",
  ].join(" ");
  const workspacePanelToggleLabel = isMobileWorkspaceViewport
    ? isMobileWorkspaceDrawerOpen
      ? "Close tasks"
      : "Open tasks"
    : isWorkspacePanelCollapsed
      ? "Expand side panel"
      : "Collapse side panel";
  const workspacePanelToggleControls = isMobileWorkspaceViewport ? "workspace-drawer" : "workspace-panel";
  const workspacePanelToggleExpanded = isMobileWorkspaceViewport ? isMobileWorkspaceDrawerOpen : !isWorkspacePanelCollapsed;

  const handleSelectWorkspace = (spaceId: string) => {
    setActiveWorkspaceId(spaceId);
    setOpenWorkspaceMenuId(null);
    setDeleteWorkspaceId(null);
    setIsMobileWorkspaceDrawerOpen(false);
  };

  const handleCreateWorkspace = () => {
    const currentMessages = threadMessagesByWorkspace[activeWorkspace.id] ?? [];
    if (activeWorkspace.label === "New task" && currentMessages.length === 0) {
      setComposerValue("");
      setWorkspaceSearchQuery("");
      setIsWorkspaceSearchOpen(false);
      setOpenWorkspaceMenuId(null);
      setDeleteWorkspaceId(null);
      setEditingThreadHeaderId(null);
      setIsMobileWorkspaceDrawerOpen(false);
      return;
    }
    const nextIndex = nextWorkspaceThreadIndex;
    const newSpace: Workspace = {
      id: `thread-${nextIndex}`,
      label: "New task",
      description: "",
      badge: "new",
    };
    setNextWorkspaceThreadIndex((current) => current + 1);
    setWorkspaces((current) => [newSpace, ...current]);
    setThreadMessagesByWorkspace((current) => ({ ...current, [newSpace.id]: [] }));
    setActiveWorkspaceId(newSpace.id);
    setWorkspaceSearchQuery("");
    setIsWorkspaceSearchOpen(false);
    setOpenWorkspaceMenuId(null);
    setDeleteWorkspaceId(null);
    setEditingThreadHeaderId(null);
    setIsMobileWorkspaceDrawerOpen(false);
  };

  const previousUserGoalForAgentResponse = (messageId: string): string => {
    const messageIndex = activeThreadMessages.findIndex((message) => message.id === messageId);
    const searchLimit = messageIndex === -1 ? activeThreadMessages.length : messageIndex;
    for (let index = searchLimit - 1; index >= 0; index -= 1) {
      const candidate = activeThreadMessages[index];
      if (candidate?.role === "user" && candidate.content?.trim()) {
        return candidate.content.trim();
      }
    }
    return "";
  };

  const handleCopyAgentResponse = async (message: ThreadMessage) => {
    const text = agentResponseText(message);
    if (!text.trim()) {
      pushNotification("warning", "There is no response text to copy.");
      return;
    }
    try {
      await writeClipboardText(text);
      setCopiedAgentResponseId(message.id);
      pushNotification("success", "Agent response copied.");
    } catch (error) {
      pushNotification("error", messageFromUnknownError(error, "Could not copy response."));
    }
  };

  const handleRateAgentResponse = (messageId: string, rating: AgentResponseRating) => {
    const currentRating = agentResponseRatings[messageId];
    if (currentRating === rating) {
      setAgentResponseRatings((current) => {
        const { [messageId]: _removedRating, ...remainingRatings } = current;
        return remainingRatings;
      });
      pushNotification("info", "Response rating removed.");
      return;
    }

    setAgentResponseRatings((current) => ({
      ...current,
      [messageId]: rating,
    }));
    pushNotification("success", rating === "good" ? "Marked response as useful." : "Marked response as not useful.");
  };

  const handleShareAgentResponse = async (message: ThreadMessage) => {
    const text = agentResponseText(message);
    if (!text.trim()) {
      pushNotification("warning", "There is no response text to share.");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: message.label ?? "Orynt agent response",
          text,
        });
        pushNotification("success", "Share sheet opened.");
      } else {
        await writeClipboardText(text);
        pushNotification("success", "Share text copied.");
      }
      setSharedAgentResponseId(message.id);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      pushNotification("error", messageFromUnknownError(error, "Could not share response."));
    }
  };

  const handleResendAgentResponse = (message: ThreadMessage) => {
    const retryGoal = previousUserGoalForAgentResponse(message.id);
    if (!retryGoal) {
      pushNotification("warning", "No original user request was found to resend.");
      return;
    }
    setOpenAgentResponseMenuId(null);
    void submitComposerGoal(retryGoal);
  };

  const handleBranchAgentResponse = (message: ThreadMessage) => {
    const nextIndex = nextWorkspaceThreadIndex;
    const branchSpace: Workspace = {
      id: `branch-${nextIndex}`,
      label: `Branch ${nextIndex}`,
      description: "Branched agent response.",
      badge: "branch",
    };
    const branchMessage: ThreadMessage = {
      id: `${branchSpace.id}-agent-1`,
      role: "agent",
      label: message.label ?? "Agent response",
      content: message.content ? `Branched from response:\n\n${message.content}` : "Branched from agent response.",
      showContext: false,
    };
    setNextWorkspaceThreadIndex((current) => current + 1);
    setWorkspaces((current) => [branchSpace, ...current]);
    setThreadMessagesByWorkspace((current) => ({
      ...current,
      [branchSpace.id]: [branchMessage],
    }));
    setActiveWorkspaceId(branchSpace.id);
    setWorkspaceSearchQuery("");
    setIsWorkspaceSearchOpen(false);
    setOpenWorkspaceMenuId(null);
    setOpenAgentResponseMenuId(null);
    setEditingThreadHeaderId(null);
  };

  const handleToggleAgentResponseMenu = (messageId: string) => {
    setOpenAgentResponseMenuId((current) => (current === messageId ? null : messageId));
  };

  const handleToggleReadAloud = (message: ThreadMessage) => {
    if (!("speechSynthesis" in window)) {
      pushNotification("warning", "Read aloud is not available in this window.");
      return;
    }
    if (readingAgentResponseId === message.id) {
      window.speechSynthesis.cancel();
      setReadingAgentResponseId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(agentResponseText(message));
    utterance.onend = () => setReadingAgentResponseId((current) => (current === message.id ? null : current));
    utterance.onerror = () => setReadingAgentResponseId((current) => (current === message.id ? null : current));
    setReadingAgentResponseId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  const handleAgentResponseTextSelection = (messageId: string) => {
    const selection = window.getSelection();
    const selectedText = normalizeSelectedText(selection?.toString() ?? "");
    if (!selection || selection.rangeCount === 0 || selectedText.length === 0) {
      setAgentResponseSelection((current) => (current?.messageId === messageId ? null : current));
      return;
    }

    const anchorElement = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? (selection.anchorNode as Element) : selection.anchorNode?.parentElement;
    const focusElement = selection.focusNode?.nodeType === Node.ELEMENT_NODE ? (selection.focusNode as Element) : selection.focusNode?.parentElement;
    const selector = `[data-agent-response-content-id="${messageId}"]`;
    const selectionIsInsideResponse = [anchorElement, focusElement].every((element) => element?.closest(selector));
    if (!selectionIsInsideResponse) {
      setAgentResponseSelection((current) => (current?.messageId === messageId ? null : current));
      return;
    }

    setAgentResponseSelection({ messageId, text: selectedText });
    setOpenAgentResponseMenuId(null);
  };

  const handleAppMouseUp = () => {
    if (!agentResponseSelection) {
      return;
    }

    const selection = window.getSelection();
    const selectedText = normalizeSelectedText(selection?.toString() ?? "");
    const anchorElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? (selection.anchorNode as Element) : selection?.anchorNode?.parentElement;
    const focusElement = selection?.focusNode?.nodeType === Node.ELEMENT_NODE ? (selection.focusNode as Element) : selection?.focusNode?.parentElement;
    const responseSelector = "[data-agent-response-content-id]";
    const selectionIsInsideResponse =
      selectedText.length > 0 && [anchorElement, focusElement].every((element) => element?.closest(responseSelector));

    if (!selectionIsInsideResponse) {
      setAgentResponseSelection(null);
    }
  };

  const handleReplyToSelectedAgentText = () => {
    if (!agentResponseSelection) {
      return;
    }

    setComposerValue(`Replying to Agent response: "${agentResponseSelection.text}"`);
    setAgentResponseSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleToggleWorkspaceSearch = () => {
    if (isMobileWorkspaceViewport) {
      setIsMobileWorkspaceDrawerOpen(true);
    }
    setIsWorkspaceSearchOpen((current) => {
      if (current) {
        setWorkspaceSearchQuery("");
      }
      return !current;
    });
  };

  const handleToggleWorkspacePanel = () => {
    if (isMobileWorkspaceViewport) {
      setIsMobileWorkspaceDrawerOpen((current) => !current);
      return;
    }
    setIsWorkspacePanelCollapsed((current) => !current);
  };

  const handleToggleWorkspaceMenu = (spaceId: string) => {
    setOpenWorkspaceMenuId((current) => (current === spaceId ? null : spaceId));
    setDeleteWorkspaceId(null);
  };

  const handleStartRenameWorkspace = (space: Workspace) => {
    setRenamingWorkspaceId(space.id);
    setWorkspaceRenameValue(space.label);
    setOpenWorkspaceMenuId(null);
    setDeleteWorkspaceId(null);
  };

  const handleCancelRenameWorkspace = () => {
    setRenamingWorkspaceId(null);
    setWorkspaceRenameValue("");
  };

  const handleCommitRenameWorkspace = (spaceId: string) => {
    const nextLabel = workspaceRenameValue.trim();
    if (!nextLabel) {
      handleCancelRenameWorkspace();
      return;
    }
    setWorkspaces((current) => current.map((space) => (space.id === spaceId ? { ...space, label: nextLabel } : space)));
    handleCancelRenameWorkspace();
  };

  const handleRenameWorkspaceKeyDown = (event: KeyboardEvent<HTMLInputElement>, spaceId: string) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCommitRenameWorkspace(spaceId);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelRenameWorkspace();
    }
  };

  const handleStartThreadHeaderEdit = () => {
    setEditingThreadHeaderId(activeWorkspace.id);
    setThreadHeaderTitleValue(activeWorkspace.label);
    setThreadHeaderDescriptionValue(activeWorkspace.description);
    setOpenWorkspaceMenuId(null);
    setDeleteWorkspaceId(null);
  };

  const handleCancelThreadHeaderEdit = () => {
    setEditingThreadHeaderId(null);
    setThreadHeaderTitleValue("");
    setThreadHeaderDescriptionValue("");
  };

  const handleCommitThreadHeaderEdit = () => {
    if (!editingThreadHeaderId) {
      return;
    }
    const nextTitle = threadHeaderTitleValue.trim();
    const nextDescription = threadHeaderDescriptionValue.trim();
    setWorkspaces((current) =>
      current.map((space) =>
        space.id === editingThreadHeaderId
          ? {
              ...space,
              label: nextTitle || space.label,
              description: nextDescription,
            }
          : space,
      ),
    );
    handleCancelThreadHeaderEdit();
  };

  const handleThreadHeaderEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCommitThreadHeaderEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelThreadHeaderEdit();
    }
  };

  const handleStartThreadHeaderEditKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleStartThreadHeaderEdit();
    }
  };

  const handleThreadHeaderEditBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    handleCommitThreadHeaderEdit();
  };

  const handleArchiveWorkspace = (spaceId: string) => {
    if (visibleWorkspaces.length <= 1) {
      return;
    }
    const nextWorkspaces = workspaces.map((space) => (space.id === spaceId ? { ...space, archived: true } : space));
    const nextVisibleWorkspace = nextWorkspaces.find((space) => !space.archived);
    setWorkspaces(nextWorkspaces);
    if (activeWorkspaceId === spaceId && nextVisibleWorkspace) {
      setActiveWorkspaceId(nextVisibleWorkspace.id);
    }
    setOpenWorkspaceMenuId(null);
    setDeleteWorkspaceId(null);
  };

  const handleRequestDeleteWorkspace = (spaceId: string) => {
    if (visibleWorkspaces.length <= 1) {
      return;
    }
    setDeleteWorkspaceId(spaceId);
    setOpenWorkspaceMenuId(null);
  };

  const handleConfirmDeleteWorkspace = () => {
    if (!deleteWorkspaceId || visibleWorkspaces.length <= 1) {
      return;
    }
    const nextWorkspaces = workspaces.filter((space) => space.id !== deleteWorkspaceId);
    const nextVisibleWorkspace = nextWorkspaces.find((space) => !space.archived);
    setWorkspaces(nextWorkspaces);
    setThreadMessagesByWorkspace((current) => {
      const nextMessages = { ...current };
      delete nextMessages[deleteWorkspaceId];
      return nextMessages;
    });
    if (activeWorkspaceId === deleteWorkspaceId && nextVisibleWorkspace) {
      setActiveWorkspaceId(nextVisibleWorkspace.id);
    }
    setOpenWorkspaceMenuId(null);
    setDeleteWorkspaceId(null);
  };

  const handleRestoreWorkspace = (spaceId: string) => {
    setWorkspaces((current) => current.map((space) => (space.id === spaceId ? { ...space, archived: false } : space)));
    setActiveWorkspaceId(spaceId);
    setWorkspaceSearchQuery("");
    setIsWorkspaceSearchOpen(false);
    setShowWorkspaceArchive(false);
  };

  const handleToggleAccountMenu = () => {
    setIsAccountMenuOpen((current) => !current);
    setOpenWorkspaceMenuId(null);
  };

  const handleOpenSettingsFromAccountMenu = () => {
    setIsAccountMenuOpen(false);
    setShowSetupDialog(false);
    setShowSettingsSidebar(true);
  };

  const handleToggleSettingsDialog = () => {
    setShowSetupDialog(false);
    setShowSettingsSidebar((current) => !current);
  };

  const handleOpenComposerQuickDialog = (dialog: "model" | "effort") => {
    const quickButton = dialog === "model" ? composerModelButtonRef.current : composerEffortButtonRef.current;
    if (quickButton) {
      setComposerQuickMenuPlacement(resolveComposerMenuPlacement(quickButton, dialog === "model" ? 520 : 380));
    }
    if (dialog === "effort" && composerQuickDialog !== "effort") {
      updateComposerEffortPopoverCenter();
    }
    setIsComposerAttachmentMenuOpen(false);
    setIsComposerMetaMenuOpen(false);
    setComposerQuickDialog((current) => (current === dialog ? null : dialog));
  };

  const handleSaveComposerModel = async (provider: SetupProviderOption, model: SetupModelOption) => {
    const nextThinkingEffort = resolveThinkingEffortForModel(model, thinkingEffort);
    setSelectedModelId(model.id);
    setThinkingEffort(nextThinkingEffort);
    setModelConnectionMessage("");
    setModelConnectionMessageTone("info");
    if (modelConnection?.providerId === provider.id && modelConnection.modelId === model.id) {
      setComposerQuickDialog(null);
      return;
    }
    await withPendingAction("model-connection:save", async () => {
      try {
        const connection = await saveSelectedModelConnectionWithPreflight({ provider, model, thinkingEffort: nextThinkingEffort });
        if (connection) {
          setComposerQuickDialog(null);
        }
      } catch (error) {
        setModelConnectionMessage(messageFromUnknownError(error, "Provider setup save failed."));
        setModelConnectionMessageTone("error");
      }
    });
  };


  const handleSelectComposerThinkingEffortAndClose = async (effort: ThinkingEffortOption) => {
    await handleThinkingEffortChange(effort);
    setComposerQuickDialog(null);
  };

  const handleToggleComposerMetaMenu = () => {
    if (composerMetaButtonRef.current) {
      setComposerMetaMenuPlacement(resolveComposerMenuPlacement(composerMetaButtonRef.current, composerPermissionMenuEstimatedHeight));
    }
    setIsComposerAttachmentMenuOpen(false);
    setComposerQuickDialog(null);
    setIsComposerMetaMenuOpen((current) => !current);
  };

  const handleSelectComposerPermissionMode = (mode: PermissionModeOption) => {
    setPermissionMode(mode);
    setIsComposerMetaMenuOpen(false);
  };

  const handleToggleComposerAttachmentMenu = () => {
    if (composerAttachmentButtonRef.current) {
      setComposerAttachmentMenuPlacement(resolveComposerMenuPlacement(composerAttachmentButtonRef.current, composerAttachmentMenuEstimatedHeight));
    }
    setIsComposerMetaMenuOpen(false);
    setIsComposerSkillsMenuOpen(false);
    setComposerQuickDialog(null);
    setIsComposerAttachmentMenuOpen((current) => !current);
  };

  const handleSelectComposerAttachmentOption = (optionId: string) => {
    if (optionId === "skills") {
      setIsComposerSkillsMenuOpen(true);
      return;
    }
    setIsComposerAttachmentMenuOpen(false);
  };

  const handleToggleSelectedAgentSkill = (skillId: string) => {
    setSelectedAgentSkillIds((current) => (current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId]));
  };

  const handleOpenSkillsManager = () => {
    setIsComposerAttachmentMenuOpen(false);
    setIsComposerSkillsMenuOpen(false);
    setIsAccountMenuOpen(false);
    setShowSkillsManager(true);
  };

  const renderComposerModelDialog = () => {
    if (composerQuickDialog !== "model") {
      return null;
    }

    return (
      <div
        className={`composer-model-menu composer-model-menu-${composerQuickMenuPlacement}`}
        id="composer-model-menu"
        role="menu"
        aria-label="Choose model"
        ref={composerQuickMenuRef}
      >
        {selectedProvider && activeModelCatalogOptions.length > 0 ? (
          activeModelCatalogOptions.map((model) => {
            const isSelectedModel = selectedModelId === model.id;
            return (
              <button
                className="composer-model-menu-option"
                type="button"
                role="menuitemradio"
                aria-checked={isSelectedModel}
                aria-busy={isSelectedModel && isModelConnectionSavePending}
                disabled={isModelConnectionSavePending}
                key={model.id}
                onClick={() => void handleSaveComposerModel(selectedProvider, model)}
              >
                {model.label}
                {isSelectedModel ? <Check className="composer-option-check" aria-hidden="true" strokeWidth={2} /> : null}
              </button>
            );
          })
        ) : (
          <p className="composer-quick-empty">{selectedProvider ? "Refresh to load provider-available models." : "Choose a provider first."}</p>
        )}
      </div>
    );
  };

  const renderComposerThinkingEffortDialog = () => {
    if (composerQuickDialog !== "effort") {
      return null;
    }
    const activeComposerThinkingEffort =
      composerThinkingEffortOptions.find((option) => option.value === thinkingEffort) ?? composerThinkingEffortOptions.find((option) => option.value === selectedModelThinkingEffort) ?? composerThinkingEffortOptions[0];

    return (
      <div
        className={`composer-effort-popover composer-effort-popover-${composerQuickMenuPlacement}`}
        id="composer-effort-menu"
        role="menu"
        aria-label="Change thinking effort"
        ref={composerQuickMenuRef}
        style={
          composerEffortPopoverCenter === null ? undefined : ({ "--composer-effort-anchor-x": `${composerEffortPopoverCenter}px` } as CSSProperties)
        }
      >
        <div className="composer-effort-menu-options">
          {composerThinkingEffortOptions.map((option) => {
            const isSelectedEffort = option.value === activeComposerThinkingEffort.value;
            return (
              <button
                className="composer-effort-menu-option"
                type="button"
                role="menuitemradio"
                aria-checked={isSelectedEffort}
                key={option.value}
                onClick={() => void handleSelectComposerThinkingEffortAndClose(option.value)}
              >
                {option.label}
                {isSelectedEffort ? <Check className="composer-option-check" aria-hidden="true" strokeWidth={2} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDeleteWorkspaceDialog = () => {
    if (!deleteWorkspace) {
      return null;
    }

    return (
      <ShellModal id="workspace-delete-dialog" label="Delete thread" onClose={() => setDeleteWorkspaceId(null)}>
        <div className="workspace-delete-dialog">
          <p>
            Delete <strong>{deleteWorkspace.label}</strong> and its local messages.
          </p>
          <div className="workspace-dialog-actions">
            <button className="workspace-dialog-secondary" type="button" onClick={() => setDeleteWorkspaceId(null)}>
              Cancel
            </button>
            <button className="workspace-dialog-danger" type="button" onClick={handleConfirmDeleteWorkspace}>
              Delete thread
            </button>
          </div>
        </div>
      </ShellModal>
    );
  };

  const renderWorkspaceArchiveDialog = () => {
    if (!showWorkspaceArchive) {
      return null;
    }

    return (
      <ShellModal id="workspace-archive-dialog" label="Archive" onClose={() => setShowWorkspaceArchive(false)}>
        <div className="workspace-archive-dialog">
          {archivedWorkspaces.length > 0 ? (
            archivedWorkspaces.map((space) => (
              <div className="workspace-archive-row" key={space.id}>
                <span>{space.label}</span>
                <button type="button" onClick={() => handleRestoreWorkspace(space.id)}>
                  Restore
                </button>
              </div>
            ))
          ) : (
            <p>No archived threads.</p>
          )}
        </div>
      </ShellModal>
    );
  };

  const renderApprovalBubble = (messageKey = "approval") => (
    <MessageBlock role="approval" meta="Approval request" showMeta={showMessageBlockMeta} key={messageKey}>
      <ChatBubble
        tone="approval"
        align="start"
        width="full"
        ariaLabel="Approval request"
        title="Protected action approval"
        actions={
          <>
            {!desktopRunSnapshot || (desktopRunSnapshot.status === "waiting_for_approval" && desktopRunSnapshot.taskPlan) ? (
              <>
                <button className="approval-action-secondary" type="button" onClick={() => void handleApproval("denied")} disabled={isApprovalPending} aria-busy={isApprovalDeniedPending}>
                  <LoadingButtonContent isLoading={isApprovalDeniedPending} loadingLabel="Denying">
                    Deny step
                  </LoadingButtonContent>
                </button>
                <button className="approval-action-primary" type="button" onClick={() => void handleApproval("approved")} disabled={isApprovalPending} aria-busy={isApprovalApprovedPending}>
                  <LoadingButtonContent isLoading={isApprovalApprovedPending} loadingLabel="Approving">
                    Approve step
                  </LoadingButtonContent>
                </button>
              </>
            ) : null}
            {desktopRunSnapshot?.status === "running" ? (
              <>
                {desktopRunSnapshot.executionAttemptStatus === "prepared" ? (
                  <button className="approval-action-primary" type="button" onClick={() => void handleRecoverRuntime()} disabled={isPendingAction("runtime:recover")}>
                    Recover
                  </button>
                ) : null}
                <button className="approval-action-secondary" type="button" onClick={() => void handleCancelRuntime()} disabled={isPendingAction("runtime:cancel")}>
                  Cancel run
                </button>
              </>
            ) : null}
            {desktopRunSnapshot?.status === "execution_in_doubt" ? (
              <button className="approval-action-secondary" type="button" onClick={() => void handleMarkRuntimeFailed()} disabled={isPendingAction("runtime:mark-failed")}>
                Mark failed
              </button>
            ) : null}
          </>
        }
      >
        <p>{approvalStatus}</p>
        {desktopRunSnapshot?.status === "waiting_for_approval" && !desktopRunSnapshot.taskPlan ? (
          <p className="approval-plan-digest">
            This legacy run cannot be approved because it has no trusted task plan. Create a new run.
          </p>
        ) : null}
        {desktopRunSnapshot?.taskPlan ? (
          <div className="approval-plan" aria-label="Approved repository task plan">
            <p>
              {desktopRunSnapshot.taskPlan.summary} ·{" "}
              {desktopRunSnapshot.taskPlan.tasks.length} task
              {desktopRunSnapshot.taskPlan.tasks.length === 1 ? "" : "s"}
            </p>
            <ol>
              {desktopRunSnapshot.taskPlan.tasks.map((task) => (
                <li key={task.id}>
                  {task.title} · {task.authority.replace("_", " ")}
                </li>
              ))}
            </ol>
            <p className="approval-plan-digest">
              Digest {desktopRunSnapshot.taskPlan.digest.slice(0, 16)}…
            </p>
          </div>
        ) : null}
      </ChatBubble>
    </MessageBlock>
  );

  const renderThreadMessage = (message: ThreadMessage) => {
    if (message.role === "user") {
      return (
        <MessageBlock role="user" align="end" key={message.id} messageId={message.id}>
          <ChatBubble tone="user" align="end" width="compact">
            <p>{message.content}</p>
          </ChatBubble>
        </MessageBlock>
      );
    }

    if (message.role === "system") {
      return (
        <MessageBlock role="system" key={message.id} messageId={message.id}>
          <p className="system-notice-text">{message.content}</p>
        </MessageBlock>
      );
    }

    if (message.role === "agent") {
      return renderAgentMessage(message);
    }

    return renderApprovalBubble(message.id);
  };

  const renderAgentResponseActions = (message: ThreadMessage) => {
    const isCopied = copiedAgentResponseId === message.id;
    const isShared = sharedAgentResponseId === message.id;
    const rating = agentResponseRatings[message.id];
    const isMenuOpen = openAgentResponseMenuId === message.id;
    const isReading = readingAgentResponseId === message.id;

    return (
      <div className="agent-response-actions" role="toolbar" aria-label="Agent response actions">
        <button
          className="agent-response-action-button"
          type="button"
          aria-label={isCopied ? "Copied response" : "Copy response"}
          aria-pressed={isCopied}
          title={isCopied ? "Copied" : "Copy"}
          onClick={() => void handleCopyAgentResponse(message)}
        >
          {isCopied ? <Check className="ui-icon" aria-hidden="true" strokeWidth={2} /> : <Copy className="ui-icon" aria-hidden="true" strokeWidth={2} />}
        </button>
        <button
          className="agent-response-action-button"
          type="button"
          aria-label="Good response"
          aria-pressed={rating === "good"}
          title="Good response"
          onClick={() => handleRateAgentResponse(message.id, "good")}
        >
          <ThumbsUp className="ui-icon" aria-hidden="true" strokeWidth={2} />
        </button>
        <button
          className="agent-response-action-button"
          type="button"
          aria-label="Bad response"
          aria-pressed={rating === "bad"}
          title="Bad response"
          onClick={() => handleRateAgentResponse(message.id, "bad")}
        >
          <ThumbsDown className="ui-icon" aria-hidden="true" strokeWidth={2} />
        </button>
        <button
          className="agent-response-action-button"
          type="button"
          aria-label={isShared ? "Shared response" : "Share response"}
          aria-pressed={isShared}
          title={isShared ? "Shared" : "Share"}
          onClick={() => void handleShareAgentResponse(message)}
        >
          {isShared ? <Check className="ui-icon" aria-hidden="true" strokeWidth={2} /> : <Share className="ui-icon" aria-hidden="true" strokeWidth={2} />}
        </button>
        <button className="agent-response-action-button" type="button" aria-label="Resend task" title="Resend" onClick={() => handleResendAgentResponse(message)}>
          <RotateCcw className="ui-icon" aria-hidden="true" strokeWidth={2} />
        </button>
        <div className="agent-response-more-action">
          <button
            className="agent-response-action-button"
            type="button"
            aria-label="More response actions"
            aria-expanded={isMenuOpen}
            title="More"
            onClick={() => handleToggleAgentResponseMenu(message.id)}
          >
            <MoreHorizontal className="ui-icon" aria-hidden="true" strokeWidth={2} />
          </button>

          {isMenuOpen ? (
            <div className="agent-response-more-menu" role="menu" aria-label="More response actions">
              <button type="button" role="menuitem" onClick={() => handleBranchAgentResponse(message)}>
                <GitBranch className="ui-icon" aria-hidden="true" strokeWidth={2} />
                <span>Branch in new thread</span>
              </button>
              <button
                type="button"
                role="menuitem"
                aria-pressed={isReading}
                onClick={() => {
                  handleToggleReadAloud(message);
                  setOpenAgentResponseMenuId(null);
                }}
              >
                <Volume2 className="ui-icon" aria-hidden="true" strokeWidth={2} />
                <span>{isReading ? "Stop reading aloud" : "Read aloud"}</span>
              </button>
            </div>
          ) : null}
        </div>

      </div>
    );
  };


  const renderAgentMessage = (message: ThreadMessage, detailMessages: ThreadMessage[] = []) => (
    <div className="agent-run-block" key={message.id}>
      <AgentDetails messages={detailMessages} />
      <MessageBlock role="agent" meta={message.label ?? "Agent response"} showMeta={showMessageBlockMeta}>
        <ChatBubble
          tone="agent"
          align="start"
          width="full"
          ariaLabel="Agent response"
          actions={renderAgentResponseActions(message)}
        >
          <div
            className="agent-response-content"
            data-agent-response-content-id={message.id}
            onMouseUp={() => handleAgentResponseTextSelection(message.id)}
            onKeyUp={() => handleAgentResponseTextSelection(message.id)}
          >
            {renderMarkdownContent(message.content ?? "")}
          </div>
          {agentResponseSelection?.messageId === message.id ? (
            <div className="agent-response-selection-popover" role="toolbar" aria-label="Selected text actions">
              <button
                type="button"
                aria-label="Reply to selected text"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleReplyToSelectedAgentText}
              >
                Reply
              </button>
            </div>
          ) : null}
        </ChatBubble>
      </MessageBlock>
    </div>
  );

  const renderAgentGeneratingMessage = () => {
    const runCheckpoints = activeThreadMessages.filter((message) => message.role === "system" && message.detailKind);
    const latestCheckpoint = runCheckpoints.at(-1);
    const checkpointLabel = latestCheckpoint
      ? `Checkpoint ${runCheckpoints.length}: ${truncateUiText(latestCheckpoint.content ?? (latestCheckpoint.detailKind ? runEventKindLabels[latestCheckpoint.detailKind] : "Run event"), 120)}`
      : "Checkpoint 0: waiting for run log";

    return (
      <div className="agent-thinking-status" role="status" aria-label="Agent is generating response" aria-live="polite" key="agent-generating-response">
        <div className="agent-thinking-status-title">
          <LoadingSpinner />
          <span>Generating response</span>
          <span className="agent-generating-timer" aria-label={`Elapsed ${formatElapsedClock(generatingElapsedSeconds)}`}>
            {formatElapsedClock(generatingElapsedSeconds)}
          </span>
          <span className="agent-generating-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
        <span className="agent-generating-checkpoint" aria-label={checkpointLabel}>
          {checkpointLabel}
        </span>
      </div>
    );
  };

  const renderThreadMessages = () => {
    const renderedMessages: ReactNode[] = [];
    let pendingSystemMessages: ThreadMessage[] = [];

    const renderStandaloneSystemMessages = (messages: ThreadMessage[], keyPrefix: string) => {
      const detailMessages = messages.filter((systemMessage) => systemMessage.detailKind);
      const noticeMessages = messages.filter((systemMessage) => !systemMessage.detailKind);
      const standaloneMessages = noticeMessages.map((systemMessage) => renderThreadMessage(systemMessage));
      if (detailMessages.length > 0) {
        let latestCompletionDetail: ThreadMessage | null = null;
        for (let index = detailMessages.length - 1; index >= 0; index -= 1) {
          const systemMessage = detailMessages[index];
          if (systemMessage.detailKind === "done" && (systemMessage.content ?? "").startsWith("Repository harness run completed for ")) {
            latestCompletionDetail = systemMessage;
            break;
          }
        }
        standaloneMessages.push(
          <div className="agent-run-block" key={`${keyPrefix}-agent-details-${detailMessages.map((message) => message.id).join("-")}`}>
            <AgentDetails messages={detailMessages} />
          </div>,
        );
        if (latestCompletionDetail) {
          standaloneMessages.push(
            renderAgentMessage({
              id: `${latestCompletionDetail.id}-no-final-response`,
              runId: latestCompletionDetail.runId,
              role: "agent",
              label: "Agent response",
              content: noFinalModelResponseContent(latestCompletionDetail.runId),
            }),
          );
        }
      }
      return standaloneMessages;
    };

    activeThreadMessages.forEach((message) => {
      if (message.role === "system") {
        pendingSystemMessages = [...pendingSystemMessages, message];
        return;
      }

      if (isInternalAgentRunMessage(message)) {
        pendingSystemMessages = [
          ...pendingSystemMessages,
          {
            ...message,
            role: "system",
            detailKind: message.detailKind ?? (isRepositoryHarnessCompletionFallbackMessage(message) ? "done" : "model"),
          },
        ];
        return;
      }

      if (message.role === "agent") {
        renderedMessages.push(renderAgentMessage(message, pendingSystemMessages));
        pendingSystemMessages = [];
        return;
      }

      if (pendingSystemMessages.length > 0) {
        renderedMessages.push(...renderStandaloneSystemMessages(pendingSystemMessages, `before-${message.id}`));
        pendingSystemMessages = [];
      }

      renderedMessages.push(renderThreadMessage(message));
    });

    if (pendingSystemMessages.length > 0 && !isComposerSubmitPending) {
      renderedMessages.push(...renderStandaloneSystemMessages(pendingSystemMessages, "trailing"));
    }

    if (isComposerSubmitPending) {
      renderedMessages.push(renderAgentGeneratingMessage());
    }

    return renderedMessages;
  };

  const renderModelProviderSetupPanel = (headingId: string) => (
    <section className="settings-review-list setup-provider-panel" aria-label="Setup model provider">
      <div className="setup-picker-panel">
        <section className="setup-picker setup-picker-section" aria-label="Provider selector">
          <label className="settings-field settings-field-stacked">
            <span>Provider</span>
            <OryntDropdown
              ariaLabel="Provider"
              density="comfortable"
              id={`${headingId}-provider`}
              onChange={(nextValue) => handleSelectSetupProvider(nextValue as ModelProviderId | "")}
              options={[
                { value: "", label: "Choose provider" },
                ...setupProviderOptions.map((provider) => ({
                  description: provider.description,
                  label: provider.label,
                  value: provider.id,
                })),
              ]}
              placeholder="Choose provider"
              value={selectedProviderId ?? ""}
            />
          </label>
        </section>
      </div>
      {selectedProvider ? (
        <article className="settings-review-card">
          <div className="settings-review-card-header">
            <div>
              <h3>{selectedProvider.label}</h3>
              <span>{selectedModel?.label ?? "Provider setup"}</span>
            </div>
            <strong>{modelConnectionStatusLabel(modelConnection)}</strong>
          </div>
          <p className={setupLogTextClassName(modelConnectionMessage ? modelConnectionMessageTone : modelCatalogStatus === "ready" ? "success" : "info")}>
            {isCodexAutoCheckPending ? (
              <span className="loading-button-content">
                <LoadingSpinner />
                <span>{modelConnectionMessage || "Checking local Codex CLI identity with `codex login status`."}</span>
              </span>
            ) : (
              modelConnectionMessage ||
              (modelCatalogStatus === "ready"
                ? modelCatalogIsLive
                  ? "Choose a live model to finish provider setup."
                  : "Cached model choices are visible while live availability refreshes."
                : selectedProvider.id === "codex-cli"
                  ? "Checking Codex CLI automatically."
                  : "Run the provider check to fetch live models.")
            )}
          </p>
          {selectedProvider.id === "openai-api" ? (
            <label className="settings-field">
              <span>API key environment variable</span>
              <input
                className="input-focus-standalone"
                type="text"
                aria-label="API key environment variable"
                value={apiKeyEnvName}
                placeholder="OPENAI_API_KEY"
                autoComplete="off"
                onChange={(event) => {
                  setApiKeyEnvName(event.target.value);
                  modelCatalogRequestIdRef.current += 1;
                  setModelCatalogProviderId(null);
                  setModelCatalogOptions([]);
                  setModelCatalogStatus("idle");
                  setModelCatalogIsLive(false);
                  setModelCatalogMessage("");
                  setModelCatalogMessageTone("info");
                  setSelectedModelId(null);
                }}
              />
            </label>
          ) : (
            <div className="settings-callout">
              <strong>Existing Codex CLI session</strong>
              <span>Auto-detect checks the local session with `codex login status`. If sign-in is missing, run `codex login` in a terminal here or manually, then check again.</span>
            </div>
          )}
          {shouldShowProviderSetupActions ? (
            <div className="candidate-rule-actions">
              {selectedProvider.id === "codex-cli" ? (
                <>
                  {isCodexAutoCheckPending ? (
                    <button type="button" onClick={handleSkipCodexAutoCheck} aria-label="Skip auto check">
                      Skip auto check
                    </button>
                  ) : !isSelectedProviderLiveCatalogReady ? (
                    <>
                      <button type="button" onClick={() => void handleLaunchCodexLogin("browser")} disabled={isCodexLoginPending} aria-busy={isCodexBrowserLoginPending} aria-label="Open Codex login">
                        <LoadingButtonContent isLoading={isCodexBrowserLoginPending} loadingLabel="Opening">
                          Open Codex login
                        </LoadingButtonContent>
                      </button>
                      <button type="button" onClick={() => void handleLaunchCodexLogin("deviceCode")} disabled={isCodexLoginPending} aria-busy={isCodexDeviceCodeLoginPending} aria-label="Use device code">
                        <LoadingButtonContent isLoading={isCodexDeviceCodeLoginPending} loadingLabel="Opening">
                          Use device code
                        </LoadingButtonContent>
                      </button>
                    </>
                  ) : null}
                  {canSaveSelectedModelConnection ? (
                    <button type="button" onClick={() => void handleSaveModelConnection()} disabled={isModelConnectionSavePending} aria-busy={isModelConnectionSavePending} aria-label="Save provider setup">
                      <LoadingButtonContent isLoading={isModelConnectionSavePending} loadingLabel="Saving">
                        Save provider setup
                      </LoadingButtonContent>
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button type="button" onClick={() => void handleRunModelConnectionPreflight()} disabled={isSelectedProviderCheckPending || isSelectedProviderModelFetchPending} aria-busy={isSelectedProviderCheckPending || isSelectedProviderModelFetchPending} aria-label="Run provider check">
                    <LoadingButtonContent isLoading={isSelectedProviderCheckPending || isSelectedProviderModelFetchPending} loadingLabel={isSelectedProviderModelFetchPending ? "Fetching" : "Checking"}>
                      Run provider check
                    </LoadingButtonContent>
                  </button>
                  {canSaveSelectedModelConnection ? (
                    <button type="button" onClick={() => void handleSaveModelConnection()} disabled={isModelConnectionSavePending} aria-busy={isModelConnectionSavePending} aria-label="Save provider setup">
                      <LoadingButtonContent isLoading={isModelConnectionSavePending} loadingLabel="Saving">
                        Save provider setup
                      </LoadingButtonContent>
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {selectedProvider.id === "codex-cli" && codexLoginBackupUrl ? (
            <p className="setup-log-text setup-log-text-info">
              Backup link: <a href={codexLoginBackupUrl} target="_blank" rel="noreferrer">{codexLoginBackupUrl}</a>
            </p>
          ) : null}
        </article>
      ) : null}
      {selectedProvider && modelCatalogStatus === "loading" ? (
        <article className="settings-review-card">
          <div className="settings-review-card-header">
            <div>
              <h3>Live models</h3>
              <span>Fetching</span>
            </div>
            <strong className="loading-status-label">
              <LoadingSpinner />
              Loading
            </strong>
          </div>
          <p className={setupLogTextClassName(modelCatalogMessageTone)}>{modelCatalogMessage}</p>
          <div className="loading-skeleton-list" aria-hidden="true">
            <div className="loading-skeleton-row" />
            <div className="loading-skeleton-row" />
          </div>
        </article>
      ) : null}
      {selectedProvider && modelCatalogStatus === "error" ? (
        <article className="settings-review-card">
          <div className="settings-review-card-header">
            <div>
              <h3>Live models</h3>
              <span>Fetch failed</span>
            </div>
            <strong>Retry required</strong>
          </div>
          <p className={setupLogTextClassName(modelCatalogMessageTone)}>{modelCatalogMessage}</p>
          <div className="candidate-rule-actions">
            <button type="button" onClick={() => void loadProviderModels(selectedProvider.id, apiKeyEnvName)} disabled={isSelectedProviderModelFetchPending} aria-busy={isSelectedProviderModelFetchPending}>
              <LoadingButtonContent isLoading={isSelectedProviderModelFetchPending} loadingLabel="Fetching">
                Retry model fetch
              </LoadingButtonContent>
            </button>
          </div>
        </article>
      ) : null}
      {selectedProvider && modelCatalogStatus === "empty" ? (
        <article className="settings-review-card">
          <div className="settings-review-card-header">
            <div>
              <h3>Live models</h3>
              <span>No models</span>
            </div>
            <strong>Empty</strong>
          </div>
          <p className={setupLogTextClassName(modelCatalogMessageTone)}>{modelCatalogMessage}</p>
        </article>
      ) : null}
      {selectedProvider && modelCatalogStatus === "ready" && activeModelCatalogOptions.length > 0 ? (
        <section className="setup-picker setup-picker-section" aria-label="Model selector">
          <label className="settings-field settings-field-stacked">
            <span>Model</span>
            <OryntDropdown
              ariaLabel="Model"
              density="comfortable"
              id={`${headingId}-model`}
              onChange={handleSelectSetupModel}
              options={[
                { value: "", label: "Choose model" },
                ...activeModelCatalogOptions.map((model) => ({
                  description: model.description ?? undefined,
                  label: model.label,
                  value: model.id,
                })),
              ]}
              placeholder="Choose model"
              value={selectedModelId ?? ""}
            />
          </label>
          {selectedModelSupportsThinkingEffort ? (
            <label className="settings-field settings-field-stacked">
              <SettingsLabelWithInfo info={selectedModelThinkingEffortCopy.helper} infoLabel="Thinking effort info" label="Thinking effort" />
              <OryntDropdown
                ariaLabel="Thinking effort"
                density="comfortable"
                id={`${headingId}-thinking-effort`}
                onChange={(nextValue) => void handleThinkingEffortChange(nextValue as ThinkingEffortOption)}
                options={selectedModelThinkingEffortOptions.map((option) => ({
                  description: option.helper,
                  label: option.label,
                  value: option.value,
                }))}
                placeholder="Choose thinking effort"
                value={selectedModelThinkingEffort}
              />
            </label>
          ) : null}
          {modelCatalogMessage ? <p className={setupLogTextClassName(modelCatalogMessageTone)}>{modelCatalogMessage}</p> : null}
        </section>
      ) : null}
    </section>
  );

  const renderSetupControls = ({
    className = "settings-section",
    heading = "Setup",
    headingId = "settings-setup-title",
  }: {
    className?: string;
    heading?: string | null;
    headingId?: string;
  } = {}) => (
    <section className={className} aria-labelledby={heading ? headingId : undefined} aria-label={heading ? undefined : "Setup controls"}>
      {heading ? <h2 id={headingId}>{heading}</h2> : null}
      <ol className="setup-flow" aria-label="Setup flow">
        <li className="setup-flow-step">
          <div className="setup-flow-step-copy">
            <strong>Choose a local directory</strong>
            <span>{repositoryPath.trim() || settingsSnapshot?.defaultRepositoryPath ? "Selected." : "Pick the repo folder."}</span>
          </div>
          <label className="settings-field">
            <span>Default local directory</span>
            <div className="settings-input-action-row">
              <input
                className="input-focus-standalone"
                type="text"
                aria-label="Default local directory"
                value={setupRepositoryPath}
                placeholder="/path/to/local/directory"
                onChange={(event) => {
                  setSetupRepositoryPath(event.target.value);
                  setSetupRepositoryMessage("");
                  setSetupRepositoryMessageTone("info");
                }}
              />
              <button type="button" className="settings-secondary-button" onClick={() => void handleDetectSetupRepositoryPath()} disabled={isSetupDetectPending} aria-busy={isSetupDetectPending} aria-label="Detect current">
                <LoadingButtonContent isLoading={isSetupDetectPending} loadingLabel="Detecting">
                  Detect current
                </LoadingButtonContent>
              </button>
              <button type="button" className="settings-icon-text-button" onClick={() => void handleBrowseSetupRepositoryPath()} disabled={isSetupBrowsePending} aria-busy={isSetupBrowsePending} aria-label="Browse">
                <LoadingButtonContent isLoading={isSetupBrowsePending} loadingLabel="Opening">
                  <>
                    <FolderPlus className="ui-icon" aria-hidden="true" />
                    Browse
                  </>
                </LoadingButtonContent>
              </button>
            </div>
            {setupRepositoryMessage ? <small className={setupLogTextClassName(setupRepositoryMessageTone)}>{setupRepositoryMessage}</small> : null}
          </label>
        </li>
        <li className="setup-flow-step">
          <div className="setup-flow-step-copy">
            <strong>Choose model provider</strong>
            <span>{modelConnection ? modelConnectionStatusMessage(modelConnection) : "Select provider and model."}</span>
          </div>
          {renderModelProviderSetupPanel(headingId)}
        </li>
        <li className="setup-flow-step">
          <div className="setup-flow-step-copy">
            <strong>Review advanced defaults</strong>
            <span>Repository-only execution.</span>
          </div>
          <section className="settings-control" aria-label="Setup permission mode">
            <label htmlFor={`${headingId}-permission-mode`}>Permission mode</label>
            <OryntDropdown
              ariaLabel="Permission mode"
              id={`${headingId}-permission-mode`}
              onChange={(nextValue) => void handlePermissionModeChange(nextValue as PermissionModeOption)}
              options={permissionModeOptions.map((option) => ({
                description: option.helper,
                label: option.label,
                value: option.value,
              }))}
              placeholder="Choose permission mode"
              value={permissionMode}
            />
            <span>{permissionModeCopy.helper}</span>
          </section>
        </li>
      </ol>
      <div className="candidate-rule-actions">
        <button type="button" onClick={() => void handleCompleteWelcomeSetup()} disabled={isSetupCompletePending} aria-busy={isSetupCompletePending} aria-label="Complete setup">
          <LoadingButtonContent isLoading={isSetupCompletePending} loadingLabel="Completing">
            Complete setup
          </LoadingButtonContent>
        </button>
      </div>
    </section>
  );

  const renderSettingsDialog = () => {
    if (!showSettingsSidebar) {
      return null;
    }

    const renderSettingsSectionContent = () => {
      switch (activeSettingsSection) {
        case "general": {
          const retentionPolicySummary = settingsSnapshot?.retentionPolicy.summary ?? "Cleanup is manual for private beta; automatic retention is planned.";
          const retentionPolicyStatus = settingsSnapshot?.retentionPolicy.cleanupEnabled ? "Auto cleanup" : "Manual";

          return (
            <section className="settings-section settings-preferences" aria-labelledby="settings-general-title">
              <section className="settings-group" aria-labelledby="settings-general-title">
                <h2 id="settings-general-title">Profile</h2>
                <div className="settings-row settings-preference-row">
                  <span>Avatar</span>
                  <span className="settings-profile-avatar" aria-hidden="true">
                    {(operatorCallSign || operatorFullName || "OP").slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <label className="settings-field settings-preference-row">
                  <span>Full name</span>
                  <input
                    className="input-focus-standalone"
                    type="text"
                    aria-label="Full name"
                    value={operatorFullName}
                    onChange={(event) => void handleOperatorProfileChange({ fullName: event.target.value })}
                  />
                </label>
                <label className="settings-field settings-preference-row">
                  <span>What should Orynt call you?</span>
                  <input
                    className="input-focus-standalone"
                    type="text"
                    aria-label="What should Orynt call you?"
                    value={operatorCallSign}
                    onChange={(event) => void handleOperatorProfileChange({ callSign: event.target.value })}
                  />
                </label>
                <label className="settings-field settings-preference-row">
                  <span>What best describes your work?</span>
                  <OryntDropdown
                    ariaLabel="What best describes your work?"
                    id="settings-work-type"
                    value={operatorWorkType}
                    onChange={(nextValue) => void handleOperatorProfileChange({ workType: nextValue as SettingsSnapshot["operatorProfile"]["workType"] })}
                    options={workTypeOptions}
                    placeholder="Choose work type"
                  />
                </label>
              </section>

              <section className="settings-group" aria-labelledby="settings-preferences-title">
                <h2 id="settings-preferences-title">Preferences</h2>
                <div className="settings-row settings-preference-row">
                  <span>Appearance</span>
                  <div className="settings-segment settings-icon-segment" role="group" aria-label="Appearance">
                    {appearanceOptions.map((option) => {
                      const OptionIcon = option.Icon;
                      return (
                        <button
                          type="button"
                          aria-label={option.ariaLabel}
                          aria-pressed={appearancePreference === option.value}
                          onClick={() => void handleUiPreferencesChange({ appearance: option.value })}
                          key={option.value}
                        >
                          <OptionIcon className="ui-icon" aria-hidden="true" strokeWidth={2} />
                          <span className="sr-only">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="settings-field settings-preference-row">
                  <span>Chat font</span>
                  <OryntDropdown
                    ariaLabel="Chat font"
                    id="settings-chat-font"
                    value={chatFontPreference}
                    onChange={(nextValue) => void handleUiPreferencesChange({ chatFont: nextValue as SettingsSnapshot["uiPreferences"]["chatFont"] })}
                    options={chatFontOptions}
                    placeholder="Choose chat font"
                  />
                </label>
                <div className="settings-row settings-preference-row">
                  <span>Motion</span>
                  <div className="settings-segment settings-text-segment" role="group" aria-label="Motion">
                    {motionOptions.map((option) => (
                      <button
                        type="button"
                        aria-label={option.ariaLabel}
                        aria-pressed={motionPreference === option.value}
                        onClick={() => void handleUiPreferencesChange({ motion: option.value })}
                        key={option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="settings-group" aria-labelledby="settings-voice-title">
                <h2 id="settings-voice-title">Voice</h2>
                <label className="settings-field settings-preference-row">
                  <span>Language</span>
                  <OryntDropdown
                    ariaLabel="Language"
                    id="settings-voice-language"
                    value={voiceLanguage}
                    onChange={(nextValue) => void handleVoicePreferencesChange({ language: nextValue as SettingsSnapshot["voicePreferences"]["language"] })}
                    options={voiceLanguageOptions}
                    placeholder="Choose language"
                  />
                </label>
                <label className="settings-field settings-preference-row">
                  <span>Style</span>
                  <OryntDropdown
                    ariaLabel="Style"
                    id="settings-voice-style"
                    value={voiceStyle}
                    onChange={(nextValue) => void handleVoicePreferencesChange({ style: nextValue as SettingsSnapshot["voicePreferences"]["style"] })}
                    options={voiceStyleOptions}
                    placeholder="Choose voice style"
                  />
                </label>
                <label className="settings-field settings-preference-row">
                  <span>Speed</span>
                  <OryntDropdown
                    ariaLabel="Speed"
                    id="settings-voice-speed"
                    value={voiceSpeed}
                    onChange={(nextValue) => void handleVoicePreferencesChange({ speed: nextValue as SettingsSnapshot["voicePreferences"]["speed"] })}
                    options={voiceSpeedOptions}
                    placeholder="Choose speed"
                  />
                </label>
              </section>

              <section className="settings-group" aria-labelledby="settings-orynt-title">
                <h2 id="settings-orynt-title">Orynt</h2>
                <div className="settings-row settings-preference-row">
                  <SettingsLabelWithInfo info={messageBlockMetaDescription} infoLabel="Message labels info" label="Message labels" />
                  <button
                    className="surface-switch settings-inline-switch"
                    type="button"
                    role="switch"
                    aria-checked={showMessageBlockMeta}
                    onClick={() => void handleUiPreferencesChange({ showMessageBlockMeta: !showMessageBlockMeta })}
                  >
                    <span className="surface-switch-copy">
                      <span>Show message labels</span>
                    </span>
                    <span className="surface-switch-toggle" aria-hidden="true">
                      <span className="surface-switch-thumb" />
                    </span>
                  </button>
                </div>
                <label className="settings-field settings-preference-row">
                  <SettingsLabelWithInfo info={permissionModeCopy.helper} infoLabel="Permission mode info" label="Permission mode" />
                  <OryntDropdown
                    ariaLabel="Permission mode"
                    id="settings-permission-mode"
                    value={permissionMode}
                    onChange={(nextValue) => void handlePermissionModeChange(nextValue as PermissionModeOption)}
                    options={permissionModeOptions.map((option) => ({
                      description: option.helper,
                      label: option.label,
                      value: option.value,
                    }))}
                    placeholder="Choose permission mode"
                  />
                </label>
                <div className="settings-row settings-preference-row">
                  <SettingsLabelWithInfo info={retentionPolicySummary} infoLabel="Retention info" label="Retention" />
                  <strong>{retentionPolicyStatus}</strong>
                </div>
              </section>
            </section>
          );
        }
        case "model":
          return (
            <section className="settings-section settings-model-section" aria-labelledby="settings-model-title">
              <section className="settings-group" aria-labelledby="settings-model-title">
                <h2 id="settings-model-title">Model</h2>
                <p>Select a provider, authenticate it, and choose a live model before repository runs.</p>
              </section>
              {renderModelProviderSetupPanel("settings-model")}
            </section>
          );
        case "memory":
          return <MemoryManager repositoryPath={repositoryPath.trim() || undefined} />;
        case "status":
          return (
            <section className="settings-section settings-status-section" aria-labelledby="settings-status-title">
              <section className="settings-group settings-status-summary" aria-labelledby="settings-status-title">
                <h2 id="settings-status-title">Status</h2>
                <p>Orynt is running in repository-only private beta. Repository work is available after setup; every other executable surface stays disabled.</p>
              </section>

              <section className="settings-group settings-surface-status" aria-label="Unavailable beta surfaces">
                <h2>Surface availability</h2>
                <div className="settings-surface-status-list">
                  <article className="settings-surface-status-item settings-surface-status-item-available">
                    <div>
                      <strong>Repository</strong>
                      <span>Selected local directory reads, diffs, and scoped code changes are the only executable surface.</span>
                    </div>
                    <span className="settings-surface-status-pill settings-surface-status-pill-available">Available</span>
                  </article>
                  {betaUnavailableSurfaces.map((surface) => (
                    <article className="settings-surface-status-item settings-surface-status-item-unavailable" key={surface}>
                      <div>
                        <strong>{surface}</strong>
                        <span>{betaUnavailableSurfaceDescriptions[surface]}</span>
                      </div>
                      <span className="settings-surface-status-pill settings-surface-status-pill-unavailable">{surface} unavailable</span>
                    </article>
                  ))}
                </div>
              </section>
            </section>
          );
        case "account":
          return (
            <section className="settings-section settings-account-section" aria-labelledby="settings-account-title">
              <h2 id="settings-account-title">Account</h2>
              <div className="settings-group">
                <div className="settings-row settings-preference-row">
                  <span>Log out of all devices</span>
                  <button className="settings-secondary-button" type="button">
                    Log out
                  </button>
                </div>
                <div className="settings-row settings-preference-row">
                  <span>Delete your account</span>
                  <button className="settings-danger-button" type="button" disabled>
                    Delete account
                  </button>
                </div>
                <div className="settings-row settings-preference-row">
                  <span>Organization ID</span>
                  <code className="settings-readonly-value">{settingsSnapshot?.workspaceId ?? "workspace-local-alpha"}</code>
                </div>
              </div>

              <section className="settings-group" aria-labelledby="settings-trusted-devices-title">
                <h2 id="settings-trusted-devices-title">Trusted devices</h2>
                <table className="settings-table" aria-label="Trusted devices">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={2}>No trusted devices.</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="settings-group" aria-labelledby="settings-active-sessions-title">
                <h2 id="settings-active-sessions-title">Active sessions</h2>
                <table className="settings-table" aria-label="Active sessions">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Location</th>
                      <th>Created</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        Desktop browser <span className="settings-status-pill">Current</span>
                      </td>
                      <td>Local</td>
                      <td>Private beta</td>
                      <td>Now</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </section>
          );
        case "billing":
          return (
            <section className="settings-section settings-billing-section" aria-labelledby="settings-billing-title">
              <section className="settings-plan" aria-labelledby="settings-billing-title">
                <div className="settings-plan-icon" aria-hidden="true">
                  <GitBranch className="ui-icon" strokeWidth={2} />
                </div>
                <div>
                  <h2 id="settings-billing-title">Free plan</h2>
                  <p>Local beta access</p>
                </div>
                <button className="settings-danger-button" type="button" disabled>
                  Upgrade plan
                </button>
              </section>

              <ul className="settings-feature-list" aria-label="Plan features">
                <li>Chat with Orynt on this desktop preview</li>
                <li>Create repository run drafts with approval gates</li>
                <li>Save local run history and artifact evidence</li>
                <li>Review memory candidates and skill drafts</li>
                <li>Connect the local Codex CLI during first-run setup</li>
              </ul>

              <section className="settings-group" aria-labelledby="settings-invoices-title">
                <h2 id="settings-invoices-title">Invoices</h2>
                <table className="settings-table" aria-label="Invoices">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={4}>No invoices yet.</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </section>
          );
      }
    };

    return (
      <ShellModal
        id="settings-dialog"
        label="Settings"
        variant="atmospheric"
        modalClassName="settings-modal"
        bodyClassName="settings-modal-body"
        onClose={() => setShowSettingsSidebar(false)}
      >
        <div className="settings-dialog settings-shell">
          <aside className="settings-rail" aria-label="Settings categories">
            <label className="settings-search input-focus-shell input-focus-shell-compact">
              <Search className="ui-icon" aria-hidden="true" strokeWidth={2} />
              <input
                className="input-focus-control"
                type="text"
                aria-label="Search settings"
                placeholder="Search"
                value={settingsSearchQuery}
                onChange={(event) => setSettingsSearchQuery(event.target.value)}
              />
            </label>
            <nav className="settings-nav" aria-label="Settings sections">
              {(["Settings", "Customize"] as const).map((group) => {
                const groupSections = visibleSettingsSections.filter((section) => section.group === group);
                if (groupSections.length === 0) {
                  return null;
                }

                return (
                  <div className="settings-nav-group" key={group}>
                    <span>{group}</span>
                    {groupSections.map((section) => {
                      const SectionIcon = section.Icon;
                      const isActive = activeSettingsSection === section.id;
                      return (
                        <button
                          className="settings-nav-button"
                          type="button"
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => setActiveSettingsSection(section.id)}
                          key={section.id}
                        >
                          <SectionIcon className="ui-icon" aria-hidden="true" strokeWidth={2} />
                          <span>{section.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </aside>
          <div className="settings-content" aria-label={activeSettingsSectionLabel}>
            {renderSettingsSectionContent()}
          </div>
        </div>
      </ShellModal>
    );
  };

  const renderAccountMenuItem = (item: AccountMenuItem) => {
    const MenuIcon = item.Icon;
    const content = (
      <>
        <MenuIcon className="ui-icon account-menu-icon" aria-hidden="true" strokeWidth={2} />
        <span>{item.label}</span>
        {item.hasSubmenu ? <ChevronRight className="ui-icon account-menu-accessory" aria-hidden="true" strokeWidth={2} /> : <span className="account-menu-accessory" aria-hidden="true" />}
      </>
    );

    if (item.action === "settings") {
      return (
        <button className="account-menu-item" type="button" role="menuitem" onClick={handleOpenSettingsFromAccountMenu} key={item.id}>
          {content}
        </button>
      );
    }

    if (item.action === "skills") {
      return (
        <button className="account-menu-item" type="button" role="menuitem" onClick={handleOpenSkillsManager} key={item.id}>
          {content}
        </button>
      );
    }

    if (item.action === "logout") {
      return (
        <a className="account-menu-item account-menu-item-logout" role="menuitem" href={landingUrl} onClick={() => setIsAccountMenuOpen(false)} key={item.id}>
          {content}
        </a>
      );
    }

    return (
      <button className="account-menu-item" type="button" role="menuitem" aria-disabled="true" onClick={(event) => event.preventDefault()} key={item.id}>
        {content}
      </button>
    );
  };

  const renderComposer = (variant: "start" | "inline") => (
    <form className={`composer composer-${variant} composer-scale-${composerScaleMode}`} aria-label="Task composer" onSubmit={(event) => void handleTaskSubmit(event)}>
      <div className="composer-field input-focus-shell">
        <button
          className="composer-scale-button"
          type="button"
          aria-label={composerScaleMode === "full" ? "Collapse composer" : "Expand composer"}
          aria-pressed={composerScaleMode === "full"}
          title={composerScaleMode === "full" ? "Collapse composer" : "Expand composer"}
          onClick={() => setComposerScaleMode((current) => (current === "full" ? "normal" : "full"))}
        >
          {composerScaleMode === "full" ? (
            <Minimize2 className="ui-icon" aria-hidden="true" strokeWidth={2} />
          ) : (
            <Maximize2 className="ui-icon" aria-hidden="true" strokeWidth={2} />
          )}
        </button>
        <div className="composer-repository-path">
          <button
            className="composer-directory-button"
            type="button"
            aria-label="Change directory"
            title="Change directory"
            onClick={() => void handleBrowseComposerRepositoryPath()}
            disabled={isComposerSubmitPending || isPendingAction("composer:browse-directory")}
          >
            <FolderOpen className="ui-icon" aria-hidden="true" strokeWidth={2} />
          </button>
          <output
            id={`composer-repository-path-${variant}`}
            className={`composer-directory-path-view${repositoryPath.trim() ? "" : " composer-directory-path-view-empty"}`}
            aria-label="Directory path"
            title={repositoryPath.trim() || "No directory selected"}
          >
            {repositoryPath.trim() || "/path/to/local/directory"}
          </output>
        </div>
        <textarea
          ref={composerTextareaRef}
          className="input-focus-control"
          aria-label="Task for Orynt"
          name="composer-goal"
          placeholder={formatThreadComposerPlaceholder(activeWorkspace.label)}
          rows={1}
          value={composerValue}
          onChange={(event) => setComposerValue(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        {selectedAgentSkillIds.length > 0 ? (
          <div className="composer-skill-attachments" aria-label="Attached skills">
            {selectedAgentSkillIds.map((skillId) => {
              const skill = eligibleAgentSkills.find((item) => item.id === skillId);
              return skill ? (
                <button type="button" key={skill.id} aria-label={`Remove ${skill.name} skill`} onClick={() => handleToggleSelectedAgentSkill(skill.id)}>
                  <Blocks className="ui-icon" aria-hidden="true" strokeWidth={2} />
                  <span>{skill.name}</span>
                  <X className="ui-icon" aria-hidden="true" strokeWidth={2} />
                </button>
              ) : null;
            })}
          </div>
        ) : null}
        {composerStatusMessage ? (
          <p className="composer-codex-connection-status" role="status">
            {composerStatusMessage}
          </p>
        ) : null}
        <div className="composer-toolbar">
          <div className="composer-attachment">
            <button
              ref={composerAttachmentButtonRef}
              className="composer-attachment-button"
              type="button"
              aria-label="Add content"
              aria-haspopup="menu"
              aria-expanded={isComposerAttachmentMenuOpen}
              aria-controls={isComposerAttachmentMenuOpen ? "composer-attachment-menu" : undefined}
              title="Add content"
              onClick={handleToggleComposerAttachmentMenu}
            >
              <Plus className="ui-icon" aria-hidden="true" strokeWidth={2} />
            </button>
            <button
              ref={composerModelButtonRef}
              className="composer-model-button"
              type="button"
              aria-label={`Change model. Current model: ${composerModelLabel}.`}
              title="Change model"
              aria-haspopup="menu"
              aria-expanded={composerQuickDialog === "model"}
              aria-controls={composerQuickDialog === "model" ? "composer-model-menu" : undefined}
              onClick={() => handleOpenComposerQuickDialog("model")}
            >
              <Cpu className="ui-icon" aria-hidden="true" strokeWidth={2} />
              <span>{composerModelLabel}</span>
            </button>
            <button
              ref={composerEffortButtonRef}
              className="composer-model-button composer-effort-button"
              type="button"
              aria-label={`Change thinking effort. Current effort: ${thinkingEffortCopy.label}.`}
              aria-haspopup="menu"
              aria-expanded={composerQuickDialog === "effort"}
              aria-controls={composerQuickDialog === "effort" ? "composer-effort-menu" : undefined}
              onClick={() => handleOpenComposerQuickDialog("effort")}
            >
              <Gauge className="ui-icon" aria-hidden="true" strokeWidth={2} />
              <span>{thinkingEffortCopy.label}</span>
            </button>
            {isComposerAttachmentMenuOpen ? (
              <div
                ref={composerAttachmentMenuRef}
                className={`composer-attachment-menu composer-attachment-menu-${composerAttachmentMenuPlacement}`}
                id="composer-attachment-menu"
                role="menu"
                aria-label="Add content options"
              >
                {isComposerSkillsMenuOpen ? (
                  <div className="composer-attachment-menu-section composer-skills-submenu" role="none">
                    <button className="composer-attachment-menu-item composer-skills-back" type="button" role="menuitem" onClick={() => setIsComposerSkillsMenuOpen(false)}>
                      <ChevronRight className="composer-attachment-menu-icon composer-skills-back-icon" aria-hidden="true" strokeWidth={2} />
                      <span>Back</span>
                    </button>
                    <span className="composer-skills-menu-label">Eligible skills</span>
                    {eligibleAgentSkills.length === 0 ? <small className="composer-skills-empty">No enabled skills are eligible for this repository.</small> : eligibleAgentSkills.map((skill) => {
                      const isSelected = selectedAgentSkillIds.includes(skill.id);
                      return (
                        <button
                          className="composer-attachment-menu-item"
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={isSelected}
                          key={skill.id}
                          onClick={() => handleToggleSelectedAgentSkill(skill.id)}
                        >
                          <Blocks className="composer-attachment-menu-icon" aria-hidden="true" strokeWidth={2} />
                          <span>{skill.name}</span>
                          <small>{skill.scope}</small>
                          {isSelected ? <Check className="composer-attachment-menu-accessory" aria-hidden="true" strokeWidth={2} /> : null}
                        </button>
                      );
                    })}
                    <button className="composer-attachment-menu-item composer-skills-manage" type="button" role="menuitem" onClick={handleOpenSkillsManager}>
                      <SettingsIcon className="composer-attachment-menu-icon" aria-hidden="true" strokeWidth={2} />
                      <span>Manage skills…</span>
                    </button>
                  </div>
                ) : composerAttachmentOptionGroups.map((group, groupIndex) => (
                  <div className="composer-attachment-menu-section" role="none" key={`attachment-group-${groupIndex}`}>
                    {group.map((option) => {
                      const OptionIcon = option.Icon;
                      const hasCheckedState = "checked" in option;
                      const isChecked = hasCheckedState ? Boolean(option.checked) : false;
                      const hasSubmenu = "hasSubmenu" in option && option.hasSubmenu === true;
                      const isDisabled = "disabled" in option && option.disabled === true;
                      const shortcut = "shortcut" in option && typeof option.shortcut === "string" ? option.shortcut : "";
                      const helper = "helper" in option && typeof option.helper === "string" ? option.helper : "";
                      return (
                        <button
                          className="composer-attachment-menu-item"
                          type="button"
                          role={hasCheckedState ? "menuitemcheckbox" : "menuitem"}
                          aria-label={option.label}
                          aria-checked={hasCheckedState ? isChecked : undefined}
                          aria-haspopup={hasSubmenu ? "menu" : undefined}
                          disabled={isDisabled}
                          key={option.id}
                          onClick={() => handleSelectComposerAttachmentOption(option.id)}
                        >
                          <OptionIcon className="composer-attachment-menu-icon" aria-hidden="true" strokeWidth={2} />
                          <span>{option.label}</span>
                          {shortcut ? <small>{shortcut}</small> : null}
                          {helper ? <small>{helper}</small> : null}
                          {hasSubmenu ? <ChevronRight className="composer-attachment-menu-accessory" aria-hidden="true" strokeWidth={2} /> : null}
                          {isChecked ? <Check className="composer-attachment-menu-accessory" aria-hidden="true" strokeWidth={2} /> : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}
            {renderComposerModelDialog()}
            {renderComposerThinkingEffortDialog()}
          </div>
          <div className="composer-actions">
            <button
              ref={composerMetaButtonRef}
              className="composer-meta-button"
              type="button"
              aria-label="Permission mode"
              aria-haspopup="menu"
              aria-expanded={isComposerMetaMenuOpen}
              aria-controls={isComposerMetaMenuOpen ? "composer-meta-menu" : undefined}
              title="Permission mode"
              onClick={handleToggleComposerMetaMenu}
            >
              <Shield className="ui-icon" aria-hidden="true" strokeWidth={2} />
              <span>{permissionModeCopy.label}</span>
            </button>
            {isComposerMetaMenuOpen ? (
              <div
                ref={composerMetaMenuRef}
                className={`composer-meta-menu composer-meta-menu-${composerMetaMenuPlacement}`}
                id="composer-meta-menu"
                role="menu"
                aria-label="Permission mode options"
              >
                {permissionModeOptions.map((option) => {
                  const isSelectedPermissionMode = permissionMode === option.value;
                  return (
                    <button
                      className="composer-meta-menu-item"
                      type="button"
                      role="menuitemradio"
                      aria-label={option.label}
                      aria-checked={isSelectedPermissionMode}
                      key={option.value}
                      onClick={() => handleSelectComposerPermissionMode(option.value)}
                    >
                      <span>{option.label}</span>
                      <small>{option.helper}</small>
                      {isSelectedPermissionMode ? <Check className="composer-option-check" aria-hidden="true" strokeWidth={2} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <button
              className="composer-send-button"
              type="button"
              aria-label="Send task"
              title="Send task"
              disabled={composerValue.trim().length === 0 || !effectiveRepositoryPath || isComposerSubmitPending}
              aria-busy={isComposerSubmitPending}
              onClick={() => void submitComposerGoal()}
            >
              {isComposerSubmitPending ? <LoadingSpinner /> : <Send className="send-icon" aria-hidden="true" strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>
    </form>
  );

  const renderCockpitSurface = ({
    children,
    showComposer = false,
  }: {
    children: ReactNode;
    showComposer?: boolean;
  }) => (
    <section ref={activeThreadRef} className={`thread${showComposer && isActiveThreadEmpty ? " thread-empty" : ""}`} aria-label="Task conversation">
      <header className="thread-header">
        {editingThreadHeaderId === activeWorkspace.id ? (
          <div className="thread-header-title thread-header-title-editing" onBlur={handleThreadHeaderEditBlur}>
            <label className="thread-header-field-shell thread-header-name-shell input-focus-shell input-focus-shell-labeled">
              <span className="thread-header-field-label">Title</span>
              <input
                className="thread-header-field thread-header-name-field input-focus-control"
                aria-label="Task name"
                type="text"
                value={threadHeaderTitleValue}
                autoFocus
                onChange={(event) => setThreadHeaderTitleValue(event.target.value)}
                onKeyDown={handleThreadHeaderEditKeyDown}
              />
            </label>
            <label className="thread-header-field-shell thread-header-description-shell input-focus-shell input-focus-shell-labeled">
              <span className="thread-header-field-label">Description</span>
              <input
                className="thread-header-field thread-header-description-field input-focus-control"
                aria-label="Task description"
                type="text"
                value={threadHeaderDescriptionValue}
                placeholder="Description"
                onChange={(event) => setThreadHeaderDescriptionValue(event.target.value)}
                onKeyDown={handleThreadHeaderEditKeyDown}
              />
            </label>
          </div>
        ) : (
          <div
            className="thread-header-title thread-header-title-editable"
            role="button"
            tabIndex={0}
            aria-label="Edit task name and description"
            onClick={handleStartThreadHeaderEdit}
            onKeyDown={handleStartThreadHeaderEditKeyDown}
          >
            <h1>{activeWorkspace.label}</h1>
            {activeWorkspace.description ? <span title={activeWorkspace.description}>{activeWorkspace.description}</span> : null}
          </div>
        )}
      </header>
      {showComposer && isActiveThreadEmpty ? (
        <>
          <div className="thread-start">
            {setupWarningMessage || composerReadinessMessage ? (
              renderSetupReadinessNotice()
            ) : (
              <div className="thread-start-copy">
                <h2>{threadStartCopy.title}</h2>
                <p>{threadStartCopy.description}</p>
              </div>
            )}
          </div>
          {renderComposer("start")}
        </>
      ) : (
        <>
          <div className="message-list">{children}</div>
          {showComposer ? renderComposer("inline") : null}
        </>
      )}
    </section>
  );

  const renderCockpitContent = () => {
    if (!hasSelectedRun) {
      return <NoRunSelected />;
    }

    return renderCockpitSurface({
      showComposer: true,
      children: renderThreadMessages(),
    });
  };

  const renderSetupReadinessNotice = () => {
    const message = composerReadinessMessage || setupWarningMessage;

    if (!message) {
      return null;
    }

    return (
      <section className={`thread-setup-warning${composerReadinessMessage ? " thread-setup-warning-error" : ""}`} role="status" aria-label="Setup required">
        <div>
          <span>{composerReadinessMessage ? "Setup blocked" : "Setup required"}</span>
          <p className={setupLogTextClassName(composerReadinessMessage ? "error" : "warning")}>{message}</p>
        </div>
        <button type="button" onClick={handleOpenSetupDialog}>
          Open setup
        </button>
      </section>
    );
  };

  const renderSetupDialog = () => {
    if (!showSetupDialog) {
      return null;
    }

    return (
      <ShellModal
        id="setup-dialog"
        label="Set up Orynt"
        variant="atmospheric"
        modalClassName="setup-modal"
        bodyClassName="setup-modal-body"
        onClose={() => setShowSetupDialog(false)}
      >
        <div className="setup-dialog">
          <section className="setup-dialog-intro" aria-label="Setup summary">
            <span>Repository-only beta</span>
            <p>
              Choose where Orynt may act, choose a model provider, and confirm conservative defaults before the first supervised task. This beta is limited to the selected local directory, with approval gates and evidence before anything is applied.
            </p>
          </section>
          {renderSetupControls({
            className: "settings-section setup-dialog-form",
            heading: null,
            headingId: "setup-dialog-controls-title",
          })}
        </div>
      </ShellModal>
    );
  };

  return (
    <main className={shellClassName} onMouseUp={handleAppMouseUp}>
      <aside className="workspace-panel" id="workspace-panel">
        <div className="workspace-panel-header">
          <button className="workspace-brand" type="button" aria-label="Open Cockpit">
            <img className="workspace-brand-logo" src={lightbulbLogoOnDark} alt="" aria-hidden="true" />
            <span className="workspace-brand-wordmark">Orynt</span>
          </button>
          <button
            className="workspace-search-toggle"
            type="button"
            aria-controls="workspace-thread-search"
            aria-expanded={shouldShowWorkspaceSearch}
            aria-label="Search tasks"
            title="Search tasks"
            onClick={handleToggleWorkspaceSearch}
          >
            <Search className="ui-icon" aria-hidden="true" strokeWidth={2} />
          </button>
          <button
            className="workspace-panel-toggle"
            type="button"
            aria-controls={workspacePanelToggleControls}
            aria-expanded={workspacePanelToggleExpanded}
            aria-label={workspacePanelToggleLabel}
            title={workspacePanelToggleLabel}
            onClick={handleToggleWorkspacePanel}
          >
            {isWorkspacePanelCollapsed || (isMobileWorkspaceViewport && !isMobileWorkspaceDrawerOpen) ? (
              <PanelLeftOpen className="ui-icon" aria-hidden="true" strokeWidth={2} />
            ) : (
              <PanelLeftClose className="ui-icon" aria-hidden="true" strokeWidth={2} />
            )}
          </button>
        </div>

        {isMobileWorkspaceViewport && isMobileWorkspaceDrawerOpen ? (
          <button className="workspace-drawer-backdrop" type="button" aria-label="Close task drawer" onClick={() => setIsMobileWorkspaceDrawerOpen(false)} />
        ) : null}
        <div className="workspace-drawer" id="workspace-drawer" hidden={isMobileWorkspaceViewport && !isMobileWorkspaceDrawerOpen}>
          <div className="workspace-controls">
            {shouldShowWorkspaceSearch ? (
              <label className="workspace-search input-focus-shell input-focus-shell-compact" id="workspace-thread-search">
                <input
                  ref={workspaceSearchInputRef}
                  className="input-focus-control"
                  type="text"
                  aria-label="Search tasks"
                  placeholder="Search tasks"
                  value={workspaceSearchQuery}
                  onChange={(event) => setWorkspaceSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setWorkspaceSearchQuery("");
                      setIsWorkspaceSearchOpen(false);
                    }
                  }}
                />
              </label>
            ) : null}
            <button className="workspace-create-button" type="button" aria-label="Create new task" title="New task" onClick={handleCreateWorkspace}>
              <span className="workspace-create-icon" aria-hidden="true">
                <Plus className="ui-icon" strokeWidth={2} />
              </span>
              <span>New task</span>
            </button>
          </div>
          <nav aria-label="Tasks">
            {filteredWorkspaces.map((space) => {
              const isActiveWorkspace = activeWorkspace.id === space.id;
              const isWorkspaceMenuOpen = openWorkspaceMenuId === space.id;
              const isRenamingWorkspace = renamingWorkspaceId === space.id;
              const isFinalVisibleWorkspace = visibleWorkspaces.length <= 1;
              return (
                <div
                  className={`workspace-row${isActiveWorkspace ? " workspace-row-active" : ""}${isWorkspaceMenuOpen ? " workspace-row-menu-open" : ""}`}
                  key={space.id}
                  onDoubleClick={() => handleStartRenameWorkspace(space)}
                >
                  {isRenamingWorkspace ? (
                    <input
                      className="workspace-rename-input input-focus-standalone"
                      aria-label={`Rename ${space.label} task`}
                      type="text"
                      value={workspaceRenameValue}
                      autoFocus
                      onBlur={() => handleCommitRenameWorkspace(space.id)}
                      onChange={(event) => setWorkspaceRenameValue(event.target.value)}
                      onKeyDown={(event) => handleRenameWorkspaceKeyDown(event, space.id)}
                    />
                  ) : (
                    <button
                      className="workspace-row-button"
                      type="button"
                      aria-pressed={isActiveWorkspace}
                      onClick={() => handleSelectWorkspace(space.id)}
                    >
                      <span>{space.label}</span>
                    </button>
                  )}
                  <button
                    className="workspace-options"
                    type="button"
                    aria-label={`Task options for ${space.label}`}
                    aria-haspopup="menu"
                    aria-expanded={isWorkspaceMenuOpen}
                    aria-controls={`workspace-options-${space.id}`}
                    title={`Task options for ${space.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleWorkspaceMenu(space.id);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <EllipsisVertical className="ui-icon" aria-hidden="true" strokeWidth={2} />
                  </button>
                  {isWorkspaceMenuOpen ? (
                    <div
                      className="workspace-menu"
                      id={`workspace-options-${space.id}`}
                      role="menu"
                      aria-label={`Task options for ${space.label}`}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <button role="menuitem" type="button" onClick={() => handleStartRenameWorkspace(space)}>
                        <Pencil className="ui-icon" aria-hidden="true" strokeWidth={2} />
                        <span>Rename</span>
                      </button>
                      <button role="menuitem" type="button" disabled={isFinalVisibleWorkspace} onClick={() => handleArchiveWorkspace(space.id)}>
                        <Archive className="ui-icon" aria-hidden="true" strokeWidth={2} />
                        <span>Archive</span>
                      </button>
                      <button className="workspace-menu-danger" role="menuitem" type="button" disabled={isFinalVisibleWorkspace} onClick={() => handleRequestDeleteWorkspace(space.id)}>
                        <Trash2 className="ui-icon" aria-hidden="true" strokeWidth={2} />
                        <span>Delete</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          {archivedWorkspaces.length > 0 ? (
            <button className="workspace-archive-button" type="button" aria-label="Open archive" title="Open archive" onClick={() => setShowWorkspaceArchive(true)}>
              <Archive className="ui-icon" aria-hidden="true" strokeWidth={2} />
              <span>Archive</span>
              <strong>{archivedWorkspaces.length}</strong>
            </button>
          ) : null}
          <div className="workspace-footer">
            <div className="workspace-account">
              <button
                ref={accountMenuButtonRef}
                className="workspace-account-trigger"
                type="button"
                aria-controls="account-menu"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                aria-label="Open account menu"
                title="Account menu"
                onClick={handleToggleAccountMenu}
              >
                <span className="workspace-profile-avatar" aria-hidden="true">
                  OP
                </span>
                <span className="workspace-profile-copy">
                  <strong>Operator</strong>
                  <small>Free plan</small>
                </span>
                <ChevronsUpDown className="ui-icon workspace-account-caret" aria-hidden="true" strokeWidth={2} />
              </button>
              {isAccountMenuOpen ? (
                <div className="account-menu" id="account-menu" role="menu" aria-label="Account menu" ref={accountMenuRef}>
                  <div className="account-menu-email">operator@orynt.local</div>
                  {accountMenuGroups.map((group, index) => (
                    <div className="account-menu-group" role="group" key={group.map((item) => item.id).join("-")}>
                      {group.map(renderAccountMenuItem)}
                      {index < accountMenuGroups.length - 1 ? <span className="account-menu-separator" aria-hidden="true" /> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      {renderCockpitContent()}

      {renderSetupDialog()}
      {renderSettingsDialog()}
      {renderDeleteWorkspaceDialog()}
      {renderWorkspaceArchiveDialog()}
      {showSkillsManager ? (
        <ShellModal
          id="skills-manager-dialog"
          label="Skills Manager"
          modalClassName="skills-manager-modal"
          bodyClassName="skills-manager-modal-body"
          onClose={() => setShowSkillsManager(false)}
        >
          <SkillsManager
            learnedSkills={skillRegistry.skills}
            onEligibleSkillsChange={(skills) => {
              setEligibleAgentSkills(skills);
              setSelectedAgentSkillIds((current) => current.filter((id) => skills.some((skill) => skill.id === id)));
            }}
            onLearnedSkillAction={async (skill, action) => {
              await handleSkillDecision(skill, action);
            }}
            repositoryPath={repositoryPath.trim()}
          />
        </ShellModal>
      ) : null}
      {notifications.length > 0 ? (
        <div className="app-notifications" role="status" aria-live="polite" aria-label="Orynt notifications">
          {notifications.map((notification) => (
            <div className={`app-notification app-notification-${notification.tone}`} key={notification.id}>
              <Check className="ui-icon" aria-hidden="true" strokeWidth={2} />
              <span>{notification.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}

export default App;
