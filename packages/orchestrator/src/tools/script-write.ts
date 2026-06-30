/**
 * `script_write` (SPEC §4b, Phase 5b) — author a C# script and (optionally) attach it.
 *
 * Hybrid: the orchestrator writes the `.cs` into `Assets/` (it has local fs access), then
 * asks the bridge to import/compile it. Compiling forces a Unity **domain reload** that
 * drops and restarts the bridge WebSocket, so this tool waits for the connection to drop,
 * then reconnects (the session's client is swapped for the post-reload one) before attaching.
 *
 * Legal only in `launched`. Interactive mode only for now — the bridge restarts its server
 * natively on reload (its assembly-reload handlers run when not in `-batchmode`).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveProjectRoot } from "../config.js";
import { IllegalToolError, assertBridgeToolLegal } from "../fsm/machine.js";
import { connectBridge } from "../lifecycle/launch-node.js";
import { getEffectiveState } from "../state/reconcile.js";
import type { ToolContext } from "./context.js";
import { illegalToolResult, jsonResult } from "./result.js";

const RELOAD_DROP_TIMEOUT_MS = 30_000;
const RECONNECT_TIMEOUT_MS = 120_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Wait for the bridge to come back after a domain reload; swap in the new client. */
async function reconnectAfterReload(ctx: ToolContext): Promise<boolean> {
  try {
    ctx.session.current?.client.close();
  } catch {
    // already gone
  }
  const deadline = Date.now() + RECONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const client = await connectBridge();
    if (client) {
      try {
        // Confirm it's truly back (not mid-reload) with a lightweight request.
        await client.request("get_scene_info", {}, 5_000);
        if (ctx.session.current) ctx.session.current.client = client;
        return true;
      } catch {
        client.close();
      }
    }
    await sleep(1_500);
  }
  return false;
}

export function registerScriptWrite(server: McpServer, ctx: ToolContext): void {
  server.tool(
    "script_write",
    "Write a C# script under Assets/, recompile (Unity reloads), and optionally attach it to a " +
      "GameObject. Legal only in 'launched'.",
    {
      path: z.string().describe("Path under Assets/, e.g. 'Scripts/Spinner.cs'"),
      contents: z.string(),
      attachToPath: z.string().optional().describe("GameObject path to attach the script to"),
      componentName: z.string().optional().describe("Script class name (required to attach)"),
    },
    async (args) => {
      const state = await getEffectiveState(ctx);
      try {
        assertBridgeToolLegal(state, "script_write");
      } catch (err) {
        if (err instanceof IllegalToolError) return illegalToolResult(err);
        throw err;
      }
      const client = ctx.session.current?.client;
      if (!client || !client.isOpen()) {
        return jsonResult(
          { error: "bridge_not_connected", tool: "script_write", message: "Relaunch the editor." },
          true,
        );
      }

      // 1. Write the script.
      const rel = `Assets/${args.path}`.replace(/\/+/g, "/");
      const abs = join(resolveProjectRoot(), rel);
      try {
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, args.contents, "utf8");
      } catch (err) {
        return jsonResult(
          {
            error: "script_write_failed",
            tool: "script_write",
            message: err instanceof Error ? err.message : String(err),
          },
          true,
        );
      }

      // 2. Import the new file (refresh_assets), then force compilation (recompile_scripts) —
      //    importing alone defers compilation when the editor is driven, so the reload never
      //    fires. Both are best-effort: the reload drops this connection mid-flight.
      try {
        await ctx.bridgeMutex.run(() => client.request("refresh_assets", {}, 15_000));
      } catch {
        // expected when the reload drops the connection
      }
      try {
        await ctx.bridgeMutex.run(() => client.request("recompile_scripts", {}, 10_000));
      } catch {
        // expected when the reload drops the connection
      }

      // 3. Wait for the reload to drop the connection (confirms a recompile happened).
      let dropped = false;
      const dropDeadline = Date.now() + RELOAD_DROP_TIMEOUT_MS;
      while (Date.now() < dropDeadline) {
        if (!client.isOpen()) {
          dropped = true;
          break;
        }
        await sleep(500);
      }

      // 4. Reconnect across the reload if it happened.
      if (dropped) {
        const ok = await reconnectAfterReload(ctx);
        if (!ok) {
          return jsonResult(
            {
              error: "reconnect_timeout",
              tool: "script_write",
              message: "Bridge did not come back after the recompile/domain reload.",
            },
            true,
          );
        }
      }

      // 5. Optionally attach the (now-compiled) script as a component.
      let attached = false;
      let attachError: string | undefined;
      if (args.attachToPath && args.componentName) {
        const live = ctx.session.current?.client;
        if (live) {
          try {
            await ctx.bridgeMutex.run(() =>
              live.request(
                "update_component",
                {
                  objectPath: args.attachToPath,
                  componentName: args.componentName,
                  componentData: {},
                },
                15_000,
              ),
            );
            attached = true;
          } catch (err) {
            attachError = err instanceof Error ? err.message : String(err);
          }
        }
      }

      return jsonResult(
        {
          ok: true,
          tool: "script_write",
          written: rel,
          recompiled: dropped,
          attached,
          attachError,
        },
        false,
      );
    },
  );
}
