import { expect } from 'chai';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { buildAgentGraph, buildAgentInput } from '../../../../app/agent/graph.js';

describe('agent graph', function () {
  it('returns the model answer when no tool calls are emitted', async function () {
    const model = fakeModel().respond(new AIMessage('agent answer'));
    const graph = buildAgentGraph({ model, tools: [] });
    const input = buildAgentInput({
      systemPrompt: 'system prompt',
      history: [new HumanMessage('older message')],
      userMessage: 'latest message',
    });

    const result = await graph.invoke(input);

    expect(result.messages).to.have.length(4);
    expect(result.messages[3].content).to.equal('agent answer');
    expect(model.callCount).to.equal(1);
  });
});
