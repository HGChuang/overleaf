/** A dispatched operation may have succeeded remotely despite a lost reply. */
export class ToolOutcomeUnknownError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ToolOutcomeUnknownError';
  }
}
