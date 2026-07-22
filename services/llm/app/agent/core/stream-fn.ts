/**
 * Vendored from @earendil-works/pi-agent-core (MIT License, Copyright (c) 2025 Mario Zechner)
 * — src/stream-fn.ts, unchanged except for the import path.
 */

import type { StreamFn } from "./types.js";

let defaultStreamFn: StreamFn | undefined;

/**
 * Configure the fallback used by Agent and low-level loops when callers omit streamFn.
 */
export function setDefaultStreamFn(streamFn: StreamFn | undefined): void {
	defaultStreamFn = streamFn;
}

export function getDefaultStreamFn(): StreamFn {
	if (!defaultStreamFn) {
		throw new Error("No default stream function configured. Pass streamFn explicitly or call setDefaultStreamFn().");
	}
	return defaultStreamFn;
}
