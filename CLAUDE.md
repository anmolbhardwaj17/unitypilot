# CLAUDE.md

Persistent context for Claude Code on this repo. Read this and `SPEC.md`
at the start of every session. `SPEC.md` is the source of truth for *what*
to build; this file is *how we work*.

## What this project is

The Unity MCP Orchestrator: a Node/TypeScript MCP server that lets an AI
agent manage the full Unity lifecycle (install editor → create project →
inject bridge → launch headless → build scenes / scripts / import assets /
run tests / fix console errors) without the developer opening the Unity
Editor by hand. Two packages, one product: an orchestrator (ours, the moat)
and a forked C# bridge it injects into projects. Full detail in `SPEC.md`.

## Working agreement (non-negotiable)

- **One phase at a time.** Build the phase I name, stop at its deliverable,
  wait for me to verify on my Mac. Never run ahead into the next phase.
- **Spec is truth.** If reality contradicts `SPEC.md`, update `SPEC.md`
  first — explain the change — then code. Never let the doc drift.
- **Propose before scaffolding.** For structural decisions (folders,
  package boundaries, new deps), propose and wait for my OK.
- **No silent scope creep.** If something tempts you outside the current
  phase, name it and leave it; don't build it.

## Environment (macOS only, v1)

- Target platform: **macOS only.** Windows/Linux resolver files are
  `NotImplemented` stubs, never real implementations in v1.
- Architecture matters: Apple Silicon (`arm64`) vs Intel (`x64`) install
  separate Unity editor builds. Always detect with `uname -m`; never assume.
- Unity Hub is assumed already installed by the user. We install *editors*
  via the Hub CLI; we do not install the Hub itself.

## Hard constraints (these cause silent failures if violated)

- **Never pass `-logFile`** to the Unity editor. The bridge uses stdout for
  comms; `-logFile` breaks it.
- **Freeze resolved paths.** Editor path, project root, arch, bridge version
  resolve once, get written to `<project>/.unity-mcp/state.json`, and are
  read (never recomputed) afterward. AI discovery happens once per value.
- **Launch is headless by default** (`-batchmode -nographics`); graphics is
  opt-in.
- **Bridge tools only in `launched` state.** Calling them earlier returns a
  structured error naming the lifecycle tool to call first.
- **Time out on launch handshake** and report a possible macOS Gatekeeper /
  permissions prompt rather than hanging forever.

## Standards

- TypeScript, Node 22 LTS, pnpm workspaces.
- Official `@modelcontextprotocol/sdk` for MCP — don't hand-roll the protocol.
- Biome for lint/format. Vitest for tests.
- The macOS resolver is the load-bearing module: keep all platform-specific
  logic behind one interface in `src/resolver/`. No `process.platform`
  checks scattered through the codebase.

## Decisions NOT yet made (don't pre-empt)

- **Bridge fork choice** is a Phase 4 spike. Criteria are in `SPEC.md §7`.
  Do not vendor or commit to a fork before then. Verify the actual LICENSE
  file of any candidate — don't trust its description.

## How to talk to me

- Direct. If an approach is wrong or a phase reveals the plan won't work,
  say so plainly with the reasoning. I prefer honest probability ranges
  over reassurance.
- Flag assumptions explicitly rather than quietly picking one.
