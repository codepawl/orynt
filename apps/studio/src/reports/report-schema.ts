export const codePawlVerdicts = ["verified", "needs_evidence", "risky", "failed", "blocked"] as const;
export type CodePawlVerdict = (typeof codePawlVerdicts)[number];

export const codePawlChangeStatuses = ["added", "modified", "deleted", "renamed", "unknown"] as const;
export type CodePawlChangeStatus = (typeof codePawlChangeStatuses)[number];

export const codePawlValidationStatuses = ["passed", "failed", "missing"] as const;
export type CodePawlValidationStatus = (typeof codePawlValidationStatuses)[number];

export interface CodePawlProjectContext {
  name: string;
  path: string;
}

export interface CodePawlSessionContext {
  id: string;
  source: string;
  summary: string;
}

export interface CodePawlChangedFile {
  path: string;
  status: CodePawlChangeStatus;
  evidence_ref: string;
}

export interface CodePawlValidationEvidence {
  check: string;
  status: CodePawlValidationStatus;
  source: string;
  summary: string;
}

export interface CodePawlRiskItem {
  severity: string;
  title: string;
  detail: string;
  evidence_refs: string[];
}

export interface CodePawlMissingEvidence {
  check: string;
  expected: string;
  evidence_ref: string;
}

export interface CodePawlArtifact {
  kind: string;
  path: string;
}

export interface CodePawlReport {
  id: string;
  created_at: string;
  project: CodePawlProjectContext;
  session: CodePawlSessionContext;
  agent: string;
  branch: string;
  verdict: CodePawlVerdict;
  summary: string;
  changed_files: CodePawlChangedFile[];
  validation_evidence: CodePawlValidationEvidence[];
  risks: CodePawlRiskItem[];
  missing_evidence: CodePawlMissingEvidence[];
  next_actions: string[];
  follow_up_prompt: string;
  memory_candidates: string[];
  artifacts: CodePawlArtifact[];
}

export function isCodePawlVerdict(value: unknown): value is CodePawlVerdict {
  return typeof value === "string" && codePawlVerdicts.includes(value as CodePawlVerdict);
}

export function isCodePawlReport(value: unknown): value is CodePawlReport {
  if (!isRecord(value)) return false;
  if (!isCodePawlVerdict(value.verdict)) return false;
  if (!isRecord(value.project) || !isRecord(value.session)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.created_at === "string" &&
    typeof value.project.name === "string" &&
    typeof value.project.path === "string" &&
    typeof value.session.id === "string" &&
    typeof value.session.source === "string" &&
    typeof value.session.summary === "string" &&
    typeof value.agent === "string" &&
    typeof value.branch === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.changed_files) &&
    value.changed_files.every(isCodePawlChangedFile) &&
    Array.isArray(value.validation_evidence) &&
    value.validation_evidence.every(isCodePawlValidationEvidence) &&
    Array.isArray(value.risks) &&
    value.risks.every(isCodePawlRiskItem) &&
    Array.isArray(value.missing_evidence) &&
    value.missing_evidence.every(isCodePawlMissingEvidence) &&
    Array.isArray(value.next_actions) &&
    value.next_actions.every((item) => typeof item === "string") &&
    typeof value.follow_up_prompt === "string" &&
    Array.isArray(value.memory_candidates) &&
    value.memory_candidates.every((item) => typeof item === "string") &&
    Array.isArray(value.artifacts) &&
    value.artifacts.every(isCodePawlArtifact)
  );
}

function isCodePawlChangedFile(value: unknown): value is CodePawlChangedFile {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    typeof value.status === "string" &&
    codePawlChangeStatuses.includes(value.status as CodePawlChangeStatus) &&
    typeof value.evidence_ref === "string"
  );
}

function isCodePawlValidationEvidence(value: unknown): value is CodePawlValidationEvidence {
  if (!isRecord(value)) return false;
  return (
    typeof value.check === "string" &&
    typeof value.status === "string" &&
    codePawlValidationStatuses.includes(value.status as CodePawlValidationStatus) &&
    typeof value.source === "string" &&
    typeof value.summary === "string"
  );
}

function isCodePawlRiskItem(value: unknown): value is CodePawlRiskItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.severity === "string" &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    Array.isArray(value.evidence_refs) &&
    value.evidence_refs.every((item) => typeof item === "string")
  );
}

function isCodePawlMissingEvidence(value: unknown): value is CodePawlMissingEvidence {
  if (!isRecord(value)) return false;
  return (
    typeof value.check === "string" &&
    typeof value.expected === "string" &&
    typeof value.evidence_ref === "string"
  );
}

function isCodePawlArtifact(value: unknown): value is CodePawlArtifact {
  if (!isRecord(value)) return false;
  return typeof value.kind === "string" && typeof value.path === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
