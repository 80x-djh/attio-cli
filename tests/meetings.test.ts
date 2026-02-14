import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerMeetings } from '../src/commands/meetings.ts';
import { createProgram, installFetchMock, runCli } from './cli-test-helpers.ts';

test('meetings list supports cursor pagination with --all', async () => {
  const program = createProgram([registerMeetings]);
  const mock = installFetchMock(async (url) => {
    if (url.includes('cursor=cursor_1')) {
      return {
        body: {
          data: [{ id: { meeting_id: 'm_2' }, title: 'Second meeting' }],
          pagination: { next_cursor: null },
        },
      };
    }

    return {
      body: {
        data: [{ id: { meeting_id: 'm_1' }, title: 'First meeting' }],
        pagination: { next_cursor: 'cursor_1' },
      },
    };
  });

  try {
    await runCli(program, [
      'meetings',
      'list',
      '--all',
      '--linked-object',
      'companies',
      '--linked-record-id',
      'rec_1',
    ]);

    const firstCall = mock.calls[0];
    const secondCall = mock.calls[1];
    assert.ok(firstCall.url.includes('/meetings?'));
    assert.ok(firstCall.url.includes('linked_object=companies'));
    assert.ok(firstCall.url.includes('linked_record_id=rec_1'));
    assert.ok(secondCall.url.includes('cursor=cursor_1'));
  } finally {
    mock.restore();
  }
});

test('meetings get calls /meetings/{id}', async () => {
  const program = createProgram([registerMeetings]);
  const mock = installFetchMock(async () => ({ body: { data: { id: { meeting_id: 'm_1' } } } }));

  try {
    await runCli(program, ['meetings', 'get', 'm_1']);
    const call = mock.calls.find((entry) => entry.url.includes('/meetings/m_1'));
    assert.ok(call);
    assert.equal(call.method, 'GET');
  } finally {
    mock.restore();
  }
});
