import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerThreads } from '../src/commands/threads.ts';
import { createProgram, installFetchMock, runCli } from './cli-test-helpers.ts';

test('threads list supports object+record filtering', async () => {
  const program = createProgram([registerThreads]);
  const mock = installFetchMock(async () => ({ body: { data: [] } }));

  try {
    await runCli(program, [
      'threads',
      'list',
      '--object',
      'companies',
      '--record',
      'rec_1',
      '--limit',
      '10',
      '--offset',
      '5',
    ]);

    const call = mock.calls.find((entry) => entry.url.includes('/threads?'));
    assert.ok(call);
    assert.ok(call.url.includes('object=companies'));
    assert.ok(call.url.includes('record_id=rec_1'));
    assert.ok(call.url.includes('limit=10'));
    assert.ok(call.url.includes('offset=5'));
  } finally {
    mock.restore();
  }
});

test('threads get calls /threads/{thread_id}', async () => {
  const program = createProgram([registerThreads]);
  const mock = installFetchMock(async () => ({ body: { data: { id: { thread_id: 'thread_1' } } } }));

  try {
    await runCli(program, ['threads', 'get', 'thread_1']);

    const call = mock.calls.find((entry) => entry.url.includes('/threads/thread_1'));
    assert.ok(call);
    assert.equal(call.method, 'GET');
  } finally {
    mock.restore();
  }
});
