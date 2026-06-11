import { createRoute } from "@tanstack/react-router";

import {
  BulletList,
  CodeBlock,
  InfoCard,
  InlineLink,
  OPENPAWL_INSTALL_DOC,
  OPENPAWL_RELEASE,
  OPENPAWL_RELEASE_URL,
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
          "Install the Openpawl GitHub Action from the verified v0.5.1 public release tag.",
      },
    ],
  }),
  component: OpenpawlInstallPage,
});

function OpenpawlInstallPage() {
  return (
    <PageShell
      eyebrow="openpawl / install"
      title="Install Openpawl from the public Action release."
      lead="Openpawl is a public dry-run-first GitHub Action candidate. Pin the verified v0.5.1 release tag for Action installs while the GitHub Marketplace listing remains pending."
    >
      <InfoCard title="Pinned release workflow">
        <CodeBlock>{`jobs:
  openpawl:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - uses: codepawl/openpawl@v0.5.1
        with:
          task: "review changes and suggest improvements"
          mode: "dry-run"
          repo-path: "."`}</CodeBlock>
        <p>
          The public release is{" "}
          <InlineLink href={OPENPAWL_RELEASE_URL}>{OPENPAWL_RELEASE}</InlineLink>.
          This page does not claim that the GitHub Marketplace listing is live.
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
          verified release tag:{" "}
          <InlineLink href={OPENPAWL_INSTALL_DOC}>OPENPAWL_INSTALL.md</InlineLink>.
        </p>
      </InfoCard>
    </PageShell>
  );
}
