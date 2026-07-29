import { describe, expect, it } from "vitest";

import {
  classifyAutoOrchestrationPreset,
  createLegacySingleModelProfile,
  createOrchestrationPreset,
  resolveOrchestrationProfile,
  validateOrchestrationRecoveryTask,
  validateOrchestrationPlan,
  type OrchestrationPlan,
} from "./orchestrationContracts";

const catalog = [
  {
    id: "gpt-5.6-sol",
    supportedThinkingEfforts: ["high", "xhigh"] as const,
    defaultThinkingEffort: "high" as const,
  },
  {
    id: "gpt-5.6-terra",
    supportedThinkingEfforts: ["medium", "high"] as const,
    defaultThinkingEffort: "medium" as const,
  },
  {
    id: "gpt-5.6-luna",
    supportedThinkingEfforts: ["low", "medium", "high"] as const,
    defaultThinkingEffort: "medium" as const,
  },
];

describe("multi-model orchestration contracts", () => {
  it("creates Codex-first presets and resolves compatible effort", () => {
    const resolved = resolveOrchestrationProfile(
      createOrchestrationPreset("quality"),
      catalog.map((model) => ({
        ...model,
        supportedThinkingEfforts: [...model.supportedThinkingEfforts],
      })),
    );
    expect(resolved.roles.coordinator).toMatchObject({
      modelId: "gpt-5.6-sol",
      thinkingEffort: "xhigh",
    });
    expect(resolved.roles.implementer.modelId).toBe("gpt-5.6-terra");
    expect(resolved.roles.helper.modelId).toBe("gpt-5.6-luna");
  });

  it("preserves legacy single-model behavior as a custom profile", () => {
    const profile = createLegacySingleModelProfile("gpt-5.5", "high");
    expect(profile.preset).toBe("custom");
    expect(
      new Set(Object.values(profile.roles).map((role) => role.modelId)),
    ).toEqual(new Set(["gpt-5.5"]));
  });

  it("classifies auto routing conservatively", () => {
    expect(
      classifyAutoOrchestrationPreset({
        instruction: "explain this package",
        estimatedChangedFiles: 0,
      }),
    ).toBe("economy");
    expect(
      classifyAutoOrchestrationPreset({
        instruction: "fix the parser",
        estimatedChangedFiles: 2,
      }),
    ).toBe("balanced");
    expect(
      classifyAutoOrchestrationPreset({
        instruction: "migrate authentication architecture",
        operations: ["migration"],
      }),
    ).toBe("quality");
  });

  it("omits an unavailable optional helper and blocks custom missing models", () => {
    const withoutLuna = catalog
      .filter((model) => model.id !== "gpt-5.6-luna")
      .map((model) => ({
        ...model,
        supportedThinkingEfforts: [...model.supportedThinkingEfforts],
      }));
    const resolved = resolveOrchestrationProfile(
      createOrchestrationPreset("balanced"),
      withoutLuna,
    );
    expect(resolved.omittedRoles).toContain("helper");
    expect(resolved.roles.helper.modelId).toBe("gpt-5.6-sol");

    expect(() =>
      resolveOrchestrationProfile(
        createLegacySingleModelProfile("missing", "high"),
        withoutLuna,
      ),
    ).toThrow("Custom coordinator model is unavailable");
  });

  it("enforces depth, helper, dependency, and single-writer invariants", () => {
    const profile = createOrchestrationPreset("balanced");
    const plan: OrchestrationPlan = {
      schemaVersion: 1,
      id: "plan-1",
      runId: "run-1",
      parentTaskId: "task-1",
      summary: "Inspect then implement",
      createdAt: "2026-07-29T00:00:00.000Z",
      tasks: [
        {
          id: "helper-1",
          role: "helper",
          title: "Inspect",
          instruction: "Inspect parser",
          dependencies: [],
          authority: "read_only",
          expectedPaths: ["src/parser.ts"],
          expectedArtifacts: ["summary"],
          depth: 1,
        },
        {
          id: "implementer-1",
          role: "implementer",
          title: "Implement",
          instruction: "Fix parser",
          dependencies: ["helper-1"],
          authority: "single_writer",
          expectedPaths: ["src/parser.ts"],
          expectedArtifacts: ["diff"],
          depth: 1,
        },
      ],
    };
    expect(() => validateOrchestrationPlan(plan, profile)).not.toThrow();
    expect(() =>
      validateOrchestrationPlan(
        {
          ...plan,
          tasks: [
            ...plan.tasks,
            {
              ...plan.tasks[1]!,
              id: "implementer-2",
              dependencies: [],
            },
          ],
        },
        profile,
      ),
    ).toThrow("exactly one implementer");
    expect(() =>
      validateOrchestrationPlan(
        {
          ...plan,
          tasks: [
            {
              ...plan.tasks[0]!,
              dependencies: ["helper-2"],
            },
            {
              ...plan.tasks[0]!,
              id: "helper-2",
              dependencies: ["helper-1"],
            },
            plan.tasks[1]!,
          ],
        },
        profile,
      ),
    ).toThrow("dependency cycle");
    expect(() =>
      validateOrchestrationPlan(
        {
          ...plan,
          tasks: plan.tasks.map((task) =>
            task.role === "implementer"
              ? { ...task, authority: "read_only" as const }
              : task,
          ),
        },
        profile,
      ),
    ).toThrow("exactly one implementer");
    expect(() =>
      validateOrchestrationPlan(
        plan,
        resolveOrchestrationProfile(
          profile,
          catalog
            .filter((model) => model.id !== "gpt-5.6-luna")
            .map((model) => ({
              ...model,
              supportedThinkingEfforts: [...model.supportedThinkingEfforts],
            })),
        ),
      ),
    ).toThrow("omitted helper");
  });

  it("accepts only a new path-bounded single-writer recovery task", () => {
    const profile = resolveOrchestrationProfile(
      createOrchestrationPreset("quality"),
      catalog.map((model) => ({
        ...model,
        supportedThinkingEfforts: [...model.supportedThinkingEfforts],
      })),
    );
    const plan: OrchestrationPlan = {
      schemaVersion: 1,
      id: "plan-recovery",
      runId: "run-recovery",
      parentTaskId: "coordinate",
      summary: "bounded action",
      createdAt: new Date(0).toISOString(),
      tasks: [
        {
          id: "implement",
          role: "implementer",
          title: "implement",
          instruction: "implement",
          dependencies: [],
          authority: "single_writer",
          expectedPaths: ["src/approved.ts"],
          expectedArtifacts: [],
          depth: 1,
        },
      ],
    };
    const recovery = {
      ...plan.tasks[0]!,
      id: "recover",
      instruction: "repair verifier failure",
      dependencies: ["implement"],
      depth: 2,
    };

    expect(() =>
      validateOrchestrationRecoveryTask(recovery, plan, profile)
    ).not.toThrow();
    expect(() =>
      validateOrchestrationRecoveryTask(
        { ...recovery, expectedPaths: ["src/outside.ts"] },
        plan,
        profile,
      )
    ).toThrow("cannot expand approved paths");
  });
});
