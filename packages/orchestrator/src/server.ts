import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveProjectRoot } from "./config.js";
import { StateStore } from "./state/store.js";
import { registerBridgeTools } from "./tools/bridge-tools.js";
import { createToolContext } from "./tools/context.js";
import { registerLifecycleTools } from "./tools/lifecycle.js";
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
    name: "unity-mcp-orchestrator",
    version: "0.0.0",
  });

  const ctx = createToolContext(new StateStore(resolveProjectRoot()));

  server.tool(
    "status",
    "Report the orchestrator's current lifecycle state, frozen paths, bridge " +
      "connectivity, and the next tool to call. Legal in every state; the resume anchor.",
    async () => {
      const state = await ctx.store.read();
      const runtime = {
        bridgeConnected: ctx.session.current?.client.isOpen() ?? false,
        busy: ctx.bridgeMutex.isLocked(),
      };
      return { content: [{ type: "text", text: JSON.stringify(getStatus(state, runtime)) }] };
    },
  );

  registerLifecycleTools(server, ctx);
  registerBridgeTools(server, ctx);

  return server;
}
