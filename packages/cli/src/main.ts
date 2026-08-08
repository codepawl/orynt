import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";

async function main(): Promise<void> {
const [
  { runCliApplication },
  {
    runCliAgentTurn,
    runCliReadOnlyRole,
    runCliSkillRoutingTurn,
    shutdownCliAgentRuntime,
  },
  {
    cliHelp,
    createCliContextVmInvocationPort,
    diagnoseModelTierLive,
    listCliModels,
    oryntStateRoot,
    probeCodexCli,
    runCliRepositoryTask,
  },
  { collectDoctorReport },
  {
    DEFAULT_CLI_APPEARANCE,
    FileCliPreferencesStore,
    FileCliSessionStore,
  },
  { DEFAULT_CLI_SHORTCUTS },
  { DEFAULT_CLI_STATUSLINE },
  { TtyComposer },
  { DEFAULT_CLI_CLIPBOARD, SystemCliClipboardReader },
  { resolveTerminalAppearance },
  { createTerminalDesignSystem },
  { terminalSafeText },
  { runSkillCli },
  { LocalSkillCliManager },
  { runBrowserCli },
  { runAssetCli },
  {
    cliCodeIntelStatus,
    configureCliCodeIntelAdapters,
    prepareCliCapabilities,
    prepareCliCodeIntelTools,
    restartCliCodeIntelAdapter,
    shutdownCliCapabilityRuntime,
  },
  { runImproveCli },
  { runIntelligenceCli },
  { loadCustomLspAdapters, runLspCli },
  { runSessionCli },
  { checkForStartupUpdate, runUpdateCli },
  { codexChildEnvironment, probeCodexEnvironment, runCodexSetup },
  { probeClaudeEnvironment },
  { probeOpencodeEnvironment },
  { cliCodexAppServerRuntime, readCliProviderUsage },
] = await Promise.all([
  import("./app.js"),
  import("./agent.js"),
  import("./runtime.js"),
  import("./doctor.js"),
  import("./state.js"),
  import("./shortcuts.js"),
  import("./statusline.js"),
  import("./composer.js"),
  import("./clipboard.js"),
  import("./terminal-theme.js"),
  import("./terminal-presentation.js"),
  import("./ui.js"),
  import("./skills.js"),
  import("./skillRuntime.js"),
  import("./browser.js"),
  import("./assets.js"),
  import("./capabilities.js"),
  import("./improve.js"),
  import("./intelligence.js"),
  import("./lsp.js"),
  import("./sessions.js"),
  import("./update.js"),
  import("./codexSetup.js"),
  import("./claudeSetup.js"),
  import("./opencodeSetup.js"),
  import("./provider.js"),
]);

const terminal = Boolean(input.isTTY && output.isTTY);
const argv = process.argv.slice(2);
const automaticMaintenanceEligible =
  terminal &&
  ![
    "assets",
    "browser",
    "improve",
    "intelligence",
    "lsp",
    "run",
    "sessions",
    "setup",
    "skills",
    "update",
    "usage",
  ].includes(argv[0] ?? "") &&
  !argv.some((argument) =>
    ["--help", "-h", "--version", "-v"].includes(argument)
  );
const stateRoot = oryntStateRoot();
const contextVm = createCliContextVmInvocationPort(stateRoot);
const sessionStore = new FileCliSessionStore(stateRoot);
const preferencesStore = new FileCliPreferencesStore(stateRoot);
const skillManager = new LocalSkillCliManager(stateRoot);
configureCliCodeIntelAdapters(await loadCustomLspAdapters(stateRoot));
let initialAppearance = { ...DEFAULT_CLI_APPEARANCE };
let initialClipboard = structuredClone(DEFAULT_CLI_CLIPBOARD);
let initialShortcuts = structuredClone(DEFAULT_CLI_SHORTCUTS);
let initialStatusline = structuredClone(DEFAULT_CLI_STATUSLINE);
try {
  const preferences = await preferencesStore.load();
  initialAppearance = preferences.appearance;
  initialClipboard = preferences.clipboard;
  initialShortcuts = preferences.shortcuts;
  initialStatusline = preferences.statusline;
} catch {
  // runCliApplication reports preference load and migration failures.
}
let appearanceResolution;
try {
  appearanceResolution = resolveTerminalAppearance({
    isTTY: terminal,
    saved: initialAppearance,
    argv,
    env: process.env,
  });
} catch (error) {
  output.write(
    `Error: ${terminalSafeText(error instanceof Error ? error.message : String(error))}\n\n${cliHelp()}\n`,
  );
  process.exitCode = 2;
  return;
}
let colorEnabled = appearanceResolution.color;
let motionEnabled = appearanceResolution.motion;
let richTextEnabled = appearanceResolution.richText;
let themeId = appearanceResolution.themeId;
const designSystem = createTerminalDesignSystem(colorEnabled, themeId);
const interface_ = terminal
  ? undefined
  : readline.createInterface({
      input,
      output,
      terminal: false,
    });
const lineIterator = interface_?.[Symbol.asyncIterator]();
let activeOperationController: AbortController | undefined;
let ttyComposer: InstanceType<typeof TtyComposer> | undefined;
const clipboard = new SystemCliClipboardReader(stateRoot);

const write = (value: string) => {
  const rendered = designSystem.renderProductText(value);
  if (ttyComposer) {
    ttyComposer.write(rendered);
    return;
  }
  output.write(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
};

const writeCentered = (variants: readonly string[]) => {
  const rendered = variants.map((variant) =>
    designSystem.renderProductText(variant)
  );
  if (ttyComposer) {
    ttyComposer.writeCentered(rendered);
    return;
  }
  const fallback = rendered[0];
  if (fallback) output.write(fallback.endsWith("\n") ? fallback : `${fallback}\n`);
};

const handleInterrupt = () => {
  if (!activeOperationController) {
    write("Use /exit to end the session. Ctrl+C cancels an active agent operation.");
    return;
  }
  if (activeOperationController.signal.aborted) {
    write("Cancellation already requested; waiting for cleanup.");
    return;
  }
  write("Cancellation requested. Stopping the active agent operation…");
  activeOperationController.abort();
};

const prepareRunSignal = (): AbortSignal => {
  if (activeOperationController) {
    throw new Error("An Orynt agent operation is already active");
  }
  activeOperationController = new AbortController();
  return activeOperationController.signal;
};

const releaseRunSignal = (signal: AbortSignal): void => {
  if (activeOperationController?.signal === signal) activeOperationController = undefined;
};

const cancelRunSignal = (signal: AbortSignal): void => {
  if (
    activeOperationController?.signal === signal &&
    !activeOperationController.signal.aborted
  ) {
    activeOperationController.abort();
  }
};

ttyComposer = terminal
  ? new TtyComposer({
      input,
      output,
      color: colorEnabled,
      themeId,
      motion: motionEnabled,
      richText: richTextEnabled,
      shortcuts: initialShortcuts,
      statusline: initialStatusline,
      clipboardPreferences: initialClipboard,
      viewportMode: appearanceResolution.screenMode,
      clipboard,
      designSystem,
      onInterrupt: handleInterrupt,
    })
  : undefined;

const applyAppearance = (
  appearance: typeof DEFAULT_CLI_APPEARANCE,
) => {
  appearanceResolution = resolveTerminalAppearance({
    isTTY: terminal,
    saved: appearance,
    argv,
    env: process.env,
  });
  colorEnabled = appearanceResolution.color;
  motionEnabled = appearanceResolution.motion;
  richTextEnabled = appearanceResolution.richText;
  themeId = appearanceResolution.themeId;
  designSystem.update({ color: colorEnabled, themeId });
  ttyComposer?.setPresentation({
    color: colorEnabled,
    themeId,
    motion: motionEnabled,
    richText: richTextEnabled,
  });
  return appearanceResolution;
};

const applyShortcuts = (shortcuts: typeof DEFAULT_CLI_SHORTCUTS) => {
  ttyComposer?.setShortcuts(shortcuts);
};

const applyStatusline = (statusline: typeof DEFAULT_CLI_STATUSLINE) => {
  ttyComposer?.setStatusline(statusline);
};

const applyClipboard = (preferences: typeof DEFAULT_CLI_CLIPBOARD) => {
  ttyComposer?.setClipboardPreferences(preferences);
};

const signalExitCodes: Partial<Record<NodeJS.Signals, number>> = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};
const signalHandlers = new Map<NodeJS.Signals, () => void>();
let terminationRequested = false;
for (const [signal, exitCode] of Object.entries(signalExitCodes) as [NodeJS.Signals, number][]) {
  const handler = () => {
    if (terminationRequested) {
      process.exit(exitCode);
    }
    terminationRequested = true;
    process.exitCode = exitCode;
    activeOperationController?.abort();
    ttyComposer?.close();
    interface_?.close();
    const hardExit = setTimeout(() => process.exit(exitCode), 5_000);
    hardExit.unref();
  };
  signalHandlers.set(signal, handler);
  process.once(signal, handler);
}

const runExternalCodexCommand = async (
  executable: string,
  commandArgs: string[],
  options: { timeoutMs?: number } = {},
): Promise<{ exitCode: number | null; signal?: NodeJS.Signals | null }> => {
  if (!terminal || !ttyComposer) {
    throw new Error("External Codex setup commands require an interactive TTY");
  }
  const restoreTerminal = ttyComposer.suspend();
  const normalSigintHandler = signalHandlers.get("SIGINT");
  if (normalSigintHandler) process.off("SIGINT", normalSigintHandler);
  const childOwnsSigint = () => undefined;
  process.on("SIGINT", childOwnsSigint);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, commandArgs, {
        cwd: process.cwd(),
        env: codexChildEnvironment(),
        shell: false,
        stdio: "inherit",
      });
      let timeout: NodeJS.Timeout | undefined;
      if (options.timeoutMs !== undefined) {
        timeout = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
        timeout.unref();
      }
      child.once("error", (error) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (exitCode, signal) => {
        if (timeout) clearTimeout(timeout);
        resolve({ exitCode, signal });
      });
    });
  } finally {
    process.off("SIGINT", childOwnsSigint);
    if (normalSigintHandler && !terminationRequested) {
      process.once("SIGINT", normalSigintHandler);
    }
    restoreTerminal();
  }
};

const runWithInterrupt = async (request: Parameters<typeof runCliRepositoryTask>[0]) => {
  const controller = request.signal
    ? activeOperationController?.signal === request.signal
      ? activeOperationController
      : undefined
    : new AbortController();
  if (!controller) {
    throw new Error("Controlled run signal was not prepared by Orynt");
  }
  activeOperationController = controller;
  try {
    return await runCliRepositoryTask({ ...request, signal: request.signal ?? controller.signal });
  } finally {
    if (activeOperationController === controller) activeOperationController = undefined;
  }
};

try {
  let automaticRetentionEnabled = false;
  if (
    argv[0] !== "update" &&
    !(argv[0] === "setup" && argv.includes("--check")) &&
    !argv.includes("--help") &&
    !argv.includes("-h") &&
    !argv.includes("--version") &&
    !argv.includes("-v")
  ) {
    let preferences = await preferencesStore.load();
    let consent = preferences.updateCheckConsent ?? "unknown";
    if (consent === "unknown" && terminal) {
      const answer = await ttyComposer?.ask(
        "Check for updates at startup? [y/N] ",
      );
      consent = /^(?:y|yes)$/i.test(answer?.trim() ?? "")
        ? "enabled"
        : "disabled";
      await preferencesStore.saveUpdateCheckConsent(consent);
      preferences = await preferencesStore.load();
    }
    const notice = await checkForStartupUpdate({
      stateRoot,
      consent,
    });
    if (notice) write(notice);
    if (
      automaticMaintenanceEligible &&
      preferences.sessionRetention === undefined
    ) {
      const answer = await ttyComposer?.ask(
        "Clean up old sessions automatically? [y/N] ",
      );
      const mode = /^(?:y|yes)$/i.test(answer?.trim() ?? "")
        ? "automatic_audited"
        : "audit_only";
      await preferencesStore.saveSessionRetention(mode);
      automaticRetentionEnabled = mode === "automatic_audited";
    } else {
      automaticRetentionEnabled =
        preferences.sessionRetention?.mode === "automatic_audited";
    }
  }
  if (argv[0] === "lsp") {
    process.exitCode = await runLspCli(argv.slice(1), {
      cwd: process.cwd(),
      stateRoot,
      write,
      restart: async (adapterId) => {
        await prepareCliCodeIntelTools(process.cwd());
        await restartCliCodeIntelAdapter(adapterId);
      },
    });
  } else if (argv[0] === "sessions") {
    process.exitCode = await runSessionCli(argv.slice(1), {
      stateRoot,
      cwd: process.cwd(),
      width: output.columns,
      write,
    });
  } else if (argv[0] === "browser") {
    process.exitCode = await runBrowserCli(argv.slice(1), {
      env: process.env,
      stateRoot,
      write,
    });
  } else if (argv[0] === "assets") {
    process.exitCode = await runAssetCli(argv.slice(1), {
      cwd: process.cwd(),
      env: process.env,
      write,
      recordMemoryExemption: (input) =>
        contextVm.recordMemoryExemption({
          sessionId: `asset-${Date.now()}`,
          ...input,
        }),
      confirm: terminal
        ? async (prompt) => {
            const answer = await ttyComposer?.ask(`${prompt} [y/N] `);
            return /^(?:y|yes)$/i.test(answer?.trim() ?? "");
          }
        : undefined,
    });
  } else if (argv[0] === "improve") {
    process.exitCode = await runImproveCli(argv.slice(1), {
      stateRoot,
      write,
      confirm: terminal
        ? async (prompt) => {
            const answer = await ttyComposer?.ask(`${prompt} [y/N] `);
            return /^(?:y|yes)$/i.test(answer?.trim() ?? "");
          }
        : undefined,
    });
  } else if (argv[0] === "intelligence") {
    process.exitCode = await runIntelligenceCli({
      argv: argv.slice(1),
      stateRoot,
      write,
    });
  } else if (argv[0] === "update") {
    process.exitCode = await runUpdateCli(argv.slice(1), {
      stateRoot,
      write,
      saveStartupConsent: (consent) =>
        preferencesStore.saveUpdateCheckConsent(consent),
      confirm: terminal
        ? async (prompt) => {
            const answer = await ttyComposer?.ask(`${prompt} [y/N] `);
            return /^(?:y|yes)$/i.test(answer?.trim() ?? "");
          }
        : undefined,
    });
  } else if (argv[0] === "skills") {
    process.exitCode = await runSkillCli(argv.slice(1), {
      cwd: process.cwd(),
      isTTY: terminal,
      manager: skillManager,
      write,
      confirm: terminal
        ? async (prompt) => {
            const answer = await (ttyComposer
              ? ttyComposer.ask(`${prompt} [y/N] `)
              : Promise.resolve("no"));
            return /^(?:y|yes)$/i.test(answer.trim());
          }
        : undefined,
    });
  } else {
    process.exitCode = await runCliApplication(argv, {
    cwd: process.cwd(),
    isTTY: terminal,
    color: colorEnabled,
    themeId,
    richText: richTextEnabled,
    get width() {
      return output.columns;
    },
    get height() {
      return output.rows;
    },
    ask: async (prompt) => {
      if (ttyComposer) return ttyComposer.ask(prompt);
      const next = await lineIterator?.next();
      if (!next) return "/exit";
      const answer = next.done ? "/exit" : next.value;
      output.write(`${prompt}${terminalSafeText(answer)}\n`);
      return answer;
    },
    compose: ttyComposer?.compose,
    beginLiveInput: ttyComposer?.beginLiveInput,
    setProviderUsage: ttyComposer?.setProviderUsage,
    takeSubmittedImages: ttyComposer?.takeSubmittedImages,
    takeSubmittedDraft: ttyComposer?.takeSubmittedDraft,
    select: ttyComposer?.select,
    remember: ttyComposer?.remember,
    beginActivity: ttyComposer?.beginActivity,
    beginStartupActivity: ttyComposer?.beginStartupActivity,
    beginMessageStream: ttyComposer?.beginMessageStream,
    write,
    writeCentered,
    clear: () => {
      if (terminal) ttyComposer?.clearViewport();
    },
    probeProvider: probeCodexCli,
    setupProvider: (initialStatus) =>
      runCodexSetup({
        isTTY: terminal,
        platform: process.platform,
        ...(initialStatus?.code
          ? { initialStatus: initialStatus as import("./codexSetup.js").CodexProviderStatus }
          : {}),
        write,
        select: ttyComposer?.select,
        confirm: terminal
          ? async (prompt) => {
              const answer = await ttyComposer?.ask(`${prompt} [y/N] `);
              return /^(?:y|yes)$/i.test(answer?.trim() ?? "");
            }
          : undefined,
        probe: probeCodexCli,
        runExternal: runExternalCodexCommand,
      }),
    listModels: listCliModels,
    turn: async (request) => {
      let prepared: Awaited<ReturnType<typeof prepareCliCapabilities>>;
      if (request.capabilitySettings) {
        try {
          prepared = await prepareCliCapabilities({
            stateRoot,
            repositoryPath: request.repositoryPath,
            prompt: request.prompt,
            settings: request.capabilitySettings,
            provider:
              process.env.ORYNT_AGENT_RUNTIME === "native" &&
              process.env.OPENAI_API_KEY
                ? "openai_responses"
                : "codex_app_server",
            model: request.modelId,
            signal: request.signal,
            approveBrowserVision: terminal
              ? async (summary, digest) => {
                  write(`${summary}\nSession trust digest: ${digest}`);
                  const answer = await ttyComposer?.ask("Use browser vision for this session? [y/N] ");
                  return /^(?:y|yes)$/i.test(answer?.trim() ?? "");
                }
              : undefined,
            approveBrowserAction: terminal
              ? async (summary) => {
                  const answer = await ttyComposer?.ask(
                    `Run browser action: ${summary}? [y/N] `,
                  );
                  return /^(?:y|yes)$/i.test(answer?.trim() ?? "");
                }
              : undefined,
            approveCodeRefactor: terminal
              ? async (summary, digest) => {
                  write(`${summary}\nPreview digest: ${digest}`);
                  const answer = await ttyComposer?.ask(
                    "Apply this exact code refactor? [y/N] ",
                  );
                  return /^(?:y|yes)$/i.test(answer?.trim() ?? "");
                }
              : undefined,
          });
        } catch (error) {
          write(
            `Browser capability unavailable for this turn: ${terminalSafeText(
              error instanceof Error ? error.message : String(error),
            )}`,
          );
        }
      }
      try {
        return await runCliAgentTurn({
          ...request,
          contextVm,
          ...(prepared ? { capabilityTools: prepared.tools } : {}),
        });
      } finally {
        await prepared?.close();
      }
    },
    readOnlyRole: async (request) => {
      const capabilityTools = await prepareCliCodeIntelTools(
        request.repositoryPath,
      );
      return await runCliReadOnlyRole({
        ...request,
        contextVm,
        ...(capabilityTools ? { capabilityTools } : {}),
      });
    },
    run: runWithInterrupt,
    codeIntelStatus: cliCodeIntelStatus,
    diagnose: (request) => collectDoctorReport({
      ...request,
      stateRoot,
      isTTY: terminal,
      color: colorEnabled,
      term: process.env.TERM,
      width: output.columns,
      height: output.rows,
      themeId,
    }, {
      probeCodexEnvironment,
      probeClaudeEnvironment: () => probeClaudeEnvironment(),
      probeOpencodeEnvironment: () => probeOpencodeEnvironment(),
      listModels: listCliModels,
      loadPreferences: () => preferencesStore.load(),
      codeIntelStatus: cliCodeIntelStatus,
      runLiveTier: async (tier, binding) => {
        await contextVm.recordMemoryExemption({
          sessionId: "doctor-provider-probe",
          operation: `doctor.model-tier.${tier}`,
          reason: "provider_probe",
          transport: binding.providerId,
          modelId: binding.modelId,
          input: `Live provider readiness probe for ${tier} tier.`,
        });
        await diagnoseModelTierLive(tier, binding);
      },
    }),
    readProviderUsage: async (detail) => {
      // Usage is provider-specific, so it follows the coordinator tier's
      // binding rather than assuming Codex.
      const preferences = await preferencesStore.load();
      const tiers = preferences.workingConfig?.modelTierConfiguration;
      const providerId = tiers
        ? tiers.tiers[tiers.roles.coordinator].providerId
        : "codex-cli";
      return readCliProviderUsage(detail, providerId);
    },
    listSkills: async (repositoryPath) => {
      const inventory = (await skillManager.list({
        repositoryPath,
      })) as {
        skills?: Array<{
          id: string;
          name: string;
          description: string;
          scope: string;
          trust: "trusted" | "community" | "untrusted";
          eligible: boolean;
          health: string;
        }>;
      };
      return inventory.skills ?? [];
    },
    routeSkills: runCliSkillRoutingTurn,
    snapshotSkills: async (request) => {
      const result = await skillManager.snapshotContext(request) as {
        context?: import("@codepawl/shared").SkillContextSnapshot;
      };
      if (!result.context) {
        throw new Error("Skill context snapshot was incomplete");
      }
      return result.context;
    },
    persistSession: (session) => sessionStore.save(session),
    loadSession: (sessionId) => sessionId === "latest" ? sessionStore.loadLatest() : sessionStore.load(sessionId),
    listSessions: (options) =>
      sessionStore.list({ ...options, limit: options?.limit ?? 20 }),
    appendTranscript: (sessionId, logicalTurnId, messages, recordedAt) =>
      sessionStore.appendTranscript(
        sessionId,
        logicalTurnId,
        messages,
        recordedAt,
      ),
    readTranscript: (sessionId, options) =>
      sessionStore.readTranscript(sessionId, options),
    copyText: (value) => clipboard.writeText(value),
    notify: (text, role) => ttyComposer?.notify(text, role),
    compactContext: (threadId) =>
      cliCodexAppServerRuntime().compactThread(threadId),
    loadPreferences: () => preferencesStore.load(),
    persistWorkingConfig: (patch) => preferencesStore.saveWorkingConfig(patch),
    persistActivityDetails: (activityDetails) =>
      preferencesStore.saveActivityDetails(activityDetails),
    persistSkillRouting: (skillRouting) =>
      preferencesStore.saveSkillRouting(skillRouting),
    persistCapabilityRuntime: (settings) =>
      preferencesStore.saveCapabilityRuntime(settings),
    appearanceResolution,
    persistAppearance: (patch) => preferencesStore.saveAppearance(patch),
    applyAppearance,
    persistClipboard: (preferences) =>
      preferencesStore.saveClipboard(preferences),
    applyClipboard,
    persistShortcuts: (shortcuts) => preferencesStore.saveShortcuts(shortcuts),
    applyShortcuts,
    persistStatusline: (statusline) =>
      preferencesStore.saveStatusline(statusline),
    applyStatusline,
    hasAcknowledgedStartupBoundary: () => preferencesStore.hasAcknowledgedStartupBoundary(),
    acknowledgeStartupBoundary: () => preferencesStore.acknowledgeStartupBoundary(),
    prepareRunSignal,
    cancelRunSignal,
    releaseRunSignal,
    });
    if (automaticMaintenanceEligible && automaticRetentionEnabled) {
      const report = await sessionStore.maintainIfDue();
      if (
        report &&
        (
          report.trashed.length > 0 ||
          report.purged.length > 0 ||
          report.artifactCleanup.length > 0 ||
          report.sandboxCleanup.length > 0 ||
          report.cleanupBlocked.length > 0
        )
      ) {
        write(
          `Session maintenance · ${report.trashed.length} trashed · ${report.purged.length} purged · ${report.artifactCleanup.length} artifacts · ${report.sandboxCleanup.length} worktrees · ${report.cleanupBlocked.length} blocked`,
        );
      }
    }
  }
} catch (error) {
  write(`Fatal: ${terminalSafeText(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
} finally {
  await shutdownCliCapabilityRuntime();
  await shutdownCliAgentRuntime();
  await contextVm.close();
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  ttyComposer?.close();
  interface_?.close();
}
}

void main().catch((error) => {
  process.stderr.write(
    `Fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
