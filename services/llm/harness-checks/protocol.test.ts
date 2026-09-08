import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { streamConfiguredModel } from '../app/llm/nativeStream.js';
import { model } from './helpers.js';

const done = { type: 'response.completed', response: { id: 'r1', status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 1 } } };
const added = { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', name: 'read_file', call_id: 'c1' } };
const args = { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"path":"main.tex"}' };
const argsDone = { type: 'response.function_call_arguments.done', output_index: 0 };
async function replay(protocol: string, events: any[], options: any = {}) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.end();
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const descriptor = { ...model, baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, compat: { protocol } };
    const stream = await streamConfiguredModel(descriptor, { systemPrompt: 'offline', tools: [], messages: [] }, { apiKey: 'offline', maxRetries: 0, ...options });
    for await (const _ of stream) {}
    return await stream.result();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
test('C04: Responses normal text and tool completions', async () => {
  const text = await replay('responses', [{ type: 'response.output_text.delta', delta: 'ok' }, done]);
  assert.equal(text.stopReason, 'stop');
  assert.equal((text.content[0] as any).text, 'ok');
  const tool = await replay('responses', [added, args, argsDone, done]);
  assert.equal(tool.stopReason, 'toolUse');
  assert.deepEqual((tool.content[0] as any).arguments, { path: 'main.tex' });
});
test('C04: Responses EOF without terminal event is an error, even after valid arguments', async () => {
  for (const events of [[], [{ type: 'response.output_text.delta', delta: 'partial' }], [added, args, argsDone]]) {
    assert.equal((await replay('responses', events)).stopReason, 'error');
  }
});
test('C04: Responses incomplete must not execute otherwise valid tool calls', async () => {
  const result = await replay('responses', [added, args, argsDone,
    { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } }]);
  assert.equal(result.stopReason, 'length');
});
test('C04: Responses terminal completion cannot rescue unfinished tool arguments', async () => {
  assert.equal((await replay('responses', [added, { ...args, delta: '{"path":' }, done])).stopReason, 'error');
});
test('C04: Anthropic normal, max_tokens and premature EOF', async () => {
  const delta = (reason: string) => ({ type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 1 } });
  const stop = { type: 'message_stop' };
  assert.equal((await replay('anthropic-messages', [delta('end_turn'), stop])).stopReason, 'stop');
  assert.equal((await replay('anthropic-messages', [delta('max_tokens'), stop])).stopReason, 'length');
  assert.equal((await replay('anthropic-messages', [delta('end_turn')])).stopReason, 'error');
});
test('C04: chat-completions requires finish_reason and preserves length', async () => {
  const chunk = (finish_reason: any) => ({ id: 'r1', object: 'chat.completion.chunk', model: 'l0', choices: [{ index: 0, delta: { content: 'ok' }, finish_reason }] });
  assert.equal((await replay('chat-completions', [chunk('stop')])).stopReason, 'stop');
  assert.equal((await replay('chat-completions', [chunk('length')])).stopReason, 'length');
  assert.equal((await replay('chat-completions', [chunk(null)])).stopReason, 'error');
});
test('C04: chat-completions must not salvage invalid final JSON into executable arguments', async () => {
  const chunk = { id: 'r1', object: 'chat.completion.chunk', model: 'l0', choices: [{ index: 0,
    delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"main.tex"' } }] }, finish_reason: 'tool_calls' }] };
  assert.equal((await replay('chat-completions', [chunk])).stopReason, 'error');
  chunk.choices[0].delta.tool_calls[0].function.arguments = '{"path":"main.tex"}';
  assert.equal((await replay('chat-completions', [chunk])).stopReason, 'toolUse');
});
