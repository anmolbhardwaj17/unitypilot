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

## P1 — `script_write` reconnect-across-reload reliability (NEW, found while fixing P2)
**What:** `script_write` writes+compiles fine, but the orchestrator's reconnect after the domain
reload is **flaky** — sometimes it attaches cleanly (verified once), sometimes the bridge doesn't
come back within the reconnect window (`reconnect_timeout`), sometimes the recompile doesn't fire
on the first launch after a bridge C# change.
**Why it matters:** writing scripts is a core capability; it needs to be reliable, not 1-in-3.
**Likely causes to investigate:** the bridge sometimes does a *double* domain reload; port 8090 in
TIME_WAIT briefly after the server restarts; `connectBridge`'s 3s per-candidate timeout too short;
no detection of "compile finished" before reconnecting (we reconnect on first WS drop). Also a
persistent "first launch after a bridge C# edit is flaky" pattern (the bridge recompiles mid-launch).
**Fix:** harden `reconnectAfterReload` — wait for compile-finished (`editor_status.ready`) AND a
stable connection (N consecutive good `get_scene_info`), tolerate multiple reloads, longer/﻿retried
connect. **Effort:** ~1 focused session of real-Unity iteration. **Files:** `tools/script-write.ts`.

## P3 — Headless reload resilience (KNOWN LIMITATION, not a quick fix)
**What:** In headless (`-batchmode`) mode, the `RunHeadless` pump **blocks the main thread**, and a
Unity domain reload *needs* that main thread — so a recompile can't reload while the pump runs
(deadlock). Attempting to restart the pump from `[DidReloadScripts]` instead **broke headless
initial load** (the pump blocks init). Verified: import/scripts don't survive a reload headless.
**Why it's P3:** Interactive (visible editor) is the default and the maintainer's workflow, where
reloads are handled natively. Headless only matters for CI/automation later.
**Real fix (not small):** redesign the headless pump to be **cooperative/non-blocking** — e.g. a
short-lived pump that yields control back to Unity so reloads can happen, then is re-entered. This
is an architectural change, not a patch. Until then, **headless = no recompile/import** (scenes,
objects, components still work headless). **Files:** `packages/bridge` pump + launch path.

---

## Notes / smaller items
- `import_assets` + `script_write` are interactive-mode only today (P3 covers headless).
- `execute_menu_item` is intentionally not proxied (wedges in batch mode; primitives use the
  forked `create_primitive`).
- Async bridge tools (`run_tests`, `recompile_scripts`, `batch_execute`, `add_package`) aren't
  supported on the headless sync pump — Phase 6 / P3 territory.
