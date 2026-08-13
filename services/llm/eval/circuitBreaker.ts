// Provider circuit breaker (F4): K consecutive provider_error records abort
// the whole run — a dead / out-of-balance provider would otherwise burn the
// entire task list into garbage failures that poison the metrics. Completed
// trials' transcripts stay on disk for resumeRun to pick up (only missing
// task×trial pairs re-run).
//
// "Consecutive" is tracked in trial-completion order, shared across workers:
// with a live provider the counter resets on the first non-provider_error
// record; with a dead one the in-flight workers trip it within seconds.
//
// Provider-noise keywords (余额不足|429) seen in tripping details are surfaced
// in the abort message — that is cluster E's signature (provider noise, not
// an agent defect) and must be visible in the run record.

import type { TrialRecord } from './runner.js';

export const CIRCUIT_BREAKER_THRESHOLD = 10;
const PROVIDER_NOISE_PATTERN = /余额不足|429/;

export class CircuitBreaker {
  private consecutive = 0;
  private tripDetail: string | null = null;
  private noiseHit = false;

  record(r: Pick<TrialRecord, 'failureReason' | 'failureDetail'>): void {
    if (this.tripped) return;
    if (r.failureReason === 'provider_error') {
      this.consecutive++;
      if (PROVIDER_NOISE_PATTERN.test(r.failureDetail || '')) this.noiseHit = true;
      if (this.consecutive >= CIRCUIT_BREAKER_THRESHOLD) {
        this.tripDetail = r.failureDetail || 'provider_error';
      }
    } else {
      this.consecutive = 0;
    }
  }

  get tripped(): boolean {
    return this.tripDetail != null;
  }

  abortMessage(): string | null {
    if (!this.tripDetail) return null;
    return (
      `${CIRCUIT_BREAKER_THRESHOLD} consecutive provider_error` +
      (this.noiseHit ? ' (provider-noise keywords matched: 余额不足|429)' : '') +
      ` — last: ${this.tripDetail.slice(0, 200)}`
    );
  }
}
