import { strict as assert } from 'node:assert';
import { Command } from 'commander';

export interface FetchCall {
  url: string;
  method: string;
  body?: any;
}

export interface MockHttpResponse {
  status?: number;
  body?: any;
  headers?: Record<string, string>;
}

export function createProgram(registerFns: Array<(program: Command) => void>): Command {
  const program = new Command();
  program
    .name('attio')
    .exitOverride()
    .option('--api-key <key>', 'Override API key')
    .option('--json', 'Force JSON output')
    .option('--table', 'Force table output')
    .option('--csv', 'Force CSV output')
    .option('-q, --quiet', 'Only output IDs')
    .option('--debug', 'Enable debug logging');

  for (const register of registerFns) {
    register(program);
  }

  return program;
}

export function installFetchMock(
  responder: (url: string, method: string, body: any) => MockHttpResponse | Promise<MockHttpResponse>,
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string' && init.body.length > 0
      ? JSON.parse(init.body)
      : undefined;

    calls.push({ url, method, body });

    const result = await responder(url, method, body);
    const status = result.status ?? 200;
    const headers = {
      'content-type': 'application/json',
      ...(result.headers ?? {}),
    };

    return new Response(JSON.stringify(result.body ?? {}), { status, headers });
  }) as typeof globalThis.fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

export async function runCli(program: Command, args: string[]): Promise<void> {
  process.env.ATTIO_API_KEY = 'test-api-key';

  const originalLog = console.log;
  const originalError = console.error;

  console.log = () => undefined;
  console.error = () => undefined;

  try {
    await program.parseAsync(['--json', ...args], { from: 'user' });
  } catch (err: any) {
    if (err?.code === 'commander.executeSubCommandAsync') {
      throw err;
    }
    if (err?.code === 'commander.helpDisplayed') {
      throw err;
    }
    if (err?.code === 'commander.version') {
      throw err;
    }
    throw err;
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

export function assertCalledPath(calls: FetchCall[], expectedPath: string, method?: string): void {
  const call = calls.find((entry) => entry.url.includes(expectedPath) && (!method || entry.method === method));
  assert.ok(call, `Expected call for ${method ?? 'ANY'} ${expectedPath}`);
}
