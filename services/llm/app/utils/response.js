import { randomUUID } from 'crypto';
import { asCopilotError } from './errors.js';

export function getRequestId(req) {
  return req?.headers?.['x-request-id'] || randomUUID();
}

export function ok(data, meta = {}) {
  return {
    success: true,
    data,
    meta,
  };
}

export function fail(error, meta = {}) {
  const normalized = asCopilotError(error);
  return {
    status: normalized.status,
    body: {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
      meta,
    },
  };
}
