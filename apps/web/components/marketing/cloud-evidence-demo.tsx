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

export const DEMO_EVIDENCE_RUN: EvidenceRunViewModel = {
  runId: "run_demo_openpawl_v051",
  status: "success",
  readiness: "ready",
  validation: "passed",
  mode: "dry-run",
  schemaVersion: "1",
  source: "Static demo fixture based on Openpawl v0.5.1 artifact contracts",
  actionsUrl: "https://github.com/codepawl/openpawl/actions",
  reportPath: ".codepawl/runs/run_demo_openpawl_v051/report.md",
  tracePath: ".codepawl/runs/run_demo_openpawl_v051/trace.json",
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
      description: "Reviewable patch intent. This demo stores no user code.",
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
    { label: "Run ID", value: "run_demo_openpawl_v051" },
    { label: "Mode", value: "dry-run" },
    { label: "Status", value: "success" },
    { label: "Readiness", value: "ready" },
    { label: "Validation", value: "passed" },
    { label: "schemaVersion", value: "1" },
    { label: "Provider calls", value: "0 demo calls" },
    { label: "Artifact root", value: ".codepawl/runs/run_demo_openpawl_v051/" },
  ],
} as const;

export function CloudEvidenceDemo({ run = DEMO_EVIDENCE_RUN }: { run?: EvidenceRunViewModel }) {
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
              <h2 className="cp-h3 mt-2 text-fg-1">Demo run summary</h2>
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
            customer artifact intake, no billing, no organization RBAC, and no
            production Cloud provisioning.
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
          <h2 className="cp-h3 mt-2 text-fg-1">Static fixture files</h2>
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
            body={`## Evidence Summary

- Run ID: ${run.runId}
- Mode: ${run.mode}
- Status: ${run.status}
- Readiness: ${run.readiness}
- Validation: ${run.validation}
- schemaVersion: ${run.schemaVersion}
- Report path: ${run.reportPath}
- Trace path: ${run.tracePath}

This demo report is static and does not include customer prompts, repository code, traces, logs, or uploaded artifacts.`}
          />
          <ArtifactPanel
            id="run-demo"
            title="run.json"
            body={JSON.stringify(
              {
                schemaVersion: run.schemaVersion,
                runId: run.runId,
                mode: run.mode,
                status: run.status,
                readiness: run.readiness,
                validation: run.validation,
                artifactCount: run.artifacts.length,
              },
              null,
              2,
            )}
          />
          <ArtifactPanel
            id="trace-demo"
            title="trace.json"
            body={JSON.stringify(
              {
                schemaVersion: run.schemaVersion,
                runId: run.runId,
                providerCalls: 0,
                events: [
                  "demo_fixture_loaded",
                  "evidence_summary_rendered",
                  "artifact_list_rendered",
                ],
              },
              null,
              2,
            )}
          />
          <ArtifactPanel
            id="patch-plan-demo"
            title="patch-plan.json"
            body={JSON.stringify(
              {
                schemaVersion: run.schemaVersion,
                runId: run.runId,
                patches: [],
                note: "Static demo. No repository code or generated patch content is stored.",
              },
              null,
              2,
            )}
          />
          <ArtifactPanel
            id="selected-files-demo"
            title="selected-files.json"
            body={JSON.stringify(
              {
                schemaVersion: run.schemaVersion,
                runId: run.runId,
                selectedFiles: ["demo/path-only-reference.ts"],
              },
              null,
              2,
            )}
          />
          <ArtifactPanel
            id="applied-files-demo"
            title="applied-files.json"
            body={JSON.stringify(
              {
                schemaVersion: run.schemaVersion,
                runId: run.runId,
                appliedFiles: [],
                writeMode: "not used in this read-only demo",
              },
              null,
              2,
            )}
          />
        </div>
      </section>
    </article>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="cp-caption text-fg-3">{label}</p>
      <p className="cp-h4 mt-1 break-words text-fg-1">{value}</p>
    </div>
  );
}

function ArtifactPanel({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <section id={id} className="cp-card border-ink-4 bg-ink-1 block-shadow-sm border-2 p-6">
      <div className="flex flex-col gap-2 border-b border-ink-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="cp-h3 text-fg-1">{title}</h3>
        <span className="product-badge-soon">demo fixture</span>
      </div>
      <pre className="border-ink-5 bg-code-bg cp-code mt-5 overflow-x-auto border p-4 text-fg-5">
        <code>{body}</code>
      </pre>
    </section>
  );
}
