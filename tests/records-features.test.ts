import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerRecords } from '../src/commands/records.ts';
import { register as registerEntries } from '../src/commands/entries.ts';
import { assertCalledPath, createProgram, installFetchMock, runCli } from './cli-test-helpers.ts';

test('records assert uses matching_attribute query and PUT', async () => {
  const program = createProgram([registerRecords]);
  const mock = installFetchMock(async () => ({ body: { data: { id: { record_id: 'rec_1' } } } }));

  try {
    await runCli(program, [
      'records',
      'assert',
      'people',
      '--match',
      'email_addresses',
      '--set',
      'email_addresses=[{"email_address":"ada@example.com"}]',
    ]);

    assertCalledPath(mock.calls, '/objects/people/records?matching_attribute=email_addresses', 'PUT');
  } finally {
    mock.restore();
  }
});

test('records search supports cross-object scope', async () => {
  const program = createProgram([registerRecords]);
  const mock = installFetchMock(async (_url, _method, _body) => ({ body: { data: [] } }));

  try {
    await runCli(program, [
      'records',
      'search',
      'acme',
      '--object',
      'people',
      '--object',
      'companies',
      '--limit',
      '5',
    ]);

    const call = mock.calls.find((entry) => entry.url.includes('/objects/records/search'));
    assert.ok(call);
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.body?.objects, ['people', 'companies']);
    assert.equal(call.body?.query, 'acme');
    assert.equal(call.body?.limit, 5);
  } finally {
    mock.restore();
  }
});

test('records values calls attribute values endpoint with historic flag', async () => {
  const program = createProgram([registerRecords]);
  const mock = installFetchMock(async () => ({
    body: {
      data: [
        {
          attribute_type: 'text',
          value: 'Acme',
          active_from: '2024-01-01T00:00:00.000000000Z',
          active_until: null,
          created_by_actor: { type: 'workspace-member', id: 'wm_1' },
        },
      ],
    },
  }));

  try {
    await runCli(program, ['records', 'values', 'companies', 'rec_1', '--attribute', 'name']);

    assertCalledPath(
      mock.calls,
      '/objects/companies/records/rec_1/attributes/name/values?show_historic=true',
      'GET',
    );
  } finally {
    mock.restore();
  }
});

test('records entries calls record entries endpoint', async () => {
  const program = createProgram([registerRecords]);
  const mock = installFetchMock(async () => ({ body: { data: [] } }));

  try {
    await runCli(program, ['records', 'entries', 'companies', 'rec_1']);
    assertCalledPath(mock.calls, '/objects/companies/records/rec_1/entries?limit=25&offset=0', 'GET');
  } finally {
    mock.restore();
  }
});

test('entries assert uses PUT /lists/{list}/entries', async () => {
  const program = createProgram([registerEntries]);
  const mock = installFetchMock(async () => ({ body: { data: { id: { entry_id: 'ent_1' } } } }));

  try {
    await runCli(program, [
      'entries',
      'assert',
      'pipeline',
      '--record',
      'rec_1',
      '--object',
      'people',
      '--set',
      'stage=qualified',
    ]);

    const call = mock.calls.find((entry) => entry.url.includes('/lists/pipeline/entries'));
    assert.ok(call);
    assert.equal(call.method, 'PUT');
    assert.equal(call.body?.data?.parent_record_id, 'rec_1');
    assert.equal(call.body?.data?.parent_object, 'people');
    assert.equal(call.body?.data?.entry_values?.stage, 'qualified');
  } finally {
    mock.restore();
  }
});
