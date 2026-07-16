import { CopilotService } from '../services/copilot.service.js';
import { ChecksService } from '../services/checks.service.js';
import { ContextService } from '../services/context.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { getUserIdentifier } from '../utils/common.js';
import { fail, getRequestId, ok } from '../utils/response.js';

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
      const context = this.contextService.normalizeChatContext(req.body || {});
      const data = await this.copilotService.chat(userIdentifier, context);
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    }
  }

  async compileDiagnose(req, res) {
    const requestId = getRequestId(req);
    try {
      const userIdentifier = await this.getUserIdentifier(req);
      const context = this.contextService.normalizeCompileContext(req.body || {});
      const data = await this.copilotService.compileDiagnose(userIdentifier, context);
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    }
  }

  async runChecks(req, res) {
    const requestId = getRequestId(req);
    try {
      const userIdentifier = await this.getUserIdentifier(req);
      const context = this.contextService.normalizeChecksRunContext(req.body || {});
      const data = await this.checksService.runChecks(userIdentifier, context);
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    }
  }

  async explainCheck(req, res) {
    const requestId = getRequestId(req);
    try {
      const userIdentifier = await this.getUserIdentifier(req);
      const context = this.contextService.normalizeCheckExplainContext(req.body || {});
      const data = await this.checksService.explainIssue(userIdentifier, context);
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
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
