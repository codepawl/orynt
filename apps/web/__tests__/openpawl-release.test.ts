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
});
