import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { reducePaperState } from '../../../app/agent/context/paper-state.js';
import { digest, sourcePage } from '../../../app/agent/context/source-evidence.js';
import { EMPTY_USAGE } from '../../../app/agent/core/llm-types.js';
import type { AgentMessage } from '../../../app/agent/core/types.js';

const project = (text?: string): AgentMessage => ({ role: 'user', timestamp: 0,
  content: JSON.stringify({ MESSAGE: '继续审核论文', PROJECT: { sourceManifest: text === undefined ? [] : [{ path: 'main.tex', sha256: digest(text) }] } }) });
const read = (text: string, options = {}, name = 'read_file', isError = false): AgentMessage[] => [
  { role: 'assistant', timestamp: 0, api: 'openai-completions', provider: 'test', model: 'test', usage: EMPTY_USAGE, stopReason: 'toolUse',
    content: [{ type: 'toolCall', id: 'read-1', name, arguments: { path: 'main.tex' } }] },
  { role: 'toolResult', timestamp: 0, toolCallId: 'read-1', toolName: name, isError,
    content: [{ type: 'text', text: JSON.stringify(sourcePage('main.tex', text, options)) }] },
];

describe('versioned paper evidence', () => {
  it('merges project deltas without treating system events as author requirements', () => {
    const messages: AgentMessage[] = [
      { role: 'user', timestamp: 0, content: JSON.stringify({ MESSAGE: '保留原始术语', MESSAGE_KIND: 'author',
        PROJECT: { projectId: 'p', sourceSnapshot: { id: 's1' }, sourceManifest: [] } }) },
      { role: 'user', timestamp: 1, content: JSON.stringify({ MESSAGE: '[自动验证] 检查补丁', MESSAGE_KIND: 'system_event',
        PROJECT_REF: { projectId: 'p', snapshotId: 's2' }, PROJECT_DELTA: { sourceSnapshot: { id: 's2' } } }) },
    ];
    const state = reducePaperState(messages);
    assert.deepEqual(state.authorRequests.map(request => request.text), ['保留原始术语']);
    assert.equal((state.projectBase as any).projectId, 'p');
    assert.equal((state.projectBase as any).sourceSnapshot.id, 's2');
  });

  it('retains exact read ranges, without promoting a paginated read to an audit', () => {
    const text = '论文'.repeat(5000);
    const state = reducePaperState([project(text), ...read(text)]);
    const entry = state.toolLedger[0];
    assert.equal(entry.outcome, 'observed');
    assert.equal(entry.source?.freshness, 'matching');
    assert.equal(entry.source?.startByte, 0);
    assert.ok(entry.source!.endByte < entry.source!.fileBytes);
    assert.equal(entry.resultMessage, 2);
  });

  it('invalidates old evidence on changed or removed source across epochs without mutating the frozen checkpoint', () => {
    const previous = reducePaperState([project('old text'), ...read('old text')]);
    const changed = reducePaperState([project('new text')], previous, 3);
    assert.equal(changed.toolLedger[0].source?.freshness, 'stale');
    assert.equal(previous.toolLedger[0].source?.freshness, 'matching');
    const removed = reducePaperState([project()], previous, 3);
    assert.equal(removed.toolLedger[0].source?.freshness, 'stale');
    const restored = reducePaperState([project('old text')], changed, 4);
    assert.equal(restored.toolLedger[0].source?.freshness, 'matching');
    assert.equal(restored.toolLedger[0].outcome, 'observed');
  });

  it('keeps evidence unknown without a complete current source manifest', () => {
    const state = reducePaperState(read('source'));
    assert.equal(state.toolLedger[0].source?.freshness, 'unknown');
  });

  it('does not accept failed reads, other tools or malformed source ranges as read evidence', () => {
    for (const messages of [read('source', {}, 'read_file', true), read('source', {}, 'submit_patch')]) {
      assert.equal(reducePaperState(messages).toolLedger[0].source, undefined);
    }
    const messages = read('source');
    const result = messages[1] as any;
    const page = JSON.parse(result.content[0].text);
    page.endByte += 10;
    result.content[0].text = JSON.stringify(page);
    assert.equal(reducePaperState(messages).toolLedger[0].source, undefined);
  });
});
