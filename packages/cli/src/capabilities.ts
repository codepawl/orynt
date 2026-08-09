import { createHash, randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";

import { createAgentRuntimeSession } from "@codepawl/agent-runtime";
import {
  BrowserAgentToolExecutor,
  OryntCdpBrowserRuntime,
} from "@codepawl/browser-runtime";
import {
  CodeIntelService,
  CodeIntelToolExecutor,
  FileMutationPreviewStore,
  type MutationApprovalBundle,
  type MutationVerificationCommand,
} from "@codepawl/code-intel-runtime";
import type { CustomLanguageServerAdapter } from "@codepawl/lsp-runtime";
import {
  InMemorySessionTrust,
  type CapabilityRouterWeights,
} from "@codepawl/capability-runtime";
import { LocalIntelligenceRuntime } from "@codepawl/intelligence-runtime";
import {
  AuditableGateway,
  BrowserGatewayAdapter,
  LocalGatewayEvidenceStore,
  createGatewayBrowserToolAuthority,
  type ApprovalProvider,
} from "@codepawl/gateway";
import {
  CompositeAgentToolExecutor,
  type AgentFunctionTool,
  type AgentToolExecutor,
} from "@codepawl/model-runtime";
import { RepositoryMutationTransaction } from "@codepawl/repository-sandbox";
import {
  createConservativeCodingApprenticePolicy,
  type CapabilityDescriptorV1,
  type CapabilityRuntimeSettingsV1,
} from "@codepawl/shared";

import { readBrowserSessionDescriptor } from "./browser.js";

export type PreparedCliCapabilities = {
  tools: AgentToolExecutor;
  selectedCapabilityIds: string[];
  telemetry(): {
    toolCalls: number;
    observationBytes: number;
    snapshotCount: number;
    deltaCount: number;
    recoveryCount: number;
  };
  close(): Promise<void>;
};

export type PrepareCliCapabilitiesInput = {
  stateRoot: string;
  repositoryPath: string;
  prompt: string;
  settings: CapabilityRuntimeSettingsV1;
  signal?: AbortSignal;
  approveBrowserAction?: (summary: string) => Promise<boolean>;
  provider?: "openai_responses" | "codex_app_server";
  model?: string;
  approveBrowserVision?: (summary: string, digest: string) => Promise<boolean>;
  approveCodeRefactor?: (
    summary: string,
    digest: string,
  ) => Promise<boolean>;
  codeVerificationCommands?: MutationVerificationCommand[];
};

const READ_TOOL_NAMES = new Set(["browser_tabs", "browser_observe", "browser_wait"]);
const CODE_MUTATION_TOOL_NAMES = new Set(["code_refactor_apply"]);

type SharedBrowserRuntime = {
  key: string;
  runtime: OryntCdpBrowserRuntime;
  leases: number;
};

let sharedBrowserRuntime: SharedBrowserRuntime | undefined;
let sharedCodeIntelService: CodeIntelService | undefined;
let sharedCodeIntelStateRoot: string | undefined;
let codeIntelFailure: string | undefined;
let customCodeIntelAdapters: CustomLanguageServerAdapter[] = [];
const browserVisionTrust = new InMemorySessionTrust();
const browserVisionTrustDecisions = new Set<string>();

async function verifyApprovedMutation(
  approval: MutationApprovalBundle,
  signal?: AbortSignal,
): Promise<{
  mode: "diagnostics_only" | "commands";
  commands: Array<{ argvDigest: string; exitCode: number; durationMs: number }>;
}> {
  const cancelled = (): never => {
    throw Object.assign(new Error("Mutation verification was cancelled."), {
      code: "REQUEST_CANCELLED",
      retryable: true,
    });
  };
  if (signal?.aborted) cancelled();
  const evidence: Array<{
    argvDigest: string;
    exitCode: number;
    durationMs: number;
  }> = [];
  for (const command of approval.verification.commands) {
    if (signal?.aborted) cancelled();
    if (Date.parse(approval.expiresAt) <= Date.now()) {
      throw new Error("Mutation approval expired before verification completed.");
    }
    const started = performance.now();
    const process_ = Bun.spawn(command.argv, {
      cwd: command.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    let timedOut = false;
    let aborted = false;
    let force: ReturnType<typeof setTimeout> | undefined;
    const terminate = (): void => {
      process_.kill("SIGTERM");
      force = setTimeout(() => process_.kill("SIGKILL"), 2_000);
      force.unref();
    };
    const abort = (): void => {
      aborted = true;
      terminate();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, command.timeoutMs);
    const [exitCode, stdout, stderr] = await Promise.all([
      process_.exited,
      readBoundedProcessOutput(process_.stdout),
      readBoundedProcessOutput(process_.stderr),
    ]).finally(() => {
      clearTimeout(timeout);
      if (force) clearTimeout(force);
      signal?.removeEventListener("abort", abort);
    });
    const argvDigest = createHash("sha256")
      .update(JSON.stringify(command.argv))
      .digest("hex");
    evidence.push({
      argvDigest,
      exitCode,
      durationMs: Math.round(performance.now() - started),
    });
    if (aborted) cancelled();
    if (timedOut || exitCode !== 0) {
      throw new Error(
        `Approved verification command ${timedOut ? "timed out" : "failed"} (${command.argv.join(" ")}): ${
          (stderr || stdout).slice(-4_000)
        }`,
      );
    }
  }
  return { mode: approval.verification.mode, commands: evidence };
}

async function readBoundedProcessOutput(
  stream: ReadableStream<Uint8Array> | number | undefined,
  maxBytes = 64 * 1024,
): Promise<string> {
  if (!stream || typeof stream === "number") return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - total;
    const bounded = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(bounded);
    total += bounded.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function acquireBrowserRuntime(
  descriptor_: Awaited<ReturnType<typeof readBrowserSessionDescriptor>>,
): Promise<{ runtime: OryntCdpBrowserRuntime; release(): Promise<void> }> {
  if (!descriptor_) throw new Error("Scoped browser session is unavailable");
  const key = JSON.stringify({
    webSocketUrl: descriptor_.webSocketUrl,
    mode: descriptor_.mode,
    allowedOrigins: descriptor_.allowedOrigins,
  });
  if (sharedBrowserRuntime?.key !== key) {
    if (sharedBrowserRuntime && sharedBrowserRuntime.leases > 0) {
      throw new Error(
        "Browser session scope changed while a browser turn is active",
      );
    }
    await sharedBrowserRuntime?.runtime.disconnect().catch(() => undefined);
    const runtime = new OryntCdpBrowserRuntime();
    await runtime.attach(
      {
        webSocketUrl: descriptor_.webSocketUrl,
        allowedOrigins: descriptor_.allowedOrigins,
      },
      descriptor_.mode,
    );
    sharedBrowserRuntime = { key, runtime, leases: 0 };
  }
  const lease = sharedBrowserRuntime;
  lease.leases += 1;
  let released = false;
  return {
    runtime: lease.runtime,
    release: async () => {
      if (released) return;
      released = true;
      lease.leases = Math.max(0, lease.leases - 1);
    },
  };
}

export async function shutdownCliCapabilityRuntime(): Promise<void> {
  const shared = sharedBrowserRuntime;
  sharedBrowserRuntime = undefined;
  const codeIntel = sharedCodeIntelService;
  sharedCodeIntelService = undefined;
  sharedCodeIntelStateRoot = undefined;
  await Promise.all([
    shared?.runtime.disconnect().catch(() => undefined),
    codeIntel?.close().catch(() => undefined),
  ]);
}

export function cliCodeIntelStatus(): {
  enabled: boolean;
  failure?: string;
  sessions: number;
  state?: string;
  serverFingerprint?: string;
} {
  const sessions = sharedCodeIntelService?.runtimeStatus().sessions ?? [];
  const active = sessions[0];
  return {
    enabled: Boolean(sharedCodeIntelService),
    ...(codeIntelFailure ? { failure: codeIntelFailure } : {}),
    sessions: sessions.length,
    ...(active
      ? {
          state: active.state,
          serverFingerprint: active.serverFingerprint,
        }
      : {}),
  };
}

export async function prepareCliCodeIntelTools(
  repositoryPath: string,
): Promise<AgentToolExecutor | undefined> {
  return await codeIntelExecutor(repositoryPath);
}

export function configureCliCodeIntelAdapters(
  adapters: CustomLanguageServerAdapter[],
): void {
  if (sharedCodeIntelService) {
    throw new Error(
      "Custom LSP adapters must be configured before code intelligence starts.",
    );
  }
  customCodeIntelAdapters = structuredClone(adapters);
}

export async function restartCliCodeIntelAdapter(
  adapterId: string,
): Promise<void> {
  if (!sharedCodeIntelService) {
    throw new Error("Code intelligence has not started.");
  }
  await sharedCodeIntelService.restart(adapterId);
}

async function codeIntelExecutor(
  repositoryPath: string,
  options?: {
    stateRoot: string;
    signal?: AbortSignal;
    approveCodeRefactor?: (
      summary: string,
      digest: string,
    ) => Promise<boolean>;
    verificationCommands?: MutationVerificationCommand[];
  },
): Promise<CodeIntelToolExecutor | undefined> {
  if (process.env.ORYNT_INSTALL_KIND === "native") {
    codeIntelFailure =
      "Persistent LSP requires the npm distribution until the native companion runtime is available.";
    return undefined;
  }
  try {
    if (
      sharedCodeIntelService &&
      options?.stateRoot &&
      sharedCodeIntelStateRoot !== options.stateRoot
    ) {
      await sharedCodeIntelService.close();
      sharedCodeIntelService = undefined;
    }
    sharedCodeIntelService ??= new CodeIntelService({
      maxSessions: 8,
      maxCacheEntries: 512,
      customAdapters: customCodeIntelAdapters,
      ...(options?.stateRoot
        ? {
            previewStore: new FileMutationPreviewStore({
              stateRoot: options.stateRoot,
              maxEntries: 128,
              maxBytes: 10 * 1024 * 1024,
            }),
          }
        : {}),
    });
    sharedCodeIntelStateRoot = options?.stateRoot;
    await sharedCodeIntelService.open(repositoryPath);
    codeIntelFailure = undefined;
    return new CodeIntelToolExecutor(
      sharedCodeIntelService,
      options?.approveCodeRefactor
        ? {
            signal: options.signal,
            mutationRuntime: new RepositoryMutationTransaction({
              repositoryPath,
              stateRoot: options.stateRoot,
            }),
            verificationCommands: async () =>
              structuredClone(options.verificationCommands ?? []),
            verifyMutation: verifyApprovedMutation,
            approveMutation: async (preview, approval) =>
              await options.approveCodeRefactor!(
                [
                  `Apply ${preview.operation.kind} preview ${preview.previewId}?`,
                  `Files: ${preview.affectedFiles.map(({ path: filePath }) => filePath).join(", ")}`,
                  `Verification: ${
                    approval.verification.mode === "commands"
                      ? approval.verification.commands
                        .map(({ argv }) => argv.join(" ")).join("; ")
                      : "LSP diagnostics delta only"
                  }`,
                  preview.unifiedDiff,
                ].join("\n"),
                approval.approvalDigest,
              ),
          }
        : { signal: options?.signal },
    );
  } catch (error) {
    codeIntelFailure =
      error instanceof Error ? error.message : String(error);
    return undefined;
  }
}

function descriptor(
  id: string,
  risk: CapabilityDescriptorV1["risk"],
  toolNames: string[],
): CapabilityDescriptorV1 {
  return {
    schemaVersion: 1,
    id,
    version: "1",
    digest: `${id}-v1`,
    kind: "tool_namespace",
    namespace: "browser",
    title: risk === "read_only" ? "Browser observation" : "Browser actions",
    summary: risk === "read_only"
      ? "Inspect an explicitly attached local browser session"
      : "Perform an approved typed action in an explicitly attached local browser session",
    tags: ["browser", "web", "tabs", "page", "cdp"],
    inputKinds: ["prompt"],
    outputKinds: ["browser_observation"],
    environment: ["cli"],
    trust: "builtin",
    risk,
    health: "healthy",
    auth: "not_required",
    source: {
      id: "browser-runtime",
      uri: `orynt-runtime://browser/${risk === "read_only" ? "read" : "act"}`,
      immutable: true,
    },
    provenanceRefs: [],
    repositoryScopes: [],
    toolNames,
  };
}

export async function prepareCliCapabilities(
  input: PrepareCliCapabilitiesInput,
): Promise<PreparedCliCapabilities | undefined> {
  if (input.settings.routingMode === "off") return undefined;
  const intelligence = new LocalIntelligenceRuntime(input.stateRoot);
  await intelligence.initialize();
  const namespace = {
    capabilityId: "cli-agent",
    workspaceId: `repository-${path.basename(input.repositoryPath) || "root"}`,
    repositoryPath: path.resolve(input.repositoryPath),
  };
  const intelligenceExecutor = intelligence.createSearchExecutor({
    namespace,
    settings: input.settings,
  });
  const intelligenceTools = intelligenceExecutor.tools();
  const codeExecutor = await codeIntelExecutor(input.repositoryPath, {
    stateRoot: input.stateRoot,
    signal: input.signal,
    ...(input.approveCodeRefactor
      ? { approveCodeRefactor: input.approveCodeRefactor }
      : {}),
    ...(input.codeVerificationCommands
      ? { verificationCommands: input.codeVerificationCommands }
      : {}),
  });
  const codeTools = codeExecutor?.tools() ?? [];
  const codeReadTools = codeTools.filter(
    ({ name }) => !CODE_MUTATION_TOOL_NAMES.has(name),
  );
  const codeMutationTools = codeTools.filter(({ name }) =>
    CODE_MUTATION_TOOL_NAMES.has(name)
  );
  const intelligenceDescriptor: CapabilityDescriptorV1 = {
    ...descriptor(
      "intelligence.read",
      "read_only",
      intelligenceTools.map(({ name }) => name),
    ),
    namespace: "intelligence",
    title: "Orynt intelligence search",
    summary:
      "Search approved, namespace-scoped memory and explicitly active local improvements",
    tags: ["intelligence", "memory", "provenance", "search"],
    source: {
      id: "intelligence-runtime",
      uri: "orynt-runtime://intelligence/read",
      immutable: true,
    },
  };
  const descriptor_ = await readBrowserSessionDescriptor(input.stateRoot);
  if (!descriptor_) {
    const executors: AgentToolExecutor[] = [
      intelligenceExecutor,
      ...(codeExecutor ? [codeExecutor] : []),
    ];
    return {
      tools:
        executors.length === 1
          ? intelligenceExecutor
          : new CompositeAgentToolExecutor(executors),
      selectedCapabilityIds: [
        "intelligence.read",
        ...(codeExecutor ? ["code-intelligence.read"] : []),
        ...(codeMutationTools.length ? ["code-intelligence.mutate"] : []),
      ],
      telemetry: () => ({
        toolCalls: 0,
        observationBytes: 0,
        snapshotCount: 0,
        deltaCount: 0,
        recoveryCount: 0,
      }),
      close: async () => undefined,
    };
  }
  if (input.signal?.aborted) {
    throw Object.assign(new Error("Capability preparation cancelled"), {
      name: "AbortError",
    });
  }
  const trustMaterial = {
    schemaVersion: 1 as const,
    repositoryRealpath: await realpath(input.repositoryPath),
    provider: input.provider ?? "codex_app_server",
    model: input.model ?? "unknown",
    allowedOrigins: descriptor_.allowedOrigins,
    browserVision: true as const,
  };
  let visionTrusted = false;
  try {
    browserVisionTrust.require(trustMaterial);
    visionTrusted = true;
  } catch {
    const proposal = browserVisionTrust.proposal(trustMaterial);
    const summary = [
      "Allow Orynt to send up to three non-sensitive browser region crops to the selected model for this process only?",
      `Repository: ${proposal.repositoryRealpath}`,
      `Provider/model: ${proposal.provider}/${proposal.model}`,
      `Origins: ${proposal.allowedOrigins.join(", ")}`,
    ].join("\n");
    if (!browserVisionTrustDecisions.has(proposal.digest)) {
      browserVisionTrustDecisions.add(proposal.digest);
      if (await input.approveBrowserVision?.(summary, proposal.digest)) {
        browserVisionTrust.accept(proposal, proposal.digest);
        visionTrusted = true;
      }
    }
  }

  const lease = await acquireBrowserRuntime(descriptor_);
  const runtime = lease.runtime;
  const approvalProvider: ApprovalProvider = {
    decide: async (action) => {
      if (!action.stateChanging) return "approved";
      if (!input.approveBrowserAction) return "rejected";
      return await input.approveBrowserAction(action.instruction)
        ? "approved"
        : "rejected";
    },
  };
  const runId = `cli-${randomUUID()}`;
  const gateway = new AuditableGateway({
    policy: createConservativeCodingApprenticePolicy(input.repositoryPath),
    adapter: new BrowserGatewayAdapter(runtime),
    approvalProvider,
    evidenceStore: new LocalGatewayEvidenceStore(
      path.join(input.stateRoot, "artifacts", runId, "gateway"),
    ),
  });
  const browserExecutor = new BrowserAgentToolExecutor(
    createGatewayBrowserToolAuthority(
      (action) => gateway.routeAction(action),
      {
        runId,
        workspaceId: input.repositoryPath,
        userId: "local-user",
      },
      async (pageId, payload) =>
        payload.batch
          ? runtime.inspectBatch(pageId, payload.batch)
          : [await runtime.inspectAction(pageId, payload.action!)],
    ),
  );
  const allTools = browserExecutor.tools() as AgentFunctionTool[];
  const readTools = allTools.filter((tool) => READ_TOOL_NAMES.has(tool.name));
  const actionTools = allTools.filter((tool) => !READ_TOOL_NAMES.has(tool.name));
  const descriptors = [
    intelligenceDescriptor,
    ...(codeExecutor
      ? [
          {
            ...descriptor(
              "code-intelligence.read",
              "read_only",
              codeReadTools.map(({ name }) => name),
            ),
            namespace: "code",
            title: "Persistent semantic code intelligence",
            summary:
              "Inspect TypeScript and JavaScript symbols, relations, diagnostics, and bounded context through persistent LSP sessions",
            tags: [
              "code",
              "repository",
              "typescript",
              "javascript",
              "symbol",
              "definition",
              "references",
              "diagnostics",
              "context",
            ],
            inputKinds: ["prompt", "repository"],
            outputKinds: ["semantic_code_context"],
            source: {
              id: "code-intel-runtime",
              uri: "orynt-runtime://code-intelligence/read",
              immutable: true,
            },
            repositoryScopes: [path.resolve(input.repositoryPath)],
          } satisfies CapabilityDescriptorV1,
          ...(codeMutationTools.length
            ? [{
                ...descriptor(
                  "code-intelligence.mutate",
                  "side_effect",
                  codeMutationTools.map(({ name }) => name),
                ),
                namespace: "code",
                title: "Approved semantic code refactors",
                summary:
                  "Apply an exact, user-approved rename or code-action preview through a recoverable repository transaction",
                tags: ["code", "repository", "rename", "refactor", "approval"],
                inputKinds: ["prompt", "repository"],
                outputKinds: ["repository_mutation"],
                source: {
                  id: "code-intel-runtime",
                  uri: "orynt-runtime://code-intelligence/mutate",
                  immutable: true,
                },
                repositoryScopes: [path.resolve(input.repositoryPath)],
              } satisfies CapabilityDescriptorV1]
            : []),
        ]
      : []),
    descriptor("browser.read", "read_only", readTools.map(({ name }) => name)),
    descriptor("browser.act", "side_effect", actionTools.map(({ name }) => name)),
  ];
  const ledger = intelligence.improvementLedger;
  const activeArtifacts = await intelligence.improvementRuntime
    .loadActiveArtifacts();
  const routerWeights = activeArtifacts.find(
    ({ artifact }) => artifact.kind === "router_weights",
  )?.artifact;
  const memoryProfile = activeArtifacts.find(
    ({ artifact }) => artifact.kind === "memory_profile",
  )?.artifact;
  const effectiveSettings = memoryProfile?.kind === "memory_profile"
    ? {
        ...input.settings,
        memoryTopK: memoryProfile.topK,
        memoryTokenBudget: memoryProfile.tokenBudget,
      }
    : input.settings;
  const session = createAgentRuntimeSession<string>({
    inventory: { list: async () => descriptors },
    toolBindings: [
      {
        capabilityId: "intelligence.read",
        tools: intelligenceTools,
        execute: (call) => intelligenceExecutor.execute(call),
      },
      ...(codeExecutor
        ? [
            {
              capabilityId: "code-intelligence.read",
              tools: codeReadTools,
              execute: (call: Parameters<CodeIntelToolExecutor["execute"]>[0]) =>
                codeExecutor.execute(call),
            },
            ...(codeMutationTools.length
              ? [{
                  capabilityId: "code-intelligence.mutate",
                  tools: codeMutationTools,
                  execute: (
                    call: Parameters<CodeIntelToolExecutor["execute"]>[0],
                  ) => codeExecutor.execute(call),
                }]
              : []),
          ]
        : []),
      {
        capabilityId: "browser.read",
        tools: readTools,
        execute: (call) => browserExecutor.execute(call),
      },
      {
        capabilityId: "browser.act",
        tools: actionTools,
        execute: (call) => browserExecutor.execute(call),
      },
    ],
    ledger,
    ...(routerWeights?.kind === "router_weights"
      ? { routerWeights: routerWeights satisfies CapabilityRouterWeights }
      : {}),
    runTurn: async () => ({ result: "" }),
    close: () => lease.release(),
  });
  try {
    const prepared = await session.prepare({
      schemaVersion: 1,
      runId,
      taskId: "coordinator",
      prompt: input.prompt,
      repositoryPath: input.repositoryPath,
      environment: ["cli"],
      connectedCapabilityIds: [],
      capabilitySettings: effectiveSettings,
    });
    if (prepared.tools.length === 0) {
      await session.close();
      return undefined;
    }
    const capabilityByTool = new Map<string, CapabilityDescriptorV1>();
    for (const descriptor of descriptors) {
      for (const toolName of descriptor.toolNames) {
        capabilityByTool.set(toolName, descriptor);
      }
    }
    const browserTelemetry = {
      toolCalls: 0,
      observationBytes: 0,
      snapshotCount: 0,
      deltaCount: 0,
      recoveryCount: 0,
    };
    return {
      tools: {
        tools: () => prepared.tools.map((tool) => structuredClone(tool)),
        execute: async (call) => {
          if (
            call.name === "browser_observe" &&
            typeof call.arguments === "object" &&
            call.arguments !== null &&
            (
              (call.arguments as Record<string, unknown>).screenshot === true ||
              Array.isArray((call.arguments as Record<string, unknown>).visionRefs)
            ) &&
            !visionTrusted
          ) {
            return {
              output: JSON.stringify({
                error: "Browser screenshot requires an accepted in-memory session trust grant.",
              }),
              isError: true,
            };
          }
          const startedAt = performance.now();
          const result = await prepared.executeTool(call);
          if (
            call.name === "browser_observe" &&
            visionTrusted &&
            typeof call.arguments === "object" &&
            call.arguments !== null &&
            Array.isArray((call.arguments as Record<string, unknown>).visionRefs)
          ) {
            const arguments_ = call.arguments as Record<string, unknown>;
            const refs = (arguments_.visionRefs as unknown[])
              .filter((entry): entry is string => typeof entry === "string");
            const parsed = JSON.parse(result.output) as {
              data?: { observation?: { observationId?: unknown } };
            };
            const observationId = parsed.data?.observation?.observationId;
            if (typeof observationId !== "string") {
              return {
                output: JSON.stringify({
                  error: "Browser vision requires a current observation",
                }),
                isError: true,
              };
            }
            const crops = await runtime.captureVisionCrops({
              observationId,
              refs,
            });
            result.images = crops.map((crop) => ({
              dataUrl: `data:${crop.mimeType};base64,${crop.base64}`,
              detail: "original",
              source: "browser_crop",
            }));
          }
          browserTelemetry.toolCalls += 1;
          const capability = capabilityByTool.get(call.name);
          if (capability) {
            const recordedAt = new Date().toISOString();
            const output = (() => {
              try {
                return JSON.parse(result.output) as {
                  evidence?: Array<{ storageRef?: unknown }>;
                  data?: {
                    observation?: {
                      byteLength?: unknown;
                      mode?: unknown;
                    };
                    trace?: {
                      recoveryCount?: unknown;
                    };
                  };
                };
              } catch {
                return {};
              }
            })();
            const observation = output.data?.observation;
            if (
              observation &&
              typeof observation.byteLength === "number" &&
              Number.isFinite(observation.byteLength)
            ) {
              browserTelemetry.observationBytes += Math.max(
                0,
                observation.byteLength,
              );
            }
            if (observation?.mode === "snapshot") {
              browserTelemetry.snapshotCount += 1;
            } else if (observation?.mode === "delta") {
              browserTelemetry.deltaCount += 1;
            }
            if (
              typeof output.data?.trace?.recoveryCount === "number" &&
              Number.isFinite(output.data.trace.recoveryCount)
            ) {
              browserTelemetry.recoveryCount += Math.max(
                0,
                output.data.trace.recoveryCount,
              );
            }
            await ledger.appendOutcome({
              schemaVersion: 1,
              id: `outcome-${randomUUID()}`,
              runId,
              taskId: "coordinator",
              capabilityId: capability.id,
              capabilityVersion: capability.version,
              capabilityDigest: capability.digest,
              taskTemplateId: `cli-${call.name}`,
              repositoryDomain: path.basename(input.repositoryPath) || "repository",
              modelTier: "coordinator",
              verifierPassed: result.isError !== true,
              policyPassed: result.isError !== true,
              unsafeActionCount: 0,
              latencyMs: Math.max(0, performance.now() - startedAt),
              retryCount: 0,
              artifactRefs: (output.evidence ?? [])
                .map(({ storageRef }) => storageRef)
                .filter((reference): reference is string =>
                  typeof reference === "string" &&
                  reference.startsWith("orynt-artifact://")
                ),
              recordedAt,
            });
          }
          return result;
        },
      },
      selectedCapabilityIds: prepared.capabilityPlan.selected.map(
        ({ capabilityId }) => capabilityId,
      ),
      telemetry: () => structuredClone(browserTelemetry),
      close: () => session.close(),
    };
  } catch (error) {
    await session.close();
    throw error;
  }
}
