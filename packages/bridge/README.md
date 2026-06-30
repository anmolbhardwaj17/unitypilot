# Bridge

The C# Unity bridge — a Unity package that runs *inside* the editor and exposes
scene/script/asset/test tools over a WebSocket.

## Current state: minimal stub

As of Phase 3, this is a **minimal valid Unity package** (`package.json` only,
`com.unitymcp.bridge`). It exists so the orchestrator's `create_project` can inject
it into a project's `Packages/manifest.json` as a local `file:` dependency and we can
test that injection end to end. It contains no runtime code yet.

## The real bridge is Phase 4

Per `SPEC.md §7` and `CLAUDE.md`, the fork base is chosen by a short spike at the
start of Phase 4 (default candidate: `CoderGamester/mcp-unity`; fallback:
`CoplayDev/unity-mcp`). Nothing from any fork is vendored here before that decision —
including its LICENSE, which must be verified against the actual repo file.

Do not add bridge runtime code before Phase 4.
