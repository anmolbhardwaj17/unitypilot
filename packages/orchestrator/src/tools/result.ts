/**
 * Shared MCP tool-result helpers so every tool emits a consistent JSON envelope.
 */

import type { IllegalToolError } from "../fsm/machine.js";

export type ToolResult = { isError?: boolean; content: { type: "text"; text: string }[] };

export function jsonResult(payload: unknown, isError: boolean): ToolResult {
  return { isError, content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/** The structured `illegal_tool_for_state` result naming the required next tool. */
export function illegalToolResult(err: IllegalToolError): ToolResult {
  return jsonResult(
    {
      error: "illegal_tool_for_state",
      tool: err.tool,
      currentState: err.currentState,
      requiredTool: err.requiredTool,
      message: err.message,
    },
    true,
  );
}
