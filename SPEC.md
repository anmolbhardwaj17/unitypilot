# UnityPilot — Project Spec

> **Name:** **UnityPilot** (working package id `unity-mcp-orchestrator`; npm package name finalized before publish)
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
| Editor launch | **Interactive (visible editor) by default**; headless (`-batchmode -nographics`) is opt-in (`headless: true`) | **Revised in Phase 5.** The maintainer's workflow is Unity in one window + Claude Code in the other, watching changes land live and reacting ("the human owns visual feedback", §8). Interactive is also the bridge's native mode — the editor loop runs, so the batch-mode pump/reload surgery (§4b/FORK.md) isn't needed. Headless stays for CI/automation. |

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

**Project-root resolution (one project per session).** `status` and the lifecycle
tools take no project handle, so the orchestrator resolves a single project root at
startup: `UNITY_MCP_PROJECT_ROOT` (env) if set, else `process.cwd()`. The state file
is always `<projectRoot>/.unity-mcp/state.json`. This also resolves the "`editor_ready`
exists before the project does" ordering: `ensure_editor` (Phase 3) writes the state
file at the resolved root *before* any Unity project is scaffolded there;
`create_project` later populates the Unity project into that same root (and validates
its `projectPath` against it — detail finalized in Phase 3).

**Illegal-tool-for-state** is reported as a structured tool *result* with
`isError: true` and a JSON body `{ error, tool, currentState, requiredTool, message }`,
not a thrown protocol error — so the agent can read `requiredTool` and self-correct.

---

## 4. Tool surface

Split by which process executes them.

### 4a. Orchestration tools (Node — work with Unity *not* running)

**`ensure_editor`**
- Input: `{ unityVersion: string, unityPath?: string }`
- Behavior: if `unityPath` given, verify it exists (per §5, verifying it *matches* the version is deferred to `launch`) → freeze it. Else resolve via the macOS resolver (§5); install via Unity Hub CLI if missing. Detect arch with `uname -m`, install the matching build (arm64 vs x64). `arch`, `editorPath`, and `unityVersion` are frozen.
- Done = editor binary exists, path frozen in state. → `editor_ready`

**`create_project`**
- Input: `{ projectPath: string, template?: string, targetPlatform?: string }`
- `projectPath` **must equal the resolved project root** (§3): state and the Unity project stay colocated. A mismatch returns a structured error telling the user to set `UNITY_MCP_PROJECT_ROOT` (or run the orchestrator from that directory). `template`/`targetPlatform` are accepted but not yet wired in v1.
- Behavior: run `Unity -createProject <root> -batchmode -nographics -quit` (**never** `-logFile`, G1). Idempotent/resumable: if the project is already scaffolded (`Packages/manifest.json` exists), skip the editor run. Then inject the bridge as a local `file:` dependency into `<root>/Packages/manifest.json`. Freeze `projectPath`, write `state.json`.
- Done = project folder exists, bridge registered in manifest, no creation errors. → `project_created`

**`launch`**
- Input: `{ projectPath: string, headless?: boolean }` (default `headless: false` → **visible editor**). `projectPath` must equal the resolved project root (§3), as for `create_project`.
- Behavior — **interactive (default):** boot the real editor (`-projectPath <root> -logFile -`, no `-batchmode`). The user sees the Scene/Game view; the bridge runs in its native mode (editor loop alive → no pump). **Headless (`headless: true`):** `-batchmode -nographics` plus `-executeMethod …RunHeadless` (the pump) and `UNITY_MCP_HEADLESS=1`. Either way the bridge auto-starts its WebSocket server and the orchestrator's WS client polls `ws://localhost:8090/McpUnity` until the handshake succeeds, within a **timeout** that, on expiry or early editor exit, kills the editor and returns a diagnostic (G3 Gatekeeper, or G6 license/compile from the captured log). The live editor process handle is held in memory for `shutdown`.
- Done = WS handshake confirmed. → `launched`

**`shutdown`**
- Input: `{}`
- Behavior: terminate the in-memory editor process (the WS server dies with it) and clear the session. → `project_created`. If no live process is held (e.g. orchestrator restarted), transition state anyway and note the editor may still be running.

**`status`**
- Input: `{}`
- Behavior: return current state, frozen paths, editor up/down, bridge connected, last compile result. Legal in every state. This is the resume anchor.

### 4b. Bridge tools (C# — only legal in `launched`, proxied over WS)

Most of these come from the fork; we proxy them through the orchestrator so Claude Code sees one unified tool list.

> **Reality check (Phase 5 spike).** The chosen fork (CoderGamester/mcp-unity) provides
> a rich set — `create_scene`/`load_scene`/`save_scene`/`unload_scene`/`delete_scene`,
> `update_gameobject`/`get_gameobject`/`select_gameobject`/`duplicate`/`delete`/`reparent`/
> `move`/`rotate`/`scale_gameobject`/`set_transform`, `update_component`, the `*_material`
> tools, `add_asset_to_scene`, `create_prefab`, `add_package`, `execute_menu_item`,
> `recompile_scripts`, `run_tests`, `send_console_log`, `batch_execute`, and resources
> (`get_console_logs`, `get_scenes_hierarchy`, `get_tests`, …). **But it has no
> `script_write`/`script_edit` and no `import_assets`.** We implement those two ourselves,
> **hybrid**: the orchestrator does the file IO (it has direct local fs access to the
> project) and the bridge does the Unity-side refresh/compile via a small forked
> `refresh_assets` tool. There is no primitive-creation tool either: "add a cube" is
> `execute_menu_item("GameObject/3D Object/Cube")`.
>
> **Concurrency (`busy`, G5).** `busy` is not persisted; it is an in-memory serialization
> overlay on `launched`. Bridge calls run through a per-session mutex so two never race,
> and `status` reports whether a call is in flight. The persisted `state` stays `launched`.

**`import_assets`** *(the one the user specifically wants — forked-in, hybrid)*
- Input: `{ sources: string[], destination: string }`
- Behavior: orchestrator copies the source files into `<project>/Assets/<destination>`, then calls the bridge's `refresh_assets` so Unity imports them (`AssetDatabase.Refresh`), reporting errors. (User supplies the assets; we import and make them usable. No generation — out of scope, see §8.) Importing assets that compile (scripts) triggers a domain reload — see Phase 5b.

**`scene_*`** — proxied to the fork: `scene_create`→`create_scene`, `scene_load`→`load_scene`, `scene_save`→`save_scene`, `gameobject_create`→`update_gameobject` (or a cube via `execute_menu_item`), `transform_set`→`set_transform`, `component_add`/`component_configure`→`update_component`.

**`script_*`** *(forked-in, hybrid — Phase 5b)* — `script_write` writes a `.cs` into `Assets/` (orchestrator fs) then `recompile_scripts`; attaching it uses `update_component`. Compiling forces a Unity **domain reload** that drops and restarts the bridge WS, so the orchestrator's `BridgeClient` must reconnect across it. This is why scripts are split into Phase 5b.

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
5. Always honor an explicit `unityPath` override via `verifyEditorPath(path)` (the escape hatch for non-default installs). Phase 1 verifies the binary *exists*; verifying it matches the requested version requires launching the editor and is deferred to `launch` (Phase 4).

Interface sketch:

```ts
export interface UnityResolver {
  detectArch(): Promise<"arm64" | "x64">;
  findHub(): Promise<string | null>;
  findEditor(version: string): Promise<string | null>;
  verifyEditorPath(path: string): Promise<boolean>; // honors an explicit unityPath override
  installEditor(version: string, arch: "arm64" | "x64"): Promise<string>;
}
// The single platform-selection site is resolver/index.ts (the one allowed
// process.platform switch). macOS implementation in resolver/macos.ts.
// resolver/stubs.ts = Windows + Linux throw NotImplemented for v1.
```

---

## 6. Critical gotchas (bake these in from day one)

- **G1 — `-logFile` collides only with a *stdout-transport* bridge (re-scoped in Phase 4).** The original hard constraint (inherited from the nurture-tech runner) assumed a bridge that pipes comms over Unity's **stdout**, so `-logFile` would corrupt it. **The bridge fork actually chosen in Phase 4 (CoderGamester/mcp-unity) communicates over a WebSocket (`ws://localhost:8090/McpUnity`), not stdout.** Comms are therefore out-of-band, and `-logFile -` is **safe in every phase** — including `launch` — and the orchestrator uses it everywhere to capture Unity's log for real diagnostics (license/compile failures, G6). The never-`-logFile` rule would only re-apply if a future bridge used stdout as its transport; if one ever does, scope `-logFile` off for that bridge's `launch` only.
- **G2 — Apple Silicon vs Intel editor builds are separate binaries.** Always install the arch-matched build. Detect with `uname -m`; never assume. Mismatched arch is a confusing silent failure.
- **G3 — Gatekeeper / first-launch permission hang.** macOS may quarantine or prompt on a freshly installed editor binary the first time it's launched non-interactively, and headless launch can hang silently waiting on a prompt the user never sees. `launch` and `status` must **time out** and report `"editor launched but no handshake — possible macOS permissions prompt; try launching the editor once manually"` rather than hanging forever.
- **G4 — Frozen paths, never re-resolved.** Per §2, once a path is in `state.json` it is read, not recomputed.
- **G5 — `busy` state guards concurrency.** Don't let two bridge operations race. Queue or reject.
- **G6 — Headless Unity needs an activated license (discovered in Phase 3).** `-batchmode` Unity refuses to run without an active license *even though no GUI opens*; it exits non-zero (observed: code **198**, log: `No valid Unity Editor license found` / `'com.unity.editor.headless' was not found`). This is an environmental prerequisite the orchestrator cannot satisfy itself. `create_project`/`launch` must detect this signature and return an actionable diagnostic ("activate a license in Unity Hub → sign in → ensure a Personal/Pro license is active, then retry"), not a raw exit code. The user activates the license once; the Hub stores it. A Personal license activated via the Hub is sufficient.

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

Split at the recompile/domain-reload boundary (discovered in the Phase 5 spike, §4b): the no-compile tools are straightforward; anything that compiles C# tears down and restarts the bridge WS, which is materially harder and is isolated into 5b.

**Phase 5a — proxy core + no-reload tools** ✅ *(done)*
- A persistent `BridgeClient` (request/response over the launched WS), established at `launch` and held in the session. Enforce `launched`-only and the `busy` in-memory serialization guard (§4b).
- Proxy `scene_create`/`scene_save`/`scene_get_info`, `gameobject_create_primitive` (cube via the forked `create_primitive` C# tool — the menu-item path wedges headless), `gameobject_update`, `component_add`. None trigger a domain reload.
- Two headless requirements discovered and solved: a blocking main-thread **message pump** in the bridge (the editor update loop is idle in `-batchmode`, so `delayCall`/coroutine dispatch never fire — only the first command processed), and switching the orchestrator's WS client to the **`ws` package** (Node's built-in WebSocket mis-reads websocket-sharp frames after the first). See `packages/bridge/FORK.md`.
- **Deliverable:** headless "create a scene → add a cube → save scene → get scene info" end to end on a Mac. ✅

**Phase 5b — AssetDatabase ops + domain-reload resilience**
- `import_assets` (hybrid: orchestrator copies into `Assets/`, forked `refresh_assets` imports) and `script_write` (orchestrator writes `.cs` → `recompile_scripts`, attach via `update_component`) BOTH go through `AssetDatabase` operations that can trigger a Unity **domain reload**, which tears down and restarts the bridge + headless pump. So both need `BridgeClient` auto-reconnect (and pump restart) across the reload — the core 5b problem.
- **Deliverable:** headless "import an asset" and "write a script, attach it, recompile clean," surviving the reload. (Dovetails with Phase 6's console/error→fix loop.)

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
