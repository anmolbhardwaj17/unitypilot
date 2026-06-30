/**
 * `import_assets` (SPEC §4b, Phase 5a) — the hybrid asset import the user specifically
 * wants. The orchestrator has direct local fs access to the project, so it copies the
 * source files into `Assets/<destination>` itself, then asks the bridge's forked
 * `refresh_assets` tool to run `AssetDatabase.Refresh()` so Unity imports them.
 *
 * Legal only in `launched` (the refresh goes over the bridge). No generation (§8).
 */

import { copyFile, mkdir } from "node:fs/promises";
import { basename, join, resolve as resolvePath } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveProjectRoot } from "../config.js";
import { IllegalToolError, assertBridgeToolLegal } from "../fsm/machine.js";
import { getEffectiveState } from "../state/reconcile.js";
import { callBridge } from "./bridge-tools.js";
import type { ToolContext } from "./context.js";
import { illegalToolResult, jsonResult } from "./result.js";

export function registerImportAssets(server: McpServer, ctx: ToolContext): void {
  server.tool(
    "import_assets",
    "Copy asset files into the project's Assets/<destination> and import them into Unity. " +
      "Legal only in 'launched'.",
    { sources: z.array(z.string()).min(1), destination: z.string() },
    async (args) => {
      const state = await getEffectiveState(ctx);
      try {
        assertBridgeToolLegal(state, "import_assets");
      } catch (err) {
        if (err instanceof IllegalToolError) return illegalToolResult(err);
        throw err;
      }

      const destRel = `Assets/${args.destination}`.replace(/\/+/g, "/").replace(/\/$/, "");
      const destDir = join(resolveProjectRoot(), destRel);
      const imported: string[] = [];
      try {
        await mkdir(destDir, { recursive: true });
        for (const src of args.sources) {
          const abs = resolvePath(src);
          const name = basename(abs);
          await copyFile(abs, join(destDir, name));
          imported.push(`${destRel}/${name}`);
        }
      } catch (err) {
        return jsonResult(
          {
            error: "import_copy_failed",
            tool: "import_assets",
            message: err instanceof Error ? err.message : String(err),
          },
          true,
        );
      }

      // Unity-side import via the forked refresh_assets bridge tool.
      const refresh = await callBridge(ctx, "import_assets", "refresh_assets", {});
      if (refresh.isError) return refresh;

      return jsonResult({ ok: true, tool: "import_assets", imported }, false);
    },
  );
}
