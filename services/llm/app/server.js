import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import keysRoutes from './routes/keys.routes.js';
import llmRoutes from './routes/llm.routes.js';
import copilotRoutes from './routes/copilot.routes.js';

export async function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/v1/llm', keysRoutes);
  app.use('/api/v1/llm', llmRoutes);
  app.use('/api/v1/copilot', copilotRoutes);
  return app;
}

export async function createServer() {
  const app = await createApp();
  const server = http.createServer(app);
  return { app, server };
}
