import {
  BulletList,
  InfoCard,
  InlineLink,
  LinkGrid,
  OPENPAWL_ACTION_METADATA,
  OPENPAWL_INSTALL_DOC,
  OPENPAWL_RELEASE,
  OPENPAWL_RELEASE_URL,
  OPENPAWL_REPO,
  PageShell,
} from "./marketplace-pages";

export function OpenpawlLanding() {
  return (
    <PageShell
      eyebrow="openpawl / available now"
      title="Openpawl."
      lead="Reviewable agent work, starting in GitHub. Openpawl is an open runtime for coding-agent coordination: plans, validations, guarded changes, and traceable run evidence."
    >
      <InfoCard title="What it does today">
        <p>
          Openpawl helps coding agents plan, review, validate, hand off work,
          and leave evidence that humans and other agents can trust. The first
          supported surface is GitHub Actions.
        </p>
        <BulletList
          items={[
            "Runs dry-run review and planning workflows from GitHub Actions.",
            "Emits report.md, trace.json, run.json, patch-plan.json, selected-files.json, and applied-files.json.",
            "Posts report context to issues and pull requests when configured.",
            "Supports explicit, safety-gated beta write mode for constrained tasks.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Install and source">
        <LinkGrid
          items={[
            {
              href: "/openpawl/install",
              label: "Install Openpawl",
              body: `Use the verified ${OPENPAWL_RELEASE} public Action release tag.`,
            },
            {
              href: OPENPAWL_RELEASE_URL,
              label: `Release ${OPENPAWL_RELEASE}`,
              body: "Public GitHub release for the pinned Action ref.",
              external: true,
            },
            {
              href: OPENPAWL_REPO,
              label: "codepawl/openpawl",
              body: "Public source repository.",
              external: true,
            },
            {
              href: OPENPAWL_ACTION_METADATA,
              label: "Root action.yml",
              body: "Release-locked Action metadata.",
              external: true,
            },
          ]}
        />
      </InfoCard>

      <InfoCard title="Safety model">
        <BulletList
          items={[
            "Dry-run is the default mode.",
            "Write mode must be explicit and remains beta-constrained.",
            "Forked pull request comments and bot-authored recursive comments are skipped.",
            "Approved writes create bot branches and pull requests for review.",
          ]}
        />
      </InfoCard>

      <InfoCard title="Cloud next">
        <p>
          CodePawl Cloud is the upcoming hosted evidence and team workflow layer
          around Openpawl and future CodePawl architecture. It is waitlist-only;
          these pages do not offer Cloud billing, provisioning, memory, or
          production SLA claims.
        </p>
        <p>
          For setup details, read the{" "}
          <InlineLink href={OPENPAWL_INSTALL_DOC}>release install guide</InlineLink>
          . For help, use <InlineLink href="/openpawl/support">support</InlineLink>{" "}
          or check <InlineLink href="/status">public status</InlineLink>.
        </p>
      </InfoCard>
    </PageShell>
  );
}
