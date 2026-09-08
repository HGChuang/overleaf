import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebApiClient } from '../app/llm/webApiClient.js';
import { buildCompileTools } from '../app/agent/tools/compileTools.js';
import { buildEditTools } from '../app/agent/tools/editTools.js';
import { fixture, assistant, call, patchArgs, userId, projectId } from './helpers.js';
import { Semaphore } from '../app/utils/Semaphore.js';

for (const name of ['compile', 'proposal']) test(`C05: ${name} abort closes actual in-flight HTTP request`, async () => {
  let accepted!: () => void;
  let closed!: () => void;
  const received = new Promise<void>(resolve => { accepted = resolve; });
  const disconnected = new Promise<void>(resolve => { closed = resolve; });
  const server = createServer((_req, res) => { res.on('close', closed); accepted(); }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const f = fixture([]);
    const webClient = new WebApiClient({ baseURL: `http://127.0.0.1:${(server.address() as any).port}`, timeoutMs: 10000 });
    f.context.project.files = [{ path: 'main.tex', content: 'Hello world.\n' }];
    const tool = name === 'compile' ? buildCompileTools(f.context, { webClient, userId })[0] : buildEditTools(f.context, { webClient, userId })[0];
    const ac = new AbortController();
    const work = tool.execute('call1', name === 'compile' ? {} : patchArgs, ac.signal);
    const rejected = assert.rejects(work, /cancel/i);
    await received;
    ac.abort();
    await rejected;
    await disconnected;
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
test('C05: cancelled semaphore waiter is removed without leaking slots', async () => {
  const s = new Semaphore(1);
  await s.acquire();
  const ac = new AbortController();
  const waiting = s.acquire(ac.signal);
  ac.abort();
  await assert.rejects(waiting);
  assert.equal(s.queue.length, 0);
  s.release();
  assert.equal(s.current, 0);
  await s.acquire(); s.release();
});
test('C05: turn timeout aborts in-flight compile, closes journal and releases semaphore', async () => {
  const f = fixture([assistant([call('c1', 'compile_project')], 'toolUse')], { turnTimeoutMs: 80 });
  let aborted = false;
  f.web.compileProject = async (_p: any, _u: any, _s: any, _id: any, _patch: any, signal: AbortSignal) => {
    assert.ok(signal);
    await new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
    });
  };
  await assert.rejects(f.service.chat(userId, f.context), /timed out/);
  assert.ok(aborted);
  assert.equal(f.requests.length, 1);
  assert.equal(f.semaphore.current, 0);
  assert.ok([...f.journal.sessions.values()].every(s => !s.busy));
});
test('C12: access revoked after model completion blocks proposal dispatch', async () => {
  const f = fixture([assistant([call('p1', 'submit_patch', patchArgs)], 'toolUse'), assistant()]);
  let checks = 0;
  f.web.assertProjectAccess = async () => { if (++checks >= 3) throw new Error('access revoked'); };
  await assert.rejects(f.service.chat(userId, f.context), /access revoked/);
  assert.equal(f.records.length, 0);
});
test('C09: lost proposal HTTP response is UNKNOWN, stops retries and cannot become a delivered patch', async () => {
  let dispatched = 0;
  const server = createServer((req) => { dispatched++; req.socket.destroy(); }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const remote = new WebApiClient({ baseURL: `http://127.0.0.1:${(server.address() as any).port}`, timeoutMs: 1000 });
    const f = fixture([assistant([call('p1', 'submit_patch', patchArgs)], 'toolUse'), assistant()]);
    f.web.proposePatch = remote.proposePatch.bind(remote);
    const result = await f.service.chat(userId, f.context);
    const receipt = [...f.journal.sessions.values()][0].messages.find((m: any) => m.role === 'toolResult');
    assert.equal(receipt.details.executionOutcome, 'unknown');
    assert.equal(receipt.isError, true);
    assert.equal(f.requests.length, 1);
    assert.equal(dispatched, 1);
    assert.equal(result.message.blocks.length, 0);
    assert.match(result.message.content, /尚未确认/);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
