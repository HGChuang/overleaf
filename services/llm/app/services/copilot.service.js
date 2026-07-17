import { randomUUID } from 'crypto';
import settings from '@overleaf/settings';
import { ApiKeyMapper } from '../mappers/keys.mapper.js';
import { createChatModel } from '../llm/modelFactory.js';
import { buildAgentGraph, buildAgentInput } from '../agent/graph.js';
import { buildUnifiedSystemPrompt } from '../agent/prompts.js';
import { RedisMemoryStore } from '../agent/memory.js';
import { LongTermMemoryStore } from '../agent/longTermMemory.js';
import { extractTextContent } from '../agent/messageText.js';
import { buildToolPool } from '../agent/tools/index.js';
import { runChecksOver } from '../agent/tools/checksTools.js';
import { isPromptTooLong, reactiveCompact } from '../agent/recovery.js';
import { ClientRegistry } from '../utils/clientRegistry.js';
import { badRequest } from '../utils/errors.js';

const MEMORY_TTL_SECONDS = Number(settings.LLM_MEMORY_TTL_SECONDS || 60 * 60);
const MEMORY_MAX_MESSAGES = Number(settings.LLM_MEMORY_MAX_MESSAGES || 20);
const MAX_ISSUES = Number(settings.COPILOT_CHECKS_MAX_ISSUES || 100);
const AGENT_RECURSION_LIMIT = Number(settings.COPILOT_AGENT_RECURSION_LIMIT || 25);
const LTMEM_ENABLED = settings.COPILOT_LTMEM_ENABLED !== 'false';

function createMessageResponse(content, extraBlocks = []) {
  // `content` already carries the assistant's markdown text — don't also echo
  // it as a {type:'text'} block, or the frontend renders the answer twice
  // (once from `content`, once from the block). `blocks` is for structured
  // extras only (diagnostics, issue lists, code, file refs, …).
  return {
    role: 'assistant',
    content,
    blocks: extraBlocks,
  };
}

function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- compile-diagnose structured-output helpers ----

// Map a model-produced diagnostic entry to the API response shape.
function toDiagnostic(entry, index) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const hasLoc = typeof e.file === 'string' && e.file ? true : e.line != null;
  const fix =
    e.fix && typeof e.fix === 'object'
      ? {
          oldText: typeof e.fix.oldText === 'string' ? e.fix.oldText : '',
          newText: typeof e.fix.newText === 'string' ? e.fix.newText : '',
        }
      : null;
  return {
    id: `diag_${index}_${randomUUID().slice(0, 8)}`,
    title:
      typeof e.title === 'string' && e.title ? e.title : 'Compile diagnosis',
    whatHappened: typeof e.whatHappened === 'string' ? e.whatHappened : '',
    likelyCause: typeof e.likelyCause === 'string' ? e.likelyCause : '',
    suggestedFix: typeof e.suggestedFix === 'string' ? e.suggestedFix : '',
    fix,
    location: hasLoc
      ? {
          file: typeof e.file === 'string' && e.file ? e.file : undefined,
          line: Number.isInteger(e.line) ? e.line : undefined,
        }
      : null,
    actions: ['jump_to_line', 'copy', 'regenerate', 'apply_fix'],
  };
}

// Find the last `submit_diagnostics` tool call in the message list and return
// the raw diagnostics array the model passed (or null).
function extractSubmittedDiagnostics(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const toolCalls = m && Array.isArray(m.tool_calls) ? m.tool_calls : null;
    if (!toolCalls || toolCalls.length === 0) continue;
    const sd = toolCalls.find(tc => tc && tc.name === 'submit_diagnostics');
    if (!sd) continue;
    const args = sd.args || {};
    const diags = Array.isArray(args.diagnostics)
      ? args.diagnostics
      : Array.isArray(args)
        ? args
        : null;
    if (diags && diags.length > 0) return diags;
  }
  return null;
}

// Find the last `run_checks` tool RESULT in the message list and return the
// parsed {summary, issues} the tool returned (or null). Mirrors
// extractSubmittedDiagnostics but reads the ToolMessage output rather than
// the AIMessage tool-call args.
function extractRunChecksResult(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const type = typeof m?._getType === 'function' ? m._getType() : null;
    const typeAlt = typeof m?.getType === 'function' ? m.getType() : null;
    const isTool = type === 'tool' || typeAlt === 'tool';
    if (!isTool) continue;
    const name = m.name || m.tool_name;
    if (name !== 'run_checks') continue;
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || {});
    const parsed = safeJsonParse(content);
    if (parsed && Array.isArray(parsed.issues)) return parsed;
  }
  return null;
}

// ---- patch (submit_patch) structured-output helpers ----
//
// `submit_patch` is the chat-path counterpart of the compile path's per-error
// `fix`: the model proposes a list of {oldText,newText} hunks instead of
// returning the whole document. The frontend renders an inline-diff ghost
// preview (struck old + gray new) with Accept/Reject; accept applies the edit
// client-side through the existing applyFixInEditor → OT path.

// Map a model-produced patch hunk to the API shape, with the same defensive
// coercion as the diagnostic `fix` field in `toDiagnostic`.
function toPatchHunk(entry) {
  const e = entry && typeof entry === 'object' ? entry : {};
  return {
    file: typeof e.file === 'string' && e.file ? e.file : null,
    line: Number.isInteger(e.line) ? e.line : null,
    oldText: typeof e.oldText === 'string' ? e.oldText : '',
    newText: typeof e.newText === 'string' ? e.newText : '',
  };
}

// Find the last `submit_patch` tool call in the message list and return the raw
// {hunks, summary} the model passed (or null). Mirrors extractSubmittedDiagnostics.
function extractSubmittedPatch(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const toolCalls = m && Array.isArray(m.tool_calls) ? m.tool_calls : null;
    if (!toolCalls || toolCalls.length === 0) continue;
    const sp = toolCalls.find(tc => tc && tc.name === 'submit_patch');
    if (!sp) continue;
    const args = sp.args || {};
    const hunks = Array.isArray(args.hunks) ? args.hunks : null;
    if (hunks && hunks.length > 0) {
      return {
        hunks,
        summary: typeof args.summary === 'string' ? args.summary : '',
      };
    }
  }
  return null;
}

// Build a {type:'patch'} block from a raw patch, dropping no-op hunks.
// Returns null if nothing meaningful remains (caller then falls back to text).
function toPatchBlock(rawPatch, index) {
  if (!rawPatch || !Array.isArray(rawPatch.hunks)) return null;
  const hunks = rawPatch.hunks.map(toPatchHunk).filter(h => h.oldText || h.newText);
  if (hunks.length === 0) return null;
  return {
    id: `patch_${index}_${randomUUID().slice(0, 8)}`,
    title:
      typeof rawPatch.summary === 'string' && rawPatch.summary
        ? rawPatch.summary
        : `Proposed change (${hunks.length} hunk${hunks.length === 1 ? '' : 's'})`,
    hunks,
  };
}

// Belt-and-suspenders: if the model did not call `run_checks` on the run-checks
// intent, run the deterministic scanners directly so the structured
// issue_list block is still produced (preserves the CTA's guarantee).
// Delegates to the shared `runChecksOver` so the tool and the fallback stay
// in lockstep.
function runChecksFallback(context = {}) {
  return runChecksOver(context.project || {}, context.checks, MAX_ISSUES);
}

// Tolerant JSON parse of a free-text model response into a diagnostics array.
// Accepts `[{...}]` or `{diagnostics:[...]}`, strips code fences, and handles
// strings containing brackets while scanning for the matching close.
function tryParseDiagnosticsJson(text) {
  if (!text || typeof text !== 'string') return null;
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  const arrStart = candidate.indexOf('[');
  const objStart = candidate.indexOf('{');
  let start;
  if (arrStart === -1 && objStart === -1) return null;
  else if (arrStart === -1) start = objStart;
  else if (objStart === -1) start = arrStart;
  else start = Math.min(arrStart, objStart);
  const open = candidate[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  let parsed;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
  let arr = null;
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed && Array.isArray(parsed.diagnostics)) arr = parsed.diagnostics;
  if (!arr || arr.length === 0) return null;
  return arr;
}

// Build a user-facing summary from the final message + diagnostics count.
function buildDiagnoseSummary(finalContent, diagnostics) {
  const count = Array.isArray(diagnostics) ? diagnostics.length : 0;
  const isToolConfirm = /"submitted"\s*:\s*true/.test(finalContent || '');
  if (finalContent && !isToolConfirm) return finalContent;
  return `Diagnosed ${count} compile error${count === 1 ? '' : 's'}.`;
}

// Intent-specific user message payload. Project *paths* (not full contents) —
// the model reads source via the read_file / read_file_fragment tools.
function buildUserMessage(context = {}, intent = 'chat') {
  const project = context.project || {};
  const projectShell = {
    projectId: project.projectId,
    rootDocId: project.rootDocId,
    fileList: project.fileList || [],
    outline: project.outline || [],
  };

  if (intent === 'compile-diagnose') {
    return JSON.stringify(
      {
        COMPILE: context.compile,
        PROJECT: {
          ...projectShell,
          filePaths: (project.files || []).map(f => f.path),
        },
      },
      null,
      2
    );
  }

  if (intent === 'run-checks') {
    return JSON.stringify(
      {
        REQUEST: 'Run the project quality checks and report the findings.',
        CHECKS: context.checks,
        PROJECT: projectShell,
      },
      null,
      2
    );
  }

  if (intent === 'explain-issue') {
    return JSON.stringify({ ISSUE: context.issue, PROJECT: projectShell }, null, 2);
  }

  // default: chat
  return JSON.stringify(
    {
      MESSAGE: context.message?.content,
      CONTEXT: context.context,
      PROJECT: projectShell,
    },
    null,
    2
  );
}

export class CopilotService {
  constructor({
    apiKeyMapper = new ApiKeyMapper(),
    clientRegistry,
    memoryStore,
    longTermMemoryStore,
    toolPoolFactory = buildToolPool,
    graphFactory = buildAgentGraph,
  } = {}) {
    this.apiKeyMapper = apiKeyMapper;
    this.memoryStore =
      memoryStore ||
      new RedisMemoryStore({
        ttlSeconds: MEMORY_TTL_SECONDS,
        maxMessages: MEMORY_MAX_MESSAGES,
        keyPrefix: 'copilot:mem',
      });
    // Long-term, cross-conversation memory. Default-constructed (singleton —
    // the service itself is constructed once). Disabled via
    // COPILOT_LTMEM_ENABLED=false. Shares the redis singleton.
    this.longTermMemoryStore = longTermMemoryStore || new LongTermMemoryStore();
    this.toolPoolFactory = toolPoolFactory;
    this.clientRegistry =
      clientRegistry ||
      new ClientRegistry({
        createChatModel,
        agentOptions: {
          timeout: 60_000,
          keepAlive: true,
          maxSockets: 200,
          retries: 1,
        },
        clientExpireMs: 10 * 60 * 1000,
        maxConcurrentPerKey: 8,
      });
    this.graphFactory = graphFactory;
  }

  // The single unified agent entry point. Every intent flows through here:
  // the controller normalizes the request (size validation) and passes the
  // `intent` as a HINT — it biases the system prompt + tool availability, but
  // the MODEL decides which tools to call (real intent recognition). The
  // result is mapped into the unified {conversationId, message, suggestedActions}
  // envelope, with structured blocks (diagnostic / issue_list) emitted when the
  // model called the structured tools.
  async chat(userIdentifier, context, intent = 'chat') {
    const conversationId =
      context.conversation?.conversationId || `conv_${randomUUID()}`;
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const history = await this.memoryStore.load(threadId);
    const { usingLlmInfo, model } = await this.resolveChatModel(userIdentifier);
    const { model: chatModel, semaphore } = await this.clientRegistry.getChatModel(
      usingLlmInfo.baseUrl,
      usingLlmInfo.apiKey,
      model.id
    );

    const tools = this.toolPoolFactory(context, intent);
    const boundModel =
      tools.length > 0 && typeof chatModel.bindTools === 'function'
        ? chatModel.bindTools(tools)
        : chatModel;
    const graph = this.graphFactory({
      model: boundModel,
      tools,
      recursionLimit: AGENT_RECURSION_LIMIT,
    });

    // Build the base prompt + user message, then layer in long-term memory
    // (M3): the memory *index* (a cheap catalog) goes into the system prompt;
    // the *relevant* memory bodies go into the user turn. Both are best-effort
    // and fully swallowed so a flaky memory subsystem never breaks a turn.
    let systemPrompt = buildUnifiedSystemPrompt(
      context,
      intent,
      tools.map(t => t.name)
    );
    let userMessage = buildUserMessage(context, intent);
    const lt = LTMEM_ENABLED ? this.longTermMemoryStore : null;
    if (lt) {
      try {
        const index = await lt.readIndex(userIdentifier);
        const indexSection = lt.renderIndexForPrompt(index);
        if (indexSection) systemPrompt = `${systemPrompt}\n\n${indexSection}`;
        const relevant = await lt.loadRelevant(userIdentifier, [
          ...history,
          this._pseudoUserMessage(userMessage),
        ], { model: chatModel, useLlmSelect: false });
        if (relevant) userMessage = `${relevant}\n\n${userMessage}`;
      } catch {
        // long-term memory must never break a chat turn
      }
    }

    const invoke = hist =>
      graph.invoke(
        buildAgentInput({ systemPrompt, history: hist, userMessage }),
        {
          configurable: { thread_id: threadId },
          recursionLimit: AGENT_RECURSION_LIMIT,
        }
      );

    await semaphore.acquire();
    let messages;
    try {
      let effectiveHistory = history;
      let response;
      try {
        response = await invoke(effectiveHistory);
      } catch (err) {
        // s11 reactive compact: on context-too-large, summarize the short-term
        // history and retry once. Rare (recursionLimit + micro_compact bound
        // growth), but the GLM proxy can be picky about context size.
        if (!isPromptTooLong(err)) throw err;
        effectiveHistory = await reactiveCompact(effectiveHistory, chatModel);
        response = await invoke(effectiveHistory);
      }
      messages = Array.isArray(response?.messages) ? response.messages : [];
      // Keep the full new turn (Human + assistant + tool messages), dropping
      // the System + the effectiveHistory prefix actually used (may differ from
      // the loaded history if a reactive compact ran). Storing the HumanMessage
      // too (was dropped before) so follow-up turns keep the user's prior
      // questions and long-term extraction can see user preferences.
      const appendedMessages = messages.slice(effectiveHistory.length + 1);
      await this.memoryStore.append(threadId, appendedMessages);
    } finally {
      semaphore.release();
    }

    // M3: fire-and-forget long-term extraction + consolidation. Non-blocking
    // and fully swallowed — never affects the response or breaks the caller.
    this._maybePersistLongTermMemory(userIdentifier, messages, chatModel);

    return this.mapResult(messages, context, intent, conversationId);
  }

  // A lightweight stand-in for the current user message so loadRelevant's
  // recent-user-text scan sees this turn's question when selecting memories
  // (the real HumanMessage isn't built until buildAgentInput).
  _pseudoUserMessage(content) {
    return {
      getType: () => 'human',
      _getType: () => 'human',
      content,
    };
  }

  // Background long-term memory persistence (s09 stop-hook pattern). Runs after
  // the response is returned via setImmediate; every error is swallowed.
  _maybePersistLongTermMemory(userIdentifier, messages, chatModel) {
    const lt = LTMEM_ENABLED ? this.longTermMemoryStore : null;
    if (!lt || !chatModel || !Array.isArray(messages) || messages.length === 0) {
      return;
    }
    setImmediate(async () => {
      try {
        await lt.extractMemories(userIdentifier, messages, chatModel);
        await lt.consolidate(userIdentifier, chatModel);
      } catch {
        /* swallow — never break the caller */
      }
    });
  }

  // Map the agent's message list into the unified response envelope. Each
  // intent's structured tools (submit_diagnostics / run_checks) are detected
  // and turned into the matching message.blocks; free-text answers ride as
  // message.content. Deterministic fallbacks preserve the structured-output
  // guarantee when the model routes loosely.
  mapResult(messages, context, intent, conversationId) {
    const finalContent = extractTextContent(messages[messages.length - 1]);

    if (intent === 'compile-diagnose') {
      let rawDiags = extractSubmittedDiagnostics(messages);
      if (!rawDiags || rawDiags.length === 0) {
        rawDiags = tryParseDiagnosticsJson(finalContent);
      }
      let diagnostics;
      let content;
      if (rawDiags && rawDiags.length > 0) {
        diagnostics = rawDiags.map((e, i) => toDiagnostic(e, i));
        content = buildDiagnoseSummary(finalContent, diagnostics);
      } else {
        // fallback: single free-text diagnostic grounded in the first annotation.
        const annotations = context.compile?.annotations || [];
        const primary = annotations[0] || null;
        diagnostics = [
          {
            id: `diag_0_${randomUUID().slice(0, 8)}`,
            title: primary?.message || 'Compile diagnosis',
            whatHappened: finalContent || 'No diagnosis produced.',
            likelyCause: '',
            suggestedFix: '',
            location: primary
              ? { file: primary.file, line: primary.line }
              : null,
            actions: ['jump_to_line', 'copy', 'regenerate'],
          },
        ];
        content = buildDiagnoseSummary(finalContent, diagnostics);
      }
      return {
        conversationId,
        message: {
          role: 'assistant',
          content,
          blocks: diagnostics.map(diagnostic => ({ type: 'diagnostic', diagnostic })),
        },
        suggestedActions: [],
      };
    }

    if (intent === 'run-checks') {
      let rc = extractRunChecksResult(messages);
      if (!rc || !Array.isArray(rc.issues)) {
        rc = runChecksFallback(context);
      }
      const issues = (rc.issues || []).slice(0, MAX_ISSUES);
      const total = issues.length;
      const isToolConfirm = /"submitted"\s*:\s*true/.test(finalContent || '');
      const content =
        finalContent && !isToolConfirm
          ? finalContent
          : total
            ? `${total} issue${total === 1 ? '' : 's'} found`
            : 'Checks complete';
      return {
        conversationId,
        message: {
          role: 'assistant',
          content,
          blocks: total ? [{ type: 'issue_list', items: issues }] : [],
        },
        suggestedActions: [],
      };
    }

    // explain-issue + chat: free-text answer, plus a `patch` block when the
    // model called `submit_patch` (a structured edit proposal the frontend
    // renders as an inline-diff ghost preview with Accept/Reject). `content`
    // is a SHORT generic intro only — the model's `summary` rides as
    // `patch.title` inside the card (see `toPatchBlock`). Rendering the summary
    // in BOTH `content` and `patch.title` showed it twice in the chat
    // (message-list renders `content` as markdown *and* the block).
    const patchRaw = extractSubmittedPatch(messages);
    if (patchRaw) {
      const patch = toPatchBlock(patchRaw, 0);
      if (patch) {
        const count = patch.hunks.length;
        const content = `Proposed ${count} change${
          count === 1 ? '' : 's'
        } — review the inline preview, then Accept or Reject.`;
        return {
          conversationId,
          message: createMessageResponse(content, [{ type: 'patch', patch }]),
          suggestedActions: [],
        };
      }
    }

    return {
      conversationId,
      message: createMessageResponse(finalContent),
      suggestedActions: [],
    };
  }

  // Back-compat wrapper: the old compileDiagnose(userIdentifier, context)
  // signature, now delegating to the unified chat() and reshaping the unified
  // envelope back to {conversationId, summary, diagnostics}. Kept so existing
  // callers/tests of the old shape keep working.
  async compileDiagnose(userIdentifier, context) {
    const r = await this.chat(userIdentifier, context, 'compile-diagnose');
    const diagnostics = (r.message.blocks || [])
      .filter(b => b && b.type === 'diagnostic')
      .map(b => b.diagnostic);
    return {
      conversationId: r.conversationId,
      summary: r.message.content,
      diagnostics,
    };
  }

  async getConversation(userIdentifier, conversationId) {
    if (!conversationId) {
      throw badRequest('conversationId is required');
    }
    const threadId = this.buildThreadId(userIdentifier, conversationId);
    const messages = await this.memoryStore.load(threadId);
    return {
      conversationId,
      messages: messages.map(message => ({
        role: message.getType ? message.getType() : message._getType?.() || 'message',
        content: message.content,
      })),
    };
  }

  buildThreadId(userIdentifier, conversationId) {
    return `${userIdentifier}:${conversationId}`;
  }

  async resolveChatModel(userIdentifier) {
    const { usingLlm, llminfo } = await this.apiKeyMapper.getUsingLlmWithInfo(userIdentifier);
    if (usingLlm == null || usingLlm < 0 || usingLlm >= llminfo.length) {
      throw badRequest('not set chat model');
    }
    const usingLlmInfo = llminfo[usingLlm];
    const model = usingLlmInfo?.models?.[usingLlmInfo?.usingChatModel];
    if (!model) {
      throw badRequest('not set chat model');
    }
    return { usingLlmInfo, model };
  }
}
