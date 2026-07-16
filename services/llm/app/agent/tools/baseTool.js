import { tool } from '@langchain/core/tools';

export function defineTool({ name, description, schema, handler, returnDirect = false }) {
  if (!name) {
    throw new Error('tool name is required');
  }
  if (!description) {
    throw new Error('tool description is required');
  }
  if (!schema) {
    throw new Error('tool schema is required');
  }

  const func = handler || (async () => {
    throw new Error('tool not implemented');
  });

  return tool(func, {
    name,
    description,
    schema,
    returnDirect,
  });
}
