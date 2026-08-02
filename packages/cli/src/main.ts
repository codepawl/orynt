#!/usr/bin/env node
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";

import "./extensionless-loader.js";

const [
  { runCliApplication },
  { runCliAgentTurn, runCliReadOnlyRole, shutdownCliAgentRuntime },
  { diagnoseCli, listCodexModels, oryntStateRoot, probeCodexCli, runCliRepositoryTask },
  {
    DEFAULT_CLI_APPEARANCE,
    FileCliPreferencesStore,
    FileCliSessionStore,
  },
  { TtyComposer },
  { resolveTerminalAppearance },
  { terminalSafeText },
  { runSkillCli },
  { LocalSkillCliManager },
] = await Promise.all([
  import("./app.js"),
  import("./agent.js"),
  import("./runtime.js"),
  import("./state.js"),
  import("./composer.js"),
  import("./terminal-theme.js"),
  import("./ui.js"),
  import("./skills.js"),
  import("./skillRuntime.js"),
]);

const terminal = Boolean(input.isTTY && output.isTTY);
const argv = process.argv.slice(2);
const stateRoot = oryntStateRoot();
const sessionStore = new FileCliSessionStore(stateRoot);
const preferencesStore = new FileCliPreferencesStore(stateRoot);
const skillManager = new LocalSkillCliManager(stateRoot);
let initialAppearance = { ...DEFAULT_CLI_APPEARANCE };
try {
  initialAppearance = (await preferencesStore.load()).appearance;
} catch {
  // runCliApplication reports preference load and migration failures.
}
let appearanceResolution = resolveTerminalAppearance({
  isTTY: terminal,
  saved: initialAppearance,
  argv,
  env: process.env,
});
let colorEnabled = appearanceResolution.color;
let motionEnabled = appearanceResolution.motion;
let richTextEnabled = appearanceResolution.richText;
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

const write = (value: string) => {
  if (ttyComposer) {
    ttyComposer.write(value);
    return;
  }
  output.write(value.endsWith("\n") ? value : `${value}\n`);
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

ttyComposer = terminal
  ? new TtyComposer({
      input,
      output,
      color: colorEnabled,
      motion: motionEnabled,
      richText: richTextEnabled,
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
  ttyComposer?.setPresentation({
    color: colorEnabled,
    motion: motionEnabled,
    richText: richTextEnabled,
  });
  return appearanceResolution;
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
  if (argv[0] === "skills") {
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
  } else process.exitCode = await runCliApplication(argv, {
    cwd: process.cwd(),
    isTTY: terminal,
    color: colorEnabled,
    richText: richTextEnabled,
    width: output.columns,
    height: output.rows,
    ask: async (prompt) => {
      if (ttyComposer) return ttyComposer.ask(prompt);
      const next = await lineIterator?.next();
      if (!next) return "/exit";
      const answer = next.done ? "/exit" : next.value;
      output.write(`${prompt}${terminalSafeText(answer)}\n`);
      return answer;
    },
    compose: ttyComposer?.compose,
    select: ttyComposer?.select,
    remember: ttyComposer?.remember,
    beginActivity: ttyComposer?.beginActivity,
    beginMessageStream: ttyComposer?.beginMessageStream,
    write,
    clear: () => {
      if (terminal) {
        output.write("\u001bc");
      }
    },
    probeProvider: probeCodexCli,
    listModels: listCodexModels,
    turn: runCliAgentTurn,
    readOnlyRole: runCliReadOnlyRole,
    run: runWithInterrupt,
    diagnose: (repositoryPath = process.cwd()) => diagnoseCli({
      repositoryPath,
      isTTY: terminal,
      color: colorEnabled,
      term: process.env.TERM,
    }),
    listSkills: async (repositoryPath) => {
      const inventory = (await skillManager.list({
        repositoryPath,
      })) as {
        skills?: Array<{
          id: string;
          name: string;
          scope: string;
          eligible: boolean;
          health: string;
        }>;
      };
      return inventory.skills ?? [];
    },
    persistSession: (session) => sessionStore.save(session),
    loadSession: (sessionId) => sessionId === "latest" ? sessionStore.loadLatest() : sessionStore.load(sessionId),
    loadPreferences: () => preferencesStore.load(),
    persistWorkingConfig: (patch) => preferencesStore.saveWorkingConfig(patch),
    persistDebugMode: (debugMode) => preferencesStore.saveDebugMode(debugMode),
    appearanceResolution,
    persistAppearance: (patch) => preferencesStore.saveAppearance(patch),
    applyAppearance,
    hasAcknowledgedStartupBoundary: () => preferencesStore.hasAcknowledgedStartupBoundary(),
    acknowledgeStartupBoundary: () => preferencesStore.acknowledgeStartupBoundary(),
    prepareRunSignal,
    releaseRunSignal,
  });
} catch (error) {
  write(`Fatal: ${terminalSafeText(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
} finally {
  await shutdownCliAgentRuntime();
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  ttyComposer?.close();
  interface_?.close();
}
