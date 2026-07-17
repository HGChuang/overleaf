import { CopilotService } from '../services/copilot.service.js';
import { ChecksService } from '../services/checks.service.js';
import { ContextService } from '../services/context.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { getUserIdentifier } from '../utils/common.js';
import { badRequest } from '../utils/errors.js';
import { fail, getRequestId, ok } from '../utils/response.js';

// Every Copilot action (chat / compile-diagnose / run-checks / explain-issue)
// flows through the single `POST /chat` endpoint. The request body's `intent`
// selects which service path runs; the result is mapped into one unified
// `{conversationId, message:{role,content,blocks}, suggestedActions}` shape so
// the frontend renders every action the same way.
const SUPPORTED_INTENTS = new Set([
  'chat',
  'compile-diagnose',
  'run-checks',
  'explain-issue',
]);

function resolveIntent(body = {}) {
  const raw = typeof body.intent === 'string' ? body.intent.trim() : '';
  if (!raw) return 'chat';
  if (SUPPORTED_INTENTS.has(raw)) return raw;
  throw badRequest(`unsupported intent: ${raw}`);
}

export class CopilotController {
  constructor({
    copilotService = new CopilotService(),
    checksService = new ChecksService(),
    contextService = new ContextService(),
    conversationService = new ConversationService(),
  } = {}) {
    this.copilotService = copilotService;
    this.checksService = checksService;
    this.contextService = contextService;
    this.conversationService = conversationService;
  }

  async chat(req, res) {
    const requestId = getRequestId(req);
    try {
      const userIdentifier = await this.getUserIdentifier(req);
      const intent = resolveIntent(req.body || {});
      const data = await this.runIntent(intent, userIdentifier, req.body || {});
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    }
  }

  // One unified path: normalize the request (size validation per intent —
  // the normalizers stay, they just no longer ROUTE), then run the single
  // CopilotService.chat agent with `intent` as a hint. The service maps the
  // agent result into the unified {conversationId, message, suggestedActions}
  // envelope (structured blocks emitted when the model called the structured
  // tools), so the controller just passes it through.
  async runIntent(intent, userIdentifier, body) {
    const context = this.normalizeByIntent(intent, body);
    const r = await this.copilotService.chat(userIdentifier, context, intent);
    return {
      conversationId: r.conversationId,
      message: r.message,
      suggestedActions: r.suggestedActions || [],
    };
  }

  // Pick the size-validating normalizer for the intent. These still enforce
  // the per-intent byte/field limits (COPILOT_MAX_CONTEXT_BYTES etc.); they
  // just feed one unified agent instead of selecting a service.
  normalizeByIntent(intent, body) {
    switch (intent) {
      case 'compile-diagnose':
        return this.contextService.normalizeCompileContext(body);
      case 'run-checks':
        return this.contextService.normalizeChecksRunContext(body);
      case 'explain-issue':
        return this.contextService.normalizeCheckExplainContext(body);
      default:
        return this.contextService.normalizeChatContext(body);
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
    return getUserIdentifier(sid);
  }
}
