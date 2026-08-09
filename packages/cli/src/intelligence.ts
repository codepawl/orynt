import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";
import {
  contextVmSessionId,
  type ContextVmProviderTransportV1,
  type ContextVmThinkingEffortV1,
} from "@codepawl/shared";
import { createContextVmReadinessDriver } from "./contextVmReadiness.js";

export async function runIntelligenceCli(input: {
  argv: string[];
  stateRoot: string;
  write(line: string): void;
}): Promise<number> {
  const [command = "status", ...rest] = input.argv;
  const runtime = new LocalIntelligenceRuntime(input.stateRoot);

  if (command === "readiness-live") {
    if (!rest.includes("--confirm-live")) {
      throw new Error("Live ContextVM readiness requires --confirm-live.");
    }
    const valueAfter = (flag: string): string | undefined => {
      const index = rest.indexOf(flag);
      return index >= 0 ? rest[index + 1] : undefined;
    };
    const transport = valueAfter("--transport") as
      | ContextVmProviderTransportV1
      | undefined;
    const modelId = valueAfter("--model");
    const thinkingEffort = (valueAfter("--effort") ?? "medium") as
      ContextVmThinkingEffortV1;
    if (
      !transport ||
      !["codex-cli", "codex-app-server", "openai-responses"].includes(
        transport,
      ) ||
      !modelId
    ) {
      throw new Error(
        "Usage: orynt intelligence readiness-live --confirm-live --transport <codex-cli|codex-app-server|openai-responses> --model <id> [--effort <value>] --json",
      );
    }
    const invocationId = `live-${transport}-${Date.now()}`;
    try {
      const result = await runtime.resolveInvocationContextV2({
        invocation: {
          schemaVersion: 2,
          invocationId,
          namespace: `contextvm-live:${transport}`,
          sessionId: contextVmSessionId(invocationId),
          role: "coordinator",
          transport,
          modelId,
          thinkingEffort,
          userRequest: "Confirm whether this bounded Context Pack is ready.",
          constraints: [{
            id: "live-readiness-only",
            text: "Classify readiness only; do not answer or call tools.",
            required: true,
            source: "policy",
          }],
          requestedEntities: [],
          riskLevel: "low",
          hardBudgetTokens: 512,
          retrievalMode: "authority_only",
          readiness: {
            maxOutputTokens: 1_024,
            timeoutMs: 30_000,
            maxFaultRounds: 3,
          },
        },
        decide: createContextVmReadinessDriver(),
      });
      const verification = await runtime.verifyContextVm();
      const output = {
        schemaVersion: 1,
        transport,
        modelId,
        thinkingEffort,
        status: result.status,
        invocationId,
        contextPackIds: result.status === "ready"
          ? result.artifact.orderedContextPackIds
          : result.contextPackIds,
        contextHash: result.status === "ready"
          ? result.artifact.renderedContextHash
          : null,
        verification: verification.status,
        passed: result.status === "ready" && verification.status === "pass",
      };
      input.write(JSON.stringify(output));
      return output.passed ? 0 : 1;
    } finally {
      runtime.contextVm.close();
    }
  }

  if (command === "init") {
    await runtime.initialize();
    const status = await runtime.status();
    input.write(
      rest.includes("--json")
        ? JSON.stringify(status.contextVm, null, 2)
        : [
            `ContextVM: ${status.contextVm.health}`,
            `SQLite: schema v${status.contextVm.databaseSchemaVersion} · ${status.contextVm.journalMode.toUpperCase()} · foreign keys ${status.contextVm.foreignKeys ? "on" : "off"}`,
            `Database: ${status.contextVm.databasePath}`,
            `Archive: ${status.contextVm.archiveRoot}`,
            `Derived memory: ContextVM SQLite v2 · revision ${status.contextVm.memoryRevision}`,
          ].join("\n"),
    );
    return 0;
  }

  if (command === "status") {
    const status = await runtime.status();
    if (rest.includes("--json")) {
      input.write(JSON.stringify(status, null, 2));
    } else {
      input.write(`Intelligence: ${status.health}`);
      input.write(
        `Memory: v${status.memory.schemaVersion} revision ${status.memory.revision} · ${status.memory.itemCount} items`,
      );
      input.write(
        `Improvements: v${status.improvements.schemaVersion} revision ${status.improvements.revision} · ${status.improvements.activeTargetCount} active`,
      );
      input.write(
        `ContextVM: ${status.contextVm.health} · schema v${status.contextVm.databaseSchemaVersion} · ${status.contextVm.eventCount} events · ${status.contextVm.artifactCount} artifacts`,
      );
      input.write(
        `Memory pages: ${status.contextVm.memoryPageCount} · revision ${status.contextVm.memoryRevision} · ${status.contextVm.unresolvedContradictionCount} unresolved contradictions`,
      );
      input.write(
        `Recovery: ${status.contextVm.checkpointCount} checkpoints · latest sequence ${status.contextVm.latestCheckpointSequence ?? "none"} · ${status.contextVm.consolidationCount} consolidations`,
      );
      input.write(
        `SQLite: ${status.contextVm.journalMode.toUpperCase()} · foreign keys ${status.contextVm.foreignKeys ? "on" : "off"} · archive ${status.contextVm.archiveBytes} bytes`,
      );
      input.write(
        `L2 cache: ${status.contextVm.cache.entries} entries · ${status.contextVm.cache.bytes}/${status.contextVm.cache.maxBytes} bytes · ${status.contextVm.cache.hits} hits · ${status.contextVm.cache.misses} misses · ${status.contextVm.cache.evictions} evictions · ${status.contextVm.cache.pinnedEntries} pinned · ${status.contextVm.cache.prefetchLoads} prefetched`,
      );
      input.write(`Memory store: ${status.canonicalPaths.memoryStore}`);
      input.write(`Improvement store: ${status.canonicalPaths.improvementStore}`);
      input.write(`ContextVM database: ${status.contextVm.databasePath}`);
    }
    return 0;
  }

  if (command === "verify") {
    const report = await runtime.verifyContextVm();
    if (rest.includes("--json")) {
      input.write(JSON.stringify(report, null, 2));
    } else {
      input.write(`ContextVM verification: ${report.status}`);
      for (const check of report.checks) {
        input.write(
          `${check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"}  ${check.id} · ${check.summary}`,
        );
      }
      input.write(
        `Checked ${report.eventCount} events · ${report.memoryPageCount} memory pages · ${report.artifactCount} artifacts · ${report.orphanArtifactCount} orphan objects · ${report.unresolvedContradictionCount} unresolved contradictions`,
      );
    }
    return report.status === "pass" ? 0 : 1;
  }

  if (command === "inspect") {
    const memoryId = rest.find((value) => !value.startsWith("--"));
    if (!memoryId) {
      throw new Error("Usage: orynt intelligence inspect <memory-id> [--json]");
    }
    const inspected = await runtime.inspectMemory(memoryId);
    if (!inspected) {
      throw new Error(`ContextVM memory page not found: ${memoryId}`);
    }
    if (rest.includes("--json")) {
      input.write(JSON.stringify(inspected, null, 2));
    } else {
      input.write(`Memory: ${inspected.page.id}`);
      input.write(`Kind: ${inspected.page.kind} · status ${inspected.page.status}`);
      input.write(`Summary: ${inspected.page.summary}`);
      input.write(
        `Validity: ${inspected.page.validFrom} → ${inspected.page.validUntil ?? "current"}`,
      );
      input.write(
        `Provenance: ${inspected.page.sources.length} source(s) · ${inspected.page.contentHash}`,
      );
      input.write(
        `Relations: ${inspected.page.relations.length} · contradictions ${inspected.contradictions.length}`,
      );
    }
    return 0;
  }

  if (command === "search") {
    const valueAfter = (flag: string): string | undefined => {
      const index = rest.indexOf(flag);
      return index >= 0 ? rest[index + 1] : undefined;
    };
    const flagsWithValues = new Set([
      "--namespace", "--as-of", "--entity", "--task", "--artifact", "--hops", "--limit",
    ]);
    const consumed = new Set<number>();
    rest.forEach((value, index) => {
      if (flagsWithValues.has(value)) {
        consumed.add(index);
        consumed.add(index + 1);
      }
    });
    const query = rest.find((value, index) =>
      !value.startsWith("--") && !consumed.has(index));
    const namespace = valueAfter("--namespace");
    if (!query || !namespace) {
      throw new Error(
        "Usage: orynt intelligence search <query> --namespace <namespace> [--history] [--as-of <iso>] [--hops <0|1|2>] [--limit <n>] [--json]",
      );
    }
    const hopValue = Number(valueAfter("--hops") ?? 0);
    if (![0, 1, 2].includes(hopValue)) throw new Error("--hops must be 0, 1, or 2");
    const result = await runtime.searchContextVmNamespace(namespace, {
      query,
      includeHistory: rest.includes("--history"),
      ...(valueAfter("--as-of") ? { asOf: valueAfter("--as-of") } : {}),
      ...(valueAfter("--entity") ? { entityIds: [valueAfter("--entity")!] } : {}),
      ...(valueAfter("--task") ? { taskIds: [valueAfter("--task")! as never] } : {}),
      ...(valueAfter("--artifact") ? { artifactIds: [valueAfter("--artifact")! as never] } : {}),
      hopLimit: hopValue as 0 | 1 | 2,
      ...(valueAfter("--limit") ? { topK: Number(valueAfter("--limit")) } : {}),
    });
    if (rest.includes("--json")) {
      input.write(JSON.stringify(result, null, 2));
    } else if (result.candidates.length === 0) {
      input.write("No matching ContextVM memory.");
    } else {
      for (const candidate of result.candidates) {
        input.write(
          `${candidate.scores.total.toFixed(3)}  ${candidate.page.id} · ${candidate.page.summary}`,
        );
        input.write(`  ${candidate.reasons.join(", ")}`);
      }
    }
    return 0;
  }

  if (command === "rebuild-index") {
    const report = await runtime.rebuildContextVmIndex();
    input.write(
      rest.includes("--json")
        ? JSON.stringify(report, null, 2)
        : `Rebuilt ContextVM index: ${report.indexedMemoryPages} pages · ${report.identifierCount} identifiers · ${report.digest}`,
    );
    return 0;
  }

  if (command === "explain-context") {
    const valueAfter = (flag: string): string | undefined => {
      const index = rest.indexOf(flag);
      return index >= 0 ? rest[index + 1] : undefined;
    };
    const valueFlags = new Set([
      "--namespace", "--session", "--task", "--goal", "--constraint",
      "--risk", "--budget",
    ]);
    const consumed = new Set<number>();
    rest.forEach((value, index) => {
      if (valueFlags.has(value)) {
        consumed.add(index);
        consumed.add(index + 1);
      }
    });
    const query = rest.find((value, index) =>
      !value.startsWith("--") && !consumed.has(index));
    const namespace = valueAfter("--namespace");
    if (!query || !namespace) {
      throw new Error(
        "Usage: orynt intelligence explain-context <query> --namespace <namespace> [--goal <text>] [--constraint <text>] [--risk <low|medium|high>] [--budget <256-4000>] [--json]",
      );
    }
    const risk = valueAfter("--risk") ?? "low";
    if (!["low", "medium", "high"].includes(risk)) {
      throw new Error("--risk must be low, medium, or high");
    }
    const budget = Number(valueAfter("--budget") ?? 1_200);
    const constraints = rest.flatMap((value, index) =>
      value === "--constraint" && rest[index + 1]
        ? [{
            id: `cli-${index}`,
            text: rest[index + 1]!,
            required: true,
            source: "user" as const,
          }]
        : []);
    const pack = await runtime.buildContextPack({
      schemaVersion: 1,
      namespace,
      sessionId: (valueAfter("--session") ?? "cli-explain-context") as never,
      ...(valueAfter("--task") ? { taskId: valueAfter("--task") as never } : {}),
      userRequest: query,
      currentGoal: valueAfter("--goal") ?? query,
      constraints,
      requestedEntities: [],
      riskLevel: risk as "low" | "medium" | "high",
      hardBudgetTokens: budget,
    });
    if (rest.includes("--json")) {
      input.write(JSON.stringify(pack.manifest, null, 2));
    } else {
      input.write(`Context pack: ${pack.manifest.id} · ${pack.manifest.status}`);
      input.write(
        `Budget: ${pack.manifest.renderedTokens}/${pack.manifest.hardBudgetTokens} tokens · ${pack.manifest.reservedOutputTokens} reserved`,
      );
      input.write(
        `Coverage: ${(pack.manifest.coverageScore * 100).toFixed(0)}% · evidence quality ${(pack.manifest.evidenceQualityScore * 100).toFixed(0)}%`,
      );
      for (const item of pack.manifest.items) {
        input.write(
          `${item.section}  ${item.sourceId} · ${item.tokenCount} tokens · ${item.loadReason}`,
        );
      }
      for (const gap of pack.manifest.gaps) input.write(`GAP  ${gap}`);
    }
    return pack.manifest.status === "blocked" ? 1 : 0;
  }

  if (command === "checkpoint") {
    const sessionId = rest.find((value) => !value.startsWith("--"));
    if (!sessionId) {
      throw new Error(
        "Usage: orynt intelligence checkpoint <session-id> [--json]",
      );
    }
    const checkpoint = await runtime.checkpointContextVmSession(
      sessionId,
      "explicit",
    );
    input.write(
      rest.includes("--json")
        ? JSON.stringify(checkpoint, null, 2)
        : [
            `Checkpoint: ${checkpoint.id}`,
            `Session: ${checkpoint.sessionId} · through sequence ${checkpoint.capturedThroughSequence}`,
            `State: ${checkpoint.stateHash} · ${checkpoint.state.obligations.length} unresolved obligations`,
          ].join("\n"),
    );
    return 0;
  }

  if (command === "recover") {
    const sessionId = rest.find((value) => !value.startsWith("--"));
    if (!sessionId) {
      throw new Error(
        "Usage: orynt intelligence recover <session-id> [--json]",
      );
    }
    const recovery = await runtime.recoverContextVmSession(sessionId);
    if (rest.includes("--json")) {
      input.write(JSON.stringify(recovery, null, 2));
    } else {
      input.write(`Recovery: ${recovery.status} · ${recovery.source}`);
      if (recovery.checkpointId) {
        input.write(`Checkpoint: ${recovery.checkpointId}`);
      }
      if (recovery.state) {
        input.write(
          `State: sequence ${recovery.state.throughSequence} · ${recovery.state.obligations.length} obligations · ${recovery.stateHash}`,
        );
      }
      for (const warning of recovery.warnings) input.write(`WARN  ${warning}`);
    }
    return recovery.status === "blocked"
      ? 1
      : recovery.status === "recovery_required" ? 2 : 0;
  }

  if (command === "consolidate") {
    const valueAfter = (flag: string): string | undefined => {
      const index = rest.indexOf(flag);
      return index >= 0 ? rest[index + 1] : undefined;
    };
    const sessionId = rest.find((value, index) =>
      !value.startsWith("--") &&
      !["--namespace", "--task", "--trigger"].some(
        (flag) => rest[index - 1] === flag,
      ));
    const namespace = valueAfter("--namespace");
    if (!sessionId || !namespace) {
      throw new Error(
        "Usage: orynt intelligence consolidate <session-id> --namespace <namespace> [--task <id>] [--trigger <name>] [--json]",
      );
    }
    const trigger = valueAfter("--trigger") ?? "explicit_save";
    const triggers = [
      "session_checkpoint", "task_closed", "event_threshold",
      "repeated_pattern", "accepted_decision", "explicit_save",
    ] as const;
    if (!triggers.includes(trigger as typeof triggers[number])) {
      throw new Error(`Unknown consolidation trigger: ${trigger}`);
    }
    const report = await runtime.consolidateContextVmSession({
      sessionId,
      namespace,
      trigger: trigger as typeof triggers[number],
      ...(valueAfter("--task") ? { taskId: valueAfter("--task") } : {}),
    });
    input.write(
      rest.includes("--json")
        ? JSON.stringify(report, null, 2)
        : [
            `Consolidation: ${report.outputMemoryIds.length} derived pages · ${report.rejected.length} rejected`,
            `Sources: ${report.sourceEventCount} events · ${report.inputHash}`,
            ...report.outputMemoryIds.map((id) => `  ${id}`),
            ...report.rejected.map(
              ({ outputKind, reason }) => `REJECTED  ${outputKind} · ${reason}`,
            ),
          ].join("\n"),
    );
    return report.rejected.length > 0 ? 1 : 0;
  }

  if (command === "backups") {
    const backups = await runtime.listBackups();
    input.write(
      rest.includes("--json")
        ? JSON.stringify({ backups }, null, 2)
        : backups.length > 0
          ? backups.join("\n")
          : "No intelligence migration backups.",
    );
    return 0;
  }

  if (command === "cleanup") {
    const backupId = rest.find((value) => !value.startsWith("--"));
    if (!backupId) {
      throw new Error("Usage: orynt intelligence cleanup <backup-id> --yes");
    }
    if (!rest.includes("--yes")) {
      throw new Error(
        "Backup cleanup is destructive. Re-run with the exact backup id and --yes.",
      );
    }
    await runtime.cleanupBackup(backupId);
    input.write(`Removed intelligence migration backup: ${backupId}`);
    return 0;
  }

  throw new Error(
    "Usage: orynt intelligence <init|status|verify|inspect|search|rebuild-index|explain-context|checkpoint|recover|consolidate|backups|cleanup> [--json] [--yes]",
  );
}
