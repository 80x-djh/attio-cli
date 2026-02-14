import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, confirm, type OutputFormat } from '../output.js';

export function register(program: Command): void {
  const comments = program
    .command('comments')
    .description('Manage comments on records');

  // --- list ---
  comments
    .command('list')
    .description('List comment threads on a record')
    .requiredOption('--object <obj>', 'Object slug (required)')
    .requiredOption('--record <id>', 'Record ID (required)')
    .option('--limit <n>', 'Maximum threads to return', '25')
    .option('--offset <n>', 'Number of threads to skip', '0')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const params = new URLSearchParams();
      params.set('object', opts.object);
      params.set('record_id', opts.record);
      if (opts.limit) params.set('limit', String(opts.limit));
      if (opts.offset) params.set('offset', String(opts.offset));

      const res = await client.get<{ data: any[] }>(`/threads?${params.toString()}`);
      const threads = res.data;

      if (format === 'quiet') {
        for (const thread of threads) {
          console.log(thread.id?.thread_id || thread.thread_id || '');
        }
        return;
      }

      if (format === 'json') {
        outputList(threads, { format });
        return;
      }

      // Flatten threads into individual comments for table/csv display
      const flat: Record<string, any>[] = [];
      for (const thread of threads) {
        const threadId = thread.id?.thread_id || thread.thread_id || '';
        if (thread.comments && Array.isArray(thread.comments)) {
          for (const c of thread.comments) {
            flat.push({
              thread_id: threadId,
              author: c.author?.id || c.author?.name || '',
              content: truncate(c.content_plaintext || c.content || '', 60),
              created_at: c.created_at || '',
            });
          }
        } else {
          flat.push({
            thread_id: threadId,
            author: thread.created_by_actor?.id || '',
            content: '',
            created_at: thread.created_at || '',
          });
        }
      }

      outputList(flat, {
        format,
        columns: ['thread_id', 'author', 'content', 'created_at'],
        idField: 'thread_id',
      });
    });

  // --- create ---
  comments
    .command('create')
    .description('Create a comment on a record')
    .requiredOption('--object <obj>', 'Object slug (required)')
    .requiredOption('--record <id>', 'Record ID (required)')
    .requiredOption('--content <text>', 'Comment content (required)')
    .option('--thread <thread-id>', 'Thread ID to reply to (creates new thread if omitted)')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      // Fetch current user's member ID for the author field
      // /v2/self returns a flat token-info object (no {data} wrapper)
      const selfRes = await client.get<Record<string, any>>('/self');
      const memberId = selfRes.authorized_by_workspace_member_id || '';

      const body: Record<string, any> = {
        format: 'plaintext',
        content: opts.content,
        author: {
          type: 'workspace-member',
          id: memberId,
        },
      };

      if (opts.thread) {
        body.thread_id = opts.thread;
      } else {
        body.record = {
          object: opts.object,
          record_id: opts.record,
        };
      }

      const res = await client.post<{ data: any }>('/comments', { data: body });
      outputSingle(res.data, { format, idField: 'id' });
    });

  // --- delete ---
  comments
    .command('delete <comment-id>')
    .description('Delete a comment')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (commentId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();

      if (!opts.yes) {
        const ok = await confirm(`Delete comment ${commentId}?`);
        if (!ok) {
          console.error('Aborted.');
          return;
        }
      }

      const client = new AttioClient(opts.apiKey, opts.debug);
      await client.delete(`/comments/${encodeURIComponent(commentId)}`);
      console.error('Deleted.');
    });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}
