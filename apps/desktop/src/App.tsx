import { useEffect, useMemo, useRef, useState } from "react";
import { createMockRunState, MVP_BLOCKED_SURFACES } from "@codepawl/shared";
import {
  Archive,
  Blocks,
  BookOpen,
  Camera,
  Check,
  ChevronsUpDown,
  ChevronRight,
  CircleUserRound,
  Code2,
  Copy,
  CreditCard,
  Cpu,
  Download,
  EllipsisVertical,
  ExternalLink,
  FolderPlus,
  GitBranch,
  Globe2,
  Gift,
  Info,
  Languages,
  LayoutDashboard,
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
import type { CandidateRule, MemoryReviewSnapshot, MockRunState, SkillDefinition, SkillRegistrySnapshot, SkillReplayPlan, SurfaceKind } from "@codepawl/shared";
import type { LucideIcon } from "lucide-react";
import type { FocusEvent, FormEvent, KeyboardEvent, ReactNode } from "react";

import { codepawl } from "./codepawlClient";
import type {
  ArtifactEvidenceContent,
  ArtifactEvidenceStatus,
  ArtifactEvidenceSummary,
  CodexConnectionPreflightResult,
  CodexConnectionReference,
  ModelAuthMethod,
  ModelConnectionPreflightResult,
  ModelConnectionReference,
  ModelProviderId,
  PersistedRunRecord,
  PersistedRunSummary,
  SettingsSnapshot,
} from "./codepawlClient";
import "./styles.css";

type Workspace = {
  id: string;
  label: string;
  description: string;
  badge: string;
  archived?: boolean;
};

type ThreadMessage = {
  id: string;
  role: "user" | "system" | "agent" | "approval";
  content?: string;
  label?: string;
  showContext?: boolean;
};

type AgentResponseRating = "good" | "bad";

type AgentResponseTextSelection = {
  messageId: string;
  text: string;
};

type MockAgentSource = {
  citation: number;
  domain: string;
  excerpt: string;
  title: string;
  url: string;
};

const initialWorkspaces = [
  { id: "draft", label: "Draft", description: "Draft thread.", badge: "46" },
] satisfies Workspace[];

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
  files: "Unavailable in private beta; only the selected repository path is in scope.",
  terminal: "Unavailable in private beta; no arbitrary shell or terminal control runs from this app.",
};

const messageBlockMetaDescription = "Show or hide compact block labels above agent and approval messages.";
const betaUnavailableSurfaces = ["Browser", "Desktop", "Files", "Terminal", "Cloud", "Billing"] as const;
const renderedRunEventTypes = new Set([
  "run_started",
  "sandbox_created",
  "codex_contract_created",
  "codex_result_imported",
  "verification_passed",
  "verification_failed",
  "memory_extraction_finished",
  "run_finished",
]);

const permissionModeOptions = [
  { value: "safe", label: "Safe", helper: "Ask before protected paths, destructive commands, network access, and secret access." },
  { value: "ask-first", label: "Ask first", helper: "Pause before every repository-affecting action in this workspace." },
  { value: "locked", label: "Locked", helper: "Keep the cockpit read-only until the operator re-enables controlled actions." },
] as const;

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
    return "Codex connection is required before real repository runs.";
  }
  return reference.lastPreflight?.reasons[0] ?? "Run Codex login or connection check before real repository runs.";
}

function modelConnectionFromSettings(settings: SettingsSnapshot | null): ModelConnectionReference | null {
  if (settings?.modelConnection) {
    return settings.modelConnection;
  }
  if (!settings?.codexConnection) {
    return null;
  }
  return {
    providerId: "codex-cli",
    providerLabel: "Codex CLI",
    modelId: "gpt-5.5",
    modelLabel: "GPT-5.5",
    authMethod: "chatgptOAuth",
    status: settings.codexConnection.status,
    lastPreflight: settings.codexConnection.lastPreflight
      ? {
          checkedProviderId: "codex-cli",
          checkedModelId: "gpt-5.5",
          status: settings.codexConnection.lastPreflight.status,
          ready: settings.codexConnection.lastPreflight.ready,
          checkedAt: settings.codexConnection.lastPreflight.checkedAt,
          executablePath: settings.codexConnection.lastPreflight.executablePath,
          authMode: settings.codexConnection.lastPreflight.authMode,
          reasons: settings.codexConnection.lastPreflight.reasons,
          warnings: settings.codexConnection.lastPreflight.warnings,
        }
      : null,
  };
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
    return "Choose a provider and run the provider check before real repository runs.";
  }
  return reference.lastPreflight?.reasons[0] ?? "Save provider setup and run the provider check before real repository runs.";
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

const messageBlockMetaStorageKey = "codepawl:message-block-meta-visible:v1";
const privateBetaOnboardingStorageKey = "codepawl:private-beta-onboarding:v1";
const defaultLandingUrl = "http://127.0.0.1:5173/";
const mobileWorkspaceMediaQuery = "(max-width: 720px)";

function readPrivateBetaOnboardingDismissed() {
  try {
    return window.localStorage.getItem(privateBetaOnboardingStorageKey) === "dismissed";
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

export function getLandingUrl() {
  const configuredUrl = import.meta.env.VITE_CODEPAWL_LANDING_URL?.trim();
  return configuredUrl || defaultLandingUrl;
}

const mockAgentSources = [
  {
    citation: 1,
    domain: "platform.openai.com",
    excerpt: "Reference material for model behavior, tool use, and response grounding.",
    title: "OpenAI Docs",
    url: "https://platform.openai.com/docs",
  },
  {
    citation: 2,
    domain: "docs.github.com",
    excerpt: "Repository workflow guidance used as a mock citation for branch and review behavior.",
    title: "Model behavior reference",
    url: "https://docs.github.com/en",
  },
  {
    citation: 3,
    domain: "developer.mozilla.org",
    excerpt: "Browser interaction semantics represented here as a local source mock.",
    title: "Interaction semantics note",
    url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility",
  },
] satisfies MockAgentSource[];

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
  { value: "codepawl-sans", label: "CodePawl Sans" },
  { value: "codepawl-serif", label: "CodePawl Serif" },
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
  id: string;
  label: string;
  description: string;
};

type SetupProviderOption = {
  id: ModelProviderId;
  label: string;
  description: string;
  authMethods: ModelAuthMethod[];
  defaultAuthMethod: ModelAuthMethod;
  defaultEnvKey?: string;
  models: SetupModelOption[];
};

type SetupPickerStage = "provider" | "model";

const setupProviderOptions: SetupProviderOption[] = [
  {
    id: "codex-cli",
    label: "Codex CLI",
    description: "Local Codex authentication with ChatGPT OAuth and a device-code fallback.",
    authMethods: ["chatgptOAuth", "deviceCode", "accessToken"],
    defaultAuthMethod: "chatgptOAuth",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", description: "Default Codex model for complex coding and research work." },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", description: "Lower-latency Codex option for lighter coding tasks." },
      { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", description: "Research-preview option for near-instant coding iteration." },
    ],
  },
  {
    id: "openai-api",
    label: "OpenAI API",
    description: "Usage-based OpenAI Platform access through a local environment variable.",
    authMethods: ["apiKeyEnv"],
    defaultAuthMethod: "apiKeyEnv",
    defaultEnvKey: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", description: "Flagship model for complex reasoning and coding." },
      { id: "gpt-5.4", label: "GPT-5.4", description: "More affordable model for coding and professional work." },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini", description: "Lower-cost, lower-latency model for lighter workloads." },
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano", description: "Small model option for cost-sensitive workflows." },
    ],
  },
];

function setupProviderById(providerId: ModelProviderId | null | undefined): SetupProviderOption {
  return setupProviderOptions.find((provider) => provider.id === providerId) ?? setupProviderOptions[0];
}

function setupModelById(provider: SetupProviderOption, modelId: string | null | undefined): SetupModelOption {
  return provider.models.find((model) => model.id === modelId) ?? provider.models[0];
}

const settingsSections = [
  { id: "general", label: "General", group: "Settings", keywords: ["profile", "appearance", "operator", "message", "labels", "display", "voice", "font", "motion"], Icon: SettingsIcon },
  { id: "account", label: "Account", group: "Settings", keywords: ["identity", "session", "workspace", "devices"], Icon: CircleUserRound },
  { id: "billing", label: "Billing", group: "Settings", keywords: ["plan", "invoice", "subscription", "local"], Icon: CreditCard },
] as const;

type AccountMenuItem = {
  action: "future" | "logout" | "settings";
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
    { id: "apps", label: "Get apps and extensions", Icon: Download, action: "future" },
    { id: "gift", label: "Gift CodePawl", Icon: Gift, action: "future" },
    { id: "learn", label: "Learn more", Icon: Info, action: "future", hasSubmenu: true },
  ],
  [{ id: "logout", label: "Log out", Icon: LogOut, action: "logout" }],
] satisfies AccountMenuItem[][];

type PermissionModeOption = (typeof permissionModeOptions)[number]["value"];
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
  description?: string;
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
  return label.toLowerCase().includes("thread") ? `Message ${label}...` : `Message ${label} thread...`;
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

function MessageBlock({ align = "start", children, meta, role, showMeta = false }: MessageBlockProps) {
  const blockClassName = [`message-block`, `message-block-${role}`, `message-block-align-${align}`].join(" ");

  return (
    <div className={blockClassName}>
      {meta && showMeta ? <span className="message-block-meta">{meta}</span> : null}
      {children}
    </div>
  );
}

const mockAgentSubtasks = ["Inspect connector approval", "Confirm verifier evidence", "Keep result import separate"];

function AgentDetails({ messages }: { messages: ThreadMessage[] }) {
  if (messages.length === 0) {
    return null;
  }

  const noticeCount = `${messages.length} ${messages.length === 1 ? "notice" : "notices"}`;

  return (
    <details className="agent-details" open>
      <summary>
        <span>Agent details</span>
        <strong>{noticeCount}</strong>
      </summary>
      <ol className="agent-details-list" aria-label="Agent details">
        {messages.map((message, index) => (
          <li className="agent-details-item" key={message.id}>
            <p className="agent-details-row">{message.content}</p>
            {index === 0 ? (
              <ol className="agent-details-subtask-list" aria-label="Mock subtasks">
                {mockAgentSubtasks.map((subtask) => (
                  <li className="agent-details-subtask-item" key={subtask}>
                    <p className="agent-details-subtask-row">{subtask}</p>
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

function ShellModal({ bodyClassName, children, description, id, label, modalClassName, onClose, variant = "plain" }: ShellModalProps) {
  const titleId = `${id}-title`;
  const closeLabel = `Dismiss ${label.toLowerCase()}`;
  const shellModalClassName = [variant === "atmospheric" ? "shell-modal shell-modal-atmospheric" : "shell-modal", modalClassName].filter(Boolean).join(" ");
  const shellModalBodyClassName = ["shell-modal-body", bodyClassName].filter(Boolean).join(" ");

  return (
    <div className="shell-modal-backdrop" aria-label="Modal backdrop" onClick={onClose}>
      <section
        className={shellModalClassName}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <header className="shell-modal-header">
          <div>
            <strong id={titleId}>{label}</strong>
            {description ? <span>{description}</span> : null}
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
}: {
  initialRunState?: MockRunState;
  initialSelectedRunId?: string | null;
  seedDemoThread?: boolean;
} = {}) {
  const runState = useMemo(() => initialRunState ?? createMockRunState(), [initialRunState]);
  const [approvalStatus, setApprovalStatus] = useState("Waiting for operator approval");
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
  const [selectedProviderId, setSelectedProviderId] = useState<ModelProviderId>("codex-cli");
  const [selectedModelId, setSelectedModelId] = useState("gpt-5.5");
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<ModelAuthMethod>("chatgptOAuth");
  const [providerSearchQuery, setProviderSearchQuery] = useState("");
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [setupPickerStage, setSetupPickerStage] = useState<SetupPickerStage>("provider");
  const [apiKeyEnvName, setApiKeyEnvName] = useState("OPENAI_API_KEY");
  const [composerReadinessMessage, setComposerReadinessMessage] = useState("");
  const [copiedAgentResponseId, setCopiedAgentResponseId] = useState<string | null>(null);
  const [sharedAgentResponseId, setSharedAgentResponseId] = useState<string | null>(null);
  const [agentResponseRatings, setAgentResponseRatings] = useState<Record<string, AgentResponseRating>>({});
  const [openAgentResponseMenuId, setOpenAgentResponseMenuId] = useState<string | null>(null);
  const [openAgentResponseSourcesId, setOpenAgentResponseSourcesId] = useState<string | null>(null);
  const [agentResponseSelection, setAgentResponseSelection] = useState<AgentResponseTextSelection | null>(null);
  const [readingAgentResponseId, setReadingAgentResponseId] = useState<string | null>(null);
  const [nextAgentRetryIndex, setNextAgentRetryIndex] = useState(2);
  const [composerValue, setComposerValue] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [composerScaleMode, setComposerScaleMode] = useState<"normal" | "full">("normal");
  const [threadMessagesByWorkspace, setThreadMessagesByWorkspace] = useState<Record<string, ThreadMessage[]>>(() =>
    seedDemoThread ? createDemoThreadMessages(runState) : createInitialThreadMessages(),
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => [...initialWorkspaces]);
  const [nextWorkspaceThreadIndex, setNextWorkspaceThreadIndex] = useState(2);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("draft");
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
  const [showSetupDialog, setShowSetupDialog] = useState(() => !readPrivateBetaOnboardingDismissed());
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("general");
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [showMessageBlockMeta, setShowMessageBlockMeta] = useState(() => {
    try {
      return window.localStorage.getItem(messageBlockMetaStorageKey) === "true";
    } catch {
      return false;
    }
  });
  const [hasDismissedPrivateBetaOnboarding, setHasDismissedPrivateBetaOnboarding] = useState(readPrivateBetaOnboardingDismissed);
  const [operatorFullName, setOperatorFullName] = useState("Operator");
  const [operatorCallSign, setOperatorCallSign] = useState("Operator");
  const [operatorWorkType, setOperatorWorkType] = useState<SettingsSnapshot["operatorProfile"]["workType"]>("engineering");
  const [appearancePreference, setAppearancePreference] = useState<SettingsSnapshot["uiPreferences"]["appearance"]>("dark");
  const [chatFontPreference, setChatFontPreference] = useState<SettingsSnapshot["uiPreferences"]["chatFont"]>("codepawl-sans");
  const [motionPreference, setMotionPreference] = useState<SettingsSnapshot["uiPreferences"]["motion"]>("system");
  const [voiceLanguage, setVoiceLanguage] = useState<SettingsSnapshot["voicePreferences"]["language"]>("english");
  const [voiceStyle, setVoiceStyle] = useState<SettingsSnapshot["voicePreferences"]["style"]>("buttery");
  const [voiceSpeed, setVoiceSpeed] = useState<SettingsSnapshot["voicePreferences"]["speed"]>("normal");
  const [setupRepositoryPath, setSetupRepositoryPath] = useState("");
  const [setupRepositoryMessage, setSetupRepositoryMessage] = useState("");
  const [hasAttemptedRepositoryAutoDetect, setHasAttemptedRepositoryAutoDetect] = useState(false);
  const [retentionRunHistoryDays, setRetentionRunHistoryDays] = useState(30);
  const [retentionArtifactRetentionDays, setRetentionArtifactRetentionDays] = useState(30);
  const [retentionCleanupEnabled, setRetentionCleanupEnabled] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionModeOption>(() => {
    const currentMode = runState.permissionPolicy.mode;
    return permissionModeOptions.some((option) => option.value === currentMode) ? (currentMode as PermissionModeOption) : "safe";
  });
  const [isComposerMetaMenuOpen, setIsComposerMetaMenuOpen] = useState(false);
  const [composerMetaMenuPlacement, setComposerMetaMenuPlacement] = useState<ComposerMetaMenuPlacement>("dropdown");
  const [isComposerAttachmentMenuOpen, setIsComposerAttachmentMenuOpen] = useState(false);
  const [composerAttachmentMenuPlacement, setComposerAttachmentMenuPlacement] = useState<ComposerMetaMenuPlacement>("dropdown");
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
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const shouldHydrateClientState = initialRunState === undefined;
  const permissionModeCopy = permissionModeOptions.find((option) => option.value === permissionMode) ?? permissionModeOptions[0];
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
  const selectedModel = setupModelById(selectedProvider, selectedModelId);
  const filteredSetupProviders = setupProviderOptions.filter((provider) => {
    const query = providerSearchQuery.trim().toLowerCase();
    return !query || `${provider.label} ${provider.description}`.toLowerCase().includes(query);
  });
  const filteredSetupModels = selectedProvider.models.filter((model) => {
    const query = modelSearchQuery.trim().toLowerCase();
    return !query || `${model.label} ${model.id} ${model.description}`.toLowerCase().includes(query);
  });
  const activeConnectionMessage = modelConnectionMessage || codexConnectionMessage || modelConnectionStatusMessage(modelConnection);
  const composerStatusMessage = composerReadinessMessage ? "" : !isModelConnectionReady ? activeConnectionMessage : "";
  const setupWarningMessage = !hasDismissedPrivateBetaOnboarding
    ? "Setup required before repository runs."
    : !repositoryPath.trim()
      ? "Select a local git repository path before starting a repository run."
      : !isModelConnectionReady
        ? activeConnectionMessage
        : "";

  const applySettingsSnapshot = (settings: SettingsSnapshot) => {
    const operatorProfile = settings.operatorProfile ?? {
      fullName: "Operator",
      callSign: "Operator",
      workType: "engineering" as const,
    };
    const uiPreferences = settings.uiPreferences ?? {
      appearance: "dark" as const,
      chatFont: "codepawl-sans" as const,
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
      const model = setupModelById(provider, normalizedModelConnection.modelId);
      setSelectedProviderId(provider.id);
      setSelectedModelId(model.id);
      setSelectedAuthMethod(normalizedModelConnection.authMethod);
      setApiKeyEnvName(normalizedModelConnection.envKey ?? provider.defaultEnvKey ?? "OPENAI_API_KEY");
      setModelConnectionMessage(modelConnectionStatusMessage(normalizedModelConnection));
      setSetupPickerStage("model");
    } else {
      setSetupPickerStage("provider");
    }
    setPermissionMode(toUiPermissionMode(settings.permissionMode));
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
    const runs = await codepawl.listPersistedRuns();
    setPersistedRuns(runs);
  };

  const refreshSettingsSnapshot = async () => {
    const settings = await codepawl.getSettings();
    applySettingsSnapshot(settings);
    if (settings.defaultRepositoryPath && !repositoryPath.trim()) {
      setRepositoryPath(settings.defaultRepositoryPath);
    }
    if (settings.welcomeCompleted) {
      setHasDismissedPrivateBetaOnboarding(true);
      setShowSetupDialog(false);
    }
    return settings;
  };

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

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

    codepawl.onRunEvent((event) => {
      if (event.type === "run_started") {
        setCurrentRunId(event.runId);
      }
      if (event.type === "action_blocked_or_approved") {
        const summary = (event.payload as { summary?: unknown }).summary;
        setApprovalStatus(typeof summary === "string" ? summary : event.type.replaceAll("_", " "));
      }
      if (renderedRunEventTypes.has(event.type)) {
        const summary = (event.payload as { summary?: unknown }).summary;
        const content = typeof summary === "string" ? `run_event: ${event.type} - ${summary}` : `run_event: ${event.type}`;
        const threadId = activeWorkspaceIdRef.current;
        setThreadMessagesByWorkspace((current) => {
          const currentMessages = current[threadId] ?? [];
          if (currentMessages.some((message) => message.id === event.id)) {
            return current;
          }
          return {
            ...current,
            [threadId]: [
              ...currentMessages,
              {
                id: event.id,
                role: "system",
                content,
              },
            ],
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
      codepawl.resetMockListenersForTest();
    };
  }, []);

  useEffect(() => {
    if (!shouldHydrateClientState) {
      return;
    }
    let mounted = true;
    codepawl.listSkills().then((skills) => {
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
    Promise.all([codepawl.listPersistedRuns(), codepawl.getSettings()]).then(([runs, settings]) => {
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
    codepawl.detectCurrentRepositoryPath().then((path) => {
      if (!mounted || !path) {
        return;
      }
      setSetupRepositoryPath((current) => current || path);
      setRepositoryPath((current) => current || path);
      setSetupRepositoryMessage("Detected the current git repository path.");
    });

    return () => {
      mounted = false;
    };
  }, [hasAttemptedRepositoryAutoDetect, settingsSnapshot, setupRepositoryPath, shouldHydrateClientState]);

  useEffect(() => {
    if (isWorkspaceSearchOpen) {
      workspaceSearchInputRef.current?.focus();
    }
  }, [isWorkspaceSearchOpen]);

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
    if (!isComposerMetaMenuOpen && !isComposerAttachmentMenuOpen) {
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
        composerAttachmentMenuRef.current?.contains(target)
      ) {
        return;
      }

      setIsComposerMetaMenuOpen(false);
      setIsComposerAttachmentMenuOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsComposerMetaMenuOpen(false);
      setIsComposerAttachmentMenuOpen(false);
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
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isComposerAttachmentMenuOpen, isComposerMetaMenuOpen]);

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
    Promise.all([codepawl.listMemoryEpisodes(), codepawl.listCandidateRules()]).then(([episodes, candidateRules]) => {
      if (!mounted) {
        return;
      }
      setMemoryReview((current) => ({
        ...current,
        latestEpisode: episodes[0],
        episodes,
        candidateRules,
        summary: {
          ...current.summary,
          episodeCount: episodes.length,
          candidateRuleCount: candidateRules.filter((rule) => rule.status === "candidate").length,
          candidateRuleStatusCounts: summarizeCandidateRuleStatuses(candidateRules),
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
      setComposerReadinessMessage("Finish private beta onboarding before starting a repository run.");
      setShowSetupDialog(true);
      return;
    }

    if (!repositoryPath.trim()) {
      setComposerReadinessMessage("Select a local git repository path before starting a repository run.");
      setShowSetupDialog(true);
      return;
    }

    const currentSettings = settingsSnapshot ?? (await refreshSettingsSnapshot());
    if (!modelConnectionIsReady(currentSettings)) {
      const currentModelConnection = modelConnectionFromSettings(currentSettings);
      const message = modelConnectionStatusMessage(currentModelConnection);
      setModelConnectionMessage(message);
      setComposerReadinessMessage(message);
      setShowSetupDialog(true);
      return;
    }
    setComposerReadinessMessage("");

    const threadId = activeWorkspace.id;
    setThreadMessagesByWorkspace((current) => {
      const currentMessages = current[threadId] ?? [];
      const nextMessage: ThreadMessage = {
        id: `${threadId}-user-${currentMessages.length + 1}`,
        role: "user",
        content: goal,
      };
      return {
        ...current,
        [threadId]: [...currentMessages, nextMessage],
      };
    });
    setComposerValue("");

    const run = await codepawl.createRun({
      goal,
      capabilityId: "coding-apprentice",
      taskId: runState.activeTask.id,
      workspaceId: runState.workspace.id,
      repositoryPath: repositoryPath.trim(),
      budget: {
        maxSteps: runState.runSummary.run.budget.maxSteps,
        maxWallTimeMs: runState.runSummary.run.budget.maxWallTimeMs,
        maxModelTokens: runState.runSummary.run.budget.maxModelTokens,
        maxUsd: runState.usageBudget.runLimitUsd,
        stopOnBudgetExceeded: true,
      },
    });
    setCurrentRunId(run.id);
    await refreshPersistedRuns();
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
    await codepawl.approve({
      runId: currentRunId,
      approvalId: "approval-submit-1",
      decision,
    });
  };

  const handleCandidateRuleStatus = async (rule: CandidateRule, status: "accepted" | "rejected" | "superseded") => {
    const updatedRule = await codepawl.updateCandidateRuleStatus({
      id: rule.id,
      status,
      runId: currentRunId ?? runState.traceSummary.runId,
      supersededBy: status === "superseded" ? "candidate-rule-replacement-demo" : undefined,
    });
    setMemoryReview((current) => updateMemoryReviewRule(current, updatedRule));
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
        ? await codepawl.promoteSkillManually(input)
        : decision === "reject"
          ? await codepawl.rejectSkill(input)
          : decision === "supersede"
            ? await codepawl.supersedeSkill(input)
            : await codepawl.archiveSkill(input);
    setSkillRegistry((current) => updateSkillRegistrySkill(current, updatedSkill));
  };

  const handlePreviewSkillReplay = async (skill: SkillDefinition) => {
    const replayPlan = await codepawl.createSkillReplayPlan(skill.id, currentRunId ?? runState.traceSummary.runId);
    setSelectedSkillReplayPlan(replayPlan);
  };

  const handleOpenPersistedRun = async (runId: string) => {
    const run = await codepawl.openPersistedRun(runId);
    setOpenedPersistedRun(run);
    setCurrentRunId(run.runId);
    setSelectedArtifactEvidence(null);
    setArtifactEvidenceMessage("");
    try {
      const evidence = await codepawl.listArtifactEvidence(runId);
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
      const evidence = await codepawl.readArtifactEvidence(openedPersistedRun.runId, artifactId);
      setSelectedArtifactEvidence(evidence);
    } catch (error) {
      setSelectedArtifactEvidence(null);
      setArtifactEvidenceMessage(error instanceof Error ? error.message : "Artifact evidence could not be opened.");
    }
  };

  const handlePermissionModeChange = async (mode: PermissionModeOption) => {
    setPermissionMode(mode);
    const settings = await codepawl.updateSettings({ permissionMode: toSettingsPermissionMode(mode) });
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
    const settings = await codepawl.updateSettings({ operatorProfile: profile });
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
    const settings = await codepawl.updateSettings({ uiPreferences: preferences });
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
    const settings = await codepawl.updateSettings({ voicePreferences: preferences });
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

  const handleSaveSetupSettings = async () => {
    const defaultRepositoryPath = setupRepositoryPath.trim();
    setRepositoryPath(defaultRepositoryPath);
    const settings = await codepawl.updateSettings({ defaultRepositoryPath });
    applySettingsSnapshot(settings);
    setRepositoryPath(settings.defaultRepositoryPath);
    setSetupRepositoryMessage(settings.defaultRepositoryPath ? "Repository path saved." : "");
  };

  const handleSaveAdvancedSettings = async () => {
    const settings = await codepawl.updateSettings({
      retentionPolicy: {
        runHistoryDays: retentionRunHistoryDays,
        artifactRetentionDays: retentionArtifactRetentionDays,
        cleanupEnabled: retentionCleanupEnabled,
      },
    });
    applySettingsSnapshot(settings);
  };

  const handleCompleteWelcomeSetup = async () => {
    try {
      window.localStorage.setItem(privateBetaOnboardingStorageKey, "dismissed");
    } catch {
      // Welcome completion is persisted in Tauri settings when available.
    }
    const settings = await codepawl.updateSettings({ welcomeCompleted: true });
    applySettingsSnapshot(settings);
    setHasDismissedPrivateBetaOnboarding(true);
    setShowSetupDialog(false);
    if (composerReadinessMessage === "Finish private beta onboarding before starting a repository run.") {
      setComposerReadinessMessage("");
    }
  };

  const handleDetectSetupRepositoryPath = async () => {
    const path = await codepawl.detectCurrentRepositoryPath();
    if (!path) {
      setSetupRepositoryMessage("No git repository was detected from the app launch path.");
      return;
    }
    setSetupRepositoryPath(path);
    setRepositoryPath(path);
    setSetupRepositoryMessage("Detected the current git repository path.");
  };

  const handleBrowseSetupRepositoryPath = async () => {
    const selectedPath = await codepawl.browseRepositoryPath(setupRepositoryPath || repositoryPath || settingsSnapshot?.defaultRepositoryPath);
    if (!selectedPath) {
      setSetupRepositoryMessage("No repository folder was selected.");
      return;
    }
    setSetupRepositoryPath(selectedPath);
    setRepositoryPath(selectedPath);
    setSetupRepositoryMessage("Repository folder selected. Save setup settings to persist it.");
  };

  const handleLoginCodexConnection = async (method: "chatgpt" | "device") => {
    const authMethod = method === "device" ? "deviceCode" : "chatgptOAuth";
    setSelectedAuthMethod(authMethod);
    await codepawl.saveModelConnection({
      providerId: "codex-cli",
      modelId: selectedModel.id,
      authMethod,
      envKey: null,
    });
    await codepawl.loginCodexConnection({ method });
    const result = await codepawl.preflightModelConnection();
    const settings = await refreshSettingsSnapshot();
    const connection = modelConnectionFromSettings(settings);
    setCodexConnectionMessage(result.reasons[0] ?? codexConnectionStatusMessage(settings.codexConnection));
    setModelConnectionMessage(result.reasons[0] ?? modelConnectionStatusLabel(connection));
  };

  const handleRunCodexConnectionPreflight = async () => {
    const result: CodexConnectionPreflightResult = await codepawl.preflightCodexConnection();
    const settings = await refreshSettingsSnapshot();
    const codexConnection: CodexConnectionReference = {
      ...(settings.codexConnection ?? { connectionId: "codex-cli", label: "Local Codex CLI" }),
      status: result.status,
      lastPreflight: result,
    };
    const modelConnection: ModelConnectionReference = {
      ...(modelConnectionFromSettings(settings) ?? {
        providerId: "codex-cli",
        providerLabel: "Codex CLI",
        modelId: selectedModelId,
        modelLabel: selectedModel.label,
        authMethod: selectedAuthMethod,
      }),
      status: result.status,
      lastPreflight: {
        checkedProviderId: "codex-cli",
        checkedModelId: selectedModelId,
        status: result.status,
        ready: result.ready,
        checkedAt: result.checkedAt,
        executablePath: result.executablePath,
        authMode: result.authMode,
        reasons: result.reasons,
        warnings: result.warnings,
      },
    };
    setSettingsSnapshot({ ...settings, codexConnection, modelConnection });
    setCodexConnectionMessage(result.reasons[0] ?? codexConnectionStatusLabel(codexConnection));
    setModelConnectionMessage(result.reasons[0] ?? modelConnectionStatusLabel(modelConnection));
  };

  const handleDeleteCodexConnection = async () => {
    if (!modelConnection) {
      return;
    }
    await codepawl.deleteModelConnection();
    const settings = await refreshSettingsSnapshot();
    setSettingsSnapshot(settings);
    setCodexConnectionMessage(codexConnectionStatusMessage(settings.codexConnection));
    setModelConnectionMessage(modelConnectionStatusMessage(modelConnectionFromSettings(settings)));
  };

  const handleSelectSetupProvider = (providerId: ModelProviderId) => {
    const provider = setupProviderById(providerId);
    const model = setupModelById(provider, null);
    setSelectedProviderId(provider.id);
    setSelectedModelId(model.id);
    setSelectedAuthMethod(provider.defaultAuthMethod);
    setApiKeyEnvName(provider.defaultEnvKey ?? "OPENAI_API_KEY");
    setModelSearchQuery("");
    setModelConnectionMessage("");
    setSetupPickerStage("model");
  };

  const handleSaveModelConnection = async () => {
    const connection = await codepawl.saveModelConnection({
      providerId: selectedProvider.id,
      modelId: selectedModel.id,
      authMethod: selectedProvider.id === "openai-api" ? "apiKeyEnv" : selectedAuthMethod,
      envKey: selectedProvider.id === "openai-api" ? apiKeyEnvName.trim() || "OPENAI_API_KEY" : null,
    });
    const settings = await refreshSettingsSnapshot();
    setSettingsSnapshot({ ...settings, modelConnection: settings.modelConnection ?? connection });
    setModelConnectionMessage(modelConnectionStatusMessage(connection));
  };

  const handleRunModelConnectionPreflight = async () => {
    const savedConnection = await codepawl.saveModelConnection({
      providerId: selectedProvider.id,
      modelId: selectedModel.id,
      authMethod: selectedProvider.id === "openai-api" ? "apiKeyEnv" : selectedAuthMethod,
      envKey: selectedProvider.id === "openai-api" ? apiKeyEnvName.trim() || "OPENAI_API_KEY" : null,
    });
    const result: ModelConnectionPreflightResult = await codepawl.preflightModelConnection();
    const settings = await refreshSettingsSnapshot();
    const connection: ModelConnectionReference = {
      ...(settings.modelConnection ?? savedConnection),
      status: result.status,
      lastPreflight: result,
    };
    setSettingsSnapshot({ ...settings, modelConnection: connection });
    setModelConnectionMessage(result.reasons[0] ?? modelConnectionStatusLabel(connection));
  };

  const hasSelectedRun = currentRunId !== null;
  const visibleWorkspaces = workspaces.filter((space) => !space.archived);
  const archivedWorkspaces = workspaces.filter((space) => space.archived);
  const deleteWorkspace = deleteWorkspaceId ? workspaces.find((space) => space.id === deleteWorkspaceId) : undefined;
  const activeWorkspace = visibleWorkspaces.find((space) => space.id === activeWorkspaceId) ?? visibleWorkspaces[0] ?? workspaces[0];
  const activeThreadMessages = threadMessagesByWorkspace[activeWorkspace.id] ?? [];
  const activeAgentResponseSourcesMessage = openAgentResponseSourcesId
    ? activeThreadMessages.find((message) => message.role === "agent" && message.id === openAgentResponseSourcesId)
    : undefined;
  const isActiveThreadEmpty = activeThreadMessages.length === 0;
  const normalizedWorkspaceSearchQuery = workspaceSearchQuery.trim().toLowerCase();
  const filteredWorkspaces = normalizedWorkspaceSearchQuery
    ? visibleWorkspaces.filter((space) => space.label.toLowerCase().includes(normalizedWorkspaceSearchQuery))
    : visibleWorkspaces;
  const shouldShowWorkspaceSearch = isWorkspaceSearchOpen || workspaceSearchQuery.trim().length > 0;
  const shellClassName = [
    "app-shell",
    "app-shell-cockpit",
    showSettingsSidebar ? "app-shell-settings-open" : "app-shell-settings-closed",
    isWorkspacePanelCollapsed ? "app-shell-workspace-collapsed" : "app-shell-workspace-open",
    isMobileWorkspaceViewport
      ? isMobileWorkspaceDrawerOpen
        ? "app-shell-mobile-workspace-open"
        : "app-shell-mobile-workspace-closed"
      : "app-shell-desktop-workspace",
    activeAgentResponseSourcesMessage ? "app-shell-sources-open" : "app-shell-sources-closed",
  ].join(" ");
  const workspacePanelToggleLabel = isMobileWorkspaceViewport
    ? isMobileWorkspaceDrawerOpen
      ? "Close threads"
      : "Open threads"
    : isWorkspacePanelCollapsed
      ? "Expand side panel"
      : "Collapse side panel";
  const workspacePanelToggleControls = isMobileWorkspaceViewport ? "workspace-drawer" : "workspace-panel";
  const workspacePanelToggleExpanded = isMobileWorkspaceViewport ? isMobileWorkspaceDrawerOpen : !isWorkspacePanelCollapsed;

  const handleSelectWorkspace = (spaceId: string) => {
    setActiveWorkspaceId(spaceId);
    setOpenWorkspaceMenuId(null);
    setOpenAgentResponseSourcesId(null);
    setDeleteWorkspaceId(null);
    setIsMobileWorkspaceDrawerOpen(false);
  };

  const handleCreateWorkspace = () => {
    const nextIndex = nextWorkspaceThreadIndex;
    const newSpace: Workspace = {
      id: `thread-${nextIndex}`,
      label: "New thread",
      description: "Draft thread.",
      badge: "new",
    };
    setNextWorkspaceThreadIndex((current) => current + 1);
    setWorkspaces((current) => [newSpace, ...current]);
    setThreadMessagesByWorkspace((current) => ({ ...current, [newSpace.id]: [] }));
    setActiveWorkspaceId(newSpace.id);
    setWorkspaceSearchQuery("");
    setIsWorkspaceSearchOpen(false);
    setOpenWorkspaceMenuId(null);
    setOpenAgentResponseSourcesId(null);
    setDeleteWorkspaceId(null);
    setEditingThreadHeaderId(null);
    setIsMobileWorkspaceDrawerOpen(false);
  };

  const handleCopyAgentResponse = (messageId: string) => {
    setCopiedAgentResponseId((current) => (current === messageId ? null : messageId));
  };

  const handleRateAgentResponse = (messageId: string, rating: AgentResponseRating) => {
    setAgentResponseRatings((current) => {
      if (current[messageId] === rating) {
        const { [messageId]: _removedRating, ...remainingRatings } = current;
        return remainingRatings;
      }

      return {
        ...current,
        [messageId]: rating,
      };
    });
  };

  const handleShareAgentResponse = (messageId: string) => {
    setSharedAgentResponseId((current) => (current === messageId ? null : messageId));
  };

  const handleTryAgentResponseAgain = (message: ThreadMessage) => {
    const retryIndex = nextAgentRetryIndex;
    const retryMessage: ThreadMessage = {
      id: `${activeWorkspace.id}-agent-retry-${retryIndex}`,
      role: "agent",
      label: message.label ?? "Agent response",
      content: `Regenerated mock response for ${message.content ?? "the previous answer"}`,
      showContext: false,
    };
    setNextAgentRetryIndex((current) => current + 1);
    setThreadMessagesByWorkspace((current) => ({
      ...current,
      [activeWorkspace.id]: [...(current[activeWorkspace.id] ?? []), retryMessage],
    }));
    setOpenAgentResponseMenuId(null);
    setOpenAgentResponseSourcesId(null);
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
      content: `Branched from ${message.content ?? "agent response"}`,
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
    setOpenAgentResponseSourcesId(null);
    setEditingThreadHeaderId(null);
  };

  const handleToggleAgentResponseMenu = (messageId: string) => {
    setOpenAgentResponseMenuId((current) => (current === messageId ? null : messageId));
    setOpenAgentResponseSourcesId(null);
  };

  const handleToggleAgentResponseSources = (messageId: string) => {
    setOpenAgentResponseSourcesId((current) => (current === messageId ? null : messageId));
    setOpenAgentResponseMenuId(null);
  };

  const handleToggleReadAloud = (messageId: string) => {
    setReadingAgentResponseId((current) => (current === messageId ? null : messageId));
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
    setOpenAgentResponseSourcesId(null);
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

  const handleToggleComposerMetaMenu = () => {
    if (composerMetaButtonRef.current) {
      setComposerMetaMenuPlacement(resolveComposerMenuPlacement(composerMetaButtonRef.current, composerPermissionMenuEstimatedHeight));
    }
    setIsComposerAttachmentMenuOpen(false);
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
    setIsComposerAttachmentMenuOpen((current) => !current);
  };

  const handleSelectComposerAttachmentOption = () => {
    setIsComposerAttachmentMenuOpen(false);
  };

  const renderDeleteWorkspaceDialog = () => {
    if (!deleteWorkspace) {
      return null;
    }

    return (
      <ShellModal id="workspace-delete-dialog" label="Delete thread" description={deleteWorkspace.label} onClose={() => setDeleteWorkspaceId(null)}>
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
      <ShellModal id="workspace-archive-dialog" label="Archive" description="Archived threads" onClose={() => setShowWorkspaceArchive(false)}>
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
            <button className="approval-action-secondary" type="button" onClick={() => void handleApproval("denied")}>
              Deny step
            </button>
            <button className="approval-action-primary" type="button" onClick={() => void handleApproval("approved")}>
              Approve step
            </button>
          </>
        }
      >
        <p>{approvalStatus}</p>
      </ChatBubble>
    </MessageBlock>
  );

  const renderThreadMessage = (message: ThreadMessage) => {
    if (message.role === "user") {
      return (
        <MessageBlock role="user" align="end" key={message.id}>
          <ChatBubble tone="user" align="end" width="compact">
            <p>{message.content}</p>
          </ChatBubble>
        </MessageBlock>
      );
    }

    if (message.role === "system") {
      return (
        <MessageBlock role="system" key={message.id}>
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
    const isSourcesOpen = openAgentResponseSourcesId === message.id;
    const isReading = readingAgentResponseId === message.id;

    return (
      <div className="agent-response-actions" role="toolbar" aria-label="Agent response actions">
        <button
          className="agent-response-action-button"
          type="button"
          aria-label={isCopied ? "Copied response" : "Copy response"}
          aria-pressed={isCopied}
          title={isCopied ? "Copied" : "Copy"}
          onClick={() => handleCopyAgentResponse(message.id)}
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
          onClick={() => handleShareAgentResponse(message.id)}
        >
          {isShared ? <Check className="ui-icon" aria-hidden="true" strokeWidth={2} /> : <Share className="ui-icon" aria-hidden="true" strokeWidth={2} />}
        </button>
        <button className="agent-response-action-button" type="button" aria-label="Try again" title="Try again" onClick={() => handleTryAgentResponseAgain(message)}>
          <RotateCcw className="ui-icon" aria-hidden="true" strokeWidth={2} />
        </button>
        <button
          className="agent-response-action-button agent-response-sources-button"
          type="button"
          aria-label={isSourcesOpen ? "Hide sources" : "Show sources"}
          aria-expanded={isSourcesOpen}
          aria-controls={isSourcesOpen ? "agent-response-sources-panel" : undefined}
          title="Sources"
          onClick={() => handleToggleAgentResponseSources(message.id)}
        >
          <BookOpen className="ui-icon" aria-hidden="true" strokeWidth={2} />
          <span>Sources</span>
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
                  handleToggleReadAloud(message.id);
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

  const renderAgentResponseSourcesPanel = () => {
    if (!activeAgentResponseSourcesMessage) {
      return null;
    }

    return (
      <section className="agent-response-sources-panel" id="agent-response-sources-panel" aria-label="Sources">
        <header>
          <div>
            <strong>Sources</strong>
            <span>Mock web citations</span>
          </div>
          <button type="button" aria-label="Close sources" title="Close sources" onClick={() => setOpenAgentResponseSourcesId(null)}>
            <X className="ui-icon" aria-hidden="true" strokeWidth={2} />
          </button>
        </header>
        <ol>
          {mockAgentSources.map((source) => (
            <li key={source.url}>
              <span className="agent-response-source-citation">{source.citation}</span>
              <div>
                <a className="agent-response-source-link" href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.title} source`}>
                  {source.title}
                  <ExternalLink className="ui-icon" aria-hidden="true" strokeWidth={2} />
                </a>
                <small>{source.domain}</small>
                <p>{source.excerpt}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
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
            <p>{message.content}</p>
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

  const renderThreadMessages = () => {
    const renderedMessages: ReactNode[] = [];
    let pendingSystemMessages: ThreadMessage[] = [];

    activeThreadMessages.forEach((message) => {
      if (message.role === "system") {
        pendingSystemMessages = [...pendingSystemMessages, message];
        return;
      }

      if (message.role === "agent") {
        renderedMessages.push(renderAgentMessage(message, pendingSystemMessages));
        pendingSystemMessages = [];
        return;
      }

      if (pendingSystemMessages.length > 0) {
        renderedMessages.push(...pendingSystemMessages.map((systemMessage) => renderThreadMessage(systemMessage)));
        pendingSystemMessages = [];
      }

      renderedMessages.push(renderThreadMessage(message));
    });

    if (pendingSystemMessages.length > 0) {
      renderedMessages.push(...pendingSystemMessages.map((systemMessage) => renderThreadMessage(systemMessage)));
    }

    return renderedMessages;
  };

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
            <strong>Choose a repository</strong>
            <span>{repositoryPath.trim() || settingsSnapshot?.defaultRepositoryPath ? "Repository path selected." : "Save the local git repository path you want CodePawl to work in."}</span>
          </div>
          <label className="settings-field">
            <span>Default repository path</span>
            <div className="settings-input-action-row">
              <input
                className="input-focus-standalone"
                type="text"
                aria-label="Default repository path"
                value={setupRepositoryPath}
                placeholder="/path/to/local/git/repository"
                onChange={(event) => {
                  setSetupRepositoryPath(event.target.value);
                  setSetupRepositoryMessage("");
                }}
              />
              <button type="button" className="settings-secondary-button" onClick={() => void handleDetectSetupRepositoryPath()}>
                Detect current
              </button>
              <button type="button" className="settings-icon-text-button" onClick={() => void handleBrowseSetupRepositoryPath()}>
                <FolderPlus className="ui-icon" aria-hidden="true" />
                Browse
              </button>
            </div>
            {setupRepositoryMessage ? <small>{setupRepositoryMessage}</small> : null}
          </label>
        </li>
        <li className="setup-flow-step">
          <div className="setup-flow-step-copy">
            <strong>Choose model provider</strong>
            <span>{modelConnection ? modelConnectionStatusMessage(modelConnection) : "Select a provider, model, and authentication method before the first repository run."}</span>
          </div>
          <section className="settings-review-list setup-provider-panel" aria-label="Setup model provider">
            <div className="setup-picker-panel">
              {setupPickerStage === "provider" ? (
                <section className="setup-picker" aria-label="Provider selector">
                  <label className="settings-field settings-field-stacked">
                    <span>Provider</span>
                    <input
                      className="input-focus-standalone"
                      type="search"
                      aria-label="Search providers"
                      value={providerSearchQuery}
                      placeholder="Search providers"
                      onChange={(event) => setProviderSearchQuery(event.target.value)}
                    />
                  </label>
                  <div className="setup-option-list" role="listbox" aria-label="Provider options">
                    {filteredSetupProviders.map((provider) => (
                      <button
                        className={provider.id === selectedProvider.id ? "setup-option setup-option-active" : "setup-option"}
                        type="button"
                        role="option"
                        aria-selected={provider.id === selectedProvider.id}
                        onClick={() => handleSelectSetupProvider(provider.id)}
                        key={provider.id}
                      >
                        <strong>{provider.label}</strong>
                        <span>{provider.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="setup-picker" aria-label="Model selector">
                  <div className="setup-selected-provider">
                    <div>
                      <span>Provider</span>
                      <strong>{selectedProvider.label}</strong>
                    </div>
                    <button
                      type="button"
                      className="settings-secondary-button"
                      onClick={() => {
                        setProviderSearchQuery("");
                        setSetupPickerStage("provider");
                      }}
                    >
                      Change provider
                    </button>
                  </div>
                  <label className="settings-field settings-field-stacked">
                    <span>Model</span>
                    <input
                      className="input-focus-standalone"
                      type="search"
                      aria-label="Search models"
                      value={modelSearchQuery}
                      placeholder="Search models"
                      onChange={(event) => setModelSearchQuery(event.target.value)}
                    />
                  </label>
                  <div className="setup-option-list" role="listbox" aria-label="Model options">
                    {filteredSetupModels.map((model) => (
                      <button
                        className={model.id === selectedModel.id ? "setup-option setup-option-active" : "setup-option"}
                        type="button"
                        role="option"
                        aria-selected={model.id === selectedModel.id}
                        onClick={() => setSelectedModelId(model.id)}
                        key={model.id}
                      >
                        <strong>{model.label}</strong>
                        <span>{model.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
            {setupPickerStage === "model" ? (
              <article className="settings-review-card">
                <div className="settings-review-card-header">
                  <div>
                    <h3>{selectedProvider.label}</h3>
                    <span>{selectedModel.label}</span>
                  </div>
                  <strong>{modelConnectionStatusLabel(modelConnection)}</strong>
                </div>
                <p>{modelConnectionMessage || modelConnectionStatusMessage(modelConnection)}</p>
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
                      onChange={(event) => setApiKeyEnvName(event.target.value)}
                    />
                  </label>
                ) : (
                  <div className="settings-callout">
                    <strong>ChatGPT OAuth</strong>
                    <span>CodePawl opens the local Codex CLI login flow. Credentials stay in the Codex credential cache.</span>
                  </div>
                )}
                <div className="candidate-rule-actions">
                  {selectedProvider.id === "codex-cli" ? (
                    <>
                      <button type="button" onClick={() => void handleLoginCodexConnection("chatgpt")} aria-label="Connect with ChatGPT">
                        Connect with ChatGPT
                      </button>
                      <button type="button" onClick={() => void handleRunModelConnectionPreflight()} aria-label="Run provider check">
                        Run check
                      </button>
                      <button type="button" onClick={() => void handleLoginCodexConnection("device")} className="settings-secondary-button" aria-label="Use device code">
                        Use device code
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => void handleSaveModelConnection()}>
                        Save provider setup
                      </button>
                      <button type="button" onClick={() => void handleRunModelConnectionPreflight()} aria-label="Run provider check">
                        Run provider check
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => void handleDeleteCodexConnection()} disabled={!modelConnection} aria-label="Delete provider connection">
                    Delete connection
                  </button>
                </div>
              </article>
            ) : null}
          </section>
        </li>
        <li className="setup-flow-step">
          <div className="setup-flow-step-copy">
            <strong>Review advanced defaults</strong>
            <span>Repository is the only executable surface; browser, desktop, files, terminal, cloud, and billing remain unavailable.</span>
          </div>
          <section className="settings-control" aria-label="Setup permission mode">
            <label htmlFor={`${headingId}-permission-mode`}>Permission mode</label>
            <select
              className="input-focus-standalone"
              id={`${headingId}-permission-mode`}
              value={permissionMode}
              onChange={(event) => void handlePermissionModeChange(event.target.value as PermissionModeOption)}
            >
              {permissionModeOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span>{permissionModeCopy.helper}</span>
          </section>
        </li>
      </ol>
      <div className="candidate-rule-actions">
        <button type="button" onClick={() => void handleSaveSetupSettings()}>
          Save setup settings
        </button>
        <button type="button" onClick={() => void handleCompleteWelcomeSetup()}>
          Complete setup
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
        case "general":
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
                  <span>What should CodePawl call you?</span>
                  <input
                    className="input-focus-standalone"
                    type="text"
                    aria-label="What should CodePawl call you?"
                    value={operatorCallSign}
                    onChange={(event) => void handleOperatorProfileChange({ callSign: event.target.value })}
                  />
                </label>
                <label className="settings-field settings-preference-row">
                  <span>What best describes your work?</span>
                  <select
                    className="input-focus-standalone settings-select"
                    aria-label="What best describes your work?"
                    value={operatorWorkType}
                    onChange={(event) => void handleOperatorProfileChange({ workType: event.target.value as SettingsSnapshot["operatorProfile"]["workType"] })}
                  >
                    {workTypeOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
                  <select
                    className="input-focus-standalone settings-select"
                    aria-label="Chat font"
                    value={chatFontPreference}
                    onChange={(event) => void handleUiPreferencesChange({ chatFont: event.target.value as SettingsSnapshot["uiPreferences"]["chatFont"] })}
                  >
                    {chatFontOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
                  <select
                    className="input-focus-standalone settings-select"
                    aria-label="Language"
                    value={voiceLanguage}
                    onChange={(event) => void handleVoicePreferencesChange({ language: event.target.value as SettingsSnapshot["voicePreferences"]["language"] })}
                  >
                    {voiceLanguageOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field settings-preference-row">
                  <span>Style</span>
                  <select
                    className="input-focus-standalone settings-select"
                    aria-label="Style"
                    value={voiceStyle}
                    onChange={(event) => void handleVoicePreferencesChange({ style: event.target.value as SettingsSnapshot["voicePreferences"]["style"] })}
                  >
                    {voiceStyleOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field settings-preference-row">
                  <span>Speed</span>
                  <select
                    className="input-focus-standalone settings-select"
                    aria-label="Speed"
                    value={voiceSpeed}
                    onChange={(event) => void handleVoicePreferencesChange({ speed: event.target.value as SettingsSnapshot["voicePreferences"]["speed"] })}
                  >
                    {voiceSpeedOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="settings-group" aria-labelledby="settings-codepawl-title">
                <h2 id="settings-codepawl-title">CodePawl</h2>
                <div className="settings-row settings-preference-row">
                  <span>Message labels</span>
                  <button
                    className="surface-switch settings-inline-switch"
                    type="button"
                    role="switch"
                    aria-checked={showMessageBlockMeta}
                    onClick={() => void handleUiPreferencesChange({ showMessageBlockMeta: !showMessageBlockMeta })}
                  >
                    <span className="surface-switch-copy">
                      <span>Show message labels</span>
                      <small>{messageBlockMetaDescription}</small>
                    </span>
                    <span className="surface-switch-toggle" aria-hidden="true">
                      <span className="surface-switch-thumb" />
                    </span>
                  </button>
                </div>
                <label className="settings-field settings-preference-row">
                  <span>Permission mode</span>
                  <select
                    className="input-focus-standalone settings-select"
                    aria-label="Permission mode"
                    value={permissionMode}
                    onChange={(event) => void handlePermissionModeChange(event.target.value as PermissionModeOption)}
                  >
                    {permissionModeOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="settings-row settings-preference-row">
                  <span>Retention</span>
                  <strong>{settingsSnapshot?.retentionPolicy.summary ?? "Cleanup is manual for private beta; automatic retention is planned."}</strong>
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
                <p>Devices that can control your local machine through remote sessions.</p>
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
                <li>Chat with CodePawl on this desktop preview</li>
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
    <form className={`composer composer-${variant} composer-scale-${composerScaleMode}`} aria-label="Thread composer" onSubmit={(event) => void handleTaskSubmit(event)}>
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
        <label className="composer-repository-path">
          <span>Repository</span>
          <input
            className="input-focus-control"
            aria-label="Repository path"
            name="repository-path"
            placeholder="/path/to/local/git/repository"
            value={repositoryPath}
            onChange={(event) => setRepositoryPath(event.target.value)}
          />
        </label>
        <textarea
          className="input-focus-control"
          aria-label="Repository task message"
          name="composer-goal"
          placeholder={formatThreadComposerPlaceholder(activeWorkspace.label)}
          value={composerValue}
          onChange={(event) => setComposerValue(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        <div className="composer-beta-unavailable" aria-label="Unavailable beta surfaces">
          {betaUnavailableSurfaces.map((surface) => (
            <span key={surface}>{surface} unavailable</span>
          ))}
        </div>
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
            {isComposerAttachmentMenuOpen ? (
              <div
                ref={composerAttachmentMenuRef}
                className={`composer-attachment-menu composer-attachment-menu-${composerAttachmentMenuPlacement}`}
                id="composer-attachment-menu"
                role="menu"
                aria-label="Add content options"
              >
                {composerAttachmentOptionGroups.map((group, groupIndex) => (
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
                          onClick={handleSelectComposerAttachmentOption}
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
              {permissionModeCopy.label}
            </button>
            {isComposerMetaMenuOpen ? (
              <div
                ref={composerMetaMenuRef}
                className={`composer-meta-menu composer-meta-menu-${composerMetaMenuPlacement}`}
                id="composer-meta-menu"
                role="menu"
                aria-label="Permission mode options"
              >
                {permissionModeOptions.map((option) => (
                  <button
                    className="composer-meta-menu-item"
                    type="button"
                    role="menuitemradio"
                    aria-label={option.label}
                    aria-checked={permissionMode === option.value}
                    key={option.value}
                    onClick={() => handleSelectComposerPermissionMode(option.value)}
                  >
                    <span>{option.label}</span>
                    <small>{option.helper}</small>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              className="composer-send-button"
              type="button"
              aria-label="Send task"
              title="Send task"
              disabled={composerValue.trim().length === 0}
              onClick={() => void submitComposerGoal()}
            >
              <Send className="send-icon" aria-hidden="true" strokeWidth={2} />
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
    <section className={`thread${showComposer && isActiveThreadEmpty ? " thread-empty" : ""}`} aria-label="Thread conversation">
      <header className="thread-header">
        {editingThreadHeaderId === activeWorkspace.id ? (
          <div className="thread-header-title thread-header-title-editing" onBlur={handleThreadHeaderEditBlur}>
            <label className="thread-header-field-shell thread-header-name-shell input-focus-shell input-focus-shell-labeled">
              <span className="thread-header-field-label">Title</span>
              <input
                className="thread-header-field thread-header-name-field input-focus-control"
                aria-label="Thread name"
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
                aria-label="Thread description"
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
            aria-label="Edit thread name and description"
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
                <h2>Ready for the next run</h2>
                <p>{activeWorkspace.description || "Describe the repository task and CodePawl will keep the run gated, inspectable, and local-first."}</p>
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
          <p>{message}</p>
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
        label="Set up CodePawl"
        description="Repository-only private beta"
        variant="atmospheric"
        modalClassName="setup-modal"
        bodyClassName="setup-modal-body"
        onClose={() => setShowSetupDialog(false)}
      >
        <div className="setup-dialog">
          <section className="setup-dialog-intro" aria-label="Setup summary">
            <span>Repository-only beta</span>
            <p>
              Connect a local repository, choose a model provider, and confirm conservative defaults before the first supervised run. CodePawl stays local-first and repository-scoped for this private beta.
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
            <span className="workspace-brand-wordmark">CodePawl</span>
          </button>
          <button
            className="workspace-search-toggle"
            type="button"
            aria-controls="workspace-thread-search"
            aria-expanded={shouldShowWorkspaceSearch}
            aria-label="Search threads"
            title="Search threads"
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
          <button className="workspace-drawer-backdrop" type="button" aria-label="Close thread drawer" onClick={() => setIsMobileWorkspaceDrawerOpen(false)} />
        ) : null}
        <div className="workspace-drawer" id="workspace-drawer" hidden={isMobileWorkspaceViewport && !isMobileWorkspaceDrawerOpen}>
          <div className="workspace-controls">
            {shouldShowWorkspaceSearch ? (
              <label className="workspace-search input-focus-shell input-focus-shell-compact" id="workspace-thread-search">
                <input
                  ref={workspaceSearchInputRef}
                  className="input-focus-control"
                  type="text"
                  aria-label="Search threads"
                  placeholder="Search threads"
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
            <button className="workspace-create-button" type="button" title="Create thread" onClick={handleCreateWorkspace}>
              <span className="workspace-create-icon" aria-hidden="true">
                <Plus className="ui-icon" strokeWidth={2} />
              </span>
              <span>Create</span>
            </button>
          </div>
          <nav aria-label="Threads">
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
                      aria-label={`Rename ${space.label} thread`}
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
                    aria-label={`Thread options for ${space.label}`}
                    aria-haspopup="menu"
                    aria-expanded={isWorkspaceMenuOpen}
                    aria-controls={`workspace-options-${space.id}`}
                    title={`Thread options for ${space.label}`}
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
                      aria-label={`Thread options for ${space.label}`}
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
                  <div className="account-menu-email">operator@codepawl.local</div>
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
      {renderAgentResponseSourcesPanel()}

      {renderSetupDialog()}
      {renderSettingsDialog()}
      {renderDeleteWorkspaceDialog()}
      {renderWorkspaceArchiveDialog()}
    </main>
  );
}

export default App;
