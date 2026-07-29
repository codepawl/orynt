import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Blocks,
  Check,
  ChevronRight,
  CloudDownload,
  History,
  LoaderCircle,
  Pin,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import type { SkillDefinition } from "@codepawl/shared";

import { orynt } from "../../oryntClient";
import type {
  InstalledAgentSkill,
  SkillCatalogItem,
  SkillInventorySnapshot,
  SkillMutationKind,
  SkillMutationPlan,
  SkillSourceSnapshot,
} from "../../oryntClient";

const tabs = [
  { id: "installed", label: "Installed" },
  { id: "discover", label: "Discover" },
  { id: "updates", label: "Updates" },
  { id: "learned", label: "Learned" },
  { id: "sources", label: "Sources & policy" },
] as const;

type TabId = (typeof tabs)[number]["id"];
type LoadState = "loading" | "ready" | "error";

type SkillsManagerProps = {
  learnedSkills: SkillDefinition[];
  onEligibleSkillsChange: (skills: InstalledAgentSkill[]) => void;
  onLearnedSkillAction: (skill: SkillDefinition, action: "promote" | "reject" | "archive") => Promise<void>;
  repositoryPath: string;
};

function statusLabel(skill: InstalledAgentSkill) {
  if (skill.health === "blocked") return "Blocked";
  if (skill.drifted) return "Local changes";
  if (!skill.enabled) return "Disabled";
  if (!skill.eligible) return "Not eligible";
  return "Ready";
}

function trustLabel(trust: InstalledAgentSkill["trust"]) {
  if (trust === "trusted") return "Trusted source";
  if (trust === "community") return "Community source";
  return "Untrusted source";
}

export function SkillsManager({ learnedSkills, onEligibleSkillsChange, onLearnedSkillAction, repositoryPath }: SkillsManagerProps) {
  const [activeTab, setActiveTab] = useState<TabId>("installed");
  const [inventory, setInventory] = useState<SkillInventorySnapshot | null>(null);
  const [catalog, setCatalog] = useState<SkillCatalogItem[]>([]);
  const [sources, setSources] = useState<SkillSourceSnapshot[]>([]);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<SkillMutationPlan | null>(null);
  const [pendingAction, setPendingAction] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const applyInventory = (nextInventory: SkillInventorySnapshot) => {
    setInventory(nextInventory);
    onEligibleSkillsChange(nextInventory.skills.filter((skill) => skill.enabled && skill.eligible && skill.health !== "blocked"));
    setSelectedId((current) => current ?? nextInventory.skills[0]?.id ?? null);
  };

  const loadManager = async (scan = false) => {
    setLoadState("loading");
    setMessage("");
    try {
      const [nextInventory, nextSources, nextCatalog] = await Promise.all([
        scan ? orynt.scanAgentSkills(repositoryPath) : orynt.listInstalledAgentSkills(repositoryPath),
        orynt.listSkillSources(),
        orynt.searchSkillHub({ query: "", repositoryPath }),
      ]);
      applyInventory(nextInventory);
      setSources(nextSources);
      setCatalog(nextCatalog);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "Skills Manager could not load.");
    }
  };

  useEffect(() => {
    void loadManager();
  }, []);

  useEffect(() => {
    if (activeTab !== "discover") return;
    const request = window.setTimeout(() => {
      void orynt
        .searchSkillHub({ query, repositoryPath })
        .then(setCatalog)
        .catch((error) => setMessage(error instanceof Error ? error.message : "Marketplace search failed."));
    }, 180);
    return () => window.clearTimeout(request);
  }, [activeTab, query]);

  const updates = useMemo(() => inventory?.skills.filter((skill) => skill.updateVersion) ?? [], [inventory]);
  const selectedInstalled = inventory?.skills.find((skill) => skill.id === selectedId) ?? null;
  const selectedCatalog = catalog.find((skill) => skill.id === selectedId) ?? null;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const planMutation = async (
    kind: SkillMutationKind,
    skillId: string,
    options: { scope?: "project" | "user"; catalogItem?: SkillCatalogItem } = {},
  ) => {
    setPendingAction(`${kind}:${skillId}`);
    setMessage("");
    try {
      const plan = await orynt.planSkillMutation({ kind, skillId, repositoryPath, ...options });
      setPendingPlan(plan);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare the skill change.");
    } finally {
      setPendingAction("");
    }
  };

  const approveAndExecute = async () => {
    if (!pendingPlan) return;
    setPendingAction(`execute:${pendingPlan.id}`);
    setMessage("");
    try {
      await orynt.approveSkillMutation({
        planId: pendingPlan.id,
        actor: "operator",
        reason: "Approved from the Orynt Skills Manager after reviewing trust and file changes.",
      });
      const result = await orynt.executeSkillMutation(pendingPlan.id, repositoryPath);
      applyInventory(result.inventory);
      setCatalog(await orynt.searchSkillHub({ query, repositoryPath }));
      setPendingPlan(null);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Skill change failed before completion.");
    } finally {
      setPendingAction("");
    }
  };

  const renderInstalledList = (skills: InstalledAgentSkill[]) => (
    <div className="skills-manager-split">
      <div className="skills-manager-list" role="list" aria-label={activeTab === "updates" ? "Skill updates" : "Installed skills"}>
        {skills.length === 0 ? (
          <div className="skills-manager-empty">
            <Blocks aria-hidden="true" />
            <strong>{activeTab === "updates" ? "No updates waiting" : "No skills found"}</strong>
            <span>{activeTab === "updates" ? "Refresh sources to check for new releases." : "Scan local roots or discover a skill to install."}</span>
          </div>
        ) : (
          skills.map((skill) => (
            <button
              className="skills-manager-list-item"
              type="button"
              role="listitem"
              aria-current={selectedId === skill.id ? "true" : undefined}
              key={skill.id}
              onClick={() => setSelectedId(skill.id)}
            >
              <span className={`skills-manager-state skills-manager-state-${skill.health}`} aria-hidden="true" />
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.description}</small>
              </span>
              <span className="skills-manager-list-meta">
                <small>{skill.scope}</small>
                <ChevronRight aria-hidden="true" />
              </span>
            </button>
          ))
        )}
      </div>
      <div className="skills-manager-detail">
        {selectedInstalled && skills.some((skill) => skill.id === selectedInstalled.id) ? (
          <>
            <header>
              <div>
                <span className="skills-manager-eyebrow">{selectedInstalled.sourceLabel}</span>
                <h3>{selectedInstalled.name}</h3>
                <p>{selectedInstalled.description}</p>
              </div>
              <span className={`skills-manager-badge skills-manager-badge-${selectedInstalled.health}`}>
                {statusLabel(selectedInstalled)}
              </span>
            </header>
            <dl className="skills-manager-facts">
              <div><dt>Version</dt><dd>{selectedInstalled.version}</dd></div>
              <div><dt>Scope</dt><dd>{selectedInstalled.scope}</dd></div>
              <div><dt>Integrity</dt><dd className="skills-manager-mono">{selectedInstalled.digest}</dd></div>
              <div><dt>Trust</dt><dd>{trustLabel(selectedInstalled.trust)}</dd></div>
            </dl>
            {selectedInstalled.scope === "runtime" ? (
              <p className="skills-manager-notice"><ShieldCheck aria-hidden="true" /> Runtime-owned skill. Orynt can inspect it but cannot update or remove it.</p>
            ) : null}
            {selectedInstalled.drifted ? (
              <p className="skills-manager-notice skills-manager-notice-warning"><AlertTriangle aria-hidden="true" /> Local files changed after install. Updates require review.</p>
            ) : null}
            {selectedInstalled.manifest ? (
              <details className="skills-manager-manifest">
                <summary>View SKILL.md</summary>
                <pre>{selectedInstalled.manifest}</pre>
              </details>
            ) : null}
            <div className="skills-manager-actions">
              {selectedInstalled.managed ? (
                <>
                  <button type="button" onClick={() => void planMutation(selectedInstalled.enabled ? "disable" : "enable", selectedInstalled.id)}>
                    {selectedInstalled.enabled ? "Disable" : "Enable"}
                  </button>
                  <button type="button" onClick={() => void planMutation(selectedInstalled.pinned ? "unpin" : "pin", selectedInstalled.id)}>
                    <Pin aria-hidden="true" /> {selectedInstalled.pinned ? "Unpin" : "Pin"}
                  </button>
                  {selectedInstalled.updateVersion ? (
                    <button type="button" onClick={() => void planMutation("update", selectedInstalled.id)}>
                      Update to {selectedInstalled.updateVersion}
                    </button>
                  ) : null}
                  <button className="skills-manager-danger" type="button" onClick={() => void planMutation("remove", selectedInstalled.id)}>
                    Move to Trash
                  </button>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="skills-manager-empty"><strong>Select a skill</strong><span>Inspect its source, integrity, eligibility, and recovery options.</span></div>
        )}
      </div>
    </div>
  );

  const renderDiscover = () => (
    <div className="skills-manager-discover">
      <label className="skills-manager-search">
        <Search aria-hidden="true" />
        <input aria-label="Search skill marketplace" placeholder="Search skills, publishers, or capabilities" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="skills-manager-split">
        <div className="skills-manager-list" role="list" aria-label="Marketplace skills">
          {catalog.length === 0 ? (
            <div className="skills-manager-empty"><strong>No matching skills</strong><span>Try a broader search or refresh enabled sources.</span></div>
          ) : (
            catalog.map((item) => (
              <button className="skills-manager-list-item" type="button" role="listitem" aria-current={selectedId === item.id ? "true" : undefined} key={item.id} onClick={() => setSelectedId(item.id)}>
                <CloudDownload aria-hidden="true" />
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                <span className="skills-manager-list-meta"><small>{item.sourceLabel}</small><ChevronRight aria-hidden="true" /></span>
              </button>
            ))
          )}
        </div>
        <div className="skills-manager-detail">
          {selectedCatalog ? (
            <>
              <header><div><span className="skills-manager-eyebrow">{selectedCatalog.publisher} · {selectedCatalog.sourceLabel}</span><h3>{selectedCatalog.name}</h3><p>{selectedCatalog.description}</p></div><span className={`skills-manager-badge skills-manager-trust-${selectedCatalog.trust}`}>{selectedCatalog.trust}</span></header>
              <dl className="skills-manager-facts">
                <div><dt>Version</dt><dd>{selectedCatalog.version}</dd></div>
                <div><dt>License</dt><dd>{selectedCatalog.license ?? "Not declared"}</dd></div>
                <div><dt>Compatibility</dt><dd>{selectedCatalog.compatibility ?? "Not declared"}</dd></div>
                <div><dt>Capabilities</dt><dd>{selectedCatalog.capabilities.join(", ") || "None declared"}</dd></div>
              </dl>
              {selectedCatalog.trust !== "trusted" ? <p className="skills-manager-notice skills-manager-notice-warning"><AlertTriangle aria-hidden="true" /> Popularity does not establish trust. Review instructions and capabilities before approval.</p> : null}
              <div className="skills-manager-actions">
                {selectedCatalog.installedSkillId ? <span className="skills-manager-installed"><Check aria-hidden="true" /> Installed</span> : (
                  <>
                    <button type="button" disabled={Boolean(pendingAction)} onClick={() => void planMutation("install", selectedCatalog.id, { scope: "project", catalogItem: selectedCatalog })}>Install for project</button>
                    <button type="button" disabled={Boolean(pendingAction)} onClick={() => void planMutation("install", selectedCatalog.id, { scope: "user", catalogItem: selectedCatalog })}>Install for user</button>
                  </>
                )}
              </div>
              <p className="skills-manager-footnote">Installation does not enable or attach a skill. Enable it separately after install.</p>
            </>
          ) : <div className="skills-manager-empty"><strong>Select a catalog skill</strong><span>Review publisher, compatibility, capabilities, and trust before planning an install.</span></div>}
        </div>
      </div>
    </div>
  );

  const renderLearned = () => (
    <div className="skills-manager-learned">
      <div className="skills-manager-section-intro">
        <div><span className="skills-manager-eyebrow">Evidence-backed workspace learning</span><h3>Learned skills</h3></div>
        <p>These candidates use Orynt’s replay and promotion lifecycle. They are not installed Agent Skill packages.</p>
      </div>
      {learnedSkills.length === 0 ? <div className="skills-manager-empty"><strong>No learned skills</strong><span>Validated run evidence may create candidates for operator review.</span></div> : (
        <div className="skills-manager-learned-grid">
          {learnedSkills.map((skill) => (
            <article className="skills-manager-learned-card" key={skill.id}>
              <header><div><h3>{skill.title}</h3><p>{skill.summary}</p></div><span className="skills-manager-badge">{skill.status}</span></header>
              <small>{skill.provenance.sourceRunIds.length} source run{skill.provenance.sourceRunIds.length === 1 ? "" : "s"} · replay remains dry-run</small>
              <div className="skills-manager-actions">
                {skill.status === "candidate" ? (
                  <>
                    <button type="button" onClick={() => void onLearnedSkillAction(skill, "promote")}>Promote</button>
                    <button type="button" onClick={() => void onLearnedSkillAction(skill, "reject")}>Reject</button>
                  </>
                ) : null}
                {skill.status === "active" ? <button type="button" onClick={() => void onLearnedSkillAction(skill, "archive")}>Archive</button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const renderSources = () => (
    <div className="skills-manager-sources">
      <div className="skills-manager-section-intro">
        <div><span className="skills-manager-eyebrow">Multi-source catalog</span><h3>Sources & policy</h3></div>
        <button type="button" disabled={pendingAction === "refresh"} onClick={() => {
          setPendingAction("refresh");
          void orynt.refreshSkillHub().then(setSources).catch((error) => setMessage(error instanceof Error ? error.message : "Source refresh failed.")).finally(() => setPendingAction(""));
        }}>
          {pendingAction === "refresh" ? <LoaderCircle className="skills-manager-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Refresh
        </button>
      </div>
      <div className="skills-manager-source-list">
        {sources.map((source) => (
          <article key={source.id}>
            <div><strong>{source.label}</strong><code>{source.uri}</code></div>
            <span className={`skills-manager-badge skills-manager-trust-${source.trust}`}>{source.trust}</span>
            {source.message ? <p className="skills-manager-source-message">{source.message}</p> : null}
            <dl><div><dt>Status</dt><dd>{source.enabled ? "Enabled" : "Disabled"}{source.stale ? " · stale cache" : ""}</dd></div><div><dt>Last refresh</dt><dd>{source.lastRefreshedAt ? new Date(source.lastRefreshedAt).toLocaleString() : "Never"}</dd></div></dl>
          </article>
        ))}
      </div>
      <p className="skills-manager-notice"><ShieldCheck aria-hidden="true" /> Stars and downloads are discovery metadata only. Project scope wins over user scope; runtime roots remain read-only.</p>
    </div>
  );

  return (
    <div className="skills-manager">
      <nav className="skills-manager-tabs" role="tablist" aria-label="Skills Manager sections">
        {tabs.map((tab, index) => (
          <button
            ref={(node) => { tabRefs.current[index] = node; }}
            id={`skills-manager-tab-${tab.id}`}
            role="tab"
            aria-controls={`skills-manager-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {tab.id === "updates" && updates.length > 0 ? `${tab.label} ${updates.length}` : tab.label}
          </button>
        ))}
      </nav>
      <section className="skills-manager-panel" id={`skills-manager-panel-${activeTab}`} role="tabpanel" aria-labelledby={`skills-manager-tab-${activeTab}`}>
        {loadState === "loading" ? <div className="skills-manager-loading" role="status"><LoaderCircle className="skills-manager-spin" aria-hidden="true" /><span>Scanning configured skill roots and loading enabled sources…</span></div> : null}
        {loadState === "error" ? <div className="skills-manager-error" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>Skills Manager unavailable</strong><p>{message}</p><button type="button" onClick={() => void loadManager()}>Retry</button></div></div> : null}
        {loadState === "ready" ? (
          <>
            {message ? <p className="skills-manager-status" role="status">{message}</p> : null}
            {activeTab === "installed" ? renderInstalledList(inventory?.skills ?? []) : null}
            {activeTab === "discover" ? renderDiscover() : null}
            {activeTab === "updates" ? renderInstalledList(updates) : null}
            {activeTab === "learned" ? renderLearned() : null}
            {activeTab === "sources" ? renderSources() : null}
          </>
        ) : null}
      </section>
      {pendingPlan ? (
        <div className="skills-manager-plan-backdrop">
          <section className="skills-manager-plan" role="alertdialog" aria-modal="true" aria-labelledby="skills-manager-plan-title">
            <header><div><span className="skills-manager-eyebrow">Operator approval required</span><h3 id="skills-manager-plan-title">{pendingPlan.summary}</h3></div><span className={`skills-manager-badge skills-manager-trust-${pendingPlan.trust}`}>{pendingPlan.trust}</span></header>
            <p>This exact plan expires at {new Date(pendingPlan.expiresAt).toLocaleTimeString()}.</p>
            <ul>{pendingPlan.changes.map((change, index) => <li key={`${change.label}-${index}`}><strong>{change.kind}: {change.label}</strong><span>{change.detail}</span></li>)}</ul>
            {pendingPlan.warnings.map((warning) => <p className="skills-manager-notice skills-manager-notice-warning" key={warning}><AlertTriangle aria-hidden="true" /> {warning}</p>)}
            <div className="skills-manager-plan-actions">
              <button type="button" onClick={() => setPendingPlan(null)} disabled={Boolean(pendingAction)}>Cancel</button>
              <button type="button" onClick={() => void approveAndExecute()} disabled={Boolean(pendingAction)} aria-busy={Boolean(pendingAction)}>
                {pendingAction ? <><LoaderCircle className="skills-manager-spin" aria-hidden="true" /> Applying…</> : "Approve and apply"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <footer className="skills-manager-footer">
        <span><History aria-hidden="true" /> Managed changes are auditable and recoverable.</span>
        <button type="button" onClick={() => void loadManager(true)} disabled={loadState === "loading"}><RefreshCw aria-hidden="true" /> Scan local skills</button>
      </footer>
    </div>
  );
}
