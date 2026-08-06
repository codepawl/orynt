# ADR 0009: ContextVM deterministic extraction and retrieval

## Status

Accepted.

## Decision

ContextVM schema v3 stores deterministic extraction audits and rebuildable
retrieval indexes beside the immutable event and versioned-memory records.
Supported structured RunEvents produce canonical, versioned candidates without
an LLM. Unsupported prose remains available only as raw event evidence.

Retrieval uses owned SQLite FTS5, exact identifier indexes, temporal validity,
structural filters, and bounded one- or two-hop relation expansion. Every result
includes component scores and load reasons. Current facts are the default;
history requires an explicit request, and unresolved conflicts are excluded
from agent context.

The FTS and identifier tables are derived state. They may be rebuilt from
memory pages without changing events, archive objects, or memory provenance.

## Consequences

- Bun uses `bun:sqlite`; the existing Node fallback uses `node:sqlite`.
- No Tantivy, embedding service, semantic model, or new production dependency
  is introduced for this milestone.
- Failed verification may create candidate observations and failure patterns,
  but never promotes them into authoritative rules.
- ContextVM remains advisory and cannot override user instructions, policy, or
  safety decisions.
