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

  async compileProject(projectId: string): Promise<CompileProjectResult> {
    const response = await this.client.post(
      `/internal/project/${encodeURIComponent(projectId)}/copilot/compile`
    );
    return response.data as CompileProjectResult;
  }
}
