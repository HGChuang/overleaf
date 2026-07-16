import { LLMService } from '../services/llm.service.js';
import { getUserIdentifier } from '../utils/common.js';
import { fail, getRequestId, ok } from '../utils/response.js';

export class LLMController {
  constructor() {
    this.llmService = new LLMService();
  }

  async chat(req, res) {
    const requestId = getRequestId(req);
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const { ask, selection, filelist, outline, mode, conversationId } = req.body;
      const content = await this.llmService.chat(
        userIdentifier,
        ask,
        selection,
        filelist,
        outline,
        mode,
        conversationId
      );
      res.status(200).json(ok(content, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json({
        success: false,
        data: response.body.error.message,
        error: response.body.error,
        meta: response.body.meta,
      });
    }
  }

  async completion(req, res) {
    const requestId = getRequestId(req);
    try {
      const sid = req.cookies['overleaf.sid'];
      const userIdentifier = await getUserIdentifier(sid);
      const { cursorOffset, leftContext, rightContext, language, maxLength, fileList, outline } = req.body;
      const content = await this.llmService.completion(
        userIdentifier,
        cursorOffset,
        leftContext,
        rightContext,
        language,
        maxLength,
        fileList,
        outline
      );
      res.status(200).json(ok(content, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json({
        success: false,
        data: response.body.error.message,
        error: response.body.error,
        meta: response.body.meta,
      });
    }
  }
}



