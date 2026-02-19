import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerEntries } from '../src/commands/entries.ts';
import { createProgram, installFetchMock, runCli } from './cli-test-helpers.ts';

test('entries create succeeds with empty entry_values', async () => {
  const program = createProgram([registerEntries]);
  const mock = installFetchMock(async () => ({
    body: {
      data: {
        id: { entry_id: 'ent_new' },
        record_id: 'rec_1',
        created_at: '2026-02-19T00:00:00.000Z',
        entry_values: {},
      },
    },
  }));

  try {
    await runCli(program, [
      'entries', 'create', 'my_list',
      '--record', 'rec_1',
      '--object', 'companies',
      '--values', '{}',
    ]);

    const call = mock.calls.find((c) => c.method === 'POST' && c.url.includes('/lists/my_list/entries'));
    assert.ok(call, 'Expected POST /lists/my_list/entries call');
    assert.equal(call.body?.data?.parent_record_id, 'rec_1');
    assert.equal(call.body?.data?.parent_object, 'companies');
    assert.deepEqual(call.body?.data?.entry_values, {});
  } finally {
    mock.restore();
  }
});

test('entries assert succeeds with empty entry_values', async () => {
  const program = createProgram([registerEntries]);
  const mock = installFetchMock(async () => ({
    body: {
      data: {
        id: { entry_id: 'ent_upserted' },
        record_id: 'rec_1',
        created_at: '2026-02-19T00:00:00.000Z',
        entry_values: {},
      },
    },
  }));

  try {
    await runCli(program, [
      'entries', 'assert', 'my_list',
      '--record', 'rec_1',
      '--object', 'companies',
      '--values', '{}',
    ]);

    const call = mock.calls.find((c) => c.method === 'PUT' && c.url.includes('/lists/my_list/entries'));
    assert.ok(call, 'Expected PUT /lists/my_list/entries call');
    assert.equal(call.body?.data?.parent_record_id, 'rec_1');
    assert.equal(call.body?.data?.parent_object, 'companies');
    assert.deepEqual(call.body?.data?.entry_values, {});
  } finally {
    mock.restore();
  }
});

test('entries create still works with --set values', async () => {
  const program = createProgram([registerEntries]);
  const mock = installFetchMock(async () => ({
    body: {
      data: {
        id: { entry_id: 'ent_with_vals' },
        record_id: 'rec_1',
        created_at: '2026-02-19T00:00:00.000Z',
        entry_values: {},
      },
    },
  }));

  try {
    await runCli(program, [
      'entries', 'create', 'pipeline',
      '--record', 'rec_1',
      '--object', 'companies',
      '--set', 'stage=qualified',
    ]);

    const call = mock.calls.find((c) => c.method === 'POST' && c.url.includes('/lists/pipeline/entries'));
    assert.ok(call, 'Expected POST /lists/pipeline/entries call');
    assert.equal(call.body?.data?.entry_values?.stage, 'qualified');
  } finally {
    mock.restore();
  }
});
