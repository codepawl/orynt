export type SessionTrustGrantV1 = {
  schemaVersion: 1;
  repositoryRealpath: string;
  provider: "openai_responses" | "codex_app_server";
  model: string;
  allowedOrigins: string[];
  browserVision: true;
  issuedAt: string;
  digest: string;
};

export type RepositoryAssetFormat = "png" | "webp" | "jpeg";

export type RepositoryAssetGenerationV1 = {
  schemaVersion: 1;
  prompt: string;
  outputPaths: string[];
  format: RepositoryAssetFormat;
  mode: "create" | "replace";
  provenancePath: "assets/PROVENANCE.md";
  explicitUserRequest: true;
  maxOutputs: 1 | 2 | 3 | 4;
};

function safeRepositoryPath(value: string): boolean {
  if (!value || value !== value.trim() || value.startsWith("/") || value.includes("\\")) {
    return false;
  }
  return !value.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

export function validateSessionTrustGrantV1(grant: SessionTrustGrantV1): void {
  if (
    grant.schemaVersion !== 1 ||
    !grant.repositoryRealpath.startsWith("/") ||
    !grant.model.trim() ||
    grant.allowedOrigins.length === 0 ||
    new Set(grant.allowedOrigins).size !== grant.allowedOrigins.length ||
    grant.allowedOrigins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          url.origin !== origin ||
          !["http:", "https:"].includes(url.protocol) ||
          /[*{}[\]]/u.test(url.hostname)
        );
      } catch {
        return true;
      }
    }) ||
    Number.isNaN(Date.parse(grant.issuedAt)) ||
    !/^[a-f0-9]{64}$/u.test(grant.digest)
  ) {
    throw new Error("Session trust grant is invalid.");
  }
}

export function validateRepositoryAssetGenerationV1(
  request: RepositoryAssetGenerationV1,
): void {
  const extension = request.format === "jpeg" ? /\.(?:jpe?g)$/iu : new RegExp(`\\.${request.format}$`, "iu");
  if (
    request.schemaVersion !== 1 ||
    !request.prompt.trim() ||
    request.explicitUserRequest !== true ||
    request.provenancePath !== "assets/PROVENANCE.md" ||
    request.outputPaths.length < 1 ||
    request.outputPaths.length > request.maxOutputs ||
    request.maxOutputs < 1 ||
    request.maxOutputs > 4 ||
    new Set(request.outputPaths).size !== request.outputPaths.length ||
    request.outputPaths.some((path) => !safeRepositoryPath(path) || !extension.test(path))
  ) {
    throw new Error("Repository asset-generation request is invalid.");
  }
}
