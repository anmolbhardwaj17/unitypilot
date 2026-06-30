/**
 * Bridge tool proxy (SPEC §4b, Phase 5a).
 *
 * Surfaces a curated set of the fork's tools as MCP tools. Each call is guarded
 * `launched`-only and serialized through the session's `busy` mutex, then forwarded
 * over the WS as `{ method, params, id }`. These are the no-recompile tools; scripts
 * (which force a domain reload) are Phase 5b.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { IllegalToolError, assertBridgeToolLegal } from "../fsm/machine.js";
import type { ToolContext } from "./context.js";
import { type ToolResult, illegalToolResult, jsonResult } from "./result.js";

interface ProxyTool {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  method: string;
  /** Transform validated MCP args into the bridge's param object (identity by default). */
  mapParams?: (args: Record<string, unknown>) => object;
}

const FREEFORM = z.record(z.string(), z.unknown());

const PROXY_TOOLS: ProxyTool[] = [
  {
    name: "scene_create",
    description: "Create a new scene and optionally make it active. Legal only in 'launched'.",
    schema: {
      sceneName: z.string(),
      folderPath: z.string().optional(),
      makeActive: z.boolean().optional(),
      addToBuildSettings: z.boolean().optional(),
    },
    method: "create_scene",
  },
  {
    name: "scene_save",
    description: "Save the active scene (optionally to a new path). Legal only in 'launched'.",
    schema: { scenePath: z.string().optional(), saveAs: z.boolean().optional() },
    method: "save_scene",
  },
  {
    name: "scene_get_info",
    description: "Get info about the active scene and loaded scenes. Legal only in 'launched'.",
    schema: {},
    method: "get_scene_info",
  },
  {
    name: "gameobject_create_primitive",
    description:
      "Add a primitive GameObject (Cube/Sphere/…) to the active scene. Legal only in 'launched'.",
    schema: {
      primitive: z.enum(["Cube", "Sphere", "Capsule", "Cylinder", "Plane", "Quad"]),
      name: z.string().optional(),
    },
    method: "create_primitive",
    mapParams: (args) => ({ primitiveType: args.primitive, name: args.name }),
  },
  {
    name: "gameobject_update",
    description:
      "Create or update a GameObject's core properties (name/tag/layer/active) by path or instanceId. Legal only in 'launched'.",
    schema: {
      objectPath: z.string().optional(),
      instanceId: z.number().optional(),
      gameObjectData: FREEFORM,
    },
    method: "update_gameobject",
  },
  {
    name: "component_add",
    description:
      "Add or configure a component on a GameObject (by path or instanceId). Legal only in 'launched'.",
    schema: {
      objectPath: z.string().optional(),
      instanceId: z.number().optional(),
      componentName: z.string(),
      componentData: FREEFORM.optional(),
    },
    method: "update_component",
  },
  {
    name: "gameobject_get",
    description:
      "Get a GameObject's details including its components, by path or instanceId. Legal only in 'launched'.",
    schema: { objectPath: z.string().optional(), instanceId: z.number().optional() },
    method: "get_gameobject",
  },
  // NOTE: execute_menu_item is intentionally NOT proxied — GameObject-creation menu items
  // block the main thread in batch mode and wedge the bridge. Primitives go through
  // create_primitive instead.
];

/** Guard + serialize + forward a bridge call. Exported for reuse by import_assets (Phase 5a). */
export async function callBridge(
  ctx: ToolContext,
  toolName: string,
  method: string,
  params: object,
): Promise<ToolResult> {
  const state = (await ctx.store.read())?.state ?? "none";
  try {
    assertBridgeToolLegal(state, toolName);
  } catch (err) {
    if (err instanceof IllegalToolError) return illegalToolResult(err);
    throw err;
  }

  const client = ctx.session.current?.client;
  if (!client || !client.isOpen()) {
    return jsonResult(
      {
        error: "bridge_not_connected",
        tool: toolName,
        message: "Bridge WS not connected; relaunch.",
      },
      true,
    );
  }

  try {
    const result = await ctx.bridgeMutex.run(() => client.request(method, params));
    return jsonResult({ ok: true, tool: toolName, result }, false);
  } catch (err) {
    return jsonResult(
      {
        error: "bridge_error",
        tool: toolName,
        message: err instanceof Error ? err.message : String(err),
      },
      true,
    );
  }
}

export function registerBridgeTools(server: McpServer, ctx: ToolContext): void {
  for (const def of PROXY_TOOLS) {
    server.tool(def.name, def.description, def.schema, async (args: Record<string, unknown>) => {
      const params = def.mapParams ? def.mapParams(args) : args;
      return callBridge(ctx, def.name, def.method, params);
    });
  }
}
