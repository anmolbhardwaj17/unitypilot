#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/**
 * Entry point. Boots the orchestrator as an MCP server over stdio.
 *
 * Hard rule (SPEC §1, and a forward guard for Gotcha G1): stdout is the JSON-RPC
 * channel. All diagnostics go to stderr — never stdout — or they corrupt the
 * protocol stream.
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[unity-mcp-orchestrator] MCP server connected over stdio");
}

main().catch((err) => {
  console.error("[unity-mcp-orchestrator] fatal:", err);
  process.exit(1);
});
