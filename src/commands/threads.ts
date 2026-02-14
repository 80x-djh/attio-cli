import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, type OutputFormat } from '../output.js';

function flattenThread(thread: any): Record<string, string | number> {
  return {
    id: thread.id?.thread_id || thread.thread_id || '',
    object: thread.record?.object || '',
    record_id: thread.record?.record_id || '',
    list: thread.entry?.list || '',
    entry_id: thread.entry?.entry_id || '',
    comments: Array.isArray(thread.comments) ? thread.comments.length : 0,
    created_at: thread.created_at || '',
  };
}

export function register(program: Command): void {
  const cmd = program
    .command('threads')
    .description('Manage comment threads');

  cmd
    .command('list')
    .description('List comment threads')
    .option('--object <object>', 'Filter by object slug/ID (requires --record)')
    .option('--record <record-id>', 'Filter by parent record ID (requires --object)')
    .option('--list <list>', 'Filter by list slug/ID (requires --entry)')
    .option('--entry <entry-id>', 'Filter by entry ID (requires --list)')
    .option('--limit <n>', 'Maximum threads to return', '25')
    .option('--offset <n>', 'Number of threads to skip', '0')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      if ((opts.object && !opts.record) || (!opts.object && opts.record)) {
        throw new Error('--object and --record must be provided together.');
      }
      if ((opts.list && !opts.entry) || (!opts.list && opts.entry)) {
        throw new Error('--list and --entry must be provided together.');
      }

      const params = new URLSearchParams();
      params.set('limit', String(Number(opts.limit) || 25));
      params.set('offset', String(Number(opts.offset) || 0));
      if (opts.object) params.set('object', opts.object);
      if (opts.record) params.set('record_id', opts.record);
      if (opts.list) params.set('list', opts.list);
      if (opts.entry) params.set('entry_id', opts.entry);

      const res = await client.get<{ data: any[] }>(`/threads?${params.toString()}`);
      const threads = res.data;

      if (format === 'quiet') {
        for (const thread of threads) {
          console.log(thread.id?.thread_id || thread.thread_id || '');
        }
        return;
      }

      if (format === 'json') {
        outputList(threads, { format, idField: 'id' });
        return;
      }

      outputList(threads.map(flattenThread), {
        format,
        columns: ['id', 'object', 'record_id', 'list', 'entry_id', 'comments', 'created_at'],
        idField: 'id',
      });
    });

  cmd
    .command('get <id>')
    .description('Get a thread by ID')
    .action(async (id: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(`/threads/${encodeURIComponent(id)}`);
      const thread = res.data;

      if (format === 'json') {
        outputSingle(thread, { format, idField: 'id' });
        return;
      }

      outputSingle(flattenThread(thread), { format, idField: 'id' });
    });
}
