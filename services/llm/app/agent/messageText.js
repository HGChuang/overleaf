// Shared text extraction from a langchain message (string content or a
// content-block array). Used by CopilotService (final-answer extraction) and
// LongTermMemoryStore (recent-dialogue extraction), so the logic lives in one
// place rather than being duplicated across both.
export function extractTextContent(message) {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map(block => {
        if (typeof block === 'string') {
          return block;
        }
        if (block && typeof block.text === 'string') {
          return block.text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}
