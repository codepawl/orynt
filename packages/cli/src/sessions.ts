import path from "node:path";

import {
  FileCliSessionStore,
  type CliSessionCatalogEntry,
} from "./state.js";
import { displayWidth, truncate, type ComposerChoice } from "./composer.js";
import { terminalSafeText } from "./ui.js";

export type SessionCliDependencies = {
  stateRoot: string;
  cwd: string;
  width?: number;
  write(value: string): void;
};

export function sessionStateLabel(
  entry: CliSessionCatalogEntry,
  currentSessionId?: string,
): "current" | "pinned" | "trash" | "saved" {
  if (entry.sessionId === currentSessionId) return "current";
  if (entry.pinned) return "pinned";
  if (entry.trashedAt) return "trash";
  return "saved";
}

export function sessionUpdatedLabel(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return terminalSafeText(updatedAt);
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function fitLine(value: string, width: number): string {
  const safe = terminalSafeText(value);
  return displayWidth(safe) <= width ? safe : truncate(safe, width);
}

export function renderSessionEntry(
  entry: CliSessionCatalogEntry,
  options: {
    index?: number;
    width?: number;
    currentSessionId?: string;
  } = {},
): string {
  const width = Math.max(12, Math.trunc(options.width ?? 80));
  const prefix = options.index === undefined ? "" : `${options.index + 1}. `;
  const titleWidth = Math.max(1, width - displayWidth(prefix));
  const title = fitLine(entry.title || entry.sessionId, titleWidth);
  const state = sessionStateLabel(entry, options.currentSessionId);
  const metadata =
    width >= 72
      ? `${state} · ${entry.turnCount} turns · ${sessionUpdatedLabel(entry.updatedAt)} · ${entry.sessionId}`
      : width >= 42
        ? `${state} · ${entry.turnCount} turns · ${entry.sessionId}`
        : `${state} · ${entry.sessionId}`;
  return `${prefix}${title}\n${fitLine(`   ${metadata}`, width)}`;
}

export function renderSessionList(
  entries: readonly CliSessionCatalogEntry[],
  options: {
    width?: number;
    currentSessionId?: string;
    startIndex?: number;
  } = {},
): string {
  const startIndex = options.startIndex ?? 0;
  return entries
    .map((entry, index) =>
      renderSessionEntry(entry, {
        width: options.width,
        currentSessionId: options.currentSessionId,
        index: startIndex + index,
      })
    )
    .join("\n");
}

export function sessionComposerChoice(
  entry: CliSessionCatalogEntry,
  currentSessionId?: string,
): ComposerChoice {
  const state = sessionStateLabel(entry, currentSessionId);
  return {
    value: entry.sessionId,
    label: terminalSafeText(entry.title || entry.sessionId),
    description: `${state} · ${entry.turnCount} turns · ${sessionUpdatedLabel(entry.updatedAt)}`,
    details: [
      `Session · ${terminalSafeText(entry.sessionId)}`,
      `Repository · ${terminalSafeText(entry.repositoryPath)}`,
      `Verification · ${terminalSafeText(entry.verification ?? "not run")}`,
      `Updated · ${sessionUpdatedLabel(entry.updatedAt)}`,
    ],
  };
}

export async function runSessionCli(
  argv: string[],
  dependencies: SessionCliDependencies,
): Promise<number> {
  const store = new FileCliSessionStore(dependencies.stateRoot);
  const [command = "list", sessionId] = argv.filter(
    (argument) => !argument.startsWith("--"),
  );
  const json = argv.includes("--json");
  if (command === "list") {
    const page = await store.list({
      repositoryPath: argv.includes("--all")
        ? undefined
        : path.resolve(dependencies.cwd),
      includeTrash: argv.includes("--trash") || argv.includes("--all"),
      limit: 50,
    });
    dependencies.write(
      json
        ? JSON.stringify(page)
        : renderSessionList(page.entries, {
            width: dependencies.width,
          }) ||
            "No saved sessions were found.",
    );
    return 0;
  }
  if (command === "show") {
    if (!sessionId) throw new Error("Usage: orynt sessions show <id> [--json]");
    const session = await store.load(sessionId);
    if (!session) {
      dependencies.write(`Session not found: ${terminalSafeText(sessionId)}`);
      return 2;
    }
    dependencies.write(
      json
        ? JSON.stringify(session)
        : [
            session.title ?? session.goal ?? session.sessionId,
            `ID          ${session.sessionId}`,
            `Repository  ${session.repositoryPath}`,
            `Updated     ${session.updatedAt}`,
            `Turns       ${session.turnCount ?? 0}`,
            `Pinned      ${session.pinned === true ? "yes" : "no"}`,
            `State       ${session.trashedAt ? "trash" : "active"}`,
            `Resources   ${
              session.lastRun?.resources?.sandboxChanged
                ? "modified worktree protected"
                : session.lastRun?.resources?.sandboxWorktreePath &&
                    !session.lastRun.resources.sandboxRemovedAt
                  ? "clean worktree tracked"
                  : "none linked"
            }`,
          ]
            .map(terminalSafeText)
            .join("\n"),
    );
    return 0;
  }
  if (command === "pin" || command === "unpin") {
    if (!sessionId) throw new Error(`Usage: orynt sessions ${command} <id>`);
    await store.setPinned(sessionId, command === "pin");
    dependencies.write(`Session ${command === "pin" ? "pinned" : "unpinned"}: ${terminalSafeText(sessionId)}`);
    return 0;
  }
  if (command === "trash" || command === "restore") {
    if (!sessionId) throw new Error(`Usage: orynt sessions ${command} <id>`);
    await (command === "trash"
      ? store.trash(sessionId)
      : store.restore(sessionId));
    dependencies.write(`Session ${command === "trash" ? "moved to Trash" : "restored"}: ${terminalSafeText(sessionId)}`);
    return 0;
  }
  if (command === "cleanup") {
    const report = await store.maintain(new Date(), argv.includes("--apply"));
    dependencies.write(
      json
        ? JSON.stringify(report)
        : [
            argv.includes("--apply") ? "Session cleanup applied" : "Session cleanup dry run",
            `Inspected: ${report.inspected}`,
            `Trash candidates: ${report.trashed.length}`,
            `Purge candidates: ${report.purged.length}`,
            `Artifact cleanup: ${report.artifactCleanup.length}`,
            `Clean sandbox cleanup: ${report.sandboxCleanup.length}`,
            `Protected: ${report.skippedProtected.length}`,
            `Cleanup blocked: ${report.cleanupBlocked.length}`,
            `Budget exhausted: ${report.budgetExhausted ? "yes" : "no"}`,
          ].join("\n"),
    );
    return 0;
  }
  throw new Error(
    "Usage: orynt sessions <list|show|pin|unpin|trash|restore|cleanup>",
  );
}
