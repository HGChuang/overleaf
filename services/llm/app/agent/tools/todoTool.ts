// TodoWrite tool — "先列计划再动手, 完成率翻倍". The model calls this to plan
// a multi-step task BEFORE acting (e.g. "diagnose every compile error"), then
// ticks items off as it works. Passing the full current list each call
// (replace semantics, not append).
//
// Stateless: the plan rides in the message history (the model sees its prior
// todo_write results), which the short-term RedisMemoryStore already keeps.

import { defineTool } from './baseTool.js';

export function buildTodoTools() {
  const todoWrite = defineTool({
    name: 'todo_write',
    description:
      'Plan a multi-step task BEFORE acting, then track progress. Pass the FULL current list on every call (replace, not append). Each item: {content, status} where status is pending | in_progress | completed. Keep exactly one item in_progress at a time; mark it completed and move the next to in_progress as you finish steps. Call this FIRST for any task with 3+ steps (e.g. diagnose every compile error in a failed log). Returns {total, counts, todos}.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'The step description' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                default: 'pending',
              },
            },
            required: ['content'],
          },
        },
      },
      required: ['todos'],
    },
    handler: async ({ todos }: { todos: Array<{ content: string; status: string }> }) => {
      const counts = todos.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});
      return JSON.stringify({ ok: true, total: todos.length, counts, todos });
    },
  });

  return [todoWrite];
}
