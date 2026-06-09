import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import {
  OPENPAWL_ADD_TESTS_TASK,
  OPENPAWL_REVIEW_TASK,
  parseOpenPawlCommand,
  resolveOpenPawlTriggerFromEvent,
} from "../openpawl-trigger";

const FIXTURE_DIR = path.join(
  new URL(".", import.meta.url).pathname,
  "fixtures",
  "github-events"
);

async function loadGithubEventFixture(fileName: string): Promise<unknown> {
  const fixturePath = path.join(FIXTURE_DIR, fileName);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw) as unknown;
}

describe("Openpawl comment command parser", () => {
  it("parses '/openpawl review' exactly", () => {
    const parsed = parseOpenPawlCommand("/openpawl review");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "review",
    });
  });

  it("parses '/openpawl add tests' with mixed case and spaces", () => {
    const parsed = parseOpenPawlCommand("  /OpenPawl   Add   Tests  ");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "add tests",
    });
  });

  it("does not parse unsupported command variants", () => {
    const parsed = parseOpenPawlCommand("/openpawl run");
    expect(parsed).toBeNull();
  });

  it("does not parse unrelated text", () => {
    const parsed = parseOpenPawlCommand("Please run tests with /openpawl review");
    expect(parsed).toBeNull();
  });

  it("does not parse comments that embed the command in extra text", () => {
    const parsed = parseOpenPawlCommand("run /openpawl review please");
    expect(parsed).toBeNull();
  });

  it("parses a supported command on its own line", () => {
    const parsed = parseOpenPawlCommand("Hello team,\n/openpawl review\nPlease run it.");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "review",
    });
  });
});

describe("Openpawl trigger resolver with local GitHub event fixtures", () => {
  it("resolves issue_comment /openpawl review on a PR issue", async () => {
    const event = await loadGithubEventFixture("issue_comment_review_pr.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "issue_comment",
    });

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Supported /openpawl comment command detected.",
      task: OPENPAWL_REVIEW_TASK,
      mode: "dry-run",
      issueIsPullRequest: true,
      issueNumber: 101,
      source: "issue_comment",
    });
  });

  it("resolves issue_comment /openpawl add tests on issue", async () => {
    const event = await loadGithubEventFixture("issue_comment_add_tests_issue.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "issue_comment",
    });

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Supported /openpawl comment command detected.",
      task: OPENPAWL_ADD_TESTS_TASK,
      mode: "dry-run",
      issueIsPullRequest: false,
      issueNumber: 102,
      source: "issue_comment",
    });
  });

  it("does not run for unsupported /openpawl command in issue_comment", async () => {
    const event = await loadGithubEventFixture("issue_comment_unsupported.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "issue_comment",
    });

    expect(resolution).toMatchObject({
      shouldRun: false,
      reason: "No supported /openpawl command found in issue_comment body.",
      issueIsPullRequest: false,
      issueNumber: 103,
      source: "issue_comment",
    });
  });

  it("does not run for bot-authored issue_comment commands", async () => {
    const event = await loadGithubEventFixture("issue_comment_bot_review_pr.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "issue_comment",
    });

    expect(resolution).toMatchObject({
      shouldRun: false,
      reason: "Ignoring bot-authored issue_comment to prevent recursive Openpawl runs.",
      issueIsPullRequest: true,
      issueNumber: 104,
      source: "issue_comment",
    });
  });

  it("resolves issues labeled openpawl as dry-run", async () => {
    const event = await loadGithubEventFixture("issues_labeled_openpawl.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "issues",
    });

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Issue labeled with openpawl.",
      task: OPENPAWL_REVIEW_TASK,
      mode: "dry-run",
      issueIsPullRequest: false,
      issueNumber: 201,
      source: "issues",
    });
  });

  it("resolves pull_request labeled openpawl as dry-run", async () => {
    const event = await loadGithubEventFixture("pull_request_labeled_openpawl.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "pull_request",
    });

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Pull request labeled with openpawl.",
      task: OPENPAWL_REVIEW_TASK,
      mode: "dry-run",
      issueIsPullRequest: true,
      issueNumber: 203,
      source: "pull_request",
    });
  });

  it("marks forked pull_request safely by reporting mismatched head repo", async () => {
    const event = await loadGithubEventFixture("pull_request_forked_openpawl.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "pull_request",
    });

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Pull request event.",
      mode: "dry-run",
      issueIsPullRequest: true,
      issueNumber: 204,
      source: "pull_request",
    });
    expect(resolution.baseRepoFullName).toBe("codepawl/openpawl");
    expect(resolution.headRepoFullName).toBe("octo-org/forked-repo");
    expect(resolution.headRepoFullName).not.toBe(resolution.baseRepoFullName);
  });

  it("resolves workflow_dispatch from payload inputs", async () => {
    const event = await loadGithubEventFixture("workflow_dispatch_inputs.json");
    const resolution = resolveOpenPawlTriggerFromEvent(event as Record<string, unknown>, {
      eventName: "workflow_dispatch",
    });

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Manual workflow_dispatch trigger.",
      task: "Add targeted tests for the repository changes",
      repoPath: "src",
      mode: "write",
      issueIsPullRequest: false,
      source: "workflow_dispatch",
    });
  });
});
