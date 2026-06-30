import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveProjectRoot } from "./config.js";
import { StateStore } from "./state/store.js";
import { registerLifecycleTools } from "./tools/lifecycle.js";
import { getStatus } from "./tools/status.js";

/**
 * Build the orchestrator's MCP server.
 *
 * Phase 2: `status` reports the real lifecycle state read from
 * `<projectRoot>/.unity-mcp/state.json` (resolved per SPEC §3), so state survives
 * a process restart. The lifecycle tools are registered guard-only (see
 * `tools/lifecycle.ts`); their bodies arrive in Phases 3–4.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "unity-mcp-orchestrator",
    version: "0.0.0",
  });

  const store = new StateStore(resolveProjectRoot());

  server.tool(
    "status",
    "Report the orchestrator's current lifecycle state, frozen paths, and the next " +
      "tool to call. Legal in every state; this is the resume anchor.",
    async () => {
      const state = await store.read();
      return { content: [{ type: "text", text: JSON.stringify(getStatus(state)) }] };
    },
  );

  registerLifecycleTools(server, store);

  return server;
}
