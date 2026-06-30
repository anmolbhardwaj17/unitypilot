# UnityPilot

> An MCP server that lets an AI agent drive the full Unity lifecycle on macOS — without
> the developer ever opening the Unity Editor by hand.

One `npm install`, and an AI agent can install Unity, scaffold a project, launch it (visible
or headless), import assets, build scenes, write & compile scripts, screenshot the view,
read the console, and run tests.

**→ User docs, install, and the tool catalog: [`packages/orchestrator/README.md`](packages/orchestrator/README.md).**

This repo root is for working on UnityPilot itself. See `SPEC.md` for the full spec and
`CLAUDE.md` for the working agreement.

## ⚠️ v1 is macOS only

Apple Silicon (`arm64`) and Intel (`x64`) are supported. Windows and Linux exist only as
`NotImplemented` resolver stubs for contributors to fill in.

## Status

Phases 0–6 complete (full lifecycle + the autonomous feedback loop). Phase 7 (packaging +
public release) in progress. Built strictly phase by phase — see `SPEC.md §9`.

## Packages

- `packages/orchestrator` — the Node/TypeScript MCP server (our code), published to npm as
  **`unitypilot`**. Bundles the bridge at pack time.
- `packages/bridge` — the forked C# Unity (UPM) bridge, injected into projects via a `file:`
  reference. Fork of [CoderGamester/mcp-unity](https://github.com/CoderGamester/mcp-unity)
  (MIT); fork changes in `packages/bridge/FORK.md`.

## Develop (macOS)

```bash
corepack enable pnpm   # pnpm 9 ships with Node 22 via corepack
pnpm install
pnpm build
pnpm test
```

To produce a publishable tarball (copies the bridge into the package, then builds):

```bash
cd packages/orchestrator
npm pack            # runs prepack: bundle-bridge + tsc
```

## Out of scope for v1

Asset *generation*, Windows/Linux, Unity Asset Store distribution, and fully autonomous
visual correctness. See `SPEC.md §8`.
