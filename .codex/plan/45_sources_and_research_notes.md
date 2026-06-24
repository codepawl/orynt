# Sources and Research Notes

Generated: 2026-06-24

## External references

These are references for Codex/human review. Treat them as context, not as implementation lock-in.

- Playwright MCP introduction: https://playwright.dev/mcp/introduction
- Playwright ARIA snapshots: https://playwright.dev/docs/aria-snapshots
- OpenAI prompt caching guide: https://developers.openai.com/api/docs/guides/prompt-caching
- Anthropic context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic writing tools for agents: https://www.anthropic.com/engineering/writing-tools-for-agents
- Tauri security overview: https://v2.tauri.app/security/
- Tauri capabilities: https://v2.tauri.app/security/capabilities/
- Tauri permissions: https://v2.tauri.app/security/permissions/
- OWASP Top 10 web application risks: https://owasp.org/www-project-top-ten/
- OWASP Top 10 for LLM applications: https://genai.owasp.org/llm-top-10/
- Model Context Protocol specification: https://modelcontextprotocol.io/specification/2025-06-18

## Research notes

### Playwright/MCP direction

Playwright MCP demonstrates that structured accessibility snapshots can let LLMs interact with page elements by refs instead of relying on screenshot coordinates. CodePawl should adopt the principle but build a product-level cockpit, trace, token economy, and policy layer above it.

### Token/cost direction

Prompt caching benefits from exact stable prefixes, so CodePawl should separate stable policy/schema instructions from variable page state. Context engineering should be iterative: select, compress, isolate, and clear tool results.

### Security direction

OWASP LLM risks and prompt injection are directly relevant. Browser content must be treated as untrusted data. Tool permissions and approval gates must be enforced outside the model.

### Desktop shell direction

Tauri v2 is the only supported desktop shell. Its capability/permission model matches CodePawl's local-first security goals. Electron is intentionally excluded because its binary/runtime cost and security surface do not fit the product direction.

## How to use these sources

Do not cargo-cult. Convert principles into CodePawl-specific implementation tests.
