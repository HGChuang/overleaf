import { badRequest } from '../utils/errors.js';
import { inputBudget } from '../agent/context/budget.js';

export interface ModelLimits { contextWindow: number; maxTokens: number }

export function validateModelLimits(value: unknown): ModelLimits {
  const limits = value as ModelLimits | null;
  if (!limits || !Number.isSafeInteger(limits.contextWindow) || !Number.isSafeInteger(limits.maxTokens) ||
      limits.contextWindow <= 0 || limits.maxTokens <= 0) {
    throw badRequest('Context window and output token limit must be positive integers.');
  }
  try { inputBudget(limits.contextWindow, limits.maxTokens); }
  catch { throw badRequest('Context window must exceed the output limit plus safety reserve (at least 2048 tokens or 5% of the window).'); }
  return { contextWindow: limits.contextWindow, maxTokens: limits.maxTokens };
}
