"use client";

import { useState } from "react";

import {
  CLOUD_EVIDENCE_ACCEPTED_FILES,
  type CloudEvidenceArtifactSet,
  type CloudEvidenceValidationIssue,
  type CloudEvidenceValidationResult,
  parseCloudEvidenceArtifactBundle,
  validateCloudEvidenceArtifactSet,
} from "@/lib/cloud-evidence-artifacts";

export type EvidenceArtifact = {
  name: string;
  kind: "report" | "trace" | "run" | "patch-plan" | "selected-files" | "applied-files";
  description: string;
  demoAnchor: string;
};

export type EvidenceRunViewModel = {
  runId: string;
  status: "success" | "failure";
  readiness: "ready" | "unsupported";
  validation: "passed" | "failed" | "not-run";
  mode: "dry-run" | "write";
  schemaVersion: "1";
  source: string;
  actionsUrl: string;
  reportPath: string;
  tracePath: string;
  artifacts: ReadonlyArray<EvidenceArtifact>;
  summary: ReadonlyArray<{ label: string; value: string }>;
};

type PreviewState =
  | { status: "idle" }
  | { status: "valid"; run: EvidenceRunViewModel; artifacts: CloudEvidenceArtifactSet }
  | { status: "invalid"; result: Extract<CloudEvidenceValidationResult, { ok: false }> };

const DEMO_RUN_ID = "run_demo_openpawl_v051";

export const DEMO_EVIDENCE_ARTIFACT_SET = {
  "run.json": {
    schemaVersion: "1",
    runId: DEMO_RUN_ID,
    success: true,
    mode: "dry-run",
    error: null,
    durationMs: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    validationMaxRetries: 0,
    validationRetryAttempt: 0,
    readiness: {
      status: "ready",
      reasons: ["Static demo fixture for the upcoming Evidence Hub."],
      blockers: [],
      warnings: [],
    },
    writeSummary: {
      attempted: 0,
      created: 0,
      skipped: 0,
      rejected: 0,
    },
    filesCreated: [],
    filesSkipped: [],
    filesRejected: [],
  },
  "trace.json": {
    schemaVersion: "1",
    traceId: DEMO_RUN_ID,
    runId: DEMO_RUN_ID,
    totalDurationMs: 0,
    stepCount: 0,
    llmCallsCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    events: [],
    steps: [],
  },
  "patch-plan.json": {
    schemaVersion: "1",
    runId: DEMO_RUN_ID,
    rationale: "Static demo. No repository code or generated patch content is stored.",
    chunks: [],
    groundingNotes: ["Demo fixture only; no customer artifact intake is enabled."],
    rejectedChunks: [],
  },
  "selected-files.json": {
    schemaVersion: "1",
    runId: DEMO_RUN_ID,
    selectedFiles: [
      {
        path: "demo/path-only-reference.ts",
        reason: "Path-only demo reference.",
        content: "[redacted demo placeholder]",
      },
    ],
  },
  "applied-files.json": {
    schemaVersion: "1",
    runId: DEMO_RUN_ID,
    attempted: 0,
    created: [],
    skipped: [],
    rejected: [],
  },
  "report.md": `## Evidence Summary

- Run ID: ${DEMO_RUN_ID}
- Mode: dry-run
- Status: success
- Readiness: ready
- Validation: passed
- schemaVersion: 1
- Report path: .codepawl/runs/${DEMO_RUN_ID}/report.md
- Trace path: .codepawl/runs/${DEMO_RUN_ID}/trace.json

This demo report is static and does not include customer prompts, repository code, traces, logs, or uploaded artifacts.`,
} as const satisfies CloudEvidenceArtifactSet;

const DEMO_EVIDENCE_VALIDATION = validateDemoEvidenceArtifactSet();

export const DEMO_EVIDENCE_RUN = createEvidenceRunViewModel({
  artifacts: DEMO_EVIDENCE_VALIDATION.artifacts,
  runId: DEMO_EVIDENCE_VALIDATION.runId,
  schemaVersion: DEMO_EVIDENCE_VALIDATION.schemaVersion,
  source: "Static demo fixture based on Openpawl v0.5.1 artifact contracts",
  reportPath: `.codepawl/runs/${DEMO_RUN_ID}/report.md`,
  tracePath: `.codepawl/runs/${DEMO_RUN_ID}/trace.json`,
});

export function CloudEvidenceDemo({ run = DEMO_EVIDENCE_RUN }: { run?: EvidenceRunViewModel }) {
  const [previewText, setPreviewText] = useState("");
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: "idle",
  });

  function validatePreview(text: string) {
    const result = parseCloudEvidenceArtifactBundle(text);

    if (!result.ok) {
      setPreviewState({ status: "invalid", result });
      return;
    }

    setPreviewState({
      status: "valid",
      run: createEvidenceRunViewModel({
        artifacts: result.artifacts,
        runId: result.runId,
        schemaVersion: result.schemaVersion,
        source: "Local browser-only artifact preview",
        reportPath: `local-preview/${result.runId}/report.md`,
        tracePath: `local-preview/${result.runId}/trace.json`,
      }),
      artifacts: result.artifacts,
    });
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setPreviewText(text);
    validatePreview(text);
  }

  return (
    <article className="mx-auto max-w-[1240px] px-6 py-20">
      <p className="cp-marker mb-6">cloud / evidence hub demo</p>
      <h1 className="cp-h1 max-w-4xl text-fg-1">
        Read-only evidence review for Openpawl runs.
      </h1>
      <p className="cp-lead mt-6 max-w-3xl text-fg-2">
        CodePawl Cloud Evidence Hub is upcoming. This demo shows the intended
        artifact review experience.
      </p>
      <p className="cp-body mt-4 max-w-3xl text-fg-2">
        The page uses static demo fixtures only. It does not upload, store, or
        process real repository code, prompts, traces, artifacts, billing data,
        or customer workspaces.
      </p>
      <p className="cp-body mt-4 max-w-3xl text-fg-2">
        Future intake is designed around six Openpawl v1 artifacts only:{" "}
        <code className="cp-inline-code">{CLOUD_EVIDENCE_ACCEPTED_FILES.join(", ")}</code>.
        Artifacts must be redacted before submission. Upload controls are not
        enabled in this checkpoint.
      </p>

      <EvidenceRunContent
        run={run}
        artifacts={DEMO_EVIDENCE_VALIDATION.artifacts}
        artifactBadge="demo fixture"
        artifactListTitle="Static fixture files"
        heading="Demo run summary"
      />

      <LocalPreviewPanel
        previewText={previewText}
        previewState={previewState}
        onPreviewTextChange={(text) => {
          setPreviewText(text);
          setPreviewState({ status: "idle" });
        }}
        onValidate={() => validatePreview(previewText)}
        onFileChange={onFileChange}
      />
    </article>
  );
}

function LocalPreviewPanel({
  previewText,
  previewState,
  onPreviewTextChange,
  onValidate,
  onFileChange,
}: {
  previewText: string;
  previewState: PreviewState;
  onPreviewTextChange: (text: string) => void;
  onValidate: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section
      id="local-preview"
      className="border-ink-4 mt-12 border-t-2 pt-10"
      aria-labelledby="local-preview-heading"
    >
      <p className="cp-marker mb-6">browser-only preview</p>
      <h2 id="local-preview-heading" className="cp-h2 max-w-3xl text-fg-1">
        Preview your artifact bundle locally.
      </h2>
      <p className="cp-lead mt-4 max-w-3xl text-fg-2">
        Local preview only. Artifact contents are not uploaded or stored.
      </p>
      <p className="cp-body mt-4 max-w-3xl text-fg-2">
        Paste a JSON bundle or choose a local JSON file. Validation runs in this
        browser using the same static artifact contract helper as the demo, and
        no artifact contents are sent to CodePawl servers.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="cp-card border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="cp-caption text-fg-3">Local artifact JSON bundle</span>
              <textarea
                rows={12}
                value={previewText}
                onChange={(event) => onPreviewTextChange(event.target.value)}
                placeholder={`{"run.json": {...}, "trace.json": {...}, "patch-plan.json": {...}, "selected-files.json": {...}, "applied-files.json": {...}, "report.md": "..."}`}
                className="cp-control cp-code border-ink-5 bg-code-bg text-fg-5 placeholder:text-fg-4 focus:border-ratchet border p-3 focus:outline-none"
              />
            </label>
            <label className="grid gap-2">
              <span className="cp-caption text-fg-3">Or choose local JSON file</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={onFileChange}
                className="cp-control cp-body border-ink-5 bg-ink-2 text-fg-1 file:bg-ink-4 file:text-ink-1 file:border-0 file:px-3 file:py-2 border p-2"
              />
            </label>
            <button
              type="button"
              onClick={onValidate}
              className="cp-button bg-ratchet text-ink-0 hover:bg-ratchet-hot inline-flex w-fit items-center justify-center px-6 py-3 transition-colors"
            >
              Validate local preview
            </button>
          </div>
        </div>

        <PreviewResult previewState={previewState} />
      </div>
    </section>
  );
}

function PreviewResult({ previewState }: { previewState: PreviewState }) {
  if (previewState.status === "idle") {
    return (
      <div className="cp-card border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
        <p className="cp-caption text-ratchet">Validation</p>
        <h3 className="cp-h3 mt-2 text-fg-1">Waiting for local input</h3>
        <p className="cp-body mt-4 text-fg-2">
          Paste or select a bundle, then validate it in the browser. No upload
          request is made.
        </p>
      </div>
    );
  }

  if (previewState.status === "invalid") {
    return (
      <div className="cp-card border-danger bg-ink-1 block-shadow-sm border-2 p-6">
        <p className="cp-caption text-danger">
          {previewState.result.status === "blocked" ? "blocked" : "rejected"}
        </p>
        <h3 className="cp-h3 mt-2 text-fg-1">Preview validation failed</h3>
        <ul className="mt-5 grid gap-3">
          {previewState.result.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.artifact ?? "bundle"}-${index}`}>
              <ValidationIssue issue={issue} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="cp-card border-success bg-ink-1 block-shadow-sm border-2 p-6">
        <p className="cp-caption text-success">accepted locally</p>
        <h3 className="cp-h3 mt-2 text-fg-1">Valid local artifact preview</h3>
        <p className="cp-body mt-4 text-fg-2">
          The bundle passed browser-side validation. It has not been uploaded,
          stored, or shared with CodePawl.
        </p>
      </div>
      <EvidenceRunContent
        run={previewState.run}
        artifacts={previewState.artifacts}
        artifactBadge="local preview"
        artifactListTitle="Local fixture files"
        heading="Local run summary"
      />
    </div>
  );
}

function ValidationIssue({ issue }: { issue: CloudEvidenceValidationIssue }) {
  return (
    <div className="border-ink-4 bg-ink-0 border p-3">
      <p className="cp-caption text-danger">
        {issue.artifact ? `${issue.artifact} / ${issue.code}` : issue.code}
      </p>
      <p className="cp-small mt-1 text-fg-2">{issue.message}</p>
    </div>
  );
}

function EvidenceRunContent({
  run,
  artifacts,
  artifactBadge,
  artifactListTitle,
  heading,
}: {
  run: EvidenceRunViewModel;
  artifacts: CloudEvidenceArtifactSet;
  artifactBadge: string;
  artifactListTitle: string;
  heading: string;
}) {
  return (
    <>
      <section className="border-ink-4 mt-12 grid gap-6 border-y-2 py-6 md:grid-cols-4">
        <SummaryStat label="Run ID" value={run.runId} />
        <SummaryStat label="Mode" value={run.mode} />
        <SummaryStat label="Readiness" value={run.readiness} />
        <SummaryStat label="schemaVersion" value={run.schemaVersion} />
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="cp-card border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
          <div className="flex flex-col gap-3 border-b border-ink-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="cp-caption text-ratchet">Evidence Summary</p>
              <h2 className="cp-h3 mt-2 text-fg-1">{heading}</h2>
            </div>
            <span className="product-badge-active">{run.status}</span>
          </div>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            {run.summary.map((item) => (
              <div key={item.label} className="border-ink-4 border-t pt-3">
                <dt className="cp-caption text-fg-3">{item.label}</dt>
                <dd className="cp-small mt-1 break-words text-fg-1">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="cp-card border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
          <p className="cp-caption text-ratchet">Cloud status</p>
          <h2 className="cp-h3 mt-2 text-fg-1">Upcoming, waitlist-only</h2>
          <p className="cp-body mt-4 text-fg-2">
            This is a read-only design and engineering skeleton. There is no
            server-side artifact upload, no customer artifact storage, no
            billing, no organization RBAC, and no production Cloud provisioning.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <a
              href="/contact"
              className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-4 px-5 py-3 text-ink-1 transition-colors hover:bg-ratchet focus:outline-none focus:ring-4 focus:ring-ratchet/20"
            >
              Join Cloud waitlist
            </a>
            <a
              href="/openpawl/install"
              className="cp-hover-button cp-button inline-flex items-center justify-center border-2 border-ink-4 bg-ink-1 px-5 py-3 text-fg-1 transition-colors hover:bg-ink-2 focus:outline-none focus:ring-4 focus:ring-ratchet/20"
            >
              Install Openpawl
            </a>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="cp-card border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
          <p className="cp-caption text-ratchet">Artifact list</p>
          <h2 className="cp-h3 mt-2 text-fg-1">{artifactListTitle}</h2>
          <ul className="mt-6 grid gap-3">
            {run.artifacts.map((artifact) => (
              <li key={artifact.name}>
                <a
                  href={`#${artifact.demoAnchor}`}
                  className="cp-hover-contained border-ink-4 bg-ink-0 grid gap-1 border p-3 transition-colors"
                >
                  <span className="cp-link text-fg-1">{artifact.name}</span>
                  <span className="cp-small text-fg-3">{artifact.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-6">
          <ArtifactPanel
            id="report-demo"
            title="report.md"
            body={artifacts["report.md"]}
            badge={artifactBadge}
          />
          <ArtifactPanel
            id="run-demo"
            title="run.json"
            body={formatArtifact(artifacts, "run.json")}
            badge={artifactBadge}
          />
          <ArtifactPanel
            id="trace-demo"
            title="trace.json"
            body={formatArtifact(artifacts, "trace.json")}
            badge={artifactBadge}
          />
          <ArtifactPanel
            id="patch-plan-demo"
            title="patch-plan.json"
            body={formatArtifact(artifacts, "patch-plan.json")}
            badge={artifactBadge}
          />
          <ArtifactPanel
            id="selected-files-demo"
            title="selected-files.json"
            body={formatArtifact(artifacts, "selected-files.json")}
            badge={artifactBadge}
          />
          <ArtifactPanel
            id="applied-files-demo"
            title="applied-files.json"
            body={formatArtifact(artifacts, "applied-files.json")}
            badge={artifactBadge}
          />
        </div>
      </section>
    </>
  );
}

function createEvidenceRunViewModel(input: {
  artifacts: CloudEvidenceArtifactSet;
  runId: string;
  schemaVersion: "1";
  source: string;
  reportPath: string;
  tracePath: string;
}): EvidenceRunViewModel {
  const runArtifact = input.artifacts["run.json"] as {
    success?: unknown;
    mode?: unknown;
    readiness?: { status?: unknown };
    validationDecision?: unknown;
  };
  const traceArtifact = input.artifacts["trace.json"] as { llmCallsCount?: unknown };
  const mode = runArtifact.mode === "write" ? "write" : "dry-run";
  const readiness = runArtifact.readiness?.status === "unsupported" ? "unsupported" : "ready";
  const validation = runArtifact.validationDecision ? "passed" : "not-run";
  const status = runArtifact.success === false ? "failure" : "success";
  const providerCalls =
    typeof traceArtifact.llmCallsCount === "number"
      ? `${traceArtifact.llmCallsCount} calls`
      : "unknown";

  return {
    runId: input.runId,
    status,
    readiness,
    validation,
    mode,
    schemaVersion: input.schemaVersion,
    source: input.source,
    actionsUrl: "https://github.com/codepawl/openpawl/actions",
    reportPath: input.reportPath,
    tracePath: input.tracePath,
    artifacts: [
      {
        name: "report.md",
        kind: "report",
        description: "Human-readable Evidence Summary and review output.",
        demoAnchor: "report-demo",
      },
      {
        name: "trace.json",
        kind: "trace",
        description: "Trace metadata for the run timeline and provider-call count.",
        demoAnchor: "trace-demo",
      },
      {
        name: "run.json",
        kind: "run",
        description: "Run status, readiness, validation, mode, and schemaVersion.",
        demoAnchor: "run-demo",
      },
      {
        name: "patch-plan.json",
        kind: "patch-plan",
        description: "Reviewable patch intent. This preview stores no user code.",
        demoAnchor: "patch-plan-demo",
      },
      {
        name: "selected-files.json",
        kind: "selected-files",
        description: "Selected file references from the run plan.",
        demoAnchor: "selected-files-demo",
      },
      {
        name: "applied-files.json",
        kind: "applied-files",
        description: "Applied file metadata for guarded write-mode reviews.",
        demoAnchor: "applied-files-demo",
      },
    ],
    summary: [
      { label: "Run ID", value: input.runId },
      { label: "Mode", value: mode },
      { label: "Status", value: status },
      { label: "Readiness", value: readiness },
      { label: "Validation", value: validation },
      { label: "schemaVersion", value: input.schemaVersion },
      { label: "Provider calls", value: providerCalls },
      { label: "Artifact source", value: input.source },
    ],
  };
}

function validateDemoEvidenceArtifactSet() {
  const result = validateCloudEvidenceArtifactSet(DEMO_EVIDENCE_ARTIFACT_SET);

  if (!result.ok) {
    throw new Error(
      `Invalid Cloud Evidence demo fixture: ${result.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return result;
}

function formatArtifact(
  artifacts: CloudEvidenceArtifactSet,
  name: Exclude<keyof CloudEvidenceArtifactSet, "report.md">,
): string {
  return JSON.stringify(artifacts[name], null, 2);
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="cp-caption text-fg-3">{label}</p>
      <p className="cp-h4 mt-1 break-words text-fg-1">{value}</p>
    </div>
  );
}

function ArtifactPanel({
  id,
  title,
  body,
  badge,
}: {
  id: string;
  title: string;
  body: string;
  badge: string;
}) {
  return (
    <section id={id} className="cp-card border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
      <div className="flex flex-col gap-2 border-b border-ink-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="cp-h3 text-fg-1">{title}</h3>
        <span className="product-badge-soon">{badge}</span>
      </div>
      <pre className="border-ink-5 bg-code-bg cp-code mt-5 overflow-x-auto border p-4 text-fg-5">
        <code>{body}</code>
      </pre>
    </section>
  );
}
