# UnityPilot — Backlog

Deferred work items, so nothing gets forgotten. Each has: what it is, why it matters,
the fix approach, rough effort, and priority. Cross-referenced from `SPEC.md §9`.

Priority: **P1** = bites normal day-to-day use, fix soon · **P2** = feature completeness ·
**P3** = only matters for a mode/path we're not using yet.

---

## P1 — Resume reconcile: stale `launched` state on restart
**What:** If the orchestrator restarts (you close/reopen Claude Code, or it crashes) while a
project was `launched`, `state.json` still says `launched` but there's no live editor/bridge
connection. Result: `launch` is rejected as illegal, and bridge tools fail with
`bridge_not_connected` — you're wedged.
**Why it matters:** Restarting the MCP client is a totally normal thing; this breaks the core
loop until you hand-edit `state.json`.
**Fix:** On startup / in `status`, reconcile — if `state === "launched"` but
`bridgeConnected === false`, treat it as `project_created` (we already compute `bridgeConnected`).
Effectively one guard + a "needs relaunch" note in `status`.
**Effort:** ~half a session. **Files:** `tools/status.ts`, `fsm/machine.ts`, `server.ts`.

## P1 — Clean shutdown + stale lockfile / lingering editor
**What:** A `shutdown` that runs when the WS is already dead doesn't reliably kill the editor;
a crashed run leaves the Unity window open **and** a stale `<project>/Temp/UnityLockfile` that
blocks the next `launch` (Unity thinks the project is still open).
**Why it matters:** One bad exit can require manually killing Unity + deleting a lockfile
before you can work again.
**Fix:** `shutdown` always kills the spawned editor by PID (we hold the handle), independent of
the WS. On `launch`, detect a stale lockfile / an already-running editor for this project and
handle it (clear lockfile, or refuse with a clear message). Consider `detached`/process-group
kill so the editor never orphans when the orchestrator dies.
**Effort:** ~half a session. **Files:** `lifecycle/launch-node.ts`, `lifecycle/launch.ts`.

---

## P2 — Component attach immediately after a recompile
**What:** `script_write` with `attachToPath`+`componentName` reports `attached: true`, but the
just-compiled MonoBehaviour doesn't reliably show up via `gameobject_get`. The new type isn't
fully resolvable in the instant right after the domain reload.
**Why it matters:** "write a script and attach it" is a headline capability; right now write+
compile is solid but the attach is unverified.
**Fix:** After reconnecting, wait until `EditorApplication.isCompiling`/`isUpdating` is false
(add a tiny bridge `editor_status` tool or poll), then attach with a 2–3× retry; inspect the
actual `update_component` result rather than "no exception." Saving the scene before recompile
may also help keep a stable object identity.
**Effort:** ~1 focused session (needs real-Unity iteration). **Files:** `tools/script-write.ts`,
maybe a small C# `editor_status` tool in the bridge.

## P2 — `status` should report richer live truth
**What:** `status` reports `bridgeConnected`/`busy` but not "editor process alive" or
"last compile result." Ties into the P1 reconcile.
**Fix:** Track the editor PID liveness in the session; surface it. Cheap once P1 is done.
**Effort:** small. **Files:** `tools/status.ts`, `tools/context.ts`.

---

## P1 — `script_write` GameObject-survives-reload reliability (the remaining tail)
**What:** `script_write` now reliably writes + compiles + **survives the domain reload + reconnects**
in BOTH interactive and headless (`recompiled:true`). The remaining flakiness is the **attach**:
the target GameObject is sometimes "not found" after the reload (`GameObject 'ClaudeCube' or instance
ID not found`) even though the scene was saved first. So the object doesn't reliably persist/resolve
across the reload. (Worked cleanly once; failed on later runs.)
**Why it matters:** "write a script and attach it" needs to be dependable.
**Likely causes / fix:** after reconnect, the active scene/object may need re-opening or re-resolving
— re-`load_scene` the saved scene (or re-`get_gameobject` by idOrName to get a fresh instanceId and
attach by id) once the editor is `ready`; tolerate Unity's occasional double reload. **Effort:** ~1
focused real-Unity session. **Files:** `tools/script-write.ts`.

## ✅ P3 — Headless reload resilience (CORE FIXED via cooperative pump)
**Was:** the blocking `RunHeadless` pump deadlocked with domain reloads (a recompile needs the main
thread the pump holds), and restarting from `[DidReloadScripts]` blocked headless init.
**Fixed:** the pump is now **cooperative** — on a recompile it **yields** the main thread (returns
from `RunHeadless`) so Unity can compile + domain-reload, then **re-enters** from `AfterReload`,
gated by `SessionState` so it doesn't block the initial load. `recompile_scripts` is special-cased
in the headless sync handler (RequestScriptCompilation + yield). **Verified:** headless `script_write`
reached `recompiled:true` and a successful attach. The only residual is the shared
GameObject-survives-reload tail above. **Files:** `packages/bridge/.../McpUnityServer.cs`,
`McpUnitySocketHandler.cs`.

---

## Notes / smaller items
- `import_assets` + `script_write` are interactive-mode only today (P3 covers headless).
- `execute_menu_item` is intentionally not proxied (wedges in batch mode; primitives use the
  forked `create_primitive`).
- Async bridge tools (`run_tests`, `recompile_scripts`, `batch_execute`, `add_package`) aren't
  supported on the headless sync pump — Phase 6 / P3 territory.
