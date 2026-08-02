import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OryntCodingApprenticeRepoOpsMethodRunner,
  OryntControlledCodexRepoOpsMethodRunner,
  OryntLiveCodexRepoOpsMethodRunner,
  OryntLiveResponsesRepoOpsMethodRunner,
  HermesLiveRepoOpsMethodRunner,
  OryntRepoOpsBenchmarkRunner,
  createDefaultRepoOpsMethodRunners,
  createRepoOpsBenchV0,
  createRepoOpsBenchV1,
  writeRepoOpsBenchReports,
} from "../packages/eval-harness/dist/index.js";

const args = process.argv.slice(2);
const useCoreRunner = args.includes("--core");
const useControlledCodexRunner = args.includes("--controlled-codex");
const useLiveCodexRunner = args.includes("--live-codex");
const useLiveV1 = args.includes("--live-v1");
const useSmoke = args.includes("--smoke");
const confirmLiveCodex = args.includes("--confirm-live");
const selectedModeCount = [useCoreRunner, useControlledCodexRunner, useLiveCodexRunner, useLiveV1].filter(Boolean).length;
if (selectedModeCount > 1) {
  throw new Error("Use only one RepoOps mode flag.");
}
const positionalArgs = args.filter((arg) => ![
  "--",
  "--core",
  "--controlled-codex",
  "--live-codex",
  "--live-v1",
  "--smoke",
  "--confirm-live",
].includes(arg));
const outputDirectory = path.resolve(positionalArgs[0] ?? "packages/eval-harness/reports/repoops");
const workRoot = useCoreRunner || useControlledCodexRunner || useLiveCodexRunner || useLiveV1
  ? path.resolve(positionalArgs[1] ?? (await mkdtemp(path.join(tmpdir(), "orynt-repoops-core-"))))
  : null;
const runners = useLiveV1
  ? [
      new OryntLiveResponsesRepoOpsMethodRunner({
        workRoot,
        confirmed: confirmLiveCodex,
        modelId: "gpt-5.6-luna",
        thinkingEffort: "medium",
      }),
      new HermesLiveRepoOpsMethodRunner({
        workRoot,
        confirmed: confirmLiveCodex,
        modelId: "gpt-5.6-luna",
        thinkingEffort: "medium",
      }),
    ]
  : useLiveCodexRunner
  ? [new OryntLiveCodexRepoOpsMethodRunner({ workRoot, confirmed: confirmLiveCodex })]
  : useControlledCodexRunner
    ? [new OryntControlledCodexRepoOpsMethodRunner({ workRoot })]
    : useCoreRunner
      ? [new OryntCodingApprenticeRepoOpsMethodRunner({ workRoot })]
      : createDefaultRepoOpsMethodRunners();
const bench = useLiveV1 ? createRepoOpsBenchV1() : createRepoOpsBenchV0();
if (useLiveCodexRunner) {
  bench.tasks = bench.tasks.filter((task) => task.group === "inspect" || task.group === "debug");
}
if (useLiveV1 && useSmoke) {
  bench.tasks = bench.tasks.filter((task) => task.group === "inspect" || task.group === "edit_small");
}
const result = await new OryntRepoOpsBenchmarkRunner().runBenchWithRunners(
  bench,
  runners,
  useLiveV1 && !useSmoke ? 3 : 1,
);
const artifacts = await writeRepoOpsBenchReports(result, outputDirectory);

process.stdout.write(
  `${JSON.stringify(
    {
      benchId: result.benchId,
      taskCount: result.taskCount,
      methodCount: result.methods.length,
      mode: useLiveV1 ? "live_v1" : useLiveCodexRunner ? "live_codex" : useControlledCodexRunner ? "controlled_codex" : useCoreRunner ? "core" : "deterministic",
      liveConfirmed: useLiveCodexRunner || useLiveV1 ? confirmLiveCodex : null,
      workRoot,
      winGate: result.winGate,
      artifacts,
    },
    null,
    2,
  )}\n`,
);
