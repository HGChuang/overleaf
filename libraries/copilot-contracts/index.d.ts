export interface PatchHunk { oldText: string; newText: string; line?: number | null }
export function applyHunks(content: string, hunks: PatchHunk[]): string;
/** Snapshot-relative replacement lines; validated insertion slots retain their semantics. */
export function normalizeHunks<T extends PatchHunk>(content: string, hunks: T[]): Array<T & { line: number }>;
export function compileOutcome(result: unknown): 'passed' | 'failed' | 'unavailable';
