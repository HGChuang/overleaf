// Factory for AgentTool objects (vendored agent-core shape). Tools declare
// plain JSON Schemas for their parameters — the loop validates + coerces
// arguments against them (core/validation.ts) before `execute` runs.
//
// Contract (from pi): execute THROWS on failure; the loop catches and encodes
// the error as an isError tool result for the model to read. Do not return
// error strings as successful content.

import type { AgentTool, AgentToolResult } from '../core/types.js';

interface SimpleToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments (object). */
  parameters: Record<string, unknown>;
  /** Handler returning the text the model reads back (usually JSON-stringified). */
  handler: (params: any) => Promise<string> | string;
  label?: string;
  /** End the agent turn after this tool's batch completes (submit_patch). */
  terminate?: boolean;
  executionMode?: 'sequential' | 'parallel';
}

export function defineTool({
  name,
  description,
  parameters,
  handler,
  label,
  terminate = false,
  executionMode,
}: SimpleToolDef): AgentTool<any, Record<string, never>> {
  if (!name) {
    throw new Error('tool name is required');
  }
  if (!description) {
    throw new Error('tool description is required');
  }
  if (!parameters) {
    throw new Error('tool parameters schema is required');
  }

  return {
    name,
    label: label || name,
    description,
    parameters: parameters as unknown as AgentTool['parameters'],
    ...(executionMode ? { executionMode } : {}),
    async execute(_toolCallId, params): Promise<AgentToolResult<Record<string, never>>> {
      const text = await handler(params);
      return {
        content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }],
        details: {},
        ...(terminate ? { terminate: true } : {}),
      };
    },
  };
}
