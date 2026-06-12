export const OPENPAWL_RELEASE = {
  tag: "v0.5.3",
  actionRef: "codepawl/openpawl@v0.5.3",
  repository: "codepawl/openpawl",
  repositoryUrl: "https://github.com/codepawl/openpawl",
  releaseUrl: "https://github.com/codepawl/openpawl/releases/tag/v0.5.3",
  publishedAt: "2026-06-12T08:50:39.467Z",
  docs: {
    readme: "https://github.com/codepawl/openpawl/blob/v0.5.3/README.md",
    install: "https://github.com/codepawl/openpawl/blob/v0.5.3/docs/OPENPAWL_INSTALL.md",
    marketplace: "https://github.com/codepawl/openpawl/blob/v0.5.3/docs/MARKETPLACE.md",
    config: "https://github.com/codepawl/openpawl/blob/v0.5.3/docs/OPENPAWL_CONFIG.md",
    security: "https://github.com/codepawl/openpawl/blob/v0.5.3/SECURITY.md",
    privacy: "https://github.com/codepawl/openpawl/blob/v0.5.3/PRIVACY.md",
    mainDocs: "https://github.com/codepawl/openpawl/tree/main/docs",
  },
  capabilities: {
    surface: "github-actions",
    githubActions: true,
    mockDefault: true,
    supportedActionProviders: ["mock", "openai-compatible"],
    artifactSchemaVersion: "1",
    evidenceBundle: true,
    cloudEvidence: "local-preview",
    writeMode: "explicit-safety-gated",
  },
} as const;

export type OpenpawlRelease = typeof OPENPAWL_RELEASE;
