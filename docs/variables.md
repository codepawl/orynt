# Variables and secrets

| Name | Used by | Source/scope | Rotation or risk |
| --- | --- | --- | --- |
| `ORYNT_STATE_HOME`, `XDG_STATE_HOME` | CLI stores | Local user | Controls private state location |
| `ORYNT_NO_UPDATE_CHECK` | CLI updater | Local/CI | `1` is a hard network-off override |
| `ORYNT_UPDATE_MANIFEST_URL` | Updater tests/operators | Local process | Must remain HTTPS or loopback test-only |
| `ORYNT_AGENT_RUNTIME`, `ORYNT_CODEX_RUNTIME` | Model runtime | Local process | Selects owned runtime path; no authority expansion |
| `OPENAI_API_KEY` | Opt-in API provider | Secret environment | Never bundle, log, document, or persist |
| `ORYNT_RELEASE_SIGNING_KEY` | Manifest signer | Protected release secret | Ed25519 private key; offline backup and incident rotation |
| `ORYNT_RELEASE_PUBLIC_KEY(S)` | Packaged updater | Public build input | Public keyring; add new key before signing with it |
| `ORYNT_RELEASE_KEY_ID` | Packaging/signer | Release variable | Binds manifest signature to a known public key |
| `NPM_BOOTSTRAP_TOKEN` | First npm publish | Protected one-time secret | Revoke after `0.1.0`, then use trusted-publisher OIDC |
| `ORYNT_RUN_REAL_CODEX`, `ORYNT_LIVE_MODEL` | Guarded live tests | Local/CI | Causes provider usage only with explicit live command |

No secret may be embedded in CLI, browser, source map, SBOM, notice, evidence,
log, memory, skill, npm package, or native archive.

Before release: verify protected environment reviewers, key match and backup,
npm token scope, OIDC permissions, redacted logs, artifact contents, and full
Git history.
