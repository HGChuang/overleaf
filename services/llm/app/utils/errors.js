export class CopilotError extends Error {
  constructor(code, message, status = 500, options = {}) {
    super(message);
    this.name = 'CopilotError';
    this.code = code || 'COPILOT_UPSTREAM_ERROR';
    this.status = status;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function asCopilotError(
  error,
  {
    fallbackCode = 'COPILOT_UPSTREAM_ERROR',
    fallbackStatus = 500,
    fallbackMessage = 'Unexpected Copilot error',
  } = {}
) {
  if (error instanceof CopilotError) {
    return error;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return new CopilotError(fallbackCode, message || fallbackMessage, fallbackStatus, {
    cause: error,
  });
}

export function badRequest(message, code = 'COPILOT_BAD_REQUEST') {
  return new CopilotError(code, message, 400);
}

export function notFound(message, code = 'COPILOT_NOT_FOUND') {
  return new CopilotError(code, message, 404);
}

export function forbidden(message, code = 'COPILOT_FORBIDDEN') {
  return new CopilotError(code, message, 403);
}

export function unauthorized(message, code = 'COPILOT_UNAUTHORIZED') {
  return new CopilotError(code, message, 401);
}

export function payloadTooLarge(message, code = 'COPILOT_CONTEXT_TOO_LARGE') {
  return new CopilotError(code, message, 413);
}

export function unsupported(message, code = 'COPILOT_UNSUPPORTED_ACTION') {
  return new CopilotError(code, message, 422);
}

export function timeout(message, code = 'COPILOT_TIMEOUT') {
  return new CopilotError(code, message, 504);
}
