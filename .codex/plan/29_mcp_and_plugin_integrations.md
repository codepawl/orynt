# MCP and Plugin Integrations

Generated: 2026-06-24

## Position

MCP and plugins are useful later, but should not be the core MVP dependency.

## Why cautious

Tool systems increase the action surface. More tools can mean more ambiguity, more security risk, and more token overhead if schemas are repeatedly sent into context.

## MVP integration policy

- Built-in browser adapter first.
- No arbitrary MCP server execution by default.
- Read-only plugins before write/action plugins.
- Explicit user installation and permission grant.
- Per-tool risk classification.
- Tool outputs stored in trace and summarized before entering model context.

## Plugin contract

```ts
export interface CodePawlPlugin {
  id: string;
  name: string;
  version: string;
  permissions: PluginPermission[];
  tools: PluginTool[];
}
```

## Security requirements

- Tool allowlist.
- Sandboxed execution where possible.
- No shell command construction from model text.
- Output size limits.
- Network/file scopes.
- Human approval for write/destructive tools.

## Future plugin ideas

- GitHub read-only context.
- Local file export.
- CSV transform.
- Browser QA reporter.
- Issue creator with approval.

## Done when

MVP has an internal plugin-like boundary even if no external plugin marketplace exists.
