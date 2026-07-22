import express from 'express';
import { CopilotController } from '../controllers/copilot.controller.js';

// The single Copilot endpoint. `POST /chat` runs the one CopilotService.chat
// agent and returns the unified
// `{conversationId, message:{role,content,blocks}, suggestedActions}` shape.
// (The former `/compile-diagnose`, `/checks/run`, `/checks/explain` routes —
// and later the multi-intent dispatch on this same endpoint — were removed
// when the Ask/Fix/Check distinction was dropped; there is now only chat.)
const router = express.Router();
const controller = new CopilotController();

router.post('/chat', controller.chat.bind(controller));
router.get('/conversations/:conversationId', controller.getConversation.bind(controller));

export default router;
