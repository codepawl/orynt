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
    state: "Live",
    tone: "open",
    body: "The public waitlist captures email, role/use case, workflow need, source tag, and optional notes.",
  },
  {
    title: "Resend email flow",
    state: "Live",
    tone: "active",
    body: "Production submissions send branded confirmation emails and internal notifications through Resend.",
  },
  {
    title: "Evidence Hub preview",
    state: "Local/browser-only",
    tone: "preview",
    body: "OpenPawl evidence bundles can be inspected in the browser. Artifact contents are not uploaded or stored.",
  },
  {
    title: "Hosted evidence review",
    state: "Upcoming",
    tone: "upcoming",
    body: "Hosted review intake is planned for private conversations. Cloud Evidence is not generally available.",
  },
  {
    title: "Hosted artifact storage",
    state: "Not enabled",
    tone: "disabled",
    body: "No hosted artifact upload, customer artifact storage, billing, or production Cloud provisioning is enabled.",
  },
] satisfies CloudStatusCard[];

export const CLOUD_ROADMAP = [
  {
    period: "Now",
    state: "shipped",
    title: "Waitlist capture",
    body: "Collects the minimum context needed to understand review workflows without asking for artifacts.",
  },
  {
    period: "Now",
    state: "shipped",
    title: "Branded confirmation/internal emails",
    body: "Resend sends a user confirmation and an internal notification with safety copy and plain-text fallbacks.",
  },
  {
    period: "Now",
    state: "shipped",
    title: "Evidence Hub local preview",
    body: "Runs in the browser for local OpenPawl evidence inspection; CodePawl does not receive artifact contents.",
  },
  {
    period: "Now",
    state: "shipped",
    title: "Marketplace/OpenPawl support routes",
    body: "Public support, install, docs, and Marketplace webhook routes are live for the first supported surface.",
  },
  {
    period: "Now",
    state: "shipped",
    title: "Privacy-safe copy and smoke-tested webhook behavior",
    body: "Cloud pages state the local-only preview clearly, and the Marketplace webhook rejects GET with Allow: POST.",
  },
  {
    period: "Next",
    state: "planned",
    title: "Private hosted review intake",
    body: "Invite selected waitlist teams to review redacted OpenPawl evidence workflows before any broad Cloud launch.",
  },
  {
    period: "Next",
    state: "planned",
    title: "Reviewer inbox for OpenPawl run evidence",
    body: "Prototype an inbox for maintainers to triage submitted run evidence and review context.",
  },
  {
    period: "Next",
    state: "planned",
    title: "PR evidence summaries",
    body: "Map OpenPawl run evidence into concise pull-request review summaries without claiming autonomous approval.",
  },
  {
    period: "Next",
    state: "planned",
    title: "Basic run quality scoring",
    body: "Add simple, explainable scoring around plan completeness, validation results, and trace evidence.",
  },
  {
    period: "Next",
    state: "planned",
    title: "Manual approval workflow",
    body: "Design maintainer-controlled approval steps for hosted evidence review conversations.",
  },
  {
    period: "Later",
    state: "planned",
    title: "Team workspaces",
    body: "Group reviewers, projects, and evidence-review settings after private intake proves the workflow.",
  },
  {
    period: "Later",
    state: "planned",
    title: "Persistent evidence records with explicit consent",
    body: "Consider stored evidence records only with clear consent, retention rules, and artifact-handling controls.",
  },
  {
    period: "Later",
    state: "planned",
    title: "TracePawl hosted viewer",
    body: "Explore a hosted viewer for deeper trace inspection once Cloud Evidence review primitives are stable.",
  },
  {
    period: "Later",
    state: "planned",
    title: "Organization audit trails",
    body: "Record review decisions, approvals, and evidence changes for organization-level accountability.",
  },
  {
    period: "Later",
    state: "planned",
    title: "Status/incident history after Cloud beta is real",
    body: "Publish real operational status and incident history only after hosted Cloud beta infrastructure exists.",
  },
] satisfies CloudRoadmapItem[];

export const CLOUD_UPDATE_LOG = [
  {
    date: "2026-06-12",
    title: "Waitlist opened",
    body: "The Cloud Evidence waitlist is live for teams that want hosted OpenPawl evidence review workflows.",
  },
  {
    date: "2026-06-12",
    title: "Evidence Hub preview live",
    body: "The local/browser-only Evidence Hub preview is available without uploading or storing artifact contents.",
  },
  {
    date: "2026-06-12",
    title: "Resend email flow connected",
    body: "Waitlist submissions send branded user confirmations and internal notifications through Resend.",
  },
  {
    date: "2026-06-12",
    title: "Status roadmap published",
    body: "The public roadmap now separates live waitlist/email work, local-only preview work, upcoming hosted review, and disabled storage.",
  },
  {
    date: "2026-06-12",
    title: "Hosted review intake planned",
    body: "Private hosted review intake is planned next; hosted Cloud Evidence is still not generally available.",
  },
] satisfies CloudUpdateLogItem[];
