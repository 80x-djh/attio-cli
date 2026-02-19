import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, type OutputFormat } from '../output.js';

export function register(program: Command): void {
  const cmd = program
    .command('lists')
    .description('Manage lists');

  cmd
    .command('list')
    .description('List all lists')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any[] }>('/lists');
      const lists = res.data;

      if (format === 'quiet') {
        for (const l of lists) {
          console.log(l.id?.list_id ?? '');
        }
        return;
      }

      if (format === 'json') {
        outputList(lists, { format });
        return;
      }

      const flat = lists.map((l: any) => ({
        id: l.id?.list_id || '',
        api_slug: l.api_slug || '',
        name: l.name || '',
        parent_object: l.parent_object || '',
      }));

      outputList(flat, {
        format,
        columns: ['id', 'api_slug', 'name', 'parent_object'],
        idField: 'id',
      });
    });

  cmd
    .command('create')
    .description('Create a new list')
    .requiredOption('--name <name>', 'Human-readable name for the list')
    .requiredOption('--parent-object <object>', 'Object slug or ID for records in this list (e.g. "people", "companies")')
    .option('--api-slug <slug>', 'API slug in snake_case (auto-generated from name if omitted)')
    .option(
      '--workspace-access <level>',
      'Access for all workspace members: full-access, read-and-write, read-only',
      'full-access',
    )
    .option(
      '--member-access <member-id:level>',
      'Grant access to a specific member as member-id:level (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const apiSlug = opts.apiSlug || opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      const memberAccess = (opts.memberAccess as string[]).map((entry: string) => {
        const colonIdx = entry.lastIndexOf(':');
        if (colonIdx === -1) {
          throw new Error(`Invalid --member-access format: "${entry}". Expected: member-id:level`);
        }
        return {
          workspace_member_id: entry.slice(0, colonIdx),
          level: entry.slice(colonIdx + 1),
        };
      });

      const body = {
        data: {
          name: opts.name,
          api_slug: apiSlug,
          parent_object: opts.parentObject,
          workspace_access: opts.workspaceAccess,
          workspace_member_access: memberAccess,
        },
      };

      const res = await client.post<{ data: any }>('/lists', body);
      const listData = res.data;

      if (format === 'quiet') {
        console.log(listData.id?.list_id ?? '');
        return;
      }

      if (format === 'json') {
        outputSingle(listData, { format, idField: 'id' });
        return;
      }

      const flat: Record<string, any> = {
        id: listData.id?.list_id || '',
        api_slug: listData.api_slug || '',
        name: listData.name || '',
        parent_object: listData.parent_object || '',
        workspace_access: listData.workspace_access || '',
      };

      outputSingle(flat, { format, idField: 'id' });
    });

  cmd
    .command('get <list>')
    .description('Get a list by ID or slug')
    .action(async (list: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(`/lists/${list}`);
      const listData = res.data;

      if (format === 'json') {
        outputSingle(listData, { format, idField: 'id' });
        return;
      }

      const flat: Record<string, any> = {
        id: listData.id?.list_id || '',
        api_slug: listData.api_slug || '',
        name: listData.name || '',
        parent_object: listData.parent_object || '',
        workspace_access: listData.workspace_access || '',
        created_by_actor_type: listData.created_by_actor?.type || '',
        created_by_actor_id: listData.created_by_actor?.id || '',
      };

      outputSingle(flat, { format, idField: 'id' });
    });
}
