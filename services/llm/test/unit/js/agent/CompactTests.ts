import { expect } from 'chai';
import {
  lastReportedTotalTokens,
  microCompact,
  sanitizeToolPairing,
  snipCompact,
} from '../../../../app/agent/compact.js';
import type { AgentMessage } from '../../../../app/agent/core/types.js';
import type { AssistantMessage, ToolResultMessage } from '../../../../app/agent/core/llm-types.js';

function userMessage(content: string): AgentMessage {
  return { role: 'user', content, timestamp: Date.now() };
}

function assistantWithToolCall(id: string, text = ''): AssistantMessage {
  return {
    role: 'assistant',
    content: [
      ...(text ? [{ type: 'text' as const, text }] : []),
      { type: 'toolCall', id, name: 'read_file', arguments: { path: 'main.tex' } },
    ],
    api: 'openai-completions',
    provider: 'test',
    model: 'm',
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'toolUse',
    timestamp: Date.now(),
  };
}

function toolResult(id: string, text = 'result'): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: id,
    toolName: 'read_file',
    content: [{ type: 'text', text }],
    isError: false,
    timestamp: Date.now(),
  };
}

describe('compact helpers (agent-core message shapes)', function () {
  it('snipCompact keeps head + tail with a placeholder in the middle', function () {
    const messages = Array.from({ length: 10 }, (_, i) => userMessage(`m${i}`));
    const out = snipCompact(messages, 6, 2);
    expect(out).to.have.length(7); // 2 head + placeholder + 4 tail
    expect(out[0].content).to.equal('m0');
    expect(out[1].content).to.equal('m1');
    expect(out[2].content).to.contain('snipped 4 messages');
    expect(out[6].content).to.equal('m9');
  });

  it('microCompact placeholders old tool results but keeps the recent ones', function () {
    const big = 'x'.repeat(500);
    const messages: AgentMessage[] = [
      assistantWithToolCall('a1'),
      toolResult('a1', big),
      assistantWithToolCall('a2'),
      toolResult('a2', big),
      assistantWithToolCall('a3'),
      toolResult('a3', big),
      assistantWithToolCall('a4'),
      toolResult('a4', big),
    ];
    const out = microCompact(messages, 2);
    const first = out[1] as ToolResultMessage;
    const last = out[7] as ToolResultMessage;
    expect(first.content[0].type === 'text' && first.content[0].text).to.contain('compacted');
    expect(last.content[0].type === 'text' && last.content[0].text).to.equal(big);
    // pairing identity preserved
    expect(first.toolCallId).to.equal('a1');
  });

  it('sanitizeToolPairing keeps a fully-answered tool-call pair', function () {
    const messages: AgentMessage[] = [
      userMessage('q'),
      assistantWithToolCall('a1', 'let me read'),
      toolResult('a1'),
      userMessage('next'),
    ];
    const out = sanitizeToolPairing(messages);
    expect(out).to.have.length(4);
  });

  it('sanitizeToolPairing degrades an unanswered tool-call assistant and drops orphans', function () {
    const messages: AgentMessage[] = [
      userMessage('q'),
      assistantWithToolCall('a1', 'thinking out loud'), // tool result lost
      toolResult('other-id'), // orphan
      userMessage('next'),
    ];
    const out = sanitizeToolPairing(messages);
    expect(out).to.have.length(3);
    const degraded = out[1] as AssistantMessage;
    expect(degraded.role).to.equal('assistant');
    expect(degraded.content.some(b => b.type === 'toolCall')).to.equal(false);
    expect(degraded.content.some(b => b.type === 'text')).to.equal(true);
  });

  it('sanitizeToolPairing drops a contentless unpaired assistant entirely', function () {
    const messages: AgentMessage[] = [
      userMessage('q'),
      assistantWithToolCall('a1'), // no text, tool result lost
      userMessage('next'),
    ];
    const out = sanitizeToolPairing(messages);
    expect(out).to.have.length(2);
    expect(out.every(m => m.role === 'user')).to.equal(true);
  });

  it('lastReportedTotalTokens scans from the end for real usage', function () {
    const withUsage = (tokens: number): AssistantMessage => ({
      ...assistantWithToolCall('x'),
      content: [{ type: 'text', text: 'hi' }],
      stopReason: 'stop',
      usage: {
        input: tokens, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: tokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    const messages: AgentMessage[] = [withUsage(100), userMessage('q'), withUsage(250)];
    expect(lastReportedTotalTokens(messages)).to.equal(250);
    expect(lastReportedTotalTokens([userMessage('q')])).to.equal(0);
  });
});
