export const OPENPAWL_TRIGGER_LABEL = "openpawl";
export const OPENPAWL_REVIEW_TASK = "Review and analyse the changes in this repository context";
export const OPENPAWL_ADD_TESTS_TASK = "Add targeted tests for the repository changes";

type ParsedCommandName = "review" | "add tests";

export interface ParsedOpenPawlCommand {
  command: ParsedCommandName;
  task: string;
  sourceLine: string;
}

export interface OpenPawlTriggerResolution {
  shouldRun: boolean;
  reason: string;
  task: string;
  repoPath: string;
  mode: "dry-run" | "write";
  issueNumber?: number;
  issueIsPullRequest: boolean;
  baseRepoFullName?: string;
  headRepoFullName?: string;
  source: "workflow_dispatch" | "pull_request" | "issue_comment" | "issues" | "none";
}

interface GithubEventLike {
  action?: string;
  comment?: {
    body?: string;
  };
  issue?: {
    number?: number;
    pull_request?: unknown;
  };
  pull_request?: {
    number?: number;
    labels?: Array<{ name?: string }>;
    head?: {
      repo?: {
        full_name?: string;
      };
    };
  };
  label?: {
    name?: string;
  };
  repository?: {
    full_name?: string;
  };
  inputs?: {
    task?: string;
    repo_path?: string;
    mode?: string;
  };
}

const COMMAND_TASKS = new Map<string, string>([
  ["review", OPENPAWL_REVIEW_TASK],
  ["add tests", OPENPAWL_ADD_TESTS_TASK],
]);

function trimToSingleSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isLabelMatch(labelName: unknown): boolean {
  return typeof labelName === "string" && labelName.toLowerCase() === OPENPAWL_TRIGGER_LABEL;
}

function pickLabelName(payload: GithubEventLike): string | undefined {
  if (typeof payload.label?.name === "string") {
    return payload.label.name;
  }
  return undefined;
}

function getRepositoryFullName(payload: GithubEventLike, fallback?: string): string | undefined {
  if (typeof payload.repository?.full_name === "string") {
    return payload.repository.full_name;
  }
  if (fallback) {
    return fallback;
  }
  return undefined;
}

function getIssueNumber(payload: GithubEventLike): number | undefined {
  const issueNumber = payload.issue?.number;
  if (typeof issueNumber === "number" && Number.isFinite(issueNumber)) {
    return issueNumber;
  }
  return undefined;
}

function isPullRequestIssue(payload: GithubEventLike): boolean {
  return typeof payload.issue?.pull_request !== "undefined";
}

function getHeadRepo(payload: GithubEventLike): string | undefined {
  const fullName = payload.pull_request?.head?.repo?.full_name;
  return typeof fullName === "string" ? fullName : undefined;
}

export function parseOpenPawlCommand(commentBody: string): ParsedOpenPawlCommand | null {
  if (!commentBody) return null;

  const lines = commentBody.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = trimToSingleSpace(line);
    const match = /^\/openpawl(?:\s+(.*))?$/i.exec(trimmed);
    if (!match) continue;

    const commandText = match[1]?.trim() ?? "";
    const normalizedCommand = commandText.toLowerCase();
    const task = COMMAND_TASKS.get(normalizedCommand);
    if (!task) {
      continue;
    }

    return {
      command: normalizedCommand as ParsedCommandName,
      task,
      sourceLine: line,
    };
  }

  return null;
}

function fallbackCommandTask(commentBody: string): string | null {
  const command = parseOpenPawlCommand(commentBody);
  return command ? command.task : null;
}

export function resolveOpenPawlTriggerFromEvent(
  event: GithubEventLike | null | undefined,
  options: {
    eventName: string;
    workflowTask?: string;
    workflowRepoPath?: string;
    workflowMode?: "dry-run" | "write" | string;
    workflowRepository?: string;
  }
): OpenPawlTriggerResolution {
  const eventName = eventNameToMode(options.eventName);
  const payload = event ?? {};
  const baseRepo = getRepositoryFullName(payload, options.workflowRepository);
  const eventInputs = payload.inputs;
  const resolvedWorkflowTask = options.workflowTask ?? eventInputs?.task;
  const resolvedWorkflowRepoPath = options.workflowRepoPath ?? eventInputs?.repo_path;
  const resolvedWorkflowMode = options.workflowMode ?? eventInputs?.mode;

  switch (eventName) {
    case "workflow_dispatch": {
      const rawMode = typeof resolvedWorkflowMode === "string" ? resolvedWorkflowMode.toLowerCase() : "";
      const mode = rawMode === "write" ? "write" : "dry-run";
      return {
        shouldRun: true,
        reason: "Manual workflow_dispatch trigger.",
        task: resolvedWorkflowTask || "review and suggest improvements",
        repoPath: resolvedWorkflowRepoPath || ".",
        mode,
        issueIsPullRequest: false,
        baseRepoFullName: baseRepo,
        source: "workflow_dispatch",
      };
    }
    case "pull_request": {
      const issueNumber = payload.pull_request?.number;
      const prNumber = typeof issueNumber === "number" && Number.isFinite(issueNumber) ? issueNumber : undefined;
      const isLabeledTrigger = payload.action === "labeled" && isLabelMatch(pickLabelName(payload));
      if (!isLabeledTrigger && payload.action !== undefined && payload.action !== "opened" && payload.action !== "synchronize" && payload.action !== "reopened") {
        return {
          shouldRun: false,
          reason: "Unsupported pull_request action for automatic Openpawl runs.",
          task: OPENPAWL_REVIEW_TASK,
          repoPath: ".",
          mode: "dry-run",
          issueIsPullRequest: true,
          baseRepoFullName: baseRepo,
          headRepoFullName: getHeadRepo(payload),
          source: "pull_request",
        };
      }
      if (prNumber === undefined) {
        return {
          shouldRun: false,
          reason: "pull_request event missing pull request number.",
          task: OPENPAWL_REVIEW_TASK,
          repoPath: ".",
          mode: "dry-run",
          issueIsPullRequest: true,
          baseRepoFullName: baseRepo,
          headRepoFullName: getHeadRepo(payload),
          source: "pull_request",
        };
      }
      return {
        shouldRun: true,
        reason: isLabeledTrigger ? "Pull request labeled with openpawl." : "Pull request event.",
        task: OPENPAWL_REVIEW_TASK,
        repoPath: ".",
        mode: "dry-run",
        issueNumber: prNumber,
        issueIsPullRequest: true,
        baseRepoFullName: baseRepo,
        headRepoFullName: getHeadRepo(payload),
        source: "pull_request",
      };
    }
    case "issue_comment": {
      const body = typeof payload.comment?.body === "string" ? payload.comment.body : "";
      const task = fallbackCommandTask(body);
      if (!task) {
        return {
          shouldRun: false,
          reason: "No supported /openpawl command found in issue_comment body.",
          task: OPENPAWL_REVIEW_TASK,
          repoPath: ".",
          mode: "dry-run",
          issueIsPullRequest: isPullRequestIssue(payload),
          issueNumber: getIssueNumber(payload),
          baseRepoFullName: baseRepo,
          source: "issue_comment",
        };
      }
      const issueNumber = getIssueNumber(payload);
      if (issueNumber === undefined) {
        return {
          shouldRun: false,
          reason: "issue_comment event missing issue number.",
          task,
          repoPath: ".",
          mode: "dry-run",
          issueIsPullRequest: isPullRequestIssue(payload),
          issueNumber,
          baseRepoFullName: baseRepo,
          source: "issue_comment",
        };
      }
      return {
        shouldRun: true,
        reason: "Supported /openpawl comment command detected.",
        task,
        repoPath: ".",
        mode: "dry-run",
        issueNumber,
        issueIsPullRequest: isPullRequestIssue(payload),
        baseRepoFullName: baseRepo,
        source: "issue_comment",
      };
    }
    case "issues": {
      const action = payload.action;
      const labelName = pickLabelName(payload);
      if (action !== "labeled" || !isLabelMatch(labelName)) {
        return {
          shouldRun: false,
          reason: "issues event is not an openpawl label application.",
          task: OPENPAWL_REVIEW_TASK,
          repoPath: ".",
          mode: "dry-run",
          issueIsPullRequest: false,
          issueNumber: getIssueNumber(payload),
          baseRepoFullName: baseRepo,
          source: "issues",
        };
      }
      const issueNumber = getIssueNumber(payload);
      if (issueNumber === undefined) {
        return {
          shouldRun: false,
          reason: "issues labeled event missing issue number.",
          task: OPENPAWL_REVIEW_TASK,
          repoPath: ".",
          mode: "dry-run",
          issueIsPullRequest: false,
          baseRepoFullName: baseRepo,
          source: "issues",
        };
      }
      return {
        shouldRun: true,
        reason: "Issue labeled with openpawl.",
        task: OPENPAWL_REVIEW_TASK,
        repoPath: ".",
        mode: "dry-run",
        issueNumber,
        issueIsPullRequest: false,
        baseRepoFullName: baseRepo,
        source: "issues",
      };
    }
    default:
      return {
        shouldRun: false,
        reason: `Unsupported event: ${options.eventName}.`,
        task: OPENPAWL_REVIEW_TASK,
        repoPath: ".",
        mode: "dry-run",
        issueIsPullRequest: false,
        baseRepoFullName: baseRepo,
        source: "none",
      };
  }
}

function eventNameToMode(eventName: string): "workflow_dispatch" | "pull_request" | "issue_comment" | "issues" | "none" {
  if (eventName === "workflow_dispatch") return "workflow_dispatch";
  if (eventName === "pull_request") return "pull_request";
  if (eventName === "issue_comment") return "issue_comment";
  if (eventName === "issues") return "issues";
  return "none";
}
