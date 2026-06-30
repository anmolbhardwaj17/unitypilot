/**
 * The `status` tool — the lifecycle resume anchor (SPEC §4a).
 *
 * Phase 0 scope: wiring only. There is no resolver (Phase 1) and no state file
 * (Phase 2) yet, so the orchestrator has nothing to read and reports the initial
 * lifecycle state unconditionally. Later phases replace this with a read of
 * `<project>/.unity-mcp/state.json` and the real frozen-path payload.
 */

/** The lifecycle states from SPEC §3. Only `none` is reachable in Phase 0. */
export type LifecycleState = "none" | "editor_ready" | "project_created" | "launched" | "busy";

export interface StatusResult {
  state: LifecycleState;
}

export function getStatus(): StatusResult {
  return { state: "none" };
}
