# Risks and Open Questions

Generated: 2026-06-24

## Product risks

### Risk: Product too broad

Mitigation: keep MVP browser-first while preserving full-system architecture.

### Risk: Looks like another browser automation wrapper

Mitigation: market the cockpit, trace, replay, cost control, and weak-model support.

### Risk: Users expect magic full desktop control

Mitigation: clear roadmap and limitation messaging.

## Technical risks

### Risk: Accessibility snapshots are noisy/large

Mitigation: Semantic UI Graph filtering and top-k context packets.

### Risk: Weak models still fail

Mitigation: state machines, action narrowing, verifier, user hint mode, escalation.

### Risk: Browser automation breaks on complex sites

Mitigation: detect failure modes, refresh observation, ask user, save corrections as skills.

### Risk: Token estimate inaccurate

Mitigation: provider-specific estimation when possible, display as estimate, log actual usage where APIs return it.

## Security risks

### Risk: Prompt injection causes unsafe action

Mitigation: policy engine outside model, approvals, untrusted content labeling.

### Risk: Trace stores sensitive data

Mitigation: redaction, privacy mode, retention controls, delete run.

### Risk: Plugin/MCP expands attack surface

Mitigation: postpone arbitrary plugins, implement strict allowlist and sandbox later.

## Open questions

- Which model provider first?
- Which local model target first?
- How much UI polish before public alpha?
- Should traces be encrypted locally by default?
- Should skill format be user-editable JSON?
- How to price Pro without weakening open/local trust?
