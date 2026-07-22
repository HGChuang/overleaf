export class CopilotError extends Error {
  code: string;
  status: number;
  details: unknown;
  declare cause: unknown;

  constructor(
    code: string,
    message: string,
    status = 500,
    options: { details?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'CopilotError';
    this.code = code || 'COPILOT_UPSTREAM_ERROR';
    this.status = status;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function asCopilotError(
  error: unknown,
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

export function badRequest(message: string, code = 'COPILOT_BAD_REQUEST') {
  return new CopilotError(code, message, 400);
}

export function notFound(message: string, code = 'COPILOT_NOT_FOUND') {
  return new CopilotError(code, message, 404);
}

export function forbidden(message: string, code = 'COPILOT_FORBIDDEN') {
  return new CopilotError(code, message, 403);
}

export function unauthorized(message: string, code = 'COPILOT_UNAUTHORIZED') {
  return new CopilotError(code, message, 401);
}

export function payloadTooLarge(message: string, code = 'COPILOT_CONTEXT_TOO_LARGE') {
  return new CopilotError(code, message, 413);
}

export function unsupported(message: string, code = 'COPILOT_UNSUPPORTED_ACTION') {
  return new CopilotError(code, message, 422);
}

export function timeout(message: string, code = 'COPILOT_TIMEOUT') {
  return new CopilotError(code, message, 504);
}
