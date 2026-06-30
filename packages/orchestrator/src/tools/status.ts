/**
 * The `status` tool — the lifecycle resume anchor (SPEC §4a / §2).
 *
 * Pure: it maps a {@link ProjectState} (or `null` when no project is initialized)
 * to the reported shape. Reading the state file is the caller's job (server.ts),
 * which keeps this unit-testable without I/O.
 */

import { type LifecycleState, nextLifecycleTool } from "../fsm/machine.js";
import { FROZEN_KEYS, type ProjectState } from "../state/schema.js";

export interface StatusResult {
  state: LifecycleState;
  arch: string | null;
  unityVersion: string | null;
  editorPath: string | null;
  projectPath: string | null;
  bridgeVersion: string | null;
  /** Names of values that are frozen (resolved once, never recomputed). */
  frozen: string[];
  /** The next lifecycle tool to call to make progress, or `null` if fully advanced. */
  nextTool: string | null;
}

export function getStatus(state: ProjectState | null): StatusResult {
  if (state === null) {
    return {
      state: "none",
      arch: null,
      unityVersion: null,
      editorPath: null,
      projectPath: null,
      bridgeVersion: null,
      frozen: [],
      nextTool: nextLifecycleTool("none"),
    };
  }

  return {
    state: state.state,
    arch: state.arch ?? null,
    unityVersion: state.unityVersion ?? null,
    editorPath: state.editorPath ?? null,
    projectPath: state.projectPath ?? null,
    bridgeVersion: state.bridgeVersion ?? null,
    frozen: FROZEN_KEYS.filter((k) => state.frozen[k] === true),
    nextTool: nextLifecycleTool(state.state),
  };
}
