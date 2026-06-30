/**
 * Shared MCP tool-result helpers so every tool emits a consistent JSON envelope.
 */

import type { IllegalToolError } from "../fsm/machine.js";

type TextContent = { type: "text"; text: string };
type ImageContent = { type: "image"; data: string; mimeType: string };
export type ToolResult = { isError?: boolean; content: (TextContent | ImageContent)[] };

export function jsonResult(payload: unknown, isError: boolean): ToolResult {
  return { isError, content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/** An image result: the inline PNG (so the agent sees it) plus a text summary. */
export function imageResult(base64: string, mimeType: string, summary: unknown): ToolResult {
  return {
    isError: false,
    content: [
      { type: "image", data: base64, mimeType },
      { type: "text", text: JSON.stringify(summary) },
    ],
  };
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
