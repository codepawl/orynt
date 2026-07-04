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
  PersistedRunRecord,
  PersistedRunSummary,
  ProviderPreflightResult,
  ProviderReference,
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

function providerIsReady(settings: SettingsSnapshot | null): boolean {
  return settings?.providerRefs.some((reference) => reference.status === "ready") ?? true;
}

function providerStatusLabel(reference: ProviderReference | undefined): string {
  if (!reference) {
    return "Provider setup required";
  }
  if (reference.status === "ready") {
    return "Ready";
  }
  if (reference.status === "failed") {
    return "Preflight failed";
  }
  return "Preflight required";
}

function providerStatusMessage(reference: ProviderReference | undefined): string {
  if (!reference) {
    return "Provider setup is required before real repository runs.";
  }
  return reference.lastPreflight?.reasons[0] ?? "Run provider preflight before real repository runs.";
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
const privateBetaDisabledSurfaceSummary = "Browser, desktop, files, terminal, cloud, and billing unavailable";
const defaultLandingUrl = "http://127.0.0.1:5173/";

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

const settingsSections = [
  { id: "general", label: "General", group: "Settings", keywords: ["profile", "appearance", "operator", "message", "labels", "display"], Icon: SettingsIcon },
  { id: "dashboard", label: "Dashboard", group: "Settings", keywords: ["run", "budget", "trace", "queues", "surfaces"], Icon: LayoutDashboard },
  { id: "account", label: "Account", group: "Settings", keywords: ["identity", "session", "local"], Icon: CircleUserRound },
  { id: "privacy", label: "Privacy", group: "Settings", keywords: ["secrets", "local", "storage"], Icon: Shield },
  { id: "billing", label: "Billing", group: "Settings", keywords: ["budget", "cost", "tokens"], Icon: CreditCard },
  { id: "capabilities", label: "Capabilities", group: "Settings", keywords: ["permission", "surfaces", "safe"], Icon: Cpu },
  { id: "codepawl-code", label: "CodePawl Code", group: "Settings", keywords: ["trace", "verifier", "codex"], Icon: Code2 },
  { id: "skills", label: "Skills", group: "Customize", keywords: ["memory", "rules", "registry"], Icon: Blocks },
  { id: "connectors", label: "Connectors", group: "Customize", keywords: ["providers", "browser", "sidecar"], Icon: Plug },
  { id: "plugins", label: "Plugins", group: "Customize", keywords: ["extensions", "tauri", "local"], Icon: Puzzle },
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

function createInitialThreadMessages(runState: MockRunState): Record<string, ThreadMessage[]> {
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
}: {
  initialRunState?: MockRunState;
  initialSelectedRunId?: string | null;
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
  const [providerSetupMessage, setProviderSetupMessage] = useState("");
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
  const [threadMessagesByWorkspace, setThreadMessagesByWorkspace] = useState<Record<string, ThreadMessage[]>>(() => createInitialThreadMessages(runState));
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
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [showSettingsSidebar, setShowSettingsSidebar] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("general");
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [showMessageBlockMeta, setShowMessageBlockMeta] = useState(() => {
    try {
      return window.localStorage.getItem(messageBlockMetaStorageKey) === "true";
    } catch {
      return false;
    }
  });
  const [hasDismissedPrivateBetaOnboarding, setHasDismissedPrivateBetaOnboarding] = useState(() => {
    try {
      return window.localStorage.getItem(privateBetaOnboardingStorageKey) === "dismissed";
    } catch {
      return false;
    }
  });
  const [operatorFullName, setOperatorFullName] = useState("Operator");
  const [operatorCallSign, setOperatorCallSign] = useState("Operator");
  const [operatorInstructions, setOperatorInstructions] = useState(
    "Use controlled runtime defaults. Keep repository, browser, file, and terminal actions bounded by approvals until the operator explicitly changes capability settings.",
  );
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
  const primaryProviderRef = settingsSnapshot?.providerRefs[0];
  const isProviderReady = providerIsReady(settingsSnapshot);
  const isMockDemoMode = primaryProviderRef?.providerId === "mock-provider" || primaryProviderRef?.keyRef.startsWith("mock-provider://") === true;
  const composerStatusMessage = composerReadinessMessage || (!isProviderReady ? providerSetupMessage : "");

  const refreshPersistedRuns = async () => {
    const runs = await codepawl.listPersistedRuns();
    setPersistedRuns(runs);
  };

  const refreshSettingsSnapshot = async () => {
    const settings = await codepawl.getSettings();
    setSettingsSnapshot(settings);
    setPermissionMode(toUiPermissionMode(settings.permissionMode));
    return settings;
  };

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

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
      setSettingsSnapshot(settings);
      setPermissionMode(toUiPermissionMode(settings.permissionMode));
      setProviderSetupMessage(providerStatusMessage(settings.providerRefs[0]));
    });

    return () => {
      mounted = false;
    };
  }, [shouldHydrateClientState]);

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

    if (!hasDismissedPrivateBetaOnboarding) {
      setComposerReadinessMessage("Finish private beta onboarding before starting a repository run.");
      return;
    }

    if (!repositoryPath.trim()) {
      setComposerReadinessMessage("Select a local git repository path before starting a repository run.");
      return;
    }

    const currentSettings = settingsSnapshot ?? (await refreshSettingsSnapshot());
    if (!providerIsReady(currentSettings)) {
      const message = providerStatusMessage(currentSettings.providerRefs[0]);
      setProviderSetupMessage(message);
      setComposerReadinessMessage(message);
      return;
    }
    setComposerReadinessMessage("");

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
    setSettingsSnapshot(settings);
  };

  const handleUseLocalCodexProvider = async () => {
    const reference = await codepawl.saveProviderReference({
      providerId: "codex-cli",
      label: "Local Codex CLI",
    });
    const settings = await refreshSettingsSnapshot();
    const providerRefs = [reference, ...settings.providerRefs.filter((item) => item.providerId !== reference.providerId)];
    setSettingsSnapshot({ ...settings, providerRefs });
    setProviderSetupMessage(providerStatusMessage(reference));
  };

  const handleRunProviderPreflight = async () => {
    const providerId = primaryProviderRef?.providerId ?? "codex-cli";
    const result: ProviderPreflightResult = await codepawl.testProviderReference(providerId);
    const settings = await refreshSettingsSnapshot();
    const currentProviderRefs = settings.providerRefs.length > 0 ? settings.providerRefs : primaryProviderRef ? [primaryProviderRef] : [];
    const providerRefs = currentProviderRefs.map((reference) =>
      reference.providerId === result.checkedProviderId
        ? {
            ...reference,
            status: result.status,
            lastPreflight: result,
          }
        : reference,
    );
    setSettingsSnapshot({ ...settings, providerRefs });
    setProviderSetupMessage(result.reasons[0] ?? providerStatusLabel(providerRefs[0]));
  };

  const handleDeleteProviderReference = async () => {
    if (!primaryProviderRef) {
      return;
    }
    await codepawl.deleteProviderReference(primaryProviderRef.providerId);
    const settings = await refreshSettingsSnapshot();
    setSettingsSnapshot(settings);
    setProviderSetupMessage(providerStatusMessage(settings.providerRefs[0]));
  };

  const handleDismissPrivateBetaOnboarding = () => {
    try {
      window.localStorage.setItem(privateBetaOnboardingStorageKey, "dismissed");
    } catch {
      // Onboarding dismissal is best-effort in constrained webviews.
    }
    setHasDismissedPrivateBetaOnboarding(true);
    if (composerReadinessMessage === "Finish private beta onboarding before starting a repository run.") {
      setComposerReadinessMessage("");
    }
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
    activeAgentResponseSourcesMessage ? "app-shell-sources-open" : "app-shell-sources-closed",
  ].join(" ");

  const handleSelectWorkspace = (spaceId: string) => {
    setActiveWorkspaceId(spaceId);
    setOpenWorkspaceMenuId(null);
    setOpenAgentResponseSourcesId(null);
    setDeleteWorkspaceId(null);
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
    setIsWorkspaceSearchOpen((current) => {
      if (current) {
        setWorkspaceSearchQuery("");
      }
      return !current;
    });
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
    setShowSettingsSidebar(true);
  };

  const handleToggleSettingsDialog = () => {
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

  const renderSettingsDialog = () => {
    if (!showSettingsSidebar) {
      return null;
    }

    const renderPrivateBetaStatusChecklist = () => (
      <section className="settings-review-list private-beta-checklist" aria-label="Private beta status checklist">
        <h3>Private beta status checklist</h3>
        <div className="settings-queue-row">
          <span>Provider readiness</span>
          <strong>{providerStatusLabel(primaryProviderRef)}</strong>
        </div>
        <div className="settings-queue-row">
          <span>Local persistence</span>
          <strong>Enabled under local app data</strong>
        </div>
        <div className="settings-queue-row">
          <span>Evidence viewer</span>
          <strong>Available for persisted repository runs</strong>
        </div>
        <div className="settings-queue-row">
          <span>Packaging</span>
          <strong>Internal build only; bundle/signing/updater incomplete</strong>
        </div>
        <div className="settings-queue-row">
          <span>Disabled surfaces</span>
          <strong>{privateBetaDisabledSurfaceSummary}</strong>
        </div>
      </section>
    );

    const renderSettingsSectionContent = () => {
      switch (activeSettingsSection) {
        case "general":
          return (
            <section className="settings-section" aria-labelledby="settings-general-title">
              <h2 id="settings-general-title">Profile</h2>
              {renderPrivateBetaStatusChecklist()}
              <div className="settings-profile-avatar-row">
                <span>Avatar</span>
                <span className="settings-profile-avatar" aria-hidden="true">
                  OP
                </span>
              </div>
              <label className="settings-field">
                <span>Full name</span>
                <input className="input-focus-standalone" type="text" value={operatorFullName} onChange={(event) => setOperatorFullName(event.target.value)} />
              </label>
              <label className="settings-field">
                <span>What should CodePawl call you?</span>
                <input className="input-focus-standalone" type="text" value={operatorCallSign} onChange={(event) => setOperatorCallSign(event.target.value)} />
              </label>
              <label className="settings-field settings-field-stacked">
                <span>Operator instructions</span>
                <textarea className="input-focus-standalone" value={operatorInstructions} onChange={(event) => setOperatorInstructions(event.target.value)} />
              </label>
              <fieldset className="settings-segment" aria-label="Appearance">
                <legend>Appearance</legend>
                <button type="button" aria-pressed="true">
                  Dark
                </button>
                <button type="button" aria-pressed="false">
                  System
                </button>
              </fieldset>
              <section className="surface-switcher" aria-label="Message display">
                <h2>Message display</h2>
                <button
                  className="surface-switch"
                  type="button"
                  role="switch"
                  aria-checked={showMessageBlockMeta}
                  onClick={() => setShowMessageBlockMeta((current) => !current)}
                >
                  <span className="surface-switch-copy">
                    <span>Show message labels</span>
                    <small>{messageBlockMetaDescription}</small>
                  </span>
                  <span className="surface-switch-toggle" aria-hidden="true">
                    <span className="surface-switch-thumb" />
                  </span>
                </button>
              </section>
            </section>
          );
        case "dashboard":
          return (
            <section className="settings-section" aria-labelledby="settings-dashboard-title">
              <h2 id="settings-dashboard-title">Dashboard</h2>
              <div className="dashboard-summary" role="region" aria-label="Dashboard summary">
                <section className="dashboard-metrics" aria-label="Dashboard metrics">
                  <ChatBubble tone="metric" className="dashboard-metric" title="Active run">
                    <strong>{titleCaseStatus(runState.activeTask.status)}</strong>
                    <small>{runState.activeTask.title}</small>
                  </ChatBubble>
                  <ChatBubble tone="metric" className="dashboard-metric" title="Run spend">
                    <strong>
                      {formatUsd(runState.activeTask.costUsd)} / {formatUsd(runState.usageBudget.runLimitUsd)}
                    </strong>
                    <small>{runState.traceSummary.modelTokens.toLocaleString()} model tokens</small>
                  </ChatBubble>
                  <ChatBubble tone="metric" className="dashboard-metric" title="Usage ledger">
                    <strong>{formatUsd(runState.usageSummary.creditsConsumed)} local estimate</strong>
                    <small>
                      {pluralize(runState.usageSummary.runCount, "run")}, {pluralize(runState.usageSummary.gatewayActionCount, "gateway action")},{" "}
                      {pluralize(runState.usageSummary.artifactCount, "artifact")}
                    </small>
                  </ChatBubble>
                  <ChatBubble tone="metric" className="dashboard-metric" title="Beta access">
                    <strong>Local demo quota</strong>
                    <small>No managed AI credits or live billing in this beta.</small>
                  </ChatBubble>
                  <ChatBubble tone="metric" className="dashboard-metric" title="Trace">
                    <strong>{runState.traceSummary.eventCount} events</strong>
                    <small>{runState.traceSummary.artifactCount} artifacts captured</small>
                  </ChatBubble>
                  <ChatBubble tone="metric" className="dashboard-metric" title="Verifier">
                    <strong>{runState.traceSummary.latestVerdict}</strong>
                    <small>{runState.skillDraft.name}</small>
                  </ChatBubble>
                </section>

                <section className="dashboard-grid" aria-label="Dashboard work queues">
                  <ChatBubble tone="panel" className="dashboard-panel" title="Queues" headerAccessory="Product status">
                    <div className="dashboard-row">
                      <span>Approvals</span>
                      <strong>1 pending</strong>
                    </div>
                    <div className="dashboard-row">
                      <span>Memory rules</span>
                      <strong>{memoryReview.summary.candidateRuleCount} reviewable</strong>
                    </div>
                    <div className="dashboard-row">
                      <span>Skills</span>
                      <strong>{skillRegistry.summary.skillCount} registered</strong>
                    </div>
                  </ChatBubble>

                  <ChatBubble tone="panel" className="dashboard-panel" title="Allowed surfaces" headerAccessory="Current toggles">
                    {orderedSurfaces.map((surface) => (
                      <div className="dashboard-row" key={surface}>
                        <span>{surfaceLabels[surface]}</span>
                        <strong>{surfaceToggles[surface] ? "enabled" : "blocked"}</strong>
                      </div>
                    ))}
                  </ChatBubble>
                </section>
              </div>
            </section>
          );
        case "account":
          return (
            <section className="settings-section" aria-labelledby="settings-account-title">
              <h2 id="settings-account-title">Account</h2>
              <div className="settings-row">
                <span>Session</span>
                <strong>Local session</strong>
              </div>
              <div className="settings-row">
                <span>Operator</span>
                <strong>{operatorCallSign || "Operator"}</strong>
              </div>
              <div className="settings-row">
                <span>Workspace</span>
                <strong>{activeWorkspace.label}</strong>
              </div>
            </section>
          );
        case "privacy":
          return (
            <section className="settings-section" aria-labelledby="settings-privacy-title">
              <h2 id="settings-privacy-title">Privacy</h2>
              <div className="settings-row">
                <span>Secrets</span>
                <strong>Approval gated</strong>
              </div>
              <div className="settings-row">
                <span>Runtime</span>
                <strong>Local mock state</strong>
              </div>
              <div className="settings-row">
                <span>Network access</span>
                <strong>{surfaceToggles.browser ? "Operator enabled" : "Blocked by default"}</strong>
              </div>
            </section>
          );
        case "billing":
          return (
            <section className="settings-section" aria-labelledby="settings-billing-title">
              <h2 id="settings-billing-title">Billing</h2>
              <section className="settings-metric" aria-label="Run limits">
                <span>Run limits</span>
                <strong>
                  {formatUsd(runState.activeTask.costUsd)} / {formatUsd(runState.usageBudget.runLimitUsd)}
                </strong>
                <small>{runState.traceSummary.modelTokens.toLocaleString()} model tokens</small>
              </section>
              <div className="settings-row">
                <span>Budget mode</span>
                <strong>Local guardrail</strong>
              </div>
            </section>
          );
        case "capabilities":
          return (
            <section className="settings-section" aria-labelledby="settings-capabilities-title">
              <h2 id="settings-capabilities-title">Capabilities</h2>
              <section className="settings-control" aria-label="Permission mode">
                <label htmlFor="permission-mode">Permission mode</label>
                <select
                  className="input-focus-standalone"
                  id="permission-mode"
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

              <section className="surface-switcher" aria-label="Allowed surfaces">
                <h2>Allowed surfaces</h2>
                {orderedSurfaces.map((surface) => (
                  <button
                    className="surface-switch"
                    type="button"
                    role="switch"
                    aria-checked={surfaceToggles[surface]}
                    disabled={surface !== "repository"}
                    onClick={() => {
                      if (surface === "repository") {
                        setSurfaceToggles((current) => ({ ...current, repository: !current.repository }));
                      }
                    }}
                    key={surface}
                  >
                    <span className="surface-switch-copy">
                      <span>{surfaceLabels[surface]}</span>
                      <small>{surfaceDescriptions[surface]}</small>
                    </span>
                    <span className="surface-switch-toggle" aria-hidden="true">
                      <span className="surface-switch-thumb" />
                    </span>
                  </button>
                ))}
              </section>
            </section>
          );
        case "codepawl-code":
          return (
            <section className="settings-section" aria-labelledby="settings-code-title">
              <h2 id="settings-code-title">CodePawl Code</h2>
              <section className="settings-metric" aria-label="Trace">
                <span>Trace</span>
                <strong>{runState.traceSummary.eventCount} events</strong>
                <small>{runState.traceSummary.artifactCount} artifacts</small>
              </section>
              <section className="settings-metric" aria-label="Verifier">
                <span>Verifier</span>
                <strong>{runState.skillDraft.name}</strong>
                <small>Latest verdict: {runState.traceSummary.latestVerdict}</small>
              </section>
              <section className="settings-review-list" aria-label="Repository run history">
                <h3>Repository run history</h3>
                {persistedRuns.length > 0 ? (
                  persistedRuns.map((run) => (
                    <article className="settings-review-card" key={run.runId}>
                      <div className="settings-review-card-header">
                        <div>
                          <h3>{run.goal}</h3>
                          <span>{run.repositoryPath}</span>
                        </div>
                        <strong>{run.status}</strong>
                      </div>
                      <p>
                        {pluralize(run.eventCount, "event")} / {pluralize(run.artifactCount, "artifact")} / {pluralize(run.memoryCandidateCount, "memory candidate")} /{" "}
                        {pluralize(run.skillCount, "skill")}
                      </p>
                      <div className="settings-review-actions">
                        <button type="button" onClick={() => void handleOpenPersistedRun(run.runId)} aria-label={`Open persisted run ${run.goal}`}>
                          Open run
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p>No persisted repository runs</p>
                )}
              </section>
              {openedPersistedRun ? (
                <section className="settings-review-list" aria-label="Opened run evidence">
                  <h3>Opened run evidence</h3>
                  <section className="settings-queue" aria-label="Opened run summary">
                    <div className="settings-queue-row">
                      <span>Memory</span>
                      <strong>{pluralize(openedPersistedRun.memoryCandidates.length, "memory candidate")}</strong>
                    </div>
                    <div className="settings-queue-row">
                      <span>Skills</span>
                      <strong>{pluralize(openedPersistedRun.skills.length, "skill")}</strong>
                    </div>
                    <div className="settings-queue-row">
                      <span>Manifest</span>
                      <strong>{openedPersistedRun.artifactManifestPath}</strong>
                    </div>
                  </section>
                  {openedPersistedRun.events.map((event) => {
                    const summary = (event.payload as { summary?: unknown }).summary;
                    return (
                      <article className="settings-review-card" key={event.id}>
                        <div className="settings-review-card-header">
                          <div>
                            <h3>{event.type}</h3>
                            <span>{typeof summary === "string" ? summary : event.type.replaceAll("_", " ")}</span>
                          </div>
                          <strong>#{event.sequence}</strong>
                        </div>
                      </article>
                    );
                  })}
                  <section className="artifact-evidence-viewer" aria-label="Artifact evidence viewer">
                    <div className="settings-review-card-header">
                      <div>
                        <h3>Artifact evidence viewer</h3>
                        <span>Validated by Tauri against the persisted run manifest</span>
                      </div>
                      <strong>{pluralize(artifactEvidence.length, "artifact")}</strong>
                    </div>
                    {artifactEvidenceMessage ? (
                      <p className="artifact-evidence-message" role="status">
                        {artifactEvidenceMessage}
                      </p>
                    ) : null}
                    <div className="artifact-evidence-grid">
                      {artifactEvidence.map((artifact) => (
                        <article className="settings-review-card artifact-evidence-card" key={artifact.artifactId}>
                          <div className="settings-review-card-header">
                            <div>
                              <h3>{artifact.label}</h3>
                              <span>{artifact.reason ?? artifact.contentType ?? artifact.kind.replaceAll("_", " ")}</span>
                            </div>
                            <strong>{artifactStatusLabel(artifact.status)}</strong>
                          </div>
                          <p>
                            {artifact.byteSize ? `${artifact.byteSize} bytes` : "No readable file"} / {artifact.kind.replaceAll("_", " ")}
                          </p>
                          <div className="settings-review-actions">
                            <button
                              type="button"
                              onClick={() => void handleViewArtifactEvidence(artifact.artifactId)}
                              disabled={artifact.status !== "verified"}
                              aria-label={`View artifact ${artifact.label}`}
                            >
                              View
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {selectedArtifactEvidence ? (
                      <article className="settings-review-card artifact-evidence-content" aria-label="Selected artifact evidence">
                        <div className="settings-review-card-header">
                          <div>
                            <h3>{selectedArtifactEvidence.label}</h3>
                            <span>
                              {selectedArtifactEvidence.contentType} / {selectedArtifactEvidence.byteSize} bytes
                            </span>
                          </div>
                          <strong>{artifactStatusLabel(selectedArtifactEvidence.status)}</strong>
                        </div>
                        <pre>
                          {selectedArtifactEvidence.content.split("\n").map((line, index) => (
                            <span key={`${selectedArtifactEvidence.artifactId}-line-${index}`}>{line || " "}</span>
                          ))}
                        </pre>
                      </article>
                    ) : null}
                  </section>
                </section>
              ) : null}
              {settingsSnapshot ? (
                <section className="settings-metric" aria-label="Retention policy">
                  <span>Retention</span>
                  <strong>{settingsSnapshot.retentionPolicy.cleanupEnabled ? "Automatic cleanup" : "Manual cleanup"}</strong>
                  <small>{settingsSnapshot.retentionPolicy.summary}</small>
                </section>
              ) : null}
            </section>
          );
        case "skills":
          return (
            <section className="settings-section" aria-labelledby="settings-skills-title">
              <h2 id="settings-skills-title">Skills</h2>
              <section className="settings-queue" aria-label="Thread queues">
                <h2>Thread queues</h2>
                <div className="settings-queue-row">
                  <span>Approvals</span>
                  <strong>1 pending</strong>
                </div>
                <div className="settings-queue-row">
                  <span>Memory rules</span>
                  <strong>{memoryReview.summary.candidateRuleCount} reviewable</strong>
                </div>
                <div className="settings-queue-row">
                  <span>Skills</span>
                  <strong>{skillRegistry.summary.skillCount} registered</strong>
                </div>
                <div className="settings-queue-row">
                  <span>Archive</span>
                  <strong>No archived runs</strong>
                </div>
              </section>
              {memoryReview.candidateRules.length > 0 ? (
                <section className="settings-review-list" aria-label="Memory review">
                  <h2>Memory review</h2>
                  {memoryReview.candidateRules.map((rule) => (
                    <article className="settings-review-card" key={rule.id}>
                      <div className="settings-review-card-header">
                        <div>
                          <h3>{rule.title}</h3>
                          <span>{rule.scope.allowedPaths.join(", ")}</span>
                        </div>
                        <strong>{rule.status}</strong>
                      </div>
                      <p>{rule.rule}</p>
                      <div className="candidate-rule-actions">
                        <button type="button" onClick={() => void handleCandidateRuleStatus(rule, "accepted")} disabled={rule.status !== "candidate"} aria-label={`Accept ${rule.title}`}>
                          Accept
                        </button>
                        <button type="button" onClick={() => void handleCandidateRuleStatus(rule, "rejected")} disabled={rule.status !== "candidate"} aria-label={`Reject ${rule.title}`}>
                          Reject
                        </button>
                        <button type="button" onClick={() => void handleCandidateRuleStatus(rule, "superseded")} disabled={rule.status !== "candidate"} aria-label={`Supersede ${rule.title}`}>
                          Supersede
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}
              {skillRegistry.skills.length > 0 ? (
                <section className="settings-review-list" aria-label="Skill registry">
                  <h2>Skill registry</h2>
                  {skillRegistry.skills.map((skill) => (
                    <article className="settings-review-card" key={skill.id}>
                      <div className="settings-review-card-header">
                        <div>
                          <h3>{skill.title}</h3>
                          <span>{skill.capabilityId}</span>
                        </div>
                        <strong>{skill.status}</strong>
                      </div>
                      <p>{skill.summary}</p>
                      <div className="candidate-rule-actions">
                        <button type="button" onClick={() => void handleSkillDecision(skill, "promote")} disabled={skill.status !== "candidate"} aria-label={`Promote ${skill.title}`}>
                          Promote
                        </button>
                        <button type="button" onClick={() => void handleSkillDecision(skill, "reject")} disabled={skill.status !== "candidate"} aria-label={`Reject ${skill.title}`}>
                          Reject
                        </button>
                        <button type="button" onClick={() => void handleSkillDecision(skill, "supersede")} disabled={skill.status !== "candidate"} aria-label={`Supersede ${skill.title}`}>
                          Supersede
                        </button>
                        <button type="button" onClick={() => void handleSkillDecision(skill, "archive")} disabled={skill.status === "archived"} aria-label={`Archive ${skill.title}`}>
                          Archive
                        </button>
                        <button type="button" onClick={() => void handlePreviewSkillReplay(skill)} aria-label={`Preview replay for ${skill.title}`}>
                          Preview replay
                        </button>
                      </div>
                    </article>
                  ))}
                  {selectedSkillReplayPlan ? (
                    <section className="settings-replay-plan" aria-label="Skill replay preview">
                      <h3>{selectedSkillReplayPlan.skillTitle}</h3>
                      <strong>{selectedSkillReplayPlan.readiness}</strong>
                      <p>{selectedSkillReplayPlan.summary}</p>
                      <div className="settings-review-grid">
                        <span>
                          preconditions <strong>{selectedSkillReplayPlan.preconditions.length}</strong>
                        </span>
                        <span>
                          validation <strong>{selectedSkillReplayPlan.validationExpectations.length}</strong>
                        </span>
                        <span>
                          approvals <strong>{selectedSkillReplayPlan.requiredApprovals.length}</strong>
                        </span>
                      </div>
                    </section>
                  ) : null}
                </section>
              ) : null}
            </section>
          );
        case "connectors":
          return (
            <section className="settings-section" aria-labelledby="settings-connectors-title">
              <h2 id="settings-connectors-title">Connectors</h2>
              <section className="settings-review-list" aria-label="Provider setup">
                <h3>Provider setup</h3>
                <article className="settings-review-card">
                  <div className="settings-review-card-header">
                    <div>
                      <h3>{primaryProviderRef?.label ?? "Local Codex CLI"}</h3>
                      <span>{primaryProviderRef?.keyRef ?? "No provider reference configured"}</span>
                      {isMockDemoMode ? <small>Demo-only mock provider</small> : null}
                    </div>
                    <strong>{providerStatusLabel(primaryProviderRef)}</strong>
                  </div>
                  <p>
                    {isMockDemoMode
                      ? "Browser preview uses deterministic demo data; real repository beta runs require the local Codex CLI in Tauri."
                      : providerSetupMessage || providerStatusMessage(primaryProviderRef)}
                  </p>
                  <div className="candidate-rule-actions">
                    <button type="button" onClick={() => void handleUseLocalCodexProvider()} aria-label="Use local Codex CLI">
                      Use local Codex CLI
                    </button>
                    <button type="button" onClick={() => void handleRunProviderPreflight()} disabled={!primaryProviderRef} aria-label="Run provider preflight">
                      Run provider preflight
                    </button>
                    <button type="button" onClick={() => void handleDeleteProviderReference()} disabled={!primaryProviderRef} aria-label="Delete provider reference">
                      Delete provider
                    </button>
                  </div>
                </article>
              </section>
              <div className="settings-row">
                <span>Browser connector</span>
                <strong>{surfaceToggles.browser ? "Enabled locally" : "Blocked"}</strong>
              </div>
              <div className="settings-row">
                <span>Sidecar runtime</span>
                <strong>Preview only</strong>
              </div>
            </section>
          );
        case "plugins":
          return (
            <section className="settings-section" aria-labelledby="settings-plugins-title">
              <h2 id="settings-plugins-title">Plugins</h2>
              <div className="settings-row">
                <span>Installed plugins</span>
                <strong>None active</strong>
              </div>
              <div className="settings-row">
                <span>Plugin actions</span>
                <strong>Approval required</strong>
              </div>
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
          <p className="composer-provider-status" role="status">
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
        <div className="thread-start">
          <div className="thread-start-copy">
            <h2>Ready for the next run</h2>
            <p>{activeWorkspace.description || "Describe the repository task and CodePawl will keep the run gated, inspectable, and local-first."}</p>
          </div>
          {renderComposer("start")}
        </div>
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

  const renderPrivateBetaOnboarding = () => {
    if (hasDismissedPrivateBetaOnboarding) {
      return null;
    }

    return (
      <section className="private-beta-onboarding" aria-label="Private beta onboarding">
        <div>
          <span>Repository-only beta</span>
          <h2>CodePawl private beta</h2>
          <p>
            CodePawl currently runs supervised repository tasks only. Local-first data, persisted runs, and evidence artifacts stay in the local Tauri app data directory for this
            device.
          </p>
        </div>
        <ul>
          <li>
            <strong>Codex CLI provider readiness</strong>
            <span>Real repository runs require a local Codex CLI provider reference and a passing preflight in Settings.</span>
          </li>
          <li>
            <strong>Approval and evidence</strong>
            <span>Repository actions stay gated, runs produce an event ledger, and persisted artifacts can be reopened from the evidence viewer.</span>
          </li>
          <li>
            <strong>Local-first data</strong>
            <span>Run history, settings, provider references, and artifact manifests are stored under the local app data directory.</span>
          </li>
          <li>
            <strong>Unavailable surfaces</strong>
            <span>Browser, desktop, files, terminal, cloud, and billing are unavailable in this private beta.</span>
          </li>
        </ul>
        <button type="button" onClick={handleDismissPrivateBetaOnboarding}>
          Continue to repository beta
        </button>
      </section>
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
            aria-controls="workspace-panel"
            aria-expanded={!isWorkspacePanelCollapsed}
            aria-label={isWorkspacePanelCollapsed ? "Expand side panel" : "Collapse side panel"}
            title={isWorkspacePanelCollapsed ? "Expand side panel" : "Collapse side panel"}
            onClick={() => setIsWorkspacePanelCollapsed((current) => !current)}
          >
            {isWorkspacePanelCollapsed ? (
              <PanelLeftOpen className="ui-icon" aria-hidden="true" strokeWidth={2} />
            ) : (
              <PanelLeftClose className="ui-icon" aria-hidden="true" strokeWidth={2} />
            )}
          </button>
        </div>

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
      </aside>

      {renderCockpitContent()}
      {renderAgentResponseSourcesPanel()}
      {renderPrivateBetaOnboarding()}

      {renderSettingsDialog()}
      {renderDeleteWorkspaceDialog()}
      {renderWorkspaceArchiveDialog()}
    </main>
  );
}

export default App;
