import {
  evaluateImprovementCandidate,
} from "@codepawl/capability-runtime";
import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";

export type ImproveCliDependencies = {
  stateRoot: string;
  write: (line: string) => void;
  confirm?: (prompt: string) => Promise<boolean>;
  now?: () => string;
};

export function improveCliHelp(): string {
  return [
    "Usage: orynt improve <command>",
    "",
    "Commands:",
    "  status",
    "  list",
    "  show <candidate-id>",
    "  history",
    "  notices",
    "  hygiene [--check]",
    "  approve <candidate-id>",
    "  reject <candidate-id>",
    "  rollback <candidate-id>",
    "",
    "Candidates stay in shadow until an operator explicitly approves promotion.",
  ].join("\n");
}

export async function runImproveCli(
  argv: string[],
  dependencies: ImproveCliDependencies,
): Promise<number> {
  const [command, candidateId, ...extra] = argv;
  const noArgumentCommands = new Set([
    "status",
    "list",
    "history",
    "notices",
  ]);
  const candidateCommands = new Set(["show", "approve", "reject", "rollback"]);
  const hygiene = command === "hygiene" &&
    (candidateId === undefined || candidateId === "--check") &&
    extra.length === 0;
  if (!hygiene && (
    (!noArgumentCommands.has(command ?? "") &&
      !candidateCommands.has(command ?? "")) ||
    extra.length > 0 ||
    (noArgumentCommands.has(command ?? "")
      ? candidateId !== undefined
      : !candidateId)
  )) {
    throw new Error(improveCliHelp());
  }
  const intelligence = new LocalIntelligenceRuntime(dependencies.stateRoot);
  await intelligence.initialize();
  const runtime = intelligence.improvementRuntime;
  const ledger = intelligence.improvementLedger;
  const snapshot = await ledger.load();
  if (command === "status") {
    const active = await runtime.loadActiveArtifacts();
    dependencies.write(JSON.stringify({
      mode: "shadow_review",
      candidateCount: snapshot.candidates.length,
      active: active.map(({ artifact: _artifact, ...entry }) => entry),
      ledgerRevision: snapshot.revision,
    }, null, 2));
    return 0;
  }
  if (command === "history") {
    dependencies.write(
      snapshot.audit.length === 0
        ? "No improvement history."
        : JSON.stringify(snapshot.audit, null, 2),
    );
    return 0;
  }
  if (command === "notices") {
    dependencies.write("No immutable-target improvement notices.");
    return 0;
  }
  if (command === "hygiene") {
    const result = await runtime.hygiene(candidateId === "--check");
    dependencies.write(JSON.stringify(result, null, 2));
    return result.issues.length > 0 ? 1 : 0;
  }
  if (command === "list") {
    dependencies.write(
      snapshot.candidates.length === 0
        ? "No improvement candidates."
        : snapshot.candidates
            .map((candidate) =>
              [
                candidate.id,
                candidate.status,
                candidate.targetClass,
                candidate.targetId,
              ].join("\t")
            )
            .join("\n"),
    );
    return 0;
  }
  const candidate = snapshot.candidates.find(({ id }) => id === candidateId);
  if (!candidate) {
    dependencies.write(`Improvement candidate not found: ${candidateId}`);
    return 1;
  }
  if (command === "show") {
    dependencies.write(JSON.stringify({
      ...candidate,
      promotionEvaluation: evaluateImprovementCandidate(candidate),
    }, null, 2));
    return 0;
  }
  if (!dependencies.confirm) {
    dependencies.write(`${command} requires an interactive confirmation.`);
    return 2;
  }
  const action =
    command === "approve"
      ? "Approve"
      : command === "rollback"
        ? "Roll back"
        : "Reject";
  const confirmed = await dependencies.confirm(
    `${action} candidate ${candidate.id}?`,
  );
  if (!confirmed) {
    dependencies.write("No change made.");
    return 1;
  }
  const recordedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  if (command === "approve") {
    const evaluation = evaluateImprovementCandidate(candidate);
    if (evaluation.decision !== "promote") {
      dependencies.write(
        `Candidate remains shadow: ${evaluation.reasonCodes.join(", ")}`,
      );
      return 1;
    }
    await runtime.promote(candidate.id, snapshot.revision);
    dependencies.write(`Improvement candidate approved: ${candidate.id}`);
    return 0;
  }
  if (command === "rollback") {
    await runtime.rollback(candidate.id);
    dependencies.write(`Improvement candidate rolled back: ${candidate.id}`);
    return 0;
  }
  await ledger.recordDecision({
    candidateId: candidate.id,
    decision: "reject",
    reasonCodes: ["explicit_user_rejection"],
  }, recordedAt, snapshot.revision);
  dependencies.write(
    `Improvement candidate rejected: ${candidate.id}`,
  );
  return 0;
}
