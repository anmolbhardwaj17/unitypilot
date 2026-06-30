/**
 * Lifecycle tool registration (SPEC §4a).
 *
 * All four lifecycle tools (`ensure_editor`, `create_project`, `launch`, `shutdown`)
 * have real bodies, each wrapped by the FSM guard: an illegal call returns the
 * structured `illegal_tool_for_state` result naming the required next tool. `launch`
 * holds the live editor process in an in-memory session for `shutdown`.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BRIDGE_PACKAGE_NAME, resolveBridgePackagePath, resolveProjectRoot } from "../config.js";
import { IllegalToolError, assertToolLegal } from "../fsm/machine.js";
import { createProject } from "../lifecycle/create-project.js";
import { ensureEditor } from "../lifecycle/ensure-editor.js";
import {
  bridgeWsUrl,
  clearStaleEditor,
  connectBridge,
  startEditorProcess,
} from "../lifecycle/launch-node.js";
import { launch, shutdown } from "../lifecycle/launch.js";
import { NodeFilesystem, NodeProcessRunner } from "../lifecycle/node-deps.js";
import { createResolver } from "../resolver/index.js";
import { getEffectiveState } from "../state/reconcile.js";
import type { StateStore } from "../state/store.js";
import type { ToolContext } from "./context.js";
import { type ToolResult, illegalToolResult, jsonResult } from "./result.js";
import { getStatus } from "./status.js";

/** Run the FSM guard (with resume reconcile); returns a structured error if illegal, else null. */
async function guard(ctx: ToolContext, tool: string): Promise<ToolResult | null> {
  const state = await getEffectiveState(ctx);
  try {
    assertToolLegal(state, tool);
    return null;
  } catch (err) {
    if (err instanceof IllegalToolError) return illegalToolResult(err);
    throw err;
  }
}

/** Wrap a service body: map success to a status-bearing result, failures to a structured error. */
async function runBody(
  store: StateStore,
  tool: string,
  body: () => Promise<object>,
): Promise<ToolResult> {
  try {
    const detail = await body();
    const state = await store.read();
    return jsonResult({ ok: true, tool, ...detail, status: getStatus(state) }, false);
  } catch (err) {
    return jsonResult(
      { error: "lifecycle_error", tool, message: err instanceof Error ? err.message : String(err) },
      true,
    );
  }
}

export function registerLifecycleTools(server: McpServer, ctx: ToolContext): void {
  const { store, session } = ctx;

  server.tool(
    "ensure_editor",
    "Resolve or install a Unity editor and freeze its path. Legal in state 'none'. → editor_ready.",
    { unityVersion: z.string(), unityPath: z.string().optional() },
    async (args) => {
      const blocked = await guard(ctx, "ensure_editor");
      if (blocked) return blocked;
      const resolver = createResolver();
      return runBody(store, "ensure_editor", () => ensureEditor(resolver, store, args));
    },
  );

  server.tool(
    "create_project",
    "Scaffold a headless Unity project and inject the bridge. Legal in 'editor_ready'. → project_created.",
    {
      projectPath: z.string(),
      template: z.string().optional(),
      targetPlatform: z.string().optional(),
    },
    async (args) => {
      const blocked = await guard(ctx, "create_project");
      if (blocked) return blocked;
      const deps = {
        runner: new NodeProcessRunner(),
        fs: new NodeFilesystem(),
        bridgePackagePath: resolveBridgePackagePath(),
        bridgePackageName: BRIDGE_PACKAGE_NAME,
      };
      return runBody(store, "create_project", () =>
        createProject(deps, store, args, resolveProjectRoot()),
      );
    },
  );

  server.tool(
    "launch",
    "Boot the editor (visible by default; headless:true for CI) and confirm the bridge handshake. Legal in 'project_created'. → launched.",
    { projectPath: z.string(), headless: z.boolean().optional() },
    async (args) => {
      const blocked = await guard(ctx, "launch");
      if (blocked) return blocked;
      return runBody(store, "launch", async () => {
        const result = await launch(
          {
            prepareProject: clearStaleEditor,
            startEditor: startEditorProcess,
            connectBridge,
            wsUrl: bridgeWsUrl(),
          },
          store,
          args,
          resolveProjectRoot(),
        );
        session.current = result;
        return { wsUrl: result.wsUrl };
      });
    },
  );

  server.tool(
    "shutdown",
    "Cleanly stop the editor and close the bridge connection. Legal in 'launched'. → project_created.",
    {},
    async () => {
      const blocked = await guard(ctx, "shutdown");
      if (blocked) return blocked;
      return runBody(store, "shutdown", async () => {
        const result = await shutdown(session.current, store);
        session.current = null;
        return result;
      });
    },
  );
}
