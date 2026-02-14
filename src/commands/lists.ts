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
