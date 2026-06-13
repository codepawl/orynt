import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  OPENPAWL_ACTION_REF,
  OPENPAWL_INSTALL_DOC,
  OPENPAWL_MARKETPLACE_DOC,
  OPENPAWL_RELEASE,
  OPENPAWL_RELEASE_URL,
  OPENPAWL_REPO,
} from "@/components/marketing/marketplace-pages";
import { OPENPAWL_RELEASE as OPENPAWL_RELEASE_METADATA } from "@/src/data/openpawl-release";

const webRoot = process.cwd();
const publicOpenpawlRoutes = [
  "src/routes/openpawl.install.tsx",
  "src/routes/openpawl.docs.tsx",
  "src/routes/openpawl.support.tsx",
] as const;

describe("Openpawl release metadata", () => {
  it("keeps Marketplace constants backed by the release manifest", () => {
    expect(OPENPAWL_RELEASE).toBe(OPENPAWL_RELEASE_METADATA.tag);
    expect(OPENPAWL_ACTION_REF).toBe(OPENPAWL_RELEASE_METADATA.actionRef);
    expect(OPENPAWL_REPO).toBe(OPENPAWL_RELEASE_METADATA.repositoryUrl);
    expect(OPENPAWL_RELEASE_URL).toBe(OPENPAWL_RELEASE_METADATA.releaseUrl);
    expect(OPENPAWL_INSTALL_DOC).toBe(OPENPAWL_RELEASE_METADATA.docs.install);
    expect(OPENPAWL_MARKETPLACE_DOC).toBe(OPENPAWL_RELEASE_METADATA.docs.marketplace);
  });

  it("keeps Cloud Evidence scoped to local preview for the current release", () => {
    expect(OPENPAWL_RELEASE_METADATA.repository).toBe("codepawl/openpawl");
    expect(OPENPAWL_RELEASE_METADATA.capabilities.cloudEvidence).toBe("local-preview");
    expect(OPENPAWL_RELEASE_METADATA.capabilities.evidenceBundle).toBe(true);
  });

  it("keeps public Openpawl routes free of stale release hardcoding", () => {
    for (const route of publicOpenpawlRoutes) {
      const source = readFileSync(join(webRoot, route), "utf8");

      expect(source).not.toContain("codepawl/openpawl@v0.5.3");
      expect(source).not.toContain("blob/v0.5.3");
      expect(source).not.toContain("releases/tag/v0.5.3");
      expect(source).not.toContain("v0.5.3+");
    }
  });

  it("keeps the install route wired to release metadata constants", () => {
    const source = readFileSync(join(webRoot, "src/routes/openpawl.install.tsx"), "utf8");

    expect(source).toContain("OPENPAWL_ACTION_REF");
    expect(source).toContain("OPENPAWL_INSTALL_DOC");
    expect(source).toContain("OPENPAWL_RELEASE_URL");
    expect(OPENPAWL_ACTION_REF).toBe(`codepawl/openpawl@${OPENPAWL_RELEASE}`);
    expect(OPENPAWL_INSTALL_DOC).toContain(`/blob/${OPENPAWL_RELEASE}/docs/OPENPAWL_INSTALL.md`);
  });
});
