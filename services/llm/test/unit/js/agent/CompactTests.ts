import { expect } from 'chai';
import {
  capMessagesKeepInstructions,
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

function toolResult(id: string, text = 'result', toolName = 'read_file'): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: id,
    toolName,
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
      toolResult('a1', big, 'search_project'),
      assistantWithToolCall('a2'),
      toolResult('a2', big, 'search_project'),
      assistantWithToolCall('a3'),
      toolResult('a3', big, 'search_project'),
      assistantWithToolCall('a4'),
      toolResult('a4', big, 'search_project'),
    ];
    const out = microCompact(messages, 2);
    const first = out[1] as ToolResultMessage;
    const last = out[7] as ToolResultMessage;
    expect(first.content[0].type === 'text' && first.content[0].text).to.contain('compacted');
    expect(last.content[0].type === 'text' && last.content[0].text).to.equal(big);
    // pairing identity preserved
    expect(first.toolCallId).to.equal('a1');
  });

  it('microCompact never blanks read_file / read_file_fragment results (evict→re-read loop fix)', function () {
    const big = 'x'.repeat(500);
    const messages: AgentMessage[] = [
      assistantWithToolCall('a1'),
      toolResult('a1', big, 'read_file'),
      assistantWithToolCall('a2'),
      toolResult('a2', big, 'read_file_fragment'),
      assistantWithToolCall('a3'),
      toolResult('a3', big, 'search_project'),
      assistantWithToolCall('a4'),
      toolResult('a4', big, 'search_project'),
      assistantWithToolCall('a5'),
      toolResult('a5', big, 'search_project'),
    ];
    const out = microCompact(messages, 2);
    // Pinned reads keep their content even though they are the OLDEST results.
    const read1 = out[1] as ToolResultMessage;
    const read2 = out[3] as ToolResultMessage;
    expect(read1.content[0].type === 'text' && read1.content[0].text).to.equal(big);
    expect(read2.content[0].type === 'text' && read2.content[0].text).to.equal(big);
    // Non-read old results are still blanked; keepRecent still applies to them.
    const old = out[5] as ToolResultMessage;
    expect(old.content[0].type === 'text' && old.content[0].text).to.contain('compacted');
    const last = out[9] as ToolResultMessage;
    expect(last.content[0].type === 'text' && last.content[0].text).to.equal(big);
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

describe('capMessagesKeepInstructions (hard tail cap with pinned user messages)', function () {
  // Build a long agent turn: 1 instruction + N rounds of (assistant toolCall +
  // toolResult), optionally followed by more user turns.
  function longTurn(rounds: number, extraUserTurns = 0): AgentMessage[] {
    const msgs: AgentMessage[] = [userMessage('THE INSTRUCTION')];
    for (let i = 0; i < rounds; i++) {
      msgs.push(assistantWithToolCall(`c${i}`), toolResult(`c${i}`));
    }
    for (let u = 0; u < extraUserTurns; u++) {
      msgs.push(userMessage(`follow-up ${u}`));
      msgs.push(assistantWithToolCall(`u${u}`), toolResult(`u${u}`));
    }
    return msgs;
  }

  it('is a no-op when the list fits within max', function () {
    const msgs = longTurn(3);
    expect(capMessagesKeepInstructions(msgs, 20)).to.equal(msgs);
  });

  it('keeps the instruction when a plain tail-slice would drop it', function () {
    const msgs = longTurn(15); // 31 messages
    const out = capMessagesKeepInstructions(msgs, 20);
    expect(out.length).to.be.at.most(20);
    expect(out.some(m => m.role === 'user' && m.content === 'THE INSTRUCTION')).to.equal(true);
    // chronological order preserved (first element is the instruction)
    expect(out[0].role).to.equal('user');
    // tail preference: the most recent tool exchange survives
    expect(out.some(m => m.role === 'toolResult' && m.toolCallId === 'c14')).to.equal(true);
  });

  it('pins every user message of a multi-user-turn conversation', function () {
    const msgs = longTurn(12, 2); // instruction + follow-up 0/1
    const out = capMessagesKeepInstructions(msgs, 20);
    const users = out.filter(m => m.role === 'user').map(m => m.content);
    expect(users).to.deep.equal(['THE INSTRUCTION', 'follow-up 0', 'follow-up 1']);
  });

  it('bounds pinned instructions with maxPinned', function () {
    const msgs: AgentMessage[] = [];
    for (let u = 0; u < 15; u++) msgs.push(userMessage(`q${u}`));
    for (let i = 0; i < 15; i++) msgs.push(assistantWithToolCall(`c${i}`), toolResult(`c${i}`));
    const out = capMessagesKeepInstructions(msgs, 20, 10);
    expect(out.length).to.be.at.most(20);
    const users = out.filter(m => m.role === 'user').map(m => m.content);
    expect(users).to.have.length(10);
    expect(users[0]).to.equal('q5'); // oldest pinned instruction evicted
    expect(users[9]).to.equal('q14');
  });

  it('composes with sanitizeToolPairing without dangling tool messages', function () {
    const msgs = longTurn(15);
    const out = sanitizeToolPairing(capMessagesKeepInstructions(msgs, 20));
    // every surviving toolResult must immediately follow its assistant call
    for (let i = 0; i < out.length; i++) {
      if (out[i].role !== 'toolResult') continue;
      const prev = out[i - 1];
      const paired =
        prev?.role === 'assistant' &&
        (prev as AssistantMessage).content.some(
          b => b.type === 'toolCall' && b.id === (out[i] as ToolResultMessage).toolCallId
        );
      expect(paired, `toolResult ${(out[i] as ToolResultMessage).toolCallId} paired`).to.equal(true);
    }
  });

  it('R5: a degenerate max (1 / NaN) clamps instead of silently keeping everything', function () {
    const msgs = longTurn(10);
    const out1 = capMessagesKeepInstructions(msgs, 1);
    expect(out1.length).to.be.at.most(2);
    const outNaN = capMessagesKeepInstructions(msgs, Number('x'));
    expect(outNaN.length).to.be.at.most(2);
    // zero too
    const out0 = capMessagesKeepInstructions(msgs, 0);
    expect(out0.length).to.be.at.most(2);
  });

  it('R7: the snipCompact placeholder does not consume a pinned slot', function () {
    const placeholder: AgentMessage = {
      role: 'user',
      content: '[snipped 40 messages from conversation middle]',
      timestamp: Date.now(),
    };
    const msgs: AgentMessage[] = [userMessage('THE INSTRUCTION')];
    for (let i = 0; i < 12; i++) msgs.push(assistantWithToolCall(`c${i}`), toolResult(`c${i}`));
    msgs.splice(5, 0, placeholder);
    const out = capMessagesKeepInstructions(msgs, 20);
    const pinned = out.filter(m => m.role === 'user');
    expect(pinned.some(m => m.content === 'THE INSTRUCTION')).to.equal(true);
    expect(pinned.some(m => m === placeholder)).to.equal(false);
  });
});
