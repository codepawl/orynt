import { describe, expect, it } from "bun:test";
import {
  buildRepositoryTaskPlan,
  type RepositoryTaskPlanCandidateV1,
} from "@codepawl/cognitive-kernel";

import { deriveRepositoryExecutionPlan } from "./executionBatching";

function plan(candidate: RepositoryTaskPlanCandidateV1) {
  return buildRepositoryTaskPlan({
    sourcePrompt: "Build the bounded fixture and run tests.",
    goal: "Build the bounded fixture and run tests.",
    candidate,
    maxModelTokens: 30_000,
    maxWallTimeMs: 600_000,
  });
}

describe("repository execution batching", () => {
  it("collapses dependent writers and command-only validation into one batch", () => {
    const source = plan({
      summary: "Build and validate the fixture.",
      requirements: [
        {
          id: "R1",
          text: "Build the runtime.",
          source: "user_prompt",
          kind: "outcome",
          required: true,
        },
        {
          id: "R2",
          text: "Run tests.",
          source: "user_prompt",
          kind: "validation",
          required: true,
        },
      ],
      tasks: [
        {
          id: "T1",
          title: "Build runtime",
          instruction: "Write src/app.ts.",
          kind: "change",
          dependencies: [],
          requirementIds: ["R1"],
          authority: "single_writer",
          operations: ["write"],
          expectedPaths: ["src/app.ts"],
          doneWhen: ["Runtime exists."],
          evidence: [
            {
              id: "E1",
              requirementIds: ["R1"],
              kind: "file",
              description: "Runtime source.",
              path: "src/app.ts",
            },
          ],
        },
        {
          id: "T2",
          title: "Add tests",
          instruction: "Write tests/app.test.ts.",
          kind: "change",
          dependencies: ["T1"],
          requirementIds: ["R1"],
          authority: "single_writer",
          operations: ["write"],
          expectedPaths: ["tests/app.test.ts"],
          doneWhen: ["Tests exist."],
          evidence: [
            {
              id: "E1",
              requirementIds: ["R1"],
              kind: "file",
              description: "Test source.",
              path: "tests/app.test.ts",
            },
          ],
        },
        {
          id: "T3",
          title: "Run tests",
          instruction: "Run npm test.",
          kind: "validation",
          dependencies: ["T2"],
          requirementIds: ["R2"],
          authority: "read_only",
          operations: ["read"],
          readPaths: ["src/app.ts"],
          expectedPaths: [],
          doneWhen: ["Tests pass."],
          evidence: [
            {
              id: "E3",
              requirementIds: ["R2"],
              kind: "command",
              description: "Test output.",
              command: "npm test",
            },
          ],
        },
      ],
      allowedOperations: ["read", "write"],
    });

    const resolution = deriveRepositoryExecutionPlan(source);

    expect(resolution.batch).toMatchObject({
      sourcePlanId: source.id,
      taskIds: ["T1", "T2", "T3"],
      expectedPaths: ["src/app.ts", "tests/app.test.ts"],
      evidenceMap: [
        {
          sourceTaskId: "T1",
          sourceEvidenceId: "E1",
          batchEvidenceId: "T1--E1",
        },
        {
          sourceTaskId: "T2",
          sourceEvidenceId: "E1",
          batchEvidenceId: "T2--E1",
        },
        {
          sourceTaskId: "T3",
          sourceEvidenceId: "E3",
          batchEvidenceId: "T3--E3",
        },
      ],
    });
    expect(resolution.plan.tasks).toHaveLength(1);
    expect(resolution.plan.tasks[0]).toMatchObject({
      authority: "single_writer",
      operations: ["write"],
      dependencies: [],
      expectedPaths: ["src/app.ts", "tests/app.test.ts"],
    });
    expect(
      resolution.plan.tasks[0]!.evidence.map(({ id }) => id),
    ).toEqual(["T1--E1", "T2--E1", "T3--E3"]);
  });

  it("does not batch inspection outside the writer envelope", () => {
    const source = plan({
      summary: "Inspect before changing.",
      requirements: [
        {
          id: "R1",
          text: "Inspect and update.",
          source: "user_prompt",
          kind: "outcome",
          required: true,
        },
      ],
      tasks: [
        {
          id: "T1",
          title: "Inspect",
          instruction: "Inspect external repository context.",
          kind: "validation",
          dependencies: [],
          requirementIds: ["R1"],
          authority: "read_only",
          operations: ["read"],
          readPaths: ["docs/context.md"],
          expectedPaths: [],
          doneWhen: ["Inspection recorded."],
          evidence: [
            {
              id: "E1",
              requirementIds: ["R1"],
              kind: "semantic_review",
              description: "Inspection summary.",
            },
          ],
        },
        {
          id: "T2",
          title: "Update",
          instruction: "Update src/app.ts.",
          kind: "change",
          dependencies: ["T1"],
          requirementIds: ["R1"],
          authority: "single_writer",
          operations: ["write"],
          expectedPaths: ["src/app.ts"],
          doneWhen: ["Update complete."],
          evidence: [
            {
              id: "E2",
              requirementIds: ["R1"],
              kind: "file",
              description: "Updated source.",
              path: "src/app.ts",
            },
          ],
        },
      ],
      allowedOperations: ["read", "write"],
    });

    expect(deriveRepositoryExecutionPlan(source)).toEqual({ plan: source });
  });

  it("batches the Project Board read-write task with dependent validation", () => {
    const source = plan({
      summary: "Implement and validate the project board.",
      requirements: [
        {
          id: "R1",
          text: "Build the project board.",
          source: "user_prompt",
          kind: "outcome",
          required: true,
        },
        {
          id: "R2",
          text: "Validate the project board.",
          source: "user_prompt",
          kind: "validation",
          required: true,
        },
      ],
      tasks: [
        {
          id: "task-implement",
          title: "Implement the project board",
          instruction: "Build the project board.",
          kind: "change",
          dependencies: [],
          requirementIds: ["R1"],
          authority: "single_writer",
          operations: ["read", "write"],
          readPaths: ["index.html", "package.json", "src", "styles.css"],
          expectedPaths: [
            "index.html",
            "package.json",
            "src/main.js",
            "styles.css",
          ],
          doneWhen: ["The board is complete."],
          evidence: [
            {
              id: "E1",
              requirementIds: ["R1"],
              kind: "diff",
              description: "The board implementation.",
              path: "src/main.js",
            },
          ],
        },
        {
          id: "task-validate",
          title: "Validate the project board",
          instruction: "Run deterministic validation.",
          kind: "validation",
          dependencies: ["task-implement"],
          requirementIds: ["R2"],
          authority: "read_only",
          operations: ["read"],
          readPaths: ["index.html", "package.json", "src", "styles.css"],
          expectedPaths: [],
          doneWhen: ["The verifier passes."],
          evidence: [
            {
              id: "E2",
              requirementIds: ["R2"],
              kind: "command",
              description: "The managed verifier result.",
              command: "node .codex/orynt-beta-verify.mjs",
            },
          ],
        },
      ],
      allowedOperations: ["read", "write"],
    });

    const resolution = deriveRepositoryExecutionPlan(source);

    expect(resolution.batch?.taskIds).toEqual([
      "task-implement",
      "task-validate",
    ]);
    expect(resolution.plan.tasks).toHaveLength(1);
    expect(resolution.plan.tasks[0]).toMatchObject({
      authority: "single_writer",
      operations: ["read", "write"],
      expectedPaths: [
        "index.html",
        "package.json",
        "src/main.js",
        "styles.css",
      ],
    });
  });

  it("does not batch a writer with dependency or migration authority", () => {
    const source = plan({
      summary: "Install a dependency.",
      requirements: [
        {
          id: "R1",
          text: "Install a dependency.",
          source: "user_prompt",
          kind: "outcome",
          required: true,
        },
      ],
      tasks: [
        {
          id: "T1",
          title: "Install dependency",
          instruction: "Update package files.",
          kind: "change",
          dependencies: [],
          requirementIds: ["R1"],
          authority: "single_writer",
          operations: ["write", "dependency"],
          expectedPaths: ["package.json", "bun.lock"],
          doneWhen: ["The dependency is installed."],
          evidence: [
            {
              id: "E1",
              requirementIds: ["R1"],
              kind: "diff",
              description: "Dependency files.",
              path: "package.json",
            },
          ],
        },
        {
          id: "T2",
          title: "Validate dependency",
          instruction: "Inspect package files.",
          kind: "validation",
          dependencies: ["T1"],
          requirementIds: ["R1"],
          authority: "read_only",
          operations: ["read"],
          readPaths: ["package.json"],
          expectedPaths: [],
          doneWhen: ["Package files are valid."],
          evidence: [
            {
              id: "E2",
              requirementIds: ["R1"],
              kind: "semantic_review",
              description: "Package review.",
            },
          ],
        },
      ],
      allowedOperations: ["read", "write", "dependency"],
    });

    expect(deriveRepositoryExecutionPlan(source)).toEqual({ plan: source });
  });
});
