/**
 * Resume reconcile (BACKLOG P1).
 *
 * A persisted `launched`/`busy` state only makes sense while this orchestrator process
 * holds the live editor + bridge connection. After a restart (or crash) the in-memory
 * session is gone, so a `launched` state on disk is stale and would wedge the user
 * (`launch` becomes illegal, bridge tools fail). This demotes such a stale state back to
 * `project_created` so the user can simply re-launch.
 */

import type { LifecycleState } from "../fsm/machine.js";
import type { ToolContext } from "../tools/context.js";
import { mergeFrozen } from "./store.js";

export async function getEffectiveState(ctx: ToolContext): Promise<LifecycleState> {
  const state = await ctx.store.read();
  if (state === null) return "none";

  const live = ctx.session.current?.client.isOpen() ?? false;
  if ((state.state === "launched" || state.state === "busy") && !live) {
    await ctx.store.write(mergeFrozen(state, { state: "project_created" }, []));
    return "project_created";
  }
  return state.state;
}
