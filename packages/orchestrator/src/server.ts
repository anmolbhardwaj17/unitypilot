import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStatus } from "./tools/status.js";

/**
 * Build the orchestrator's MCP server.
 *
 * Phase 0 registers exactly one tool — `status` — to prove the Claude Code ↔
 * orchestrator pipe end to end. Lifecycle and bridge tools arrive in later phases.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "unity-mcp-orchestrator",
    version: "0.0.0",
  });

  server.tool(
    "status",
    "Report the orchestrator's current lifecycle state and frozen paths. " +
      "Legal in every state; this is the resume anchor.",
    async () => ({
      content: [{ type: "text", text: JSON.stringify(getStatus()) }],
    }),
  );

  return server;
}
