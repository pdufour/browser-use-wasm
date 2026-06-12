/**
 * Browser tool entry points: validate / summarize / execute tool calls against
 * the catalog (`./catalog.ts` `TOOL_SPECS`) using the generic spec-table
 * machinery in `./tool-spec.ts`.
 */

import { TOOL_SPECS } from './catalog.ts';
import {
  summarizeToolCall,
  validateToolCallWith,
  executeToolCallWith,
} from './tool-spec.ts';
import type { BrowserToolCall, ToolExecutorContext, ToolResult } from './tool-spec.ts';

export function toolCallSummary(call: BrowserToolCall): string {
  return summarizeToolCall(TOOL_SPECS, call);
}

export function validateToolCall(call: BrowserToolCall): BrowserToolCall {
  return validateToolCallWith(TOOL_SPECS, call);
}

/**
 * Execute a validated browser tool call.
 */
export async function executeBrowserTool(
  rawCall: BrowserToolCall,
  ctx: ToolExecutorContext
): Promise<ToolResult> {
  return executeToolCallWith(TOOL_SPECS, rawCall, ctx);
}
