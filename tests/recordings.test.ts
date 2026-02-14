import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerRecordings } from '../src/commands/recordings.ts';
import { createProgram, installFetchMock, runCli } from './cli-test-helpers.ts';

test('recordings list calls meeting call recordings endpoint', async () => {
  const program = createProgram([registerRecordings]);
  const mock = installFetchMock(async () => ({ body: { data: [], pagination: { next_cursor: null } } }));

  try {
    await runCli(program, ['recordings', 'list', '--meeting', 'meeting_1']);

    const call = mock.calls.find((entry) => entry.url.includes('/meetings/meeting_1/call_recordings?'));
    assert.ok(call);
    assert.equal(call.method, 'GET');
  } finally {
    mock.restore();
  }
});

test('recordings get with --transcript fetches transcript endpoint', async () => {
  const program = createProgram([registerRecordings]);
  const mock = installFetchMock(async (url) => {
    if (url.includes('/transcript')) {
      return {
        body: {
          data: {
            id: { call_recording_id: 'cr_1' },
            transcript: [{ speech: 'Hello world', start_time: 0, end_time: 1 }],
          },
          pagination: { next_cursor: null },
        },
      };
    }

    return {
      body: {
        data: {
          id: { meeting_id: 'meeting_1', call_recording_id: 'cr_1' },
          status: 'completed',
        },
      },
    };
  });

  try {
    await runCli(program, ['recordings', 'get', 'cr_1', '--meeting', 'meeting_1', '--transcript']);

    const getCall = mock.calls.find((entry) => entry.url.includes('/meetings/meeting_1/call_recordings/cr_1'));
    assert.ok(getCall);

    const transcriptCall = mock.calls.find((entry) => entry.url.includes('/meetings/meeting_1/call_recordings/cr_1/transcript'));
    assert.ok(transcriptCall);
    assert.equal(transcriptCall.method, 'GET');
  } finally {
    mock.restore();
  }
});
