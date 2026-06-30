# Unity MCP Orchestrator

> **Working name** — rename before publish. See `SPEC.md` for the full spec and `CLAUDE.md` for the working agreement.

One npm install, and an AI agent can install Unity, scaffold a project, launch it
headless, import assets, build scenes, write scripts, run tests, and fix its own
console errors — without the developer ever opening the Unity Editor by hand.

## ⚠️ v1 is macOS only

Apple Silicon (`arm64`) and Intel (`x64`) are supported. Windows and Linux exist
only as `NotImplemented` resolver stubs for contributors to fill in later.

## Status

Early development, built strictly phase by phase (see `SPEC.md §9`).

- **Phase 0 (current): monorepo scaffold + MCP wiring.** The orchestrator boots as
  an MCP server over stdio and exposes a single `status` tool that returns
  `{ "state": "none" }`. This proves the Claude Code ↔ orchestrator pipe before any
  real lifecycle logic exists.

## Packages

- `packages/orchestrator` — the Node/TypeScript MCP server (our code).
- `packages/bridge` — placeholder for the forked C# Unity bridge (Phase 4).

## Develop (macOS)

```bash
corepack enable pnpm   # pnpm 9 ships with Node 22 via corepack
pnpm install
pnpm build
pnpm test
```

## Connect to Claude Code

The repo ships a project-scoped `.mcp.json`. After `pnpm build`, restart Claude Code
(or reconnect with `/mcp`) and call the `status` tool — it should return
`{ "state": "none" }`.

## Out of scope for v1

Asset *generation*, Windows/Linux, Unity Asset Store distribution, and fully
autonomous visual correctness. See `SPEC.md §8`.
