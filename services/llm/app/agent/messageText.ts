// Shared text extraction from an agent-core message (string content or a
// content-block array). Used by CopilotService (final-answer extraction),
// patchBlocks (view mapping) and LongTermMemoryStore (recent-dialogue
// extraction), so the logic lives in one place.

import type { AgentMessage } from './core/types.js';

export function extractTextContent(message: AgentMessage | null | undefined): string {
  if (!message) {
    return '';
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (typeof block === 'string') {
          return block;
        }
        if (block && typeof (block as { text?: unknown }).text === 'string') {
          return (block as { text: string }).text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}
