#!/usr/bin/env bun

import path from "node:path";

import { LocalJsonMemoryStore } from "../packages/memory/dist/index.js";

const MAX_REQUEST_BYTES = 1024 * 1024;

async function readRequest() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("memory manager request exceeded the 1 MiB limit");
    }
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) throw new Error("memory manager request is required");
  const request = JSON.parse(raw);
  if (request?.schemaVersion !== 1) {
    throw new Error("memory manager schemaVersion must be 1");
  }
  if (
    typeof request.operation !== "string" ||
    !/^[a-z]+(?:\.[a-z]+)*$/.test(request.operation)
  ) {
    throw new Error("memory manager operation is invalid");
  }
  if (typeof request.memoryRoot !== "string" || !path.isAbsolute(request.memoryRoot)) {
    throw new Error("memoryRoot must be an absolute managed path");
  }
  return request;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requiredString(input, key) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function requiredRevision(options) {
  if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0) {
    throw new Error("expectedRevision is required");
  }
  return options;
}

function auditedMutation(input, field) {
  const payload = object(input[field]);
  requiredString(payload, "actor");
  requiredString(payload, "reason");
  return {
    payload,
    options: requiredRevision(object(input.options)),
  };
}

function sameNamespace(value, namespace) {
  return (
    (!namespace.capabilityId || value?.capabilityId === namespace.capabilityId) &&
    (!namespace.workspaceId || value?.workspaceId === namespace.workspaceId) &&
    (!namespace.repositoryPath || value?.repositoryPath === namespace.repositoryPath) &&
    (!namespace.projectId || value?.projectId === namespace.projectId)
  );
}

export async function executeDesktopMemoryOperation(request) {
  const store = new LocalJsonMemoryStore({
    memoryRoot: path.resolve(request.memoryRoot),
  });
  const input = object(request.input);
  switch (request.operation) {
    case "episode.list":
      return store.listEpisodes(object(input.query));
    case "rule.list":
      return store.listCandidateRules(object(input.query));
    case "rule.status":
      requiredString(input, "actor");
      requiredString(input, "reason");
      return store.updateCandidateRuleStatus(
        requiredString(input, "id"),
        requiredString(input, "status"),
        requiredRevision(object(input.options)),
      );
    case "semantic.list":
      return store.listSemanticMemory(object(input.query));
    case "semantic.status": {
      const mutation = auditedMutation(input, "decision");
      return store.updateSemanticMemoryStatus(
        mutation.payload,
        mutation.options,
      );
    }
    case "semantic.edit": {
      const mutation = auditedMutation(input, "edit");
      return store.editSemanticMemory(mutation.payload, mutation.options);
    }
    case "semantic.delete": {
      const mutation = auditedMutation(input, "decision");
      return store.deleteSemanticMemory(
        mutation.payload,
        mutation.options,
      );
    }
    case "semantic.restore": {
      const mutation = auditedMutation(input, "decision");
      return store.restoreSemanticMemory(
        mutation.payload,
        mutation.options,
      );
    }
    case "semantic.purge": {
      const mutation = auditedMutation(input, "decision");
      return store.purgeSemanticMemory(
        mutation.payload,
        mutation.options,
      );
    }
    case "memory.retrieve":
      return store.retrieveMemory(object(input.query));
    case "summary":
      return store.summarizeMemory(object(input.namespace));
    case "snapshot": {
      const namespace = object(input.namespace);
      if (!requiredString(namespace, "repositoryPath")) {
        throw new Error("repositoryPath is required");
      }
      const snapshot = await store.getStoreSnapshot();
      return {
        ...snapshot,
        episodes: snapshot.episodes.filter((item) => sameNamespace(item.namespace, namespace)),
        candidateRules: snapshot.candidateRules.filter((item) => sameNamespace(item.namespace, namespace)),
        semanticMemory: snapshot.semanticMemory.filter((item) => sameNamespace(item.namespace, namespace)),
        tombstones: snapshot.tombstones.filter((item) => sameNamespace(item.namespace, namespace)),
      };
    }
    default:
      throw new Error(`unsupported memory manager operation: ${request.operation}`);
  }
}

async function main() {
  const request = await readRequest();
  const result = await executeDesktopMemoryOperation(request);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, result })}\n`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.basename(process.argv[1]) === "desktop-memory-manager.mjs";

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "memory manager failed"}\n`,
    );
    process.exitCode = 1;
  });
}
