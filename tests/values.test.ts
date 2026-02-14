import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSets } from '../src/values.ts';

test('parseSets supports empty array shorthand', () => {
  assert.deepEqual(parseSets(['tags=[]']), { tags: [] });
});

test('parseSets supports JSON array values', () => {
  assert.deepEqual(parseSets(['domains=["acme.com","example.com"]']), {
    domains: ['acme.com', 'example.com'],
  });
});

test('parseSets supports shorthand arrays', () => {
  assert.deepEqual(parseSets(['tags=[alpha,2,true]']), {
    tags: ['alpha', 2, true],
  });
});
