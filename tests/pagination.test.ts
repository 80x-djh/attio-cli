import assert from 'node:assert/strict';
import test from 'node:test';
import { paginate } from '../src/pagination.ts';

test('paginate respects starting offset in --all mode', async () => {
  const offsets: number[] = [];

  await paginate(
    async (_limit, offset) => {
      offsets.push(offset);
      return [1, 2];
    },
    { limit: 25, offset: 40, all: true },
  );

  assert.deepEqual(offsets, [40]);
});
