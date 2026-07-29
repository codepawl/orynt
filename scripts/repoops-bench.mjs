import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OryntCodingApprenticeRepoOpsMethodRunner,
  OryntControlledCodexRepoOpsMethodRunner,
  OryntLiveCodexRepoOpsMethodRunner,
  OryntRepoOpsBenchmarkRunner,
  createDefaultRepoOpsMethodRunners,
  createRepoOpsBenchV0,
  writeRepoOpsBenchReports,
} from "../packages/eval-harness/dist/index.js";

const args = process.argv.slice(2);
const useCoreRunner = args.includes("--core");
const useControlledCodexRunner = args.includes("--controlled-codex");
const useLiveCodexRunner = args.includes("--live-codex");
const confirmLiveCodex = args.includes("--confirm-live");
const selectedModeCount = [useCoreRunner, useControlledCodexRunner, useLiveCodexRunner].filter(Boolean).length;
if (selectedModeCount > 1) {
  throw new Error("Use only one RepoOps mode flag: --core, --controlled-codex, or --live-codex.");
}
const positionalArgs = args.filter((arg) => !["--", "--core", "--controlled-codex", "--live-codex", "--confirm-live"].includes(arg));
const outputDirectory = path.resolve(positionalArgs[0] ?? "packages/eval-harness/reports/repoops");
const workRoot = useCoreRunner || useControlledCodexRunner || useLiveCodexRunner
  ? path.resolve(positionalArgs[1] ?? (await mkdtemp(path.join(tmpdir(), "orynt-repoops-core-"))))
  : null;
const runners = useLiveCodexRunner
  ? [new OryntLiveCodexRepoOpsMethodRunner({ workRoot, confirmed: confirmLiveCodex })]
  : useControlledCodexRunner
    ? [new OryntControlledCodexRepoOpsMethodRunner({ workRoot })]
    : useCoreRunner
      ? [new OryntCodingApprenticeRepoOpsMethodRunner({ workRoot })]
      : createDefaultRepoOpsMethodRunners();
const bench = createRepoOpsBenchV0();
if (useLiveCodexRunner) {
  bench.tasks = bench.tasks.filter((task) => task.group === "inspect" || task.group === "debug");
}
const result = await new OryntRepoOpsBenchmarkRunner().runBenchWithRunners(bench, runners);
const artifacts = await writeRepoOpsBenchReports(result, outputDirectory);

process.stdout.write(
  `${JSON.stringify(
    {
      benchId: result.benchId,
      taskCount: result.taskCount,
      methodCount: result.methods.length,
      mode: useLiveCodexRunner ? "live_codex" : useControlledCodexRunner ? "controlled_codex" : useCoreRunner ? "core" : "deterministic",
      liveConfirmed: useLiveCodexRunner ? confirmLiveCodex : null,
      workRoot,
      artifacts,
    },
    null,
    2,
  )}\n`,
);
