# Fork notice

This package is **vendored from [CoderGamester/mcp-unity](https://github.com/CoderGamester/mcp-unity)**
at **v1.3.0**, chosen by the Phase 4 spike (see `SPEC.md §7`). It is MIT licensed;
the upstream `LICENSE.md` (© 2024-2025 CoderGamester) and `README.md` are retained
unmodified for attribution.

## What we vendored and why

- **Kept:** the in-editor Unity package — `package.json`, `Editor/` (the C# WebSocket
  server + `McpToolBase` tools + bundled `Editor/Lib/websocket-sharp.dll`), `LICENSE.md`,
  `README.md`.
- **Dropped:** upstream `Server~/` (their Node.js MCP server). Our **orchestrator** is
  the MCP server and the WebSocket *client* to this bridge, so their Node server is
  redundant for us. Also dropped docs/locale READMEs and repo-meta files.

## Integration facts (verified during the spike)

- The server is `[InitializeOnLoad]` with `AutoStartServer = true` by default, hosting
  `ws://localhost:8090/McpUnity` (port/auto-start in `ProjectSettings/McpUnitySettings.json`).
- The orchestrator's `launch` boots the editor headless and connects a WS client to
  that endpoint to confirm the handshake (Phase 4).

## Local modifications

None yet. If/when we modify the C# (e.g. to guarantee headless auto-start), record
the changes here so the delta from upstream stays auditable.
