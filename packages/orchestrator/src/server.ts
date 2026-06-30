import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveProjectRoot } from "./config.js";
import { getEffectiveState } from "./state/reconcile.js";
import { StateStore } from "./state/store.js";
import { registerBridgeTools } from "./tools/bridge-tools.js";
import { createToolContext } from "./tools/context.js";
import { registerImportAssets } from "./tools/import-assets.js";
import { registerLifecycleTools } from "./tools/lifecycle.js";
import { registerScreenshot } from "./tools/screenshot.js";
import { registerScriptWrite } from "./tools/script-write.js";
import { getStatus } from "./tools/status.js";

/**
 * Build the orchestrator's MCP server.
 *
 * Phase 5a: `status` + the four lifecycle tools + the proxied bridge tools all share
 * one {@link ToolContext} (state store, live launch session, `busy` mutex). `status`
 * reports the persisted state plus the live bridge/`busy` overlay.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "unitypilot",
    version: "0.1.0",
  });

  const ctx = createToolContext(new StateStore(resolveProjectRoot()));

  server.tool(
    "status",
    "Report the orchestrator's current lifecycle state, frozen paths, bridge " +
      "connectivity, and the next tool to call. Legal in every state; the resume anchor.",
    async () => {
      // Reconcile a stale `launched` from a prior run before reporting (BACKLOG P1).
      await getEffectiveState(ctx);
      const state = await ctx.store.read();
      const runtime = {
        editorAlive: ctx.session.current?.handle.isAlive() ?? false,
        bridgeConnected: ctx.session.current?.client.isOpen() ?? false,
        busy: ctx.bridgeMutex.isLocked(),
      };
      return { content: [{ type: "text", text: JSON.stringify(getStatus(state, runtime)) }] };
    },
  );

  registerLifecycleTools(server, ctx);
  registerBridgeTools(server, ctx);
  registerImportAssets(server, ctx);
  registerScriptWrite(server, ctx);
  registerScreenshot(server, ctx);

  return server;
}
