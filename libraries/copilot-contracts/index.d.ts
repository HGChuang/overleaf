export interface PatchHunk { oldText: string; newText: string; line?: number | null }
export function applyHunks(content: string, hunks: PatchHunk[]): string;
export function compileOutcome(result: unknown): 'passed' | 'failed' | 'unavailable';
