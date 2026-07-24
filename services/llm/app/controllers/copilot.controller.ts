import type { Request, Response } from 'express';
import { CopilotService, type CopilotStreamEvent } from '../services/copilot.service.js';
import { ContextService } from '../services/context.service.js';
import { ConversationService } from '../services/conversation.service.js';
import { getUserIdentifier } from '../utils/common.js';
import { unauthorized } from '../utils/errors.js';
import { fail, getRequestId, ok } from '../utils/response.js';

// The single Copilot endpoint. `POST /chat` runs the one CopilotService.chat
// agent. Two response modes, negotiated via the Accept header:
//
//   - `text/event-stream` → SSE: mid-turn events stream as they happen
//     (`text_delta`, `tool_start`, `tool_end`), then a terminal `done` event
//     carrying the same {conversationId, message, suggestedActions} envelope
//     as the buffered mode, or an `error` event carrying {code,message,status}.
//     A `: hb` heartbeat comment is written every 10s so intermediaries don't
//     idle-kill the connection on tool-heavy turns.
//   - anything else → the original buffered JSON response, so existing
//     callers (e.g. llm-toolbar generators) keep working untouched.
//
// Errors raised BEFORE streaming starts (auth, payload validation) are
// reported as ordinary JSON error responses in both modes; errors mid-turn
// can only ride the `error` SSE event (the 200 headers are already out).
export class CopilotController {
  copilotService: CopilotService;
  contextService: ContextService;
  conversationService: ConversationService;

  constructor({
    copilotService = new CopilotService(),
    contextService = new ContextService(),
    conversationService = new ConversationService(),
  } = {}) {
    this.copilotService = copilotService;
    this.contextService = contextService;
    this.conversationService = conversationService;
  }

  async chat(req: Request, res: Response) {
    const requestId = getRequestId(req);
    // Abort the agent turn when the HTTP client goes away (panel closed,
    // page navigated, proxy timeout) so the run stops burning tokens instead
    // of running to completion for nobody. This MUST be res-based: req
    // 'close' fires as soon as the request body has been consumed
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
      const wantsStream = String(req.headers.accept || '').includes('text/event-stream');

      if (wantsStream) {
        await this.chatSse(res, userIdentifier, context, ac.signal);
      } else {
        const r = await this.copilotService.chat(userIdentifier, context, {
          signal: ac.signal,
        });
        const data = {
          conversationId: r.conversationId,
          message: r.message,
          suggestedActions: r.suggestedActions || [],
        };
        res.status(200).json(ok(data, { requestId }));
      }
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    } finally {
      res.removeListener('close', onClose);
    }
  }

  private async chatSse(
    res: Response,
    userIdentifier: string,
    context: unknown,
    signal: AbortSignal
  ) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering (nginx / dev proxies) so deltas reach the
      // browser as they are produced.
      'X-Accel-Buffering': 'no',
    });
    (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();

    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': hb\n\n');
    }, 10_000);

    try {
      const r = await this.copilotService.chat(userIdentifier, context, {
        signal,
        onEvent: (e: CopilotStreamEvent) => {
          if (e.type === 'text_delta') {
            send('text_delta', { delta: e.delta });
          } else if (e.type === 'tool_start') {
            send('tool_start', { toolCallId: e.toolCallId, toolName: e.toolName, args: e.args });
          } else if (e.type === 'tool_end') {
            send('tool_end', {
              toolCallId: e.toolCallId,
              toolName: e.toolName,
              isError: e.isError,
              resultSummary: e.resultSummary,
            });
          }
        },
      });
      send('done', {
        conversationId: r.conversationId,
        message: r.message,
        suggestedActions: r.suggestedActions || [],
      });
    } catch (error) {
      const response = fail(error, {});
      send('error', { status: response.status, ...response.body.error });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }

  async getConversation(req: Request, res: Response) {
    const requestId = getRequestId(req);
    try {
      const userIdentifier = await this.getUserIdentifier(req);
      const data = await this.conversationService.getConversation(
        userIdentifier,
        String(req.params.conversationId)
      );
      res.status(200).json(ok(data, { requestId }));
    } catch (error) {
      const response = fail(error, { requestId });
      res.status(response.status).json(response.body);
    }
  }

  async getUserIdentifier(req: Request) {
    const sid = req.cookies?.['overleaf.sid'];
    if (!sid) {
      // Missing session cookie is an auth problem (401), not a server fault
      // (500 from a TypeError deep in extractIdentifier).
      throw unauthorized('missing overleaf.sid session cookie');
    }
    return getUserIdentifier(sid);
  }
}
