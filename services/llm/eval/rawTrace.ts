// Raw trace recorder: FULL-FIDELITY per-tool-call capture for eval runs.
//
// The onEvent SSE tap (copilot.service.ts) is a TRUNCATED preview (6 keys /
// 160 chars per value / 500-char one-line result) — good enough for tool-call
// tallies, useless for trajectory forensics (a submit_patch hunk pair can be
// tens of KB). The only clean capture point for full args+results is wrapping
// each tool's execute() at the toolPoolFactory seam (the pool is rebuilt per
// chat() call, so the wrapper naturally aligns events to agent turns).
//
// Semantics:
//   seq      — CALL order (execute() entry). Parallel tool batches start in
//              call order but settle in completion order...
//   endSeq   — COMPLETION order (execute() settle). A1: the two orders differ
//              whenever tools run concurrently; both are recorded so graders
//              can pick the causality they need.
//   isError  — execute() threw OR result.details.dryRunRejected === true
//              (the terminating dry-run rejection returns isError=false at the
//              loop level but IS a failure signal — F4).
//   errorText— first 300 chars of the thrown error's message.
//   resultText — concatenated text content blocks, truncated at 16000 chars;
//              resultChars always holds the ORIGINAL length.
//   argsKey  — stableStringify(args): key-order-insensitive fingerprint (F5).
//
// The recorder is pure in-memory; persistence ({version:1, taskId, events,
// nodeGrade?}) is the caller's job (cli.ts traces/, dialogueDriver
// raw-trace.json). SECURITY: same privacy class as transcripts — tool
// args/results carry document text, never credentials; files stay local
// under results/ (gitignored).

import { stableStringify } from './graders/traceGrader.js';
import type { AgentTool, AgentToolResult } from '../app/agent/core/types.js';

export const RESULT_TEXT_MAX = 16000;
export const ERROR_TEXT_MAX = 300;

export interface RawToolEvent {
  seq: number;
  endSeq: number;
  turn: number;
  ts: number;
  durationMs: number;
  toolCallId: string;
  name: string;
  args: any;
  argsKey: string;
  ok: boolean;
  isError: boolean;
  errorText?: string;
  resultText: string;
  resultChars: number;
  details?: any;
}

export class RawTraceRecorder {
  private _events: RawToolEvent[] = [];
  private seqCounter = 0;
  private endSeqCounter = 0;
  // Current agent turn. The wrapping toolPoolFactory calls beginTurn() once
  // per pool build; chat() rebuilds the pool per turn, so this tracks turns.
  turn = 0;

  beginTurn(): void {
    this.turn++;
  }

  events(): RawToolEvent[] {
    return this._events;
  }

  // execute() entry: assign the call-order seq and record the start snapshot.
  // Returns the mutable event; finish() completes it in place.
  start(turn: number, toolCallId: string, name: string, args: any): RawToolEvent {
    const evt: RawToolEvent = {
      seq: this.seqCounter++,
      endSeq: -1,
      turn,
      ts: Date.now(),
      durationMs: 0,
      toolCallId,
      name,
      args: args ?? {},
      argsKey: stableStringify(args ?? null),
      ok: false,
      isError: false,
      resultText: '',
      resultChars: 0,
    };
    this._events.push(evt);
    return evt;
  }

  // execute() settle: exactly one of result/error. endSeq stamps completion
  // order — assigned HERE, not in start().
  finish(evt: RawToolEvent, startedAt: number, result: AgentToolResult<any> | null, error: any): void {
    evt.endSeq = this.endSeqCounter++;
    evt.durationMs = Date.now() - startedAt;
    if (error !== null && error !== undefined) {
      evt.isError = true;
      evt.errorText = String(error?.message || error || 'unknown').slice(0, ERROR_TEXT_MAX);
      return;
    }
    const text = (result?.content || [])
      .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
      .map((c: any) => c.text)
      .join('\n');
    evt.resultChars = text.length;
    evt.resultText = text.length > RESULT_TEXT_MAX ? text.slice(0, RESULT_TEXT_MAX) : text;
    if (result?.details && Object.keys(result.details).length > 0) {
      evt.details = result.details;
    }
    // F4: the terminating dry-run rejection is a NORMAL result carrying
    // details.dryRunRejected — the capture layer must treat it as an error.
    evt.isError = result?.details?.dryRunRejected === true;
    evt.ok = !evt.isError;
  }
}

// Closure-wrap one tool's execute() with start/finish recording. turnRef pins
// the turn number captured when THIS pool was built (the factory increments
// the recorder per build), so events stay turn-aligned even if pools overlap.
export function wrapTool(
  tool: AgentTool<any, any>,
  recorder: RawTraceRecorder,
  turnRef: { current: number }
): AgentTool<any, any> {
  return {
    ...tool,
    async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any) {
      const evt = recorder.start(turnRef.current, toolCallId, tool.name, params);
      const startedAt = Date.now();
      try {
        const result = await tool.execute(toolCallId, params, signal, onUpdate);
        recorder.finish(evt, startedAt, result, null);
        return result;
      } catch (err: any) {
        // Record, then rethrow UNCHANGED — the agent loop's own error path
        // (isError tool result for the model) must see the original error.
        recorder.finish(evt, startedAt, null, err);
        throw err;
      }
    },
  };
}

// On-disk shape for traces/<taskId>.t<N>.json and dialogue raw-trace.json.
export function serializeRawTrace({
  taskId,
  trialIndex,
  events,
  nodeGrade,
}: {
  taskId: string;
  trialIndex?: number;
  events: RawToolEvent[];
  nodeGrade?: any;
}): Record<string, any> {
  return {
    version: 1,
    taskId,
    ...(trialIndex !== undefined ? { trialIndex } : {}),
    events,
    ...(nodeGrade ? { nodeGrade } : {}),
  };
}
