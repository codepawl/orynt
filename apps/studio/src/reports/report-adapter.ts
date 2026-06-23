import {
  isCodePawlReport,
  type CodePawlChangedFile,
  type CodePawlReport,
  type CodePawlRiskItem,
  type CodePawlValidationEvidence,
} from "./report-schema";
import {
  type EvidenceStatus,
  type SessionFixture,
  type Verdict,
} from "../fixtures/studio-fixtures";

export type ReportDataStatus = "report-backed" | "empty" | "malformed";

export interface ReportDataState {
  status: ReportDataStatus;
  sessions: [SessionFixture, ...SessionFixture[]] | [];
  errors: string[];
  sourceLabel: string;
  statusMessage: string;
  bridgeNote: string;
}

const bridgeNote =
  "Static generated report samples are bundled for now. Live local loading from .codepawl/reports will require a later daemon, Tauri, or local file bridge because browser Studio cannot read arbitrary project files at runtime.";

export function buildReportDataState(inputs: unknown[]): ReportDataState {
  if (inputs.length === 0) {
    return {
      status: "empty",
      sessions: [],
      errors: ["No report JSON found in the bundled Studio fixture list."],
      sourceLabel: "Existing Studio fixture fallback",
      statusMessage: "No report JSON found. Studio is showing the existing fixture UI fallback.",
      bridgeNote,
    };
  }

  const errors: string[] = [];
  const reports: CodePawlReport[] = [];

  inputs.forEach((input, index) => {
    if (isCodePawlReport(input)) {
      reports.push(input);
    } else {
      errors.push(`Malformed report data at fixture index ${index}.`);
    }
  });

  const sessions = reports.map(adaptCodePawlReport);
  if (sessions.length === 0) {
    return {
      status: "malformed",
      sessions: [],
      errors,
      sourceLabel: "Existing Studio fixture fallback",
      statusMessage: "Malformed report data. Studio is showing the existing fixture UI fallback.",
      bridgeNote,
    };
  }

  return {
    status: errors.length > 0 ? "malformed" : "report-backed",
    sessions: sessions as [SessionFixture, ...SessionFixture[]],
    errors,
    sourceLabel: "Generated CodePawl report JSON samples",
    statusMessage:
      errors.length > 0
        ? "Some report JSON samples are malformed. Valid reports are shown and the fixture fallback remains available."
        : "Rendering generated CodePawl report JSON through the Studio adapter.",
    bridgeNote,
  };
}

export function adaptCodePawlReport(report: CodePawlReport): SessionFixture {
  const failedEvidence = report.validation_evidence.find((item) => item.status === "failed");
  const firstMissing = report.missing_evidence[0];
  const firstRisk = report.risks[0];
  const nextAction = report.next_actions[0] ?? "Review report evidence";

  return {
    id: report.session.id,
    session: `${report.agent} - ${report.session.summary}`,
    agent: report.agent,
    project: report.project.name,
    branch: report.branch,
    reportId: report.id,
    changedFileCount: report.changed_files.length,
    verdict: report.verdict,
    verdictLabel: verdictLabel(report.verdict),
    reason: reportReason(report, failedEvidence, firstMissing, firstRisk),
    summary: report.summary,
    nextAction,
    changedFiles: report.changed_files.map((file) => ({
      path: file.path,
      scope: fileScope(file, report.risks),
    })),
    validationEvidence: report.validation_evidence.map(adaptValidationEvidence),
    risks: report.risks.map((risk) => ({
      severity: riskSeverity(risk.severity),
      title: risk.title,
      detail: `${risk.detail} Evidence: ${risk.evidence_refs.join(", ")}.`,
    })),
    timeline: [
      {
        time: formatReportTime(report.created_at),
        title: "Report generated",
        detail: `${report.session.source} source produced ${report.changed_files.length} changed file record(s).`,
      },
      {
        time: formatReportTime(report.created_at),
        title: verdictLabel(report.verdict),
        detail: reportReason(report, failedEvidence, firstMissing, firstRisk),
      },
    ],
    auditTrail: auditTrail(report),
    aiDiagnosis: `Deterministic report summary: ${report.summary}`,
    followUpPrompt: report.follow_up_prompt,
    memoryCandidate: report.memory_candidates[0] ?? "No memory candidate suggested by this report.",
  };
}

function reportReason(
  report: CodePawlReport,
  failedEvidence: CodePawlValidationEvidence | undefined,
  firstMissing: CodePawlReport["missing_evidence"][number] | undefined,
  firstRisk: CodePawlRiskItem | undefined,
) {
  if (failedEvidence) return `${failedEvidence.check} evidence failed: ${failedEvidence.summary}`;
  if (firstRisk) return firstRisk.detail;
  if (firstMissing) return firstMissing.expected;
  if (report.verdict === "verified") return "Required evidence is present and no deterministic risk is detected.";
  return report.summary;
}

function adaptValidationEvidence(item: CodePawlValidationEvidence) {
  return {
    check: item.check,
    status: item.status satisfies EvidenceStatus,
    evidence: `${item.source} - ${item.summary}`,
  };
}

function auditTrail(report: CodePawlReport): SessionFixture["auditTrail"] {
  const validationItems = report.validation_evidence.map((item) => ({
    status: item.status satisfies EvidenceStatus,
    detail: item.summary,
    evidence: item.source,
  }));

  const missingItems = report.missing_evidence.map((item) => ({
    status: "required" as const,
    detail: item.expected,
    evidence: item.evidence_ref,
  }));

  if (validationItems.length === 0 && missingItems.length === 0) {
    return [
      {
        status: "missing",
        detail: "No validation evidence is attached to this report.",
        evidence: "report.validation_evidence",
      },
    ];
  }

  return [...validationItems, ...missingItems];
}

function fileScope(file: CodePawlChangedFile, risks: CodePawlRiskItem[]): SessionFixture["changedFiles"][number]["scope"] {
  const relatedRisk = risks.find((risk) => risk.detail.includes(file.path));
  if (!relatedRisk) return "in_scope";
  if (relatedRisk.severity === "Blocker" || relatedRisk.title.toLowerCase().includes("protected")) return "protected";
  return "suspicious";
}

function riskSeverity(severity: string): SessionFixture["risks"][number]["severity"] {
  if (severity === "Blocker") return "Blocker";
  if (severity === "High") return "High";
  if (severity === "Medium") return "Medium";
  return "Low";
}

function verdictLabel(verdict: Verdict) {
  return verdict
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatReportTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "report";
  return date.toISOString().slice(11, 16);
}

