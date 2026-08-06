# Make the GitHub repo public

Do this after the public files are on `main`.

Do not make the repo public and publish the first release at the same time.
Make the repo public first. Check it while signed out. Publish later.

## Repo profile

Use this description:

> An agent that just works.

Use these topics:

```text
ai-agents
browser-automation
cli
codex
coding-agent
developer-tools
local-first
typescript
```

Leave the homepage empty until Orynt has a site that someone will keep up to
date.

After the docs are on `main`, update the profile:

```bash
gh repo edit codepawl/orynt \
  --description "An agent that just works." \
  --add-topic ai-agents \
  --add-topic browser-automation \
  --add-topic cli \
  --add-topic codex \
  --add-topic coding-agent \
  --add-topic developer-tools \
  --add-topic local-first \
  --add-topic typescript
```

Do not use `autonomous`, `computer use`, `production ready`, or `self
improving` in the repo description.

## Before going public

- [ ] Put the final public files on `main`.
- [ ] Run `bun release:check`.
- [ ] Run `bun release:audit`.
- [ ] Scan the full Git history for secrets.
- [ ] Read old GitHub Actions logs and check old artifacts.
- [ ] Check `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `assets/PROVENANCE.md`.
- [ ] Confirm that every public image can be shared.
- [ ] Review repo members and deploy keys.
- [ ] Review webhooks, variables, environments, and Actions secrets.
- [ ] Review every branch, tag, release, package, wiki page, and discussion.
- [ ] Turn on private security reports.

## GitHub settings

- [ ] Keep `main` as the default branch.
- [ ] Keep normal Actions permissions read only.
- [ ] Ask before running a first time contributor's workflow.
- [ ] Require pull requests for `main`.
- [ ] Require the Quality and CodeQL checks.
- [ ] Block force pushes and branch deletion.
- [ ] Protect tags that match `v*`.
- [ ] Turn on Dependabot alerts and security updates.
- [ ] Turn on secret scanning and push protection.
- [ ] Turn on code scanning.
- [ ] Turn on Issues.
- [ ] Keep Discussions and Projects off until someone owns them.
- [ ] Keep the wiki off unless it has a clear job.
- [ ] Require a reviewer for the `release` environment.
- [ ] Keep release secrets inside the `release` environment.

## Change visibility

Read GitHub's warning before changing visibility.

Change the setting by hand in GitHub. Do not put this step in a script.

## Check the public repo

Sign out of GitHub or use a private browser window.

- [ ] The tagline is correct.
- [ ] The topics are correct.
- [ ] GitHub shows Apache 2.0 as the license.
- [ ] All README links work.
- [ ] The bug and feature forms open.
- [ ] The pull request template appears.
- [ ] Security reports open a private form.
- [ ] Quality and CodeQL pass on the public commit.
- [ ] No private names, paths, screenshots, logs, or files are visible.

Only create the first release after this check passes.
