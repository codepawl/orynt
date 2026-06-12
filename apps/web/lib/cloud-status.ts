export type CloudStatusTone = "open" | "active" | "preview" | "upcoming" | "disabled";

export type CloudStatusCard = {
  title: string;
  state: string;
  tone: CloudStatusTone;
  body: string;
};

export type CloudRoadmapItem = {
  period: "Now" | "Next" | "Later";
  state: "shipped" | "in-progress" | "planned";
  title: string;
  body: string;
};

export type CloudUpdateLogItem = {
  date: string;
  title: string;
  body: string;
};

export const CLOUD_STATUS_CARDS = [
  {
    title: "Waitlist",
    state: "Open",
    tone: "open",
    body: "Teams can join the Cloud Evidence waitlist and share review workflow needs.",
  },
  {
    title: "Resend email",
    state: "Active",
    tone: "active",
    body: "Waitlist submissions send a confirmation email and an internal notification when production secrets are configured.",
  },
  {
    title: "Browser preview",
    state: "Available",
    tone: "preview",
    body: "The Evidence Hub preview runs locally in the browser. Artifact contents are not uploaded or stored.",
  },
  {
    title: "Hosted review",
    state: "Upcoming",
    tone: "upcoming",
    body: "Hosted Cloud Evidence review is not generally available yet. Early conversations are waitlist-driven.",
  },
  {
    title: "Artifact storage",
    state: "Not enabled",
    tone: "disabled",
    body: "There is no hosted artifact upload, customer artifact storage, billing, or production Cloud provisioning.",
  },
] satisfies CloudStatusCard[];

export const CLOUD_ROADMAP = [
  {
    period: "Now",
    state: "shipped",
    title: "Browser-local Evidence Hub",
    body: "Openpawl v0.5.3+ evidence bundles can be inspected in the local/browser-only preview.",
  },
  {
    period: "Now",
    state: "shipped",
    title: "Waitlist and email confirmation",
    body: "The waitlist captures email, role/use case, workflow need, source tag, and optional notes without artifact intake.",
  },
  {
    period: "Now",
    state: "in-progress",
    title: "Status and roadmap surface",
    body: "This page centralizes Cloud Evidence status, guardrails, and launch-ready links without uptime claims.",
  },
  {
    period: "Next",
    state: "planned",
    title: "Hosted review design partners",
    body: "Use waitlist feedback to shape hosted evidence review, approval workflow, and traceability requirements.",
  },
  {
    period: "Next",
    state: "planned",
    title: "Evidence intake contract",
    body: "Keep hosted intake constrained to redacted Openpawl evidence artifacts before any storage path exists.",
  },
  {
    period: "Later",
    state: "planned",
    title: "Team workflow layer",
    body: "Explore organization review flows, audit trails, and maintainer controls after hosted review scope is proven.",
  },
] satisfies CloudRoadmapItem[];

export const CLOUD_UPDATE_LOG = [
  {
    date: "2026-06-12",
    title: "Cloud Evidence waitlist opened",
    body: "The waitlist page and Resend confirmation flow are live for early workflow conversations.",
  },
  {
    date: "2026-06-12",
    title: "Status roadmap published",
    body: "A public status and roadmap page now summarizes what is open, preview-only, upcoming, and not enabled.",
  },
  {
    date: "2026-06-11",
    title: "Evidence Hub local preview verified",
    body: "The browser-only Evidence Hub demo was verified with Openpawl evidence bundle fixtures and no upload path.",
  },
] satisfies CloudUpdateLogItem[];
