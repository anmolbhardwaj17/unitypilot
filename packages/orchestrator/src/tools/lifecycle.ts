/**
 * Lifecycle tool registration (SPEC §4a).
 *
 * Phase 3: `ensure_editor` and `create_project` have real bodies (wrapped by the
 * FSM guard). `launch` and `shutdown` remain guard-only until Phase 4. Every tool
 * runs the FSM guard first; an illegal call returns the structured
 * `illegal_tool_for_state` result naming the required next tool.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BRIDGE_PACKAGE_NAME, resolveBridgePackagePath, resolveProjectRoot } from "../config.js";
import { IllegalToolError, type LifecycleState, assertToolLegal } from "../fsm/machine.js";
import { createProject } from "../lifecycle/create-project.js";
import { ensureEditor } from "../lifecycle/ensure-editor.js";
import { NodeFilesystem, NodeProcessRunner } from "../lifecycle/node-deps.js";
import { createResolver } from "../resolver/index.js";
import type { StateStore } from "../state/store.js";
import { getStatus } from "./status.js";

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

function registerGuardedStub(
  server: McpServer,
  store: StateStore,
  name: string,
  description: string,
  schema: z.ZodRawShape,
  phase: number,
): void {
  server.tool(name, description, schema, async () => {
    const blocked = await guard(store, name);
    if (blocked) return blocked;
    return jsonResult(
      {
        error: "not_implemented_yet",
        tool: name,
        message: `'${name}' is recognized and state-legal here, but its body lands in Phase ${phase}.`,
      },
      true,
    );
  });
}

export function registerLifecycleTools(server: McpServer, store: StateStore): void {
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

  registerGuardedStub(
    server,
    store,
    "launch",
    "Boot the editor headless and confirm the bridge handshake. Legal in 'project_created'. → launched.",
    { projectPath: z.string(), graphics: z.boolean().optional() },
    4,
  );
  registerGuardedStub(
    server,
    store,
    "shutdown",
    "Cleanly stop the editor and close the bridge connection. Legal in 'launched'. → project_created.",
    {},
    4,
  );
}
