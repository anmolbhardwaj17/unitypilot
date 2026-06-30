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

## ✅ P1 — `script_write` reliability: RESOLVED (auto-focus + retries + focus message)
**Fixed:** `script_write`/`import_assets` now call `focusEditor()` (macOS `osascript ... activate`)
so Unity is foregrounded for the compile/import — defeating the background-throttle stall. Plus:
re-open the saved scene after the reload, retry the compile-trigger up to 4×, and attach with a
retry loop (the new MonoBehaviour type can be unresolvable for a moment right after the reload).
If Unity *still* doesn't recompile, `script_write` returns a clear `editor_not_processing` message
telling the user to click the Unity window. **Verified: 3/3 interactive runs passed** (write →
compile → reload → reconnect → attach, cube gets the component). Headless was already reliable.
Focus-stealing UX trade-off RESOLVED: auto-focus stays ON by default (the reliable path), with a
per-call `focusUnity:false` opt-out on `script_write`/`import_assets` for when you don't want Unity
grabbing focus. When off and the compile doesn't fire, the `editor_not_processing` message says so.

## (history) ROOT CAUSE = a backgrounded editor throttles
**Root cause (found):** Unity **throttles/pauses an editor's update loop when it's not the
foreground app**. The bridge dispatches messages via coroutines/`delayCall` (interactive) which
need that loop, so when Unity is backgrounded (e.g. while you're typing in Claude Code) asset
import + compile + message dispatch **stall** — symptoms: `.meta` never appears, `recompiled:false`,
`update_component` timeouts. This is a Unity-level behavior; a player-loop-pump heartbeat from the
bridge did NOT override it (the heartbeat is itself on the throttled `update`). When Unity IS the
foreground app, `script_write` works (verified early on).
**What's DONE (helps when the editor is processing):** capture+re-open the saved scene after the
reload (objects can drop on reload); retry the compile-trigger up to 4×; attach with verify-retry
via `idOrName`. All in `tools/script-write.ts`.
**Reliable path today:** **headless** mode forces processing (the cooperative `RunHeadless` pump) —
`script_write` is reliable there (verified). **Interactive** is reliable only when Unity is the
foreground window.
**Candidate real fixes (need investigation):** (a) bring the editor to the foreground for the
duration of a compile (macOS `osascript ... activate` around `script_write`); (b) a native bridge
hook that requests synchronous compilation off the throttled loop; (c) document "keep Unity
focused while writing scripts." **Effort:** medium, real-Unity iteration. **Files:**
`tools/script-write.ts`, possibly `lifecycle/launch-node.ts` + bridge.

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
