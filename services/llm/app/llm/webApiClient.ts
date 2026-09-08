// Minimal HTTP client for the web service's private (service-to-service)
// API. Currently used by the compile_project agent tool to trigger a fresh
// compile and fetch structured errors — the "verifier" half of the Copilot
// self-healing loop.
//
// Auth: HTTP Basic against Settings.httpAuthUsers on the web side
// (requirePrivateApiAuth). Credentials come from WEB_API_USER /
// WEB_API_PASSWORD env (dev.env: overleaf/overleaf); the endpoint 401s
// without them.

import settings from '@overleaf/settings';
import axios, { AxiosInstance } from 'axios';
import { forbidden } from '../utils/errors.js';
import { ToolOutcomeUnknownError } from '../agent/core/tool-error.js';

function remoteOperationError(operation: string, error: unknown): unknown {
  if (axios.isAxiosError(error) && (!error.response || error.response.status >= 500)) {
    return new ToolOutcomeUnknownError(
      `${operation} outcome unknown after a transport/server failure (${error.message}). Verify backend state before retrying; this is not evidence of failure.`, error);
  }
  return error;
}

export interface CompileErrorEntry {
  file: string | null;
  line: number | null;
  message: string;
}

export interface CompileProjectResult {
  status: string;
  /** null when the compile produced no parseable log (infra unavailable etc.). */
  errorCount: number | null;
  errors: CompileErrorEntry[];
  warningCount: number | null;
  note?: string;
  snapshotId?: string;
  patchId?: string;
  candidateHash?: string;
  buildId?: string;
  logComplete?: boolean;
}

export class WebApiClient {
  client: AxiosInstance;

  constructor({
    baseURL = settings.WEB_API_BASE_URL,
    username = settings.WEB_API_USER,
    password = settings.WEB_API_PASSWORD,
    timeoutMs = Number(settings.COMPILE_TOOL_TIMEOUT_MS || 150_000),
  }: {
    baseURL?: string;
    username?: string;
    password?: string;
    timeoutMs?: number;
  } = {}) {
    this.client = axios.create({
      baseURL,
      timeout: timeoutMs,
      ...(username && password ? { auth: { username, password } } : {}),
    });
  }

  async compileProject(projectId: string, userId?: string, snapshotId?: string, idempotencyKey?: string, patchId?: string, signal?: AbortSignal): Promise<CompileProjectResult> {
    signal?.throwIfAborted();
    try {
      const response = await this.client.post(
        `/internal/project/${encodeURIComponent(projectId)}/copilot/compile`, { userId, snapshotId, idempotencyKey, patchId }, { signal }
      );
      return response.data as CompileProjectResult;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409 && error.response.data) {
        return error.response.data as CompileProjectResult;
      }
      throw remoteOperationError('Compile', error);
    }
  }

  async proposePatch(projectId: string, payload: unknown, signal?: AbortSignal): Promise<any> {
    signal?.throwIfAborted();
    try {
      return (await this.client.post(`/internal/project/${encodeURIComponent(projectId)}/copilot/patch`, payload, { signal })).data;
    } catch (error) { throw remoteOperationError('Patch proposal', error); }
  }

  async listPatches(userId: string, projectId: string, conversationId: string, signal?: AbortSignal) {
    return (await this.client.get(`/internal/project/${encodeURIComponent(projectId)}/copilot/patches/user/${encodeURIComponent(userId)}`,
      { params: { conversationId }, signal, timeout: 10_000 })).data;
  }

  async readSnapshot(userId: string, projectId: string, snapshotId: string, path?: string, signal?: AbortSignal): Promise<any> {
    const response = await this.client.get(
      `/internal/project/${encodeURIComponent(projectId)}/copilot/snapshot/${encodeURIComponent(snapshotId)}/user/${encodeURIComponent(userId)}`,
      { params: path === undefined ? {} : { path }, signal, timeout: 30_000 }
    );
    return response.data;
  }

  async assertSnapshotCurrent(userId: string, projectId: string, snapshotId: string, signal?: AbortSignal) {
    const response = await this.client.get(
      `/internal/project/${encodeURIComponent(projectId)}/copilot/snapshot/${encodeURIComponent(snapshotId)}/user/${encodeURIComponent(userId)}`,
      { params: { current: '1' }, signal, timeout: 30_000 }
    );
    if (response.data?.current !== true) throw Object.assign(new Error('The paper changed while Copilot was working. Progress was saved; retry on the current version.'),
      { code: 'COPILOT_SOURCE_CHANGED', status: 409 });
  }

  async assertProjectAccess(userId: string, projectId: string, signal?: AbortSignal): Promise<void> {
    const response = await this.client.get(
      `/internal/project/${encodeURIComponent(projectId)}/copilot/access/${encodeURIComponent(userId)}`,
      { signal, timeout: 10_000 }
    );
    if (response.data?.allowed !== true) throw forbidden('project access denied');
  }
}
