import type { ChildProcess } from "node:child_process";

export interface ChildExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut?: boolean;
}

export const DEFAULT_EVAL_TRIAL_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_EVAL_USER_BRIDGE_TIMEOUT_MS = 120 * 1000;

function timeoutFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function evalTrialTimeoutMs() {
  return timeoutFromEnv("EVAL_TRIAL_TIMEOUT_MS", DEFAULT_EVAL_TRIAL_TIMEOUT_MS);
}

export function evalUserBridgeTimeoutMs() {
  return timeoutFromEnv(
    "EVAL_USER_BRIDGE_TIMEOUT_MS",
    DEFAULT_EVAL_USER_BRIDGE_TIMEOUT_MS,
  );
}

export function waitForChild(
  child: ChildProcess,
  timeoutMs = evalTrialTimeoutMs(),
): Promise<ChildExit> {
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (exit: ChildExit) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve(exit);
    };
    child.once("exit", (code, signal) => finish({ code, signal }));
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      // If the process ignores both signals, let the scheduler return a
      // structured infrastructure result rather than hanging forever.
      setTimeout(
        () => finish({ code: null, signal: "SIGTERM", timedOut: true }),
        5500,
      );
    }, timeoutMs);
  });
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new Error(`operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
