import {
  CodexAppServerRuntime,
  CodexProviderUsageReader,
} from "@codepawl/codex-adapter";
import type {
  ProviderUsageDetail,
  ProviderUsageSnapshotV1,
} from "@codepawl/model-runtime";

let sharedRuntime: CodexAppServerRuntime | undefined;
let sharedUsageReader: CodexProviderUsageReader | undefined;

export function cliCodexAppServerRuntime(): CodexAppServerRuntime {
  sharedRuntime ??= new CodexAppServerRuntime();
  return sharedRuntime;
}

export async function readCliProviderUsage(
  detail: ProviderUsageDetail = "quota",
): Promise<ProviderUsageSnapshotV1> {
  sharedUsageReader ??= new CodexProviderUsageReader({
    runtime: cliCodexAppServerRuntime(),
  });
  return sharedUsageReader.readUsage({ detail });
}

export async function shutdownCliProviderRuntime(): Promise<void> {
  const runtime = sharedRuntime;
  sharedRuntime = undefined;
  sharedUsageReader = undefined;
  await runtime?.shutdown();
}
