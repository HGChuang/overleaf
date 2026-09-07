import { CopilotError } from '../../utils/errors.js';
import type { AgentMessage } from '../core/types.js';

export interface ContextScope {
  userId: string;
  projectId: string;
  conversationId: string;
  source: 'panel';
}

export interface PaperCheckpoint {
  version: 1;
  // Requests are exact author text, never recursively paraphrased by a model.
  authorRequests: Array<{ message: number; text: string; context?: unknown }>;
  projectBase?: unknown;
  activePlan?: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }>;
  patches: Array<{ patchId: string; snapshotId: string; status: string; candidateVerification?: unknown;
    hunks: Array<{ index: number; status: string; baselineHash?: string; receipt?: unknown }> }>;
  verifications: Array<{ kind: string; snapshotId?: string; patchId?: string; candidateHash?: string; status: string; resultMessage: number }>;
  observations: Array<{ message: number; quote: string }>;
  pending: string[];
  archivedToolResults?: { throughMessage: number; count: number; hashChain: string };
  toolLedger: Array<{
    callId: string;
    name: string;
    arguments: unknown;
    outcome: 'observed' | 'failed' | 'proposed';
    resultMessage: number;
    source?: {
      path: string;
      sha256: string;
      evidenceId: string;
      startByte: number;
      endByte: number;
      fileBytes: number;
      snapshotId?: string;
      docId?: string;
      version?: number;
      // Relative to projectBase, not a claim that the archived bytes are visible.
      freshness: 'matching' | 'stale' | 'unknown';
    };
  }>;
}

export interface ContextEpoch {
  version: 1;
  generation: number;
  coveredMessages: number;
  coveredHash: string;
  checkpoint: PaperCheckpoint;
  // Store the actual rendered message. Loading an epoch must not re-render it.
  prefix: AgentMessage;
}

export type ContextEvent =
  | { type: 'context_compacting'; reason: 'capacity' | 'provider_limit' | 'economic' | 'manual' }
  | { type: 'context_compacted'; generation: number; beforeTokens: number; afterTokens: number }
  | { type: 'context_degraded'; reason: string }
  | { type: 'context_invalidated'; reason: string };

export class ContextCapacityError extends CopilotError {
  constructor(message = 'The author constraints and active work do not fit the configured model context window.') {
    super('COPILOT_CONTEXT_CAPACITY', message, 413);
  }
}
