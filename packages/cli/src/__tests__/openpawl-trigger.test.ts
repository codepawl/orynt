import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import {
  OPENPAWL_ADD_TESTS_TASK,
  OPENPAWL_FIX_FAILING_TESTS_TASK,
  OPENPAWL_PLAN_TASK,
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

  it("parses '@openpawl review' exactly", () => {
    const parsed = parseOpenPawlCommand("@openpawl review");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "review",
      prefix: "@",
    });
  });

  it("parses '@openpawl plan' exactly", () => {
    const parsed = parseOpenPawlCommand("  @OpenPawl   Plan  ");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "plan",
      prefix: "@",
    });
  });

  it("parses '@openpawl add tests' exactly", () => {
    const parsed = parseOpenPawlCommand("@openpawl add tests");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "add tests",
      prefix: "@",
    });
  });

  it("parses '@openpawl fix failing tests' exactly", () => {
    const parsed = parseOpenPawlCommand("@openpawl fix failing tests");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "fix failing tests",
      prefix: "@",
    });
  });

  it("does not parse unsupported command variants", () => {
    const parsed = parseOpenPawlCommand("/openpawl run");
    expect(parsed).toBeNull();
  });

  it("does not parse unsupported slash commands", () => {
    expect(parseOpenPawlCommand("/openpawl plan")).toBeNull();
    expect(parseOpenPawlCommand("/openpawl fix failing tests")).toBeNull();
  });

  it("parses slash-only apply command", () => {
    const parsed = parseOpenPawlCommand("/openpawl apply");
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      command: "apply",
      prefix: "/",
    });
  });

  it("does not parse unsupported mention commands", () => {
    expect(parseOpenPawlCommand("@openpawl run")).toBeNull();
    expect(parseOpenPawlCommand("@openpawl apply")).toBeNull();
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

  it("does not parse mention commands embedded in extra text", () => {
    const parsed = parseOpenPawlCommand("Please try @openpawl review for me.");
    expect(parsed).toBeNull();
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
      reason: "Supported Openpawl comment command detected.",
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
      reason: "Supported Openpawl comment command detected.",
      task: OPENPAWL_ADD_TESTS_TASK,
      mode: "dry-run",
      issueIsPullRequest: false,
      issueNumber: 102,
      source: "issue_comment",
    });
  });

  it.each([
    ["@openpawl review", OPENPAWL_REVIEW_TASK, true],
    ["@openpawl plan", OPENPAWL_PLAN_TASK, false],
    ["@openpawl add tests", OPENPAWL_ADD_TESTS_TASK, false],
    ["@openpawl fix failing tests", OPENPAWL_FIX_FAILING_TESTS_TASK, true],
  ])("resolves %s as a dry-run task", (body, expectedTask, isPullRequest) => {
    const resolution = resolveOpenPawlTriggerFromEvent(
      {
        action: "created",
        comment: {
          body,
          user: {
            login: "maintainer",
            type: "User",
          },
        },
        issue: {
          number: isPullRequest ? 105 : 106,
          pull_request: isPullRequest ? {} : undefined,
        },
        repository: {
          full_name: "codepawl/openpawl",
        },
      } as Record<string, unknown>,
      {
        eventName: "issue_comment",
      }
    );

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Supported Openpawl comment command detected.",
      task: expectedTask,
      mode: "dry-run",
      issueIsPullRequest: isPullRequest,
      source: "issue_comment",
    });
  });

  it("resolves maintainer /openpawl apply as an approved write run", () => {
    const resolution = resolveOpenPawlTriggerFromEvent(
      {
        action: "created",
        comment: {
          body: "/openpawl apply",
          author_association: "MEMBER",
          user: {
            login: "maintainer",
            type: "User",
          },
        },
        issue: {
          number: 108,
          title: "Add coverage for trace export",
          body: "Please create targeted regression tests.",
          pull_request: {},
        },
        repository: {
          full_name: "codepawl/openpawl",
          default_branch: "main",
        },
      } as Record<string, unknown>,
      {
        eventName: "issue_comment",
      }
    );

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Maintainer /openpawl apply command detected.",
      mode: "write",
      issueNumber: 108,
      issueIsPullRequest: true,
      approvedWrite: true,
      approvalSource: "apply_command",
      baseRef: "main",
      sourceTitle: "Add coverage for trace export",
      source: "issue_comment",
    });
    expect(resolution.task).toContain("Approved Openpawl apply for pull request #108");
    expect(resolution.task).toContain("Please create targeted regression tests.");
  });

  it("does not resolve non-maintainer /openpawl apply as a write run", () => {
    const resolution = resolveOpenPawlTriggerFromEvent(
      {
        action: "created",
        comment: {
          body: "/openpawl apply",
          author_association: "CONTRIBUTOR",
          user: {
            login: "external-user",
            type: "User",
          },
        },
        issue: {
          number: 109,
          title: "Improve docs",
          body: "Please update docs.",
        },
        repository: {
          full_name: "codepawl/openpawl",
        },
      } as Record<string, unknown>,
      {
        eventName: "issue_comment",
      }
    );

    expect(resolution).toMatchObject({
      shouldRun: false,
      reason: "/openpawl apply requires a maintainer comment author association.",
      mode: "dry-run",
      issueNumber: 109,
      issueIsPullRequest: false,
      approvedWrite: false,
      approvalSource: "none",
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
      reason: "No supported /openpawl or @openpawl command found in issue_comment body.",
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

  it("does not run for Openpawl report comments", () => {
    const resolution = resolveOpenPawlTriggerFromEvent(
      {
        action: "created",
        comment: {
          body: "# 🐾 Openpawl Agent Run Report\n\n## 📋 Task Summary",
          user: {
            login: "github-actions[bot]",
            type: "Bot",
          },
        },
        issue: {
          number: 107,
          pull_request: {},
        },
        repository: {
          full_name: "codepawl/openpawl",
        },
      } as Record<string, unknown>,
      {
        eventName: "issue_comment",
      }
    );

    expect(resolution).toMatchObject({
      shouldRun: false,
      reason: "Ignoring Openpawl report comment to prevent recursive Openpawl runs.",
      issueIsPullRequest: true,
      issueNumber: 107,
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

  it("resolves issues labeled openpawl-approved as an approved write run", () => {
    const resolution = resolveOpenPawlTriggerFromEvent(
      {
        action: "labeled",
        issue: {
          number: 202,
          title: "Add CLI smoke tests",
          body: "Generate focused CLI regression tests.",
        },
        label: {
          name: "openpawl-approved",
        },
        repository: {
          full_name: "codepawl/openpawl",
          default_branch: "main",
        },
      } as Record<string, unknown>,
      {
        eventName: "issues",
      }
    );

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Issue labeled with openpawl-approved.",
      mode: "write",
      issueIsPullRequest: false,
      issueNumber: 202,
      approvedWrite: true,
      approvalSource: "approved_label",
      baseRef: "main",
      source: "issues",
    });
    expect(resolution.task).toContain("Approved Openpawl apply for issue #202");
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

  it("resolves pull_request labeled openpawl-approved as an approved write run", () => {
    const resolution = resolveOpenPawlTriggerFromEvent(
      {
        action: "labeled",
        pull_request: {
          number: 205,
          title: "Improve patch planning",
          body: "Add quality checks for patch plans.",
          base: {
            ref: "main",
          },
          head: {
            repo: {
              full_name: "codepawl/openpawl",
            },
          },
        },
        label: {
          name: "openpawl-approved",
        },
        repository: {
          full_name: "codepawl/openpawl",
          default_branch: "main",
        },
      } as Record<string, unknown>,
      {
        eventName: "pull_request",
      }
    );

    expect(resolution).toMatchObject({
      shouldRun: true,
      reason: "Pull request labeled with openpawl-approved.",
      mode: "write",
      issueIsPullRequest: true,
      issueNumber: 205,
      approvedWrite: true,
      approvalSource: "approved_label",
      baseRef: "main",
      sourceTitle: "Improve patch planning",
      source: "pull_request",
    });
    expect(resolution.task).toContain("Approved Openpawl apply for pull request #205");
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
