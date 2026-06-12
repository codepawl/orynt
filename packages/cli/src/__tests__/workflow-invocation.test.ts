import { describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import path from "path";

const ROOT = path.join(new URL(".", import.meta.url).pathname, "..", "..", "..", "..");
const WORKFLOW_PATH = path.join(ROOT, ".github", "workflows", "openpawl.yml");
const SAMPLE_WORKFLOW_PATH = path.join(ROOT, "docs", "samples", "openpawl.workflow.yml");

async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

describe("Openpawl workflow invocation", () => {
  it("runs the public Openpawl release source in the primary workflow", async () => {
    const workflow = await readText(WORKFLOW_PATH);

    expect(workflow).toContain("repository: codepawl/openpawl");
    expect(workflow).toContain("ref: v0.5.1");
    expect(workflow).toContain("path: .openpawl-src");
    expect(workflow).toContain("bun --cwd .openpawl-src --filter @codepawl/cli dev -- openpawl-trigger");
    expect(workflow).toContain("bun --cwd .openpawl-src --filter @codepawl/cli dev -- run");
    expect(workflow).toContain("steps.trigger.outputs.approved_write == 'true'");
    expect(workflow).toContain("gh pr create");
    expect(workflow).not.toContain("repository: codepawl/codepawl");
    expect(workflow).not.toContain("bun run dev:cli -- openpawl-trigger");
    expect(workflow).not.toContain("bun run dev:cli -- run");
  });

  it("keeps the sample workflow pinned to the public Action release", async () => {
    const workflow = await readText(SAMPLE_WORKFLOW_PATH);

    expect(workflow).toContain("uses: codepawl/openpawl@v0.5.3");
    expect(workflow).not.toContain("uses: codepawl/openpawl@main");
    expect(workflow).not.toContain("repository: codepawl/codepawl");
    expect(workflow).not.toContain("bun run dev:cli -- openpawl-trigger");
    expect(workflow).not.toContain("bun run dev:cli -- run");
  });

  it("uses safe printf-based manual PR fallback generation in private workflow scripts", async () => {
    const workflow = await readText(WORKFLOW_PATH);
    const sampleWorkflow = await readText(SAMPLE_WORKFLOW_PATH);

    expect(workflow).toContain("printf '%s\\n'");
    expect(workflow).not.toContain("cat > /tmp/openpawl-manual-pr.md <<EOF");
    expect(workflow).not.toContain("cat > /tmp/openpawl-pr-body.md <<EOF");

    expect(sampleWorkflow).toContain("uses: codepawl/openpawl@v0.5.3");
    expect(sampleWorkflow).not.toContain("cat > /tmp/openpawl-manual-pr.md <<EOF");
    expect(sampleWorkflow).not.toContain("cat > /tmp/openpawl-pr-body.md <<EOF");
  });
});
