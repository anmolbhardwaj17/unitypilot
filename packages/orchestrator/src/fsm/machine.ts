/**
 * The lifecycle state machine (SPEC §3).
 *
 * Pure data + pure functions: which tools are legal in which state, how legal
 * tools transition state, and the structured error raised for an illegal call.
 * No I/O — the state itself lives in `state/store.ts`.
 */

/** The five lifecycle states. Single source of truth for both the type and the zod enum. */
export const LIFECYCLE_STATES = [
  "none",
  "editor_ready",
  "project_created",
  "launched",
  "busy",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** The orchestration (lifecycle) tools. Bridge tools are added in Phase 5. */
export const LIFECYCLE_TOOLS = ["ensure_editor", "create_project", "launch", "shutdown"] as const;

/** `status` is the resume anchor — legal in every state (SPEC §3). */
export const ALWAYS_LEGAL_TOOLS = ["status"] as const;

/**
 * Lifecycle tools legal in each state (excluding the always-legal `status`).
 * Bridge tools (`scene_*`, …) become legal in `launched` starting Phase 5.
 */
const LEGAL_TOOLS: Record<LifecycleState, readonly string[]> = {
  none: ["ensure_editor"],
  editor_ready: ["create_project"],
  project_created: ["launch"],
  launched: ["shutdown"],
  busy: [],
};

/** The successful transitions: state + legal tool → next state (SPEC §3 diagram). */
const TRANSITIONS: Record<LifecycleState, Partial<Record<string, LifecycleState>>> = {
  none: { ensure_editor: "editor_ready" },
  editor_ready: { create_project: "project_created" },
  project_created: { launch: "launched" },
  launched: { shutdown: "project_created" },
  busy: {},
};

/**
 * The next lifecycle tool to call to make progress from `state` — the value an
 * illegal-tool error points the agent at. `null` when fully advanced (`launched`)
 * or transient (`busy`, where the answer is "wait").
 */
export function nextLifecycleTool(state: LifecycleState): string | null {
  switch (state) {
    case "none":
      return "ensure_editor";
    case "editor_ready":
      return "create_project";
    case "project_created":
      return "launch";
    default:
      return null;
  }
}

export function isToolLegal(state: LifecycleState, tool: string): boolean {
  if ((ALWAYS_LEGAL_TOOLS as readonly string[]).includes(tool)) return true;
  return LEGAL_TOOLS[state].includes(tool);
}

/** Structured error for calling a tool that isn't legal in the current state. */
export class IllegalToolError extends Error {
  constructor(
    readonly currentState: LifecycleState,
    readonly tool: string,
    readonly requiredTool: string | null,
  ) {
    super(
      requiredTool
        ? `'${tool}' is not available in state '${currentState}'. Call '${requiredTool}' first.`
        : `'${tool}' is not available in state '${currentState}'.`,
    );
    this.name = "IllegalToolError";
  }
}

export function assertToolLegal(state: LifecycleState, tool: string): void {
  if (!isToolLegal(state, tool)) {
    throw new IllegalToolError(state, tool, nextLifecycleTool(state));
  }
}

/**
 * Apply a tool's transition. Throws {@link IllegalToolError} if the tool is not a
 * legal transition from `state`. (Used by the lifecycle tool bodies in Phase 3+.)
 */
export function applyTransition(state: LifecycleState, tool: string): LifecycleState {
  const next = TRANSITIONS[state][tool];
  if (next === undefined) {
    throw new IllegalToolError(state, tool, nextLifecycleTool(state));
  }
  return next;
}
