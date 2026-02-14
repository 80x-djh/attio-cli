import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOutputId, outputList, outputSingle } from '../src/output.ts';

function captureConsoleLogs(fn: () => void): string[] {
  const original = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return logs;
}

test('extractOutputId prefers resource IDs over workspace IDs', () => {
  assert.equal(extractOutputId({ workspace_id: 'ws_1', task_id: 'tsk_1' }), 'tsk_1');
  assert.equal(extractOutputId({ workspace_id: 'ws_1', note_id: 'nte_1' }), 'nte_1');
});

test('outputSingle quiet prints nested task_id', () => {
  const logs = captureConsoleLogs(() => {
    outputSingle({ id: { workspace_id: 'ws_1', task_id: 'tsk_1' } }, { format: 'quiet', idField: 'id' });
  });
  assert.deepEqual(logs, ['tsk_1']);
});

test('outputList quiet prints nested note IDs', () => {
  const logs = captureConsoleLogs(() => {
    outputList(
      [
        { id: { workspace_id: 'ws_1', note_id: 'nte_1' } },
        { id: { workspace_id: 'ws_1', note_id: 'nte_2' } },
      ],
      { format: 'quiet', idField: 'id' },
    );
  });
  assert.deepEqual(logs, ['nte_1', 'nte_2']);
});
