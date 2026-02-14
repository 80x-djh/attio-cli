import assert from 'node:assert/strict';
import test from 'node:test';
import { register as registerPeople } from '../src/commands/people.ts';
import { register as registerCompanies } from '../src/commands/companies.ts';
import { register as registerDeals } from '../src/commands/deals.ts';
import { register as registerUsers } from '../src/commands/users.ts';
import { register as registerWorkspaces } from '../src/commands/workspaces.ts';
import { createProgram, installFetchMock, runCli } from './cli-test-helpers.ts';

const shortcutCases = [
  { command: 'people', object: 'people', register: registerPeople },
  { command: 'companies', object: 'companies', register: registerCompanies },
  { command: 'deals', object: 'deals', register: registerDeals },
  { command: 'users', object: 'users', register: registerUsers },
  { command: 'workspaces', object: 'workspaces', register: registerWorkspaces },
] as const;

for (const tc of shortcutCases) {
  test(`${tc.command} assert delegates to record assert endpoint`, async () => {
    const program = createProgram([tc.register]);
    const mock = installFetchMock(async () => ({ body: { data: { id: { record_id: 'rec_1' } } } }));

    try {
      await runCli(program, [tc.command, 'assert', '--match', 'name', '--set', 'name=Acme']);

      const call = mock.calls.find((entry) => entry.url.includes(`/objects/${tc.object}/records?matching_attribute=name`));
      assert.ok(call);
      assert.equal(call.method, 'PUT');
      assert.equal(call.body?.data?.values?.name, 'Acme');
    } finally {
      mock.restore();
    }
  });
}
