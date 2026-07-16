import express from 'express';
import { CopilotController } from '../controllers/copilot.controller.js';

const router = express.Router();
const controller = new CopilotController();

router.post('/chat', controller.chat.bind(controller));
router.post('/compile-diagnose', controller.compileDiagnose.bind(controller));
router.post('/checks/run', controller.runChecks.bind(controller));
router.post('/checks/explain', controller.explainCheck.bind(controller));
router.get('/conversations/:conversationId', controller.getConversation.bind(controller));

export default router;
