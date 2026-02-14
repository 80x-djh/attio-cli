import chalk from 'chalk';
import { resolveApiKey } from './config.js';
import { AttioApiError, AttioAuthError, AttioRateLimitError } from './errors.js';

const BASE_URL = 'https://api.attio.com/v2';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (!Number.isNaN(asSeconds)) {
      return Math.max(0, Math.ceil(asSeconds * 1000));
    }

    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) {
      return Math.max(0, asDate - Date.now());
    }
  }

  return INITIAL_BACKOFF_MS * Math.pow(2, attempt);
}

export class AttioClient {
  private apiKey: string;
  private debug: boolean;

  constructor(apiKey?: string, debug?: boolean) {
    this.apiKey = resolveApiKey(apiKey);
    this.debug = debug ?? false;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${BASE_URL}${path}`;

    if (this.debug) {
      console.error(chalk.dim(`→ ${method} ${url}`));
      if (body !== undefined) {
        console.error(chalk.dim(`  body: ${JSON.stringify(body)}`));
      }
    }

    if (!this.apiKey) {
      throw new AttioAuthError('No API key configured');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (err: any) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') {
          throw new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s: ${method} ${path}`);
        }
        throw err;
      }
      clearTimeout(timer);

      if (this.debug) {
        console.error(chalk.dim(`← ${response.status} ${response.statusText}`));
      }

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          const backoff = Math.max(100, getRetryDelayMs(response, attempt));
          if (this.debug) {
            console.error(chalk.dim(`  retrying in ${backoff}ms`));
          }
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
        throw new AttioRateLimitError('Rate limited after 3 retries');
      }

      if (response.status === 401) {
        throw new AttioAuthError('Invalid or expired API key');
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const json = await response.json();

      if (this.debug && !response.ok) {
        console.error(chalk.dim(`  error: ${JSON.stringify(json)}`));
      }

      if (!response.ok) {
        const errorType = json?.type ?? 'unknown_error';
        let errorDetail = json?.message ?? json?.detail ?? response.statusText;
        if (json?.validation_errors?.length) {
          const details = json.validation_errors.map((e: any) =>
            `${e.path?.join('.') || '?'}: ${e.message}`
          ).join('; ');
          errorDetail += ` [${details}]`;
        }
        throw new AttioApiError(response.status, errorType, errorDetail);
      }

      return json as T;
    }

    // Should not reach here, but just in case
    throw new AttioRateLimitError('Rate limited after 3 retries');
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
