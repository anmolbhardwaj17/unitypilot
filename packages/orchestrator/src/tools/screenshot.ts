/**
 * `screenshot` (SPEC §4b, Phase 6b) — the visual feedback channel. Asks the bridge to render
 * a camera to a PNG, returns it inline (so the agent can see the scene) and also saves it under
 * `<project>/.unity-mcp/screenshots/` (so the human has a file to open).
 *
 * Legal only in `launched`. Interactive only — rendering needs a GPU (the bridge returns
 * `screenshot_unavailable_headless` under `-nographics`).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveProjectRoot } from "../config.js";
import { IllegalToolError, assertBridgeToolLegal } from "../fsm/machine.js";
import { focusEditor } from "../lifecycle/launch-node.js";
import { getEffectiveState } from "../state/reconcile.js";
import type { ToolContext } from "./context.js";
import { illegalToolResult, imageResult, jsonResult } from "./result.js";

interface ShotResult {
  data?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  source?: string;
  bytes?: number;
}

export function registerScreenshot(server: McpServer, ctx: ToolContext): void {
  server.tool(
    "screenshot",
    "Capture the current Unity view as a PNG (the visual feedback channel). Renders Camera.main " +
      "(or a named camera, or the Scene view) and returns the image inline + saves it to disk. " +
      "Interactive only. Legal only in 'launched'.",
    {
      camera: z.string().optional().describe("GameObject name of a camera to render"),
      mode: z.enum(["game", "scene"]).optional().describe("'game' (default) or 'scene' view"),
      width: z.number().int().min(16).max(3840).optional(),
      height: z.number().int().min(16).max(2160).optional(),
      focusUnity: z
        .boolean()
        .optional()
        .default(true)
        .describe("Briefly foreground Unity so the render dispatches (it throttles backgrounded)."),
    },
    async (args) => {
      const state = await getEffectiveState(ctx);
      try {
        assertBridgeToolLegal(state, "screenshot");
      } catch (err) {
        if (err instanceof IllegalToolError) return illegalToolResult(err);
        throw err;
      }
      const client = ctx.session.current?.client;
      if (!client || !client.isOpen()) {
        return jsonResult(
          { error: "bridge_not_connected", tool: "screenshot", message: "Relaunch the editor." },
          true,
        );
      }

      const params: Record<string, unknown> = {};
      if (args.camera) params.camera = args.camera;
      if (args.mode) params.mode = args.mode;
      if (args.width) params.width = args.width;
      if (args.height) params.height = args.height;

      // Unity throttles a backgrounded editor's dispatch loop, which would stall the render
      // request — foreground it first (opt out via focusUnity:false). See BACKLOG P1.
      if (args.focusUnity) await focusEditor();

      let res: ShotResult;
      try {
        res = (await ctx.bridgeMutex.run(() =>
          client.request("screenshot", params, 30_000),
        )) as ShotResult;
      } catch (err) {
        return jsonResult(
          {
            error: "screenshot_failed",
            tool: "screenshot",
            message: err instanceof Error ? err.message : String(err),
          },
          true,
        );
      }

      if (!res?.data || !res.mimeType) {
        return jsonResult(
          { error: "screenshot_failed", tool: "screenshot", message: "Bridge returned no image." },
          true,
        );
      }

      // Save the PNG so the human has a file to open, alongside the inline image for the agent.
      let savedPath: string | undefined;
      try {
        const dir = join(resolveProjectRoot(), ".unity-mcp", "screenshots");
        await mkdir(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        savedPath = join(dir, `shot-${stamp}.png`);
        await writeFile(savedPath, Buffer.from(res.data, "base64"));
      } catch {
        savedPath = undefined; // best-effort; the inline image still returns
      }

      return imageResult(res.data, res.mimeType, {
        ok: true,
        tool: "screenshot",
        source: res.source,
        width: res.width,
        height: res.height,
        bytes: res.bytes,
        savedPath,
      });
    },
  );
}
