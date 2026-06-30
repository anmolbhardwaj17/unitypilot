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
import { IllegalToolError, type LifecycleState, assertToolLegal } from "../fsm/machine.js";
import { createProject } from "../lifecycle/create-project.js";
import { ensureEditor } from "../lifecycle/ensure-editor.js";
import {
  bridgeWsCandidates,
  bridgeWsUrl,
  startEditorProcess,
  tryConnectAny,
} from "../lifecycle/launch-node.js";
import { type LaunchSession, launch, shutdown } from "../lifecycle/launch.js";
import { NodeFilesystem, NodeProcessRunner } from "../lifecycle/node-deps.js";
import { createResolver } from "../resolver/index.js";
import type { StateStore } from "../state/store.js";
import { getStatus } from "./status.js";

/** Holds the live editor process across launch → shutdown within one session. */
interface SessionHolder {
  current: LaunchSession | null;
}

type ToolResult = { isError?: boolean; content: { type: "text"; text: string }[] };

function jsonResult(payload: unknown, isError: boolean): ToolResult {
  return { isError, content: [{ type: "text", text: JSON.stringify(payload) }] };
}

async function currentState(store: StateStore): Promise<LifecycleState> {
  return (await store.read())?.state ?? "none";
}

/** Run the FSM guard; returns a structured error result if illegal, else null. */
async function guard(store: StateStore, tool: string): Promise<ToolResult | null> {
  const state = await currentState(store);
  try {
    assertToolLegal(state, tool);
    return null;
  } catch (err) {
    if (err instanceof IllegalToolError) {
      return jsonResult(
        {
          error: "illegal_tool_for_state",
          tool,
          currentState: err.currentState,
          requiredTool: err.requiredTool,
          message: err.message,
        },
        true,
      );
    }
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

export function registerLifecycleTools(server: McpServer, store: StateStore): void {
  const session: SessionHolder = { current: null };

  server.tool(
    "ensure_editor",
    "Resolve or install a Unity editor and freeze its path. Legal in state 'none'. → editor_ready.",
    { unityVersion: z.string(), unityPath: z.string().optional() },
    async (args) => {
      const blocked = await guard(store, "ensure_editor");
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
      const blocked = await guard(store, "create_project");
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
    "Boot the editor headless and confirm the bridge handshake. Legal in 'project_created'. → launched.",
    { projectPath: z.string(), graphics: z.boolean().optional() },
    async (args) => {
      const blocked = await guard(store, "launch");
      if (blocked) return blocked;
      return runBody(store, "launch", async () => {
        const candidates = bridgeWsCandidates();
        const result = await launch(
          {
            startEditor: startEditorProcess,
            tryConnect: (_url, timeoutMs) => tryConnectAny(candidates, timeoutMs),
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
      const blocked = await guard(store, "shutdown");
      if (blocked) return blocked;
      return runBody(store, "shutdown", async () => {
        const result = await shutdown(session.current, store);
        session.current = null;
        return result;
      });
    },
  );
}
