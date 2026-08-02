import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Check,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import type {
  CandidateRule,
  EpisodicMemoryItem,
  MemoryStoreEnvelopeV2,
  SemanticMemoryItem,
} from "@codepawl/shared";

import { orynt } from "../../oryntClient";

type MemoryTab = "semantic" | "rules" | "episodes" | "trash";

const tabs: Array<{ id: MemoryTab; label: string }> = [
  { id: "semantic", label: "Semantic" },
  { id: "rules", label: "Rules" },
  { id: "episodes", label: "Episodes" },
  { id: "trash", label: "Trash & audit" },
];

function emptySnapshot(): MemoryStoreEnvelopeV2 {
  return {
    schemaVersion: 3,
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    episodes: [],
    candidateRules: [],
    semanticMemory: [],
    tombstones: [],
    auditLog: [],
  };
}

function provenance(item: SemanticMemoryItem): string {
  return [
    item.provenance.runId,
    item.provenance.verificationResultId,
    item.activation?.basis,
  ]
    .filter(Boolean)
    .join(" · ");
}

function belongsToRepository(
  itemNamespace: SemanticMemoryItem["namespace"],
  repositoryPath?: string,
): boolean {
  return repositoryPath !== undefined &&
    itemNamespace.capabilityId === "coding-apprentice" &&
    itemNamespace.repositoryPath === repositoryPath;
}

export function MemoryManager({
  repositoryPath,
}: {
  repositoryPath?: string;
}) {
  const [activeTab, setActiveTab] = useState<MemoryTab>("semantic");
  const [snapshot, setSnapshot] = useState<MemoryStoreEnvelopeV2>(
    emptySnapshot,
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>("load");
  const [error, setError] = useState<string | null>(null);

  const hasRepositoryScope = useMemo(() => Boolean(repositoryPath), [repositoryPath]);

  const refresh = async (purgeDue = false) => {
    setPending("load");
    setError(null);
    try {
      let next = await orynt.getMemorySnapshot();
      next = {
        ...next,
        episodes: next.episodes.filter((item) =>
          belongsToRepository(item.namespace, repositoryPath),
        ),
        candidateRules: next.candidateRules.filter((item) =>
          belongsToRepository(item.namespace, repositoryPath),
        ),
        semanticMemory: next.semanticMemory.filter((item) =>
          belongsToRepository(item.namespace, repositoryPath),
        ),
        tombstones: next.tombstones.filter((item) =>
          belongsToRepository(item.namespace, repositoryPath),
        ),
        auditLog: next.auditLog.filter((item) =>
          belongsToRepository(item.namespace, repositoryPath),
        ),
      };
      if (purgeDue) {
        let expectedRevision = next.revision;
        const due = next.semanticMemory.filter(
          (item) =>
            item.status === "deleted" &&
            item.purgeAfter !== undefined &&
            Date.parse(item.purgeAfter) <= Date.now(),
        );
        for (const item of due) {
          await orynt.purgeSemanticMemory(
            {
              id: item.id,
              actor: "retention-policy",
              reason: "30-day memory trash retention deadline reached.",
              decidedAt: new Date().toISOString(),
            },
            { expectedRevision },
          );
          expectedRevision += 1;
        }
        if (due.length > 0) {
          next = await orynt.getMemorySnapshot();
        }
      }
      setSnapshot(next);
      setDrafts(
        Object.fromEntries(
          next.semanticMemory.map((item) => [item.id, item.summary]),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load memory.",
      );
    } finally {
      setPending(null);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, [repositoryPath]);

  const mutate = async (key: string, operation: () => Promise<unknown>) => {
    setPending(key);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Memory update failed.",
      );
      setPending(null);
    }
  };

  const semantic = snapshot.semanticMemory.filter(
    (item) => item.status !== "deleted",
  );
  const trash = snapshot.semanticMemory.filter(
    (item) => item.status === "deleted",
  );

  const renderSemantic = () => (
    <div className="memory-manager-list">
      {semantic.length === 0 ? (
        <p className="memory-manager-empty">
          No reviewable semantic memory for this repository.
        </p>
      ) : (
        semantic.map((item) => (
          <article className="memory-manager-card" key={item.id}>
            <header>
              <div>
                <strong>{item.status}</strong>
                <span>{item.sensitivity} · confidence {item.confidence.toFixed(2)}</span>
              </div>
              <code>{item.id}</code>
            </header>
            <label>
              <span>Summary</span>
              <textarea
                aria-label={`Summary for ${item.id}`}
                value={drafts[item.id] ?? item.summary}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [item.id]: event.target.value,
                  }))
                }
              />
            </label>
            <small>{provenance(item) || "No provenance available"}</small>
            <div className="memory-manager-actions">
              <button
                disabled={pending !== null || drafts[item.id] === item.summary}
                onClick={() =>
                  void mutate(`edit:${item.id}`, () =>
                    orynt.editSemanticMemory(
                      {
                        id: item.id,
                        summary: drafts[item.id],
                        actor: "operator",
                        reason: "Edited in Memory Manager.",
                      },
                      { expectedRevision: snapshot.revision },
                    ),
                  )
                }
                type="button"
              >
                <Pencil aria-hidden="true" /> Save
              </button>
              {item.status !== "approved" ? (
                <button
                  disabled={pending !== null}
                  onClick={() =>
                    void mutate(`approve:${item.id}`, () =>
                      orynt.updateSemanticMemoryStatus(
                        {
                          id: item.id,
                          status: "approved",
                          actor: "operator",
                          reason: "Approved in Memory Manager.",
                        },
                        { expectedRevision: snapshot.revision },
                      ),
                    )
                  }
                  type="button"
                >
                  <Check aria-hidden="true" /> Approve
                </button>
              ) : null}
              {item.status !== "rejected" ? (
                <button
                  disabled={pending !== null}
                  onClick={() =>
                    void mutate(`reject:${item.id}`, () =>
                      orynt.updateSemanticMemoryStatus(
                        {
                          id: item.id,
                          status: "rejected",
                          actor: "operator",
                          reason: "Rejected in Memory Manager.",
                        },
                        { expectedRevision: snapshot.revision },
                      ),
                    )
                  }
                  type="button"
                >
                  <X aria-hidden="true" /> Reject
                </button>
              ) : null}
              <button
                disabled={pending !== null}
                onClick={() =>
                  void mutate(`trash:${item.id}`, () =>
                    orynt.deleteSemanticMemory(
                      {
                        id: item.id,
                        actor: "operator",
                        reason: "Moved to Trash in Memory Manager.",
                      },
                      { expectedRevision: snapshot.revision },
                    ),
                  )
                }
                type="button"
              >
                <Trash2 aria-hidden="true" /> Trash
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  );

  const renderRules = (rules: CandidateRule[]) => (
    <div className="memory-manager-list">
      {rules.length === 0 ? (
        <p className="memory-manager-empty">No candidate rules.</p>
      ) : (
        rules.map((rule) => (
          <article className="memory-manager-card" key={rule.id}>
            <header>
              <strong>{rule.title}</strong>
              <span>{rule.status}</span>
            </header>
            <p>{rule.rule}</p>
            <small>{rule.provenance.runId}</small>
            {rule.status === "accepted" ? (
              <div className="memory-manager-actions">
                <button
                  disabled={pending !== null}
                  onClick={() =>
                    void mutate(`skill:${rule.id}`, () =>
                      orynt.createCandidateSkill(
                        rule.id,
                        rule.provenance.runId,
                      ),
                    )
                  }
                  type="button"
                >
                  Create learned-skill candidate
                </button>
              </div>
            ) : null}
          </article>
        ))
      )}
    </div>
  );

  const renderEpisodes = (episodes: EpisodicMemoryItem[]) => (
    <div className="memory-manager-list">
      {episodes.length === 0 ? (
        <p className="memory-manager-empty">No unexpired run episodes.</p>
      ) : (
        episodes.map((episode) => (
          <article className="memory-manager-card" key={episode.id}>
            <header>
              <strong>{episode.kind}</strong>
              <span>confidence {episode.confidence.toFixed(2)}</span>
            </header>
            <p>{episode.summary}</p>
            <small>
              {episode.provenance.runId}
              {episode.expiresAt ? ` · expires ${episode.expiresAt}` : ""}
            </small>
          </article>
        ))
      )}
    </div>
  );

  const renderTrash = () => (
    <div className="memory-manager-list">
      {trash.map((item) => (
        <article className="memory-manager-card" key={item.id}>
          <header>
            <strong>{item.summary}</strong>
            <span>purge after {item.purgeAfter ?? "unknown"}</span>
          </header>
          <div className="memory-manager-actions">
            <button
              disabled={pending !== null}
              onClick={() =>
                void mutate(`restore:${item.id}`, () =>
                  orynt.restoreSemanticMemory(
                    {
                      id: item.id,
                      actor: "operator",
                      reason: "Restored from Memory Manager Trash.",
                    },
                    { expectedRevision: snapshot.revision },
                  ),
                )
              }
              type="button"
            >
              <ArchiveRestore aria-hidden="true" /> Restore
            </button>
            <button
              disabled={
                pending !== null ||
                !item.purgeAfter ||
                Date.parse(item.purgeAfter) > Date.now()
              }
              onClick={() =>
                void mutate(`purge:${item.id}`, () =>
                  orynt.purgeSemanticMemory(
                    {
                      id: item.id,
                      actor: "operator",
                      reason: "Due memory content purged in Memory Manager.",
                    },
                    { expectedRevision: snapshot.revision },
                  ),
                )
              }
              type="button"
            >
              <Trash2 aria-hidden="true" /> Purge due
            </button>
          </div>
        </article>
      ))}
      {snapshot.tombstones.map((item) => (
        <article className="memory-manager-card memory-manager-tombstone" key={`${item.id}:${item.purgedAt}`}>
          <ShieldAlert aria-hidden="true" />
          <div>
            <strong>{item.id}</strong>
            <span>Purged {item.purgedAt} · audit tombstone only</span>
          </div>
        </article>
      ))}
      {snapshot.auditLog.map((entry) => (
        <article className="memory-manager-card" key={entry.id}>
          <header>
            <strong>{entry.operation}</strong>
            <span>revision {entry.committedRevision}</span>
          </header>
          <small>
            {entry.actor} · {entry.reason} · {entry.occurredAt}
          </small>
          <code>{entry.entityId}</code>
        </article>
      ))}
      {trash.length === 0 &&
      snapshot.tombstones.length === 0 &&
      snapshot.auditLog.length === 0 ? (
        <p className="memory-manager-empty">Trash and audit history are empty.</p>
      ) : null}
    </div>
  );

  return (
    <section className="memory-manager" aria-labelledby="memory-manager-title">
      <header className="memory-manager-heading">
        <div>
          <h2 id="memory-manager-title">Memory Manager</h2>
          <p>
            Repository memory is advisory and never expands permissions or
            approval authority.
          </p>
          {!hasRepositoryScope ? (
            <p className="memory-manager-error" role="alert">
              Select a repository before reviewing or changing memory.
            </p>
          ) : null}
        </div>
        <button
          aria-label="Refresh memory"
          disabled={pending !== null || !hasRepositoryScope}
          onClick={() => void refresh(true)}
          type="button"
        >
          <RefreshCw aria-hidden="true" /> Refresh
        </button>
      </header>
      <div className="memory-manager-tabs" role="tablist" aria-label="Memory views">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="memory-manager-meta">
        Revision {snapshot.revision} · {snapshot.semanticMemory.length} semantic ·{" "}
        {snapshot.candidateRules.length} rules · {snapshot.episodes.length} episodes
      </div>
      {error ? <p className="memory-manager-error" role="alert">{error}</p> : null}
      {pending === "load" ? <p className="memory-manager-empty">Loading memory…</p> : null}
      {pending !== "load" && activeTab === "semantic" ? renderSemantic() : null}
      {pending !== "load" && activeTab === "rules" ? renderRules(snapshot.candidateRules) : null}
      {pending !== "load" && activeTab === "episodes" ? renderEpisodes(snapshot.episodes) : null}
      {pending !== "load" && activeTab === "trash" ? renderTrash() : null}
    </section>
  );
}
