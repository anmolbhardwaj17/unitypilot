/**
 * Lifecycle tool registration (SPEC §4a).
 *
 * Phase 2 scope: these tools are registered with their real input schemas and the
 * real FSM **guard**, but NOT their side-effecting bodies. A call that is illegal
 * for the current state returns the structured `illegal_tool_for_state` result
 * (the Phase 2 deliverable). A legal call returns `not_implemented_yet` naming the
 * phase that fills the body — no Unity is touched, no transition happens. The guard
 * wrapper is what later phases slot their bodies into.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { IllegalToolError, type LifecycleState, assertToolLegal } from "../fsm/machine.js";
import type { StateStore } from "../state/store.js";

type ToolResult = {
  isError?: boolean;
  content: { type: "text"; text: string }[];
};

function jsonResult(payload: unknown, isError: boolean): ToolResult {
  return { isError, content: [{ type: "text", text: JSON.stringify(payload) }] };
}

async function currentState(store: StateStore): Promise<LifecycleState> {
  const state = await store.read();
  return state?.state ?? "none";
}

/**
 * Register one lifecycle tool as a guarded, not-yet-implemented stub.
 * `phase` is the phase that will supply the real body.
 */
function registerGuarded(
  server: McpServer,
  store: StateStore,
  name: string,
  description: string,
  schema: z.ZodRawShape,
  phase: number,
): void {
  server.tool(name, description, schema, async () => {
    const state = await currentState(store);
    try {
      assertToolLegal(state, name);
    } catch (err) {
      if (err instanceof IllegalToolError) {
        return jsonResult(
          {
            error: "illegal_tool_for_state",
            tool: name,
            currentState: err.currentState,
            requiredTool: err.requiredTool,
            message: err.message,
          },
          true,
        );
      }
      throw err;
    }

    return jsonResult(
      {
        error: "not_implemented_yet",
        tool: name,
        currentState: state,
        message: `'${name}' is recognized and state-legal here, but its body lands in Phase ${phase}.`,
      },
      true,
    );
  });
}

export function registerLifecycleTools(server: McpServer, store: StateStore): void {
  registerGuarded(
    server,
    store,
    "ensure_editor",
    "Resolve or install a Unity editor and freeze its path. Legal in state 'none'. → editor_ready.",
    { unityVersion: z.string(), unityPath: z.string().optional() },
    3,
  );
  registerGuarded(
    server,
    store,
    "create_project",
    "Scaffold a headless Unity project and inject the bridge. Legal in 'editor_ready'. → project_created.",
    {
      projectPath: z.string(),
      template: z.string().optional(),
      targetPlatform: z.string().optional(),
    },
    3,
  );
  registerGuarded(
    server,
    store,
    "launch",
    "Boot the editor headless and confirm the bridge handshake. Legal in 'project_created'. → launched.",
    { projectPath: z.string(), graphics: z.boolean().optional() },
    4,
  );
  registerGuarded(
    server,
    store,
    "shutdown",
    "Cleanly stop the editor and close the bridge connection. Legal in 'launched'. → project_created.",
    {},
    4,
  );
}
