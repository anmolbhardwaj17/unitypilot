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

/** Poll the editor until it's done compiling/updating after a reload (BACKLOG P2). */
async function waitForEditorReady(ctx: ToolContext, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const live = ctx.session.current?.client;
    if (!live) return;
    try {
      const r = (await ctx.bridgeMutex.run(() => live.request("editor_status", {}, 5_000))) as {
        ready?: boolean;
      };
      if (r?.ready) return;
    } catch {
      // a transient reload can drop this; keep polling
    }
    await sleep(1_000);
  }
}

/** Attach a component, then verify via get_gameobject; retry (the type may not resolve instantly). */
async function attachWithVerify(
  ctx: ToolContext,
  objectPath: string,
  componentName: string,
  attempts = 4,
): Promise<{ attached: boolean; error?: string }> {
  for (let i = 0; i < attempts; i++) {
    const live = ctx.session.current?.client;
    if (!live) return { attached: false, error: "no bridge connection" };
    try {
      await ctx.bridgeMutex.run(() =>
        live.request("update_component", { objectPath, componentName, componentData: {} }, 15_000),
      );
    } catch (err) {
      return { attached: false, error: err instanceof Error ? err.message : String(err) };
    }
    try {
      // get_gameobject takes `idOrName`; for a root object the path is its name.
      const go = (await ctx.bridgeMutex.run(() =>
        live.request("get_gameobject", { idOrName: objectPath }, 10_000),
      )) as { gameObject?: { components?: { type?: string }[] } };
      const comps = go.gameObject?.components ?? [];
      if (comps.some((c) => c.type === componentName)) return { attached: true };
    } catch {
      // verify read failed; retry
    }
    await sleep(1_000);
  }
  return { attached: false, error: "component not present after attach attempts" };
}

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

/** The active scene's asset path, or null. Captured before the reload so we can re-open it. */
async function getActiveScenePath(ctx: ToolContext): Promise<string | null> {
  const live = ctx.session.current?.client;
  if (!live) return null;
  try {
    const info = (await ctx.bridgeMutex.run(() => live.request("get_scene_info", {}, 8_000))) as {
      activeScene?: { path?: string };
    };
    return info.activeScene?.path ?? null;
  } catch {
    return null;
  }
}

/** Re-open a saved scene (BACKLOG P1): a domain reload can drop in-memory objects, so reloading
 *  the scene we saved before the recompile restores them before we attach. */
async function reopenScene(ctx: ToolContext, scenePath: string): Promise<void> {
  const live = ctx.session.current?.client;
  if (!live) return;
  try {
    await ctx.bridgeMutex.run(() => live.request("load_scene", { scenePath }, 15_000));
  } catch {
    // best-effort
  }
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

      // 2. Capture + save the active scene so we can restore it (with its objects) after the
      //    reload — a domain reload can drop in-memory GameObjects.
      const scenePath = await getActiveScenePath(ctx);
      try {
        await ctx.bridgeMutex.run(() => client.request("save_scene", {}, 15_000));
      } catch {
        // best-effort
      }

      // 3. Trigger import + compile, then wait for the domain reload to drop the connection.
      //    A driven (often unfocused) editor can defer compilation, so retry the trigger a few
      //    times until the reload actually fires. Both calls are best-effort — the reload drops
      //    the connection mid-flight.
      let dropped = false;
      for (let attempt = 0; attempt < 4 && !dropped; attempt++) {
        const live = ctx.session.current?.client;
        if (!live || !live.isOpen()) {
          dropped = true;
          break;
        }
        try {
          await ctx.bridgeMutex.run(() => live.request("refresh_assets", {}, 15_000));
        } catch {
          dropped = !live.isOpen();
        }
        try {
          await ctx.bridgeMutex.run(() => live.request("recompile_scripts", {}, 10_000));
        } catch {
          dropped = !live.isOpen();
        }
        const deadline = Date.now() + RELOAD_DROP_TIMEOUT_MS / 2;
        while (!dropped && Date.now() < deadline) {
          if (!live.isOpen()) {
            dropped = true;
            break;
          }
          await sleep(500);
        }
      }

      // 4. Reconnect across the reload if it happened, then wait for the editor to finish
      //    compiling/updating so the new type is resolvable.
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
        await waitForEditorReady(ctx);
        // Restore the saved scene so its GameObjects are present before we attach.
        if (scenePath) {
          await reopenScene(ctx, scenePath);
          await waitForEditorReady(ctx);
        }
      }

      // 5. Optionally attach the (now-compiled) script as a component, verifying it stuck.
      let attached = false;
      let attachError: string | undefined;
      if (args.attachToPath && args.componentName) {
        const result = await attachWithVerify(ctx, args.attachToPath, args.componentName);
        attached = result.attached;
        attachError = result.error;
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
