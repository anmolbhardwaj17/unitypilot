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

### Headless auto-start (Phase 4) — `Editor/UnityBridge/McpUnityServer.cs`

Upstream **deliberately disables the WebSocket server in batch mode** (CI safety, and
its `InstallServer()` runs `npm install/build` on the Node server, which can hang
headless). Our product premise is the opposite — the editor always runs headless. So
we gate the batch-mode guards behind an explicit opt-in:

- Added `internal static bool AllowHeadless` → true when env `UNITY_MCP_HEADLESS=1`.
  The orchestrator sets this only on its own `launch` (see `launch-node.ts`), so
  upstream's CI-safe default is preserved for everyone else.
- `Instance` getter, the private constructor, `RunScheduledStart`, and the
  `[DidReloadScripts] AfterReload` bootstrap now treat batch mode as allowed when
  `AllowHeadless`.
- In headless we **skip `InstallServer()`** entirely (the orchestrator is the MCP
  client; the upstream Node server is unused) and **start the server directly** in the
  constructor rather than via `EditorApplication.delayCall`/`update`, whose timing is
  unreliable in batch mode.

Not yet changed: the quit/assembly-reload event handlers still no-op in batch mode.
Reload-resilience headless (server restart after a recompile) is a Phase 5+ concern.
