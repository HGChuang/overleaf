import express from 'express';
import { CopilotController } from '../controllers/copilot.controller.js';

// A single unified Copilot endpoint. `POST /chat` handles every intent
// (chat / compile-diagnose / run-checks / explain-issue) by dispatching on the
// request body's `intent` field and returning one unified
// `{conversationId, message:{role,content,blocks}, suggestedActions}` shape.
// The former `/compile-diagnose`, `/checks/run`, `/checks/explain` routes were
// folded into this endpoint when the Ask/Fix/Check distinction was removed.
const router = express.Router();
const controller = new CopilotController();

router.post('/chat', controller.chat.bind(controller));
router.get('/conversations/:conversationId', controller.getConversation.bind(controller));

export default router;
