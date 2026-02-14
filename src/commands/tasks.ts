import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, confirm, type OutputFormat } from '../output.js';

export function register(program: Command): void {
  const tasks = program
    .command('tasks')
    .description('Manage tasks');

  // --- list ---
  tasks
    .command('list')
    .description('List tasks')
    .option('--assignee <member-id>', 'Filter by assignee workspace member ID')
    .option('--is-completed', 'Filter to only completed tasks')
    .option('--linked-object <obj>', 'Filter by linked object slug')
    .option('--linked-record-id <id>', 'Filter by linked record ID')
    .option('--limit <n>', 'Maximum tasks to return', '25')
    .option('--offset <n>', 'Number of tasks to skip', '0')
    .option('--sort <expr>', 'Sort expression')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const params = new URLSearchParams();
      params.set('limit', String(opts.limit ?? 25));
      params.set('offset', String(opts.offset ?? 0));
      if (opts.assignee) params.set('assignee', opts.assignee);
      if (opts.isCompleted) params.set('is_completed', 'true');
      if (opts.linkedObject) params.set('linked_object', opts.linkedObject);
      if (opts.linkedRecordId) params.set('linked_record_id', opts.linkedRecordId);
      if (opts.sort) params.set('sort', opts.sort);

      const res = await client.get<{ data: any[] }>(`/tasks?${params.toString()}`);
      const tasksList = res.data;

      const flat = tasksList.map((t: any) => ({
        id: t.id?.task_id || '',
        content: truncate(t.content_plaintext || '', 60),
        deadline: t.deadline_at || '',
        completed: t.is_completed ?? false,
      }));

      outputList(flat, {
        format,
        columns: ['id', 'content', 'deadline', 'completed'],
        idField: 'id',
      });
    });

  // --- get ---
  tasks
    .command('get <task-id>')
    .description('Get a task by ID')
    .action(async (taskId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(`/tasks/${encodeURIComponent(taskId)}`);
      outputSingle(res.data, { format, idField: 'id' });
    });

  // --- create ---
  tasks
    .command('create')
    .description('Create a new task')
    .requiredOption('--content <text>', 'Task content (required)')
    .option(
      '--assignee <member-id>',
      'Assignee workspace member ID (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option('--deadline <ISO-date>', 'Deadline in ISO-8601 format')
    .option(
      '--record <object:record-id>',
      'Link a record as object:record-id (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const body: Record<string, any> = {
        content: opts.content,
        format: 'plaintext',
        is_completed: false,
        deadline_at: opts.deadline || null,
        assignees: (opts.assignee && opts.assignee.length > 0)
          ? (opts.assignee as string[]).map((id: string) => ({
              referenced_actor_type: 'workspace-member',
              referenced_actor_id: id,
            }))
          : [],
        linked_records: (opts.record && opts.record.length > 0)
          ? (opts.record as string[]).map((r: string) => {
              const [targetObject, targetRecordId] = r.split(':');
              return { target_object: targetObject, target_record_id: targetRecordId };
            })
          : [],
      };

      const res = await client.post<{ data: any }>('/tasks', { data: body });
      outputSingle(res.data, { format, idField: 'id' });
    });

  // --- update ---
  tasks
    .command('update <task-id>')
    .description('Update an existing task')
    .option('--complete', 'Mark task as completed')
    .option('--incomplete', 'Mark task as not completed')
    .option('--deadline <ISO-date>', 'Update deadline')
    .option('--content <text>', 'Update task content')
    .action(async (taskId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const body: Record<string, any> = {};

      if (opts.complete) body.is_completed = true;
      if (opts.incomplete) body.is_completed = false;
      if (opts.deadline) body.deadline_at = opts.deadline;
      if (opts.content) body.content = opts.content;

      const res = await client.patch<{ data: any }>(
        `/tasks/${encodeURIComponent(taskId)}`,
        { data: body },
      );
      outputSingle(res.data, { format, idField: 'id' });
    });

  // --- delete ---
  tasks
    .command('delete <task-id>')
    .description('Delete a task')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (taskId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();

      if (!opts.yes) {
        const ok = await confirm(`Delete task ${taskId}?`);
        if (!ok) {
          console.error('Aborted.');
          return;
        }
      }

      const client = new AttioClient(opts.apiKey, opts.debug);
      await client.delete(`/tasks/${encodeURIComponent(taskId)}`);
      console.error('Deleted.');
    });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}
