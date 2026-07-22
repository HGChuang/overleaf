import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { END, START, StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';

export function buildAgentGraph({
  model,
  tools = [],
  checkpointer,
} = {}) {
  const toolNode = new ToolNode(tools);

  const callModel = async state => {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
  };

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', toolsCondition, ['tools', END])
    .addEdge('tools', 'agent');

  // NOTE: recursionLimit is a RUNTIME config (CopilotService passes it to
  // graph.invoke), not a compile option — langgraph's compile() ignores it.
  // It caps agent↔tool round trips so a model that keeps calling tools can't
  // loop until the provider times out. 25 is enough for the
  // diagnose-all-errors flow (enumerate → read fragments → classify → submit)
  // with headroom.
  return checkpointer ? graph.compile({ checkpointer }) : graph.compile();
}

export function buildAgentInput({ systemPrompt, history = [], userMessage }) {
  return {
    messages: [
      new SystemMessage(systemPrompt),
      ...history,
      new HumanMessage(userMessage),
    ],
  };
}
