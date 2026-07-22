import { CopilotService } from '../services/copilot.service.js';
import { ContextService } from '../services/context.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { getUserIdentifier } from '../utils/common.js';
import { unauthorized } from '../utils/errors.js';
import { fail, getRequestId, ok } from '../utils/response.js';

// The single Copilot endpoint. `POST /chat` runs the one CopilotService.chat
// agent; the result is mapped into the unified
// `{conversationId, message:{role,content,blocks}, suggestedActions}` shape so
// the frontend renders every action the same way. (The former
// compile-diagnose / run-checks / explain-issue intents and their separate
// services were removed when the Ask/Fix/Check distinction was dropped.)
export class CopilotController {
  constructor({
    copilotService = new CopilotService(),
    contextService = new ContextService(),
    conversationService = new ConversationService(),
  } = {}) {
    this.copilotService = copilotService;
    this.contextService = contextService;
    this.conversationService = conversationService;
  }

  async chat(req, res) {
    const requestId = getRequestId(req);
    // Abort the agent turn when the HTTP client goes away (panel closed,
    // page navigated, proxy timeout) so the graph stops burning tokens
    // instead of running to completion for nobody. This MUST be res-based:
    // req 'close' fires as soon as the request body has been consumed
    // (express.json does that immediately) and would abort every turn at
    // once; res 'close' + the writableEnded guard only fires early when the
    // connection genuinely dies before we answered.
    const ac = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) ac.abort();
    };
    res.on('close', onClose);
    try {
      const userIdentifier = await this.getUserIdentifier(req);
      const context = this.contextService.normalizeChatContext(req.body || {});
      const r = await this.copilotService.chat(userIdentifier, context, {
        signal: ac.signal,
      });
      const data = {
        conversationId: r.conversationId,
        message: r.message,
        suggestedActions: r.suggestedActions || [],
      };
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    } finally {
      res.removeListener('close', onClose);
    }
  }

  async getConversation(req, res) {
    const requestId = getRequestId(req);
    try {
      const userIdentifier = await this.getUserIdentifier(req);
      const data = await this.conversationService.getConversation(
        userIdentifier,
        req.params.conversationId
      );
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    }
  }

  async getUserIdentifier(req) {
    const sid = req.cookies['overleaf.sid'];
    if (!sid) {
      // Missing session cookie is an auth problem (401), not a server fault
      // (500 from a TypeError deep in extractIdentifier).
      throw unauthorized('missing overleaf.sid session cookie');
    }
    return getUserIdentifier(sid);
  }
}
