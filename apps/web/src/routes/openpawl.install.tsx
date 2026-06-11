import { createRoute } from "@tanstack/react-router";

import {
  BulletList,
  CodeBlock,
  InfoCard,
  InlineLink,
  OPENPAWL_INSTALL_DOC,
  PageShell,
} from "@/components/marketing/marketplace-pages";
import { Route as siteRoute } from "./site";

export const Route = createRoute({
  getParentRoute: () => siteRoute,
  path: "openpawl/install",
  head: () => ({
    meta: [
      { title: "Install Openpawl - GitHub Action setup" },
      {
        name: "description",
        content:
          "Install the current Openpawl GitHub Action candidate without relying on an unverified release tag.",
      },
    ],
  }),
  component: OpenpawlInstallPage,
});

function OpenpawlInstallPage() {
  return (
    <PageShell
      eyebrow="openpawl / install"
      title="Install Openpawl without overclaiming release status."
      lead="Openpawl is a public dry-run-first GitHub Action candidate. Use the current public source while the Marketplace release tag is being verified, then pin the verified release tag when it exists."
    >
      <InfoCard title="Current candidate workflow">
        <CodeBlock>{`jobs:
  openpawl:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - uses: codepawl/openpawl@main
        with:
          task: "review changes and suggest improvements"
          mode: "dry-run"
          repo-path: "."`}</CodeBlock>
        <p>
          Replace <code className="cp-inline-code">@main</code> with a verified
          release tag after the GitHub Release and Marketplace listing are live.
        </p>
      </InfoCard>

      <InfoCard title="Safety defaults">
        <BulletList
          items={[
            "Dry-run is the default mode.",
            "Write mode must be selected explicitly and still routes through Openpawl safety gates.",
            "Current beta write behavior is constrained and should be reviewed through bot branches and pull requests.",
            "Forked pull request comments and bot-authored recursive comments are skipped by the workflow path.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Artifacts">
        <p>
          Openpawl writes reports and trace artifacts in the workflow workspace,
          typically under <code className="cp-inline-code">.codepawl/runs/&lt;run-id&gt;/</code>.
        </p>
        <BulletList
          items={[
            "report.md",
            "trace.json",
            "run.json",
            "patch-plan.json",
            "selected-files.json",
            "applied-files.json",
          ]}
        />
      </InfoCard>

      <InfoCard title="Source install guide">
        <p>
          The full source guide lives in the public Openpawl repository on the
          default branch:{" "}
          <InlineLink href={OPENPAWL_INSTALL_DOC}>OPENPAWL_INSTALL.md</InlineLink>.
        </p>
      </InfoCard>
    </PageShell>
  );
}

