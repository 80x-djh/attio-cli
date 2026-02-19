import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerLists } from '../src/commands/lists.ts';
import { createProgram, installFetchMock, runCli, assertCalledPath } from './cli-test-helpers.ts';

test('lists create sends POST /lists with correct body', async () => {
  const program = createProgram([registerLists]);
  const mock = installFetchMock(async () => ({
    body: {
      data: {
        id: { list_id: 'list_abc123' },
        api_slug: 'enterprise_sales',
        name: 'Enterprise Sales',
        parent_object: 'companies',
        workspace_access: 'full-access',
        workspace_member_access: [],
        created_by_actor: { type: 'workspace-member', id: 'mem_1' },
      },
    },
  }));

  try {
    await runCli(program, [
      'lists', 'create',
      '--name', 'Enterprise Sales',
      '--parent-object', 'companies',
    ]);

    const call = mock.calls.find((c) => c.method === 'POST' && c.url.includes('/lists'));
    assert.ok(call, 'Expected POST /lists call');
    assert.equal(call.body?.data?.name, 'Enterprise Sales');
    assert.equal(call.body?.data?.parent_object, 'companies');
    assert.equal(call.body?.data?.api_slug, 'enterprise_sales');
    assert.equal(call.body?.data?.workspace_access, 'full-access');
    assert.deepEqual(call.body?.data?.workspace_member_access, []);
  } finally {
    mock.restore();
  }
});

test('lists create uses explicit --api-slug when provided', async () => {
  const program = createProgram([registerLists]);
  const mock = installFetchMock(async () => ({
    body: {
      data: {
        id: { list_id: 'list_abc123' },
        api_slug: 'my_custom_slug',
        name: 'Enterprise Sales',
        parent_object: 'people',
        workspace_access: 'read-only',
        workspace_member_access: [],
      },
    },
  }));

  try {
    await runCli(program, [
      'lists', 'create',
      '--name', 'Enterprise Sales',
      '--parent-object', 'people',
      '--api-slug', 'my_custom_slug',
      '--workspace-access', 'read-only',
    ]);

    const call = mock.calls.find((c) => c.method === 'POST' && c.url.includes('/lists'));
    assert.ok(call, 'Expected POST /lists call');
    assert.equal(call.body?.data?.api_slug, 'my_custom_slug');
    assert.equal(call.body?.data?.workspace_access, 'read-only');
  } finally {
    mock.restore();
  }
});

test('lists create with --member-access parses member-id:level', async () => {
  const program = createProgram([registerLists]);
  const mock = installFetchMock(async () => ({
    body: {
      data: {
        id: { list_id: 'list_abc123' },
        api_slug: 'test_list',
        name: 'Test List',
        parent_object: 'companies',
        workspace_access: 'full-access',
        workspace_member_access: [
          { workspace_member_id: 'mem_1', level: 'read-and-write' },
        ],
      },
    },
  }));

  try {
    await runCli(program, [
      'lists', 'create',
      '--name', 'Test List',
      '--parent-object', 'companies',
      '--member-access', 'mem_1:read-and-write',
    ]);

    const call = mock.calls.find((c) => c.method === 'POST' && c.url.includes('/lists'));
    assert.ok(call, 'Expected POST /lists call');
    assert.deepEqual(call.body?.data?.workspace_member_access, [
      { workspace_member_id: 'mem_1', level: 'read-and-write' },
    ]);
  } finally {
    mock.restore();
  }
});

test('lists list sends GET /lists', async () => {
  const program = createProgram([registerLists]);
  const mock = installFetchMock(async () => ({
    body: {
      data: [
        {
          id: { list_id: 'list_1' },
          api_slug: 'sales',
          name: 'Sales',
          parent_object: 'companies',
        },
      ],
    },
  }));

  try {
    await runCli(program, ['lists', 'list']);
    assertCalledPath(mock.calls, '/lists', 'GET');
  } finally {
    mock.restore();
  }
});
