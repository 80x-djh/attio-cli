import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerWebhooks } from '../src/commands/webhooks.ts';
import { createProgram, installFetchMock, runCli } from './cli-test-helpers.ts';

test('webhooks create maps --event flags to subscriptions', async () => {
  const program = createProgram([registerWebhooks]);
  const mock = installFetchMock(async () => ({ body: { data: { id: { webhook_id: 'wh_1' } } } }));

  try {
    await runCli(program, [
      'webhooks',
      'create',
      '--target-url',
      'https://example.com/webhook',
      '--event',
      'record.created',
      '--event',
      'task.updated',
      '--filter-json',
      '{"$and":[{"field":"parent_object_id","operator":"equals","value":"obj_1"}]}',
    ]);

    const call = mock.calls.find((entry) => entry.url.includes('/webhooks'));
    assert.ok(call);
    assert.equal(call.method, 'POST');
    assert.equal(call.body?.data?.target_url, 'https://example.com/webhook');
    assert.equal(call.body?.data?.subscriptions?.length, 2);
    assert.equal(call.body?.data?.subscriptions?.[0]?.event_type, 'record.created');
    assert.equal(call.body?.data?.subscriptions?.[1]?.event_type, 'task.updated');
  } finally {
    mock.restore();
  }
});

test('webhooks update supports partial target URL update', async () => {
  const program = createProgram([registerWebhooks]);
  const mock = installFetchMock(async () => ({ body: { data: { id: { webhook_id: 'wh_1' } } } }));

  try {
    await runCli(program, [
      'webhooks',
      'update',
      'wh_1',
      '--target-url',
      'https://example.com/new-hook',
    ]);

    const call = mock.calls.find((entry) => entry.url.includes('/webhooks/wh_1'));
    assert.ok(call);
    assert.equal(call.method, 'PATCH');
    assert.deepEqual(call.body, {
      data: {
        target_url: 'https://example.com/new-hook',
      },
    });
  } finally {
    mock.restore();
  }
});
