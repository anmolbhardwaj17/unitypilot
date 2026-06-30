# Unity MCP Orchestrator — Project Spec

> **Working name:** `unity-mcp-orchestrator` (rename before publish)
> **One-line pitch:** One npm install, and an AI agent can install Unity, scaffold a project, launch it headless, import assets, build scenes, write scripts, run tests, and fix its own console errors — without the developer ever opening the Unity Editor by hand.
> **Scope of v1:** macOS only (Apple Silicon + Intel). Windows/Linux are stubbed but not built.
> **Audience for this doc:** Claude Code. Read this top to bottom before writing any code. Build strictly phase by phase. Do not skip ahead.

---

## 1. The core idea (read this first, it shapes everything)

This is **not** "another Unity MCP." Several already exist (CoplayDev/unity-mcp, CoderGamester/mcp-unity, Unity's own first-party server). They are all **in-editor bridges**: the Unity Editor must already be open, with their package already installed in the project, before the AI can do anything.

The gap they leave — and the entire reason this project exists — is the **lifecycle**: installing the editor, creating the project, injecting the bridge, and launching headless. That setup is currently manual and multi-step. We collapse it into tools the agent can call.

So this product is **two cooperating pieces shipped as one product**:

1. **Orchestrator** (new code, the moat) — a Node/TypeScript MCP server that runs *outside* Unity. It manages the Unity lifecycle via the Unity Hub / editor command line, and proxies in-editor tool calls to the bridge.
2. **Bridge** (forked from an existing MIT project) — a C# Unity package that runs *inside* the editor and exposes scene/script/asset/test tools over a WebSocket.

The orchestrator is also the **installer** for the bridge. The user installs *only* the orchestrator (one npm package). When the orchestrator creates a project, it silently writes the bridge into that project's `Packages/manifest.json`. The user never touches Unity's Package Manager, never pastes a git URL. **That auto-injection is the trick that makes "anyone can install, one command" real.**

### Architecture

```
┌─────────────┐   MCP / stdio   ┌──────────────────────┐   shell    ┌──────────────┐
│ Claude Code │ ◄─────────────► │     ORCHESTRATOR     │ ─────────► │  Unity Hub / │
│ (MCP client)│                 │  (Node + TS, ours)   │   (CLI)    │ Editor binary│
└─────────────┘                 │                      │            └──────────────┘
                                │  - MCP server (stdio)│
                                │  - lifecycle FSM     │   WebSocket
                                │  - macOS resolver    │ ◄──────────┐
                                │  - WS client→bridge  │            │
                                └──────────────────────┘            │
                                                          ┌─────────▼─────────┐
                                                          │   BRIDGE (C#)     │
                                                          │  inside Unity     │
                                                          │  WS server + tools│
                                                          └───────────────────┘
```

The orchestrator is simultaneously: an **MCP server** (stdio, talking to Claude Code) and a **WebSocket client** (talking to the bridge inside Unity). It also shells out to the Unity CLI for lifecycle operations.

---

## 2. Locked technical decisions

These are decided. Do not re-litigate them mid-build.

| Decision | Choice | Why |
|---|---|---|
| Language / runtime | TypeScript, Node 22 LTS | Maintainer's standard stack |
| Monorepo tooling | pnpm workspaces | Two packages, one product |
| MCP implementation | Official `@modelcontextprotocol/sdk` (TS) | Don't hand-roll the protocol |
| Lint / format | Biome | Single fast tool |
| Tests | Vitest | Maintainer's standard |
| Orchestrator ↔ bridge transport | WebSocket | Matches the bridge fork's existing model |
| Project state storage | Project-local JSON file at `<project>/.unity-mcp/state.json` | Inspectable, git-ignorable, simple |
| Bridge source | **Fork** an MIT-licensed bridge (see §7) | Don't rebuild commodity tools |
| Target platform v1 | macOS only (arm64 + x64) | Maintainer's machine; deletes the cross-platform tax |
| Editor launch | Headless (`-batchmode -nographics`) by default | Core premise; graphics mode is opt-in |

### Determinism principle (load-bearing — this is the moat)

> **The AI resolves a path or makes a discovery decision exactly once. After that, the resolved value is frozen into the project state file and never re-derived.**

Editor binary path, project root, bridge version, detected architecture — all resolved on first encounter, written to `state.json`, and read (not recomputed) on every subsequent call. This is what separates a shippable, resumable product from a demo script that re-runs `install` every session. If a session dies mid-build, `status` reports exactly where it stopped and the agent resumes from there.

---

## 3. The lifecycle state machine

Every project the orchestrator manages sits in exactly one state. The agent reads the state; it does not infer it.

```
none ──ensure_editor──► editor_ready ──create_project──► project_created ──launch──► launched ⇄ busy
                                                                              ▲           │
                                                                              └─shutdown──┘ (→ project_created)
```

| State | Meaning | What tools are legal |
|---|---|---|
| `none` | Nothing resolved yet | `ensure_editor`, `status` |
| `editor_ready` | Editor binary resolved/installed and verified | `create_project`, `status` |
| `project_created` | Project exists on disk, bridge injected into manifest | `launch`, `status` |
| `launched` | Editor running headless, bridge WS handshake confirmed | all bridge tools, `shutdown`, `status` |
| `busy` | A bridge operation is in flight | `status` only (queue or reject others) |

**Hard rule:** bridge tools (`scene_*`, `script_*`, `import_assets`, etc.) are **only callable in `launched`**. If called earlier, the orchestrator returns a structured error telling the agent which lifecycle tool to call first. The front door must be open before anyone reaches inside.

`state.json` shape (illustrative):

```json
{
  "schemaVersion": 1,
  "state": "launched",
  "arch": "arm64",
  "unityVersion": "6000.0.x",
  "editorPath": "/Applications/Unity/Hub/Editor/6000.0.x/Unity.app/Contents/MacOS/Unity",
  "projectPath": "/Users/.../MyGame",
  "bridgeVersion": "x.y.z",
  "lastHandshakeAt": "2026-06-30T...",
  "frozen": { "editorPath": true, "arch": true }
}
```

---

## 4. Tool surface

Split by which process executes them.

### 4a. Orchestration tools (Node — work with Unity *not* running)

**`ensure_editor`**
- Input: `{ unityVersion: string, unityPath?: string }`
- Behavior: if `unityPath` given, verify it exists and matches version → freeze it. Else resolve via the macOS resolver (§5); install via Unity Hub CLI if missing. Detect arch with `uname -m`, install the matching build (arm64 vs x64).
- Done = editor binary exists, version matches, path frozen in state. → `editor_ready`

**`create_project`**
- Input: `{ projectPath: string, template?: string, targetPlatform?: string }`
- Behavior: run `Unity -createProject <path> -batchmode -quit`. Then inject the bridge package into `<path>/Packages/manifest.json`. Write initial `state.json`.
- Done = project folder exists, bridge registered in manifest, no creation errors. → `project_created`

**`launch`**
- Input: `{ projectPath: string, graphics?: boolean }` (default `graphics: false`)
- Behavior: boot the editor (`-batchmode -nographics` unless graphics requested). Wait for the bridge's WebSocket to report ready, with a **timeout** that returns a diagnostic on failure (see Gotcha G3). **Never pass `-logFile`** — it collides with stdout comms (Gotcha G1).
- Done = WS handshake confirmed. → `launched`

**`shutdown`**
- Input: `{}`
- Behavior: clean editor exit, close WS. → `project_created`

**`status`**
- Input: `{}`
- Behavior: return current state, frozen paths, editor up/down, bridge connected, last compile result. Legal in every state. This is the resume anchor.

### 4b. Bridge tools (C# — only legal in `launched`, proxied over WS)

Most of these come from the fork; we proxy them through the orchestrator so Claude Code sees one unified tool list.

**`import_assets`** *(the one the user specifically wants)*
- Input: `{ sources: string[], destination: string }`
- Behavior: copy files into the project, call `AssetDatabase.ImportAsset` + refresh, report import errors. (User supplies the assets; we import and make them usable. No generation — out of scope, see §8.)

**`scene_*`** — `scene_create`, `scene_load`, `scene_save`, `gameobject_create`, `transform_set`, `component_add`, `component_configure`. (Commodity; comes with the fork.)

**`script_*`** — `script_write`, `script_edit`, `recompile`, surfacing compile errors.

**`run_tests`** — invoke the Unity Test Runner, return pass/fail + failures.

**`read_console`** — return console messages (the other half of the autonomous error→fix loop).

**`screenshot` / `camera_view`** — the **feedback channel**. Render the game/scene/camera to an image the agent can inspect. Without this the agent is blind on anything visual. Borrow the approach from a vision-capable bridge (e.g. Union's screenshot/camera tooling).

---

## 5. The macOS resolver (the load-bearing module — isolate it)

This is the part that, cross-platform, would be 60% of the work. macOS-only makes it cheap, but it's still where "anyone can install" lives or dies. **Put it behind one module** (`packages/orchestrator/src/resolver/`) with a clean interface, so the Windows/Linux branches are obvious stubs a contributor can fill later. No `process.platform` checks sprinkled through the codebase.

Known macOS locations (verify at runtime, don't hardcode blindly):
- Unity Hub app: `/Applications/Unity Hub.app`
- Hub CLI: `/Applications/Unity Hub.app/Contents/MacOS/Unity Hub` (pass `--headless`, and `--` before Hub-specific args)
- Editors: `/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity`

Resolver responsibilities:
1. `detectArch()` → `uname -m` → `"arm64" | "x64"`. **Only real conditional in the module.**
2. `findHub()` → locate Hub or report not-installed with an actionable message.
3. `findEditor(version)` → locate an installed editor of that version.
4. `installEditor(version, arch)` → drive the Hub CLI to install, picking the arch-matched build.
5. Always honor an explicit `unityPath` override (the escape hatch for non-default installs).

Interface sketch:

```ts
export interface UnityResolver {
  detectArch(): Promise<"arm64" | "x64">;
  findHub(): Promise<string | null>;
  findEditor(version: string): Promise<string | null>;
  installEditor(version: string, arch: "arm64" | "x64"): Promise<string>;
}
// macOS implementation in resolver/macos.ts
// resolver/windows.ts + resolver/linux.ts = throw NotImplemented stubs for v1
```

---

## 6. Critical gotchas (bake these in from day one)

- **G1 — Never use `-logFile`.** The bridge relies on Unity's standard output for communication. Passing `-logFile` breaks comms. Inherited hard constraint from the nurture-tech runner pattern.
- **G2 — Apple Silicon vs Intel editor builds are separate binaries.** Always install the arch-matched build. Detect with `uname -m`; never assume. Mismatched arch is a confusing silent failure.
- **G3 — Gatekeeper / first-launch permission hang.** macOS may quarantine or prompt on a freshly installed editor binary the first time it's launched non-interactively, and headless launch can hang silently waiting on a prompt the user never sees. `launch` and `status` must **time out** and report `"editor launched but no handshake — possible macOS permissions prompt; try launching the editor once manually"` rather than hanging forever.
- **G4 — Frozen paths, never re-resolved.** Per §2, once a path is in `state.json` it is read, not recomputed.
- **G5 — `busy` state guards concurrency.** Don't let two bridge operations race. Queue or reject.

---

## 7. The bridge fork — decision and licensing

**Phase 4 begins with a short spike to pick the fork base.** Criteria, in order: (1) WebSocket-server-in-editor architecture that maps cleanly onto our proxy, (2) a clean extension pattern for adding tools, (3) feature breadth, (4) maintenance activity, (5) **MIT (or equally permissive) license — verify the actual LICENSE file in the repo, do not trust a description.**

- **Default pick:** `CoderGamester/mcp-unity` — documents a WebSocket server inside Unity + Node client, and an `McpToolBase` subclass-and-register extension pattern that fits our proxy design directly.
- **Fallback:** `CoplayDev/unity-mcp` — more feature-complete (assets, scenes, scripts, tests, scene control), MIT, actively maintained; choose this if breadth outweighs architectural fit.

**Licensing rules for shipping publicly:**
- Confirm the chosen base is MIT before building on it. Keep the upstream copyright notice in the bridge package's LICENSE.
- Our orchestrator is our own code — license the repo MIT for consistency.
- We do **not** redistribute Unity. The product runs on top of the user's own Unity install and their own Unity license. Automating the user's own licensed editor headlessly is sanctioned (it's what `-batchmode` / CI exists for).

---

## 8. Out of scope for v1 (state this in the README)

- **Asset *generation*.** We import and wire assets the user supplies. We do not generate meshes, textures, rigs, or audio. (That's a separate generative pipeline composed in later, if ever.)
- **Windows / Linux.** Resolver stubs only.
- **Unity Asset Store distribution.** The only channel with a review gate. Ship via npm (orchestrator) + git URL / OpenUPM (bridge) instead.
- **Fully autonomous visual correctness.** The agent gets a screenshot channel, but the human owns visual feedback. Honest ceiling: setup/scripting/wiring is highly automatable; visual iteration stays human-in-the-loop.

---

## 9. Build plan — phases

Each phase ends with a concrete, testable deliverable. **Do not start a phase until the previous one's deliverable passes.**

### Phase 0 — Monorepo scaffold + standards
- pnpm workspace: `packages/orchestrator` (TS, Node 22), `packages/bridge` (placeholder for the Unity package).
- Biome, Vitest, tsconfig, CI-less local scripts.
- Orchestrator boots as an MCP server over stdio exposing a single `status` tool that returns `{ state: "none" }`.
- **Deliverable:** Claude Code can connect via `mcp.json` and successfully call `status`. Wiring proven end to end before any real logic.

### Phase 1 — macOS resolver (isolated)
- Build `resolver/macos.ts` per §5. Pure, heavily unit-tested functions. `detectArch`, `findHub`, `findEditor`. `installEditor` can be stubbed/mocked in tests.
- Windows/Linux resolver files exist as `NotImplemented` throwers.
- Explicit `unityPath` override path tested.
- **Deliverable:** given a real Mac with Unity installed, the resolver locates Hub + an editor + arch correctly; tests green.

### Phase 2 — Lifecycle FSM + frozen state file
- Implement the §3 state machine and `<project>/.unity-mcp/state.json` read/write with the freeze semantics from §2.
- `status` reports real state and frozen paths. Resume logic: re-opening a half-built project reports the correct resume point.
- **Deliverable:** state transitions are enforced (illegal-tool-for-state returns a structured error naming the required lifecycle tool); state survives process restart.

### Phase 3 — `ensure_editor` + `create_project`
- `ensure_editor`: resolve/install editor headless, freeze path. → `editor_ready`.
- `create_project`: headless `-createProject`, then inject the bridge into `manifest.json` (bridge can be a minimal valid stub package at this stage), write state. → `project_created`.
- **Deliverable:** from `none`, the agent installs (or finds) an editor and scaffolds a project with the bridge registered, never opening the Unity GUI.

### Phase 4 — Bridge fork + `launch` + handshake
- Spike and pick the fork base (§7). Vendor it into `packages/bridge`, get it compiling, WebSocket server live inside the editor.
- `launch`: boot editor headless, connect the orchestrator's WS client, confirm handshake with the G3 timeout/diagnostic. → `launched`. `shutdown` returns to `project_created`.
- **Deliverable:** orchestrator launches Unity headless and reaches a confirmed `launched` handshake on a Mac.

### Phase 5 — Core bridge tools proxied through MCP
- Surface `scene_*`, `script_*`, and `import_assets` to Claude Code, proxied over WS to the bridge. Enforce `launched`-only and the `busy` guard.
- **Deliverable:** Claude Code prompt → "create a scene, add a cube, import this asset, attach this script" executes end to end, headless, no manual editor interaction.

### Phase 6 — Feedback loop
- `read_console`, `run_tests`, and `screenshot` / `camera_view`.
- Demonstrate the autonomous error→fix loop: agent writes a script with a deliberate compile error, reads the console, fixes it, recompiles clean.
- **Deliverable:** agent recovers from a self-introduced error without human help, and can return a screenshot the human reviews.

### Phase 7 — Packaging + public release
- `npm publish` the orchestrator. README with the one-line install, a **macOS-only v1** banner, the §8 scope statement, and upstream bridge attribution.
- Single version number across the monorepo, single install line. Resolver Windows/Linux stubs clearly marked as contributor-ready.
- **Deliverable:** a fresh Mac with Unity Hub installed can go from `npm`/`mcp.json` config to a built scene using only Claude Code prompts.

---

## 10. How to use this doc with Claude Code

1. Drop this file at the repo root as `SPEC.md`.
2. Tell Claude Code: *"Read SPEC.md. Build Phase 0 only. Stop at the deliverable and let me verify before Phase 1."*
3. Verify each phase's deliverable on your actual Mac before advancing. The phases are ordered so nothing later depends on something unbuilt.
4. When a phase reveals a wrong assumption (especially in the resolver or G3 timing), update this doc first, then code. Spec stays the source of truth.
