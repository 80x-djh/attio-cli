import chalk from 'chalk';
import { resolveApiKey } from './config.js';
import { AttioApiError, AttioAuthError, AttioRateLimitError } from './errors.js';

const BASE_URL = 'https://api.attio.com/v2';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

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
      const response = await fetch(url, init);

      if (this.debug) {
        console.error(chalk.dim(`← ${response.status}`));
      }

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
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
