import type { ArtifactRef, RunBudget } from "./runSpine";
import type { CorePolicy, RepositoryInspection, RepositorySandbox } from "./corePolicy";

export type CodexExecutionMode = "contract_only" | "manual_cli" | "app_server" | "sdk";

export type CodexProvider = {
  id: string;
  name: string;
  kind: "codex_cli" | "codex_app_server" | "codex_sdk" | "contract_generator";
  version?: string;
};

export type CodexAdapterStatus = {
  provider: CodexProvider;
  available: boolean;
  executionMode: CodexExecutionMode;
  executablePath?: string;
  detectedAt: string;
  reasons: string[];
};

export type CodexContractRequest = {
  runId: string;
  taskId: string;
  goal: string;
  context: string[];
  constraints: string[];
  doneWhen: string[];
  repository: RepositoryInspection;
  sandbox: RepositorySandbox;
  policy: CorePolicy;
  budget: RunBudget;
  validationCommands: string[];
  artifactRoot: string;
};

export type CodexContract = {
  id: string;
  runId: string;
  taskId: string;
  provider: CodexProvider;
  executionMode: CodexExecutionMode;
  goal: string;
  markdown: string;
  metadata: {
    id: string;
    runId: string;
    taskId: string;
    providerId: string;
    executionMode: CodexExecutionMode;
    repository: RepositoryInspection;
    sandbox: RepositorySandbox;
    allowedPaths: string[];
    protectedPaths: string[];
    blockedCommands: string[];
    validationCommands: string[];
    budget: RunBudget;
    redactionApplied: boolean;
    createdAt: string;
  };
};

export type CodexContractArtifact = {
  contractId: string;
  runId: string;
  taskId: string;
  artifactRoot: string;
  markdownPath: string;
  metadataPath: string;
  markdownSha256: string;
  metadataSha256: string;
  artifacts: ArtifactRef[];
};

export interface CodexAdapter {
  detectCodex(runId?: string): Promise<CodexAdapterStatus>;
  createContract(request: CodexContractRequest): CodexContract;
  writeContractArtifact(contract: CodexContract, artifactRoot: string): Promise<CodexContractArtifact>;
  summarizeContract(contract: CodexContract): string;
  explainExecutionMode(mode: CodexExecutionMode, status?: CodexAdapterStatus): string;
}

export function codexContractArtifactRefs(artifact: CodexContractArtifact): ArtifactRef[] {
  return artifact.artifacts.map((item) => ({ ...item }));
}
