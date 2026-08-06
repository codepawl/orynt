import { describe, expect, it } from "bun:test";

import {
  parseRepositoryDiffArtifactV1,
  REPOSITORY_DIFF_ARTIFACT_MAX_BYTES,
} from "./repositoryDiffContracts";

function artifact() {
  return {
    schemaVersion: 1,
    runId: "run-1",
    taskId: "task-1",
    baseRef: "HEAD",
    redacted: true,
    redactionCount: 1,
    truncated: false,
    maxBytes: REPOSITORY_DIFF_ARTIFACT_MAX_BYTES,
    totals: {
      files: 1,
      additions: 1,
      deletions: 1,
      binaryFiles: 0,
    },
    files: [
      {
        path: "packages/value.txt",
        status: "modified",
        additions: 1,
        deletions: 1,
        binary: false,
        patch: "@@ -1 +1 @@\n-old\n+[REDACTED]\n",
        truncated: false,
      },
    ],
    generatedAt: "2026-08-03T00:00:00.000Z",
  };
}

describe("repository diff artifact contract", () => {
  it("accepts a consistent redacted artifact", () => {
    expect(parseRepositoryDiffArtifactV1(artifact())).toEqual(artifact());
  });

  it("rejects raw or inconsistent artifacts", () => {
    expect(() =>
      parseRepositoryDiffArtifactV1({ ...artifact(), redacted: false }),
    ).toThrow(/redaction state/u);
    expect(() =>
      parseRepositoryDiffArtifactV1({
        ...artifact(),
        totals: { ...artifact().totals, additions: 2 },
      }),
    ).toThrow(/totals are inconsistent/u);
  });
});
