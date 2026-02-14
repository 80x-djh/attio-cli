import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, confirm, type OutputFormat } from '../output.js';
import { parseFilterFlag, combineFilters, parseSort } from '../filters.js';
import { flattenValue, resolveValues, requireValues } from '../values.js';
import { paginate } from '../pagination.js';

function flattenEntry(entry: any): Record<string, string> {
  const flat: Record<string, string> = {
    id: entry.id?.entry_id || '',
    record_id: entry.record_id || entry.parent_record_id || '',
    created_at: entry.created_at?.slice(0, 10) || '',
  };
  for (const [key, values] of Object.entries(entry.entry_values || {})) {
    flat[key] = flattenValue(values as any[]);
  }
  return flat;
}

export function register(program: Command): void {
  const cmd = program
    .command('entries')
    .description('Manage list entries');

  cmd
    .command('list <list>')
    .description('List entries in a list')
    .option('--filter <expr>', 'Filter: = != ~ !~ ^ > >= < <= ? (e.g. "name~Acme"). Repeatable', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--filter-json <json>', 'Raw JSON filter')
    .option('--sort <expr>', 'Sort expression (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--limit <n>', 'Max results per page', '25')
    .option('--offset <n>', 'Starting offset', '0')
    .option('--all', 'Fetch all pages')
    .action(async (list: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      let filter: Record<string, any> | undefined;
      if (opts.filterJson) {
        filter = JSON.parse(opts.filterJson);
      } else if (opts.filter && opts.filter.length > 0) {
        const parsed = (opts.filter as string[]).map(parseFilterFlag);
        filter = combineFilters(parsed);
      }

      const sorts = (opts.sort || []).map((s: string) => parseSort(s));

      const limit = parseInt(opts.limit, 10) || 25;
      const offset = parseInt(opts.offset, 10) || 0;

      const entries = await paginate<any>(
        async (pageLimit, pageOffset) => {
          const body: any = { limit: pageLimit, offset: pageOffset };
          if (filter && Object.keys(filter).length > 0) body.filter = filter;
          if (sorts.length > 0) body.sorts = sorts;
          const res = await client.post<{ data: any[] }>(`/lists/${list}/entries/query`, body);
          return res.data;
        },
        { limit, offset, all: !!opts.all },
      );

      if (format === 'json') {
        outputList(entries, { format, idField: 'id' });
        return;
      }

      const flat = entries.map(flattenEntry);
      outputList(flat, { format, idField: 'id' });
    });

  cmd
    .command('get <list> <entry-id>')
    .description('Get an entry by ID')
    .action(async (list: string, entryId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(`/lists/${list}/entries/${entryId}`);
      const entry = res.data;

      if (format === 'json') {
        outputSingle(entry, { format, idField: 'id' });
        return;
      }

      const flat = flattenEntry(entry);
      outputSingle(flat, { format, idField: 'id' });
    });

  cmd
    .command('create <list>')
    .description('Create a new entry in a list')
    .requiredOption('--record <record-id>', 'Parent record ID (required)')
    .requiredOption('--object <parent-object>', 'Parent object slug (required)')
    .option('--values <json>', 'Entry values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (list: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const resolvedValues = requireValues(await resolveValues({ values: opts.values, set: opts.set }));

      const body: any = {
        data: {
          parent_record_id: opts.record,
          parent_object: opts.object,
          entry_values: resolvedValues,
        },
      };

      const res = await client.post<{ data: any }>(`/lists/${list}/entries`, body);
      const entry = res.data;

      if (format === 'json') {
        outputSingle(entry, { format, idField: 'id' });
        return;
      }

      const flat = flattenEntry(entry);
      outputSingle(flat, { format, idField: 'id' });
    });

  cmd
    .command('update <list> <entry-id>')
    .description('Update an entry')
    .option('--values <json>', 'Entry values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (list: string, entryId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const resolvedValues = requireValues(await resolveValues({ values: opts.values, set: opts.set }));

      const body: any = {
        data: {
          entry_values: resolvedValues,
        },
      };

      const res = await client.patch<{ data: any }>(`/lists/${list}/entries/${entryId}`, body);
      const entry = res.data;

      if (format === 'json') {
        outputSingle(entry, { format, idField: 'id' });
        return;
      }

      const flat = flattenEntry(entry);
      outputSingle(flat, { format, idField: 'id' });
    });

  cmd
    .command('delete <list> <entry-id>')
    .description('Delete an entry')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (list: string, entryId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);

      if (!opts.yes) {
        const ok = await confirm(`Delete entry ${entryId} from list ${list}?`);
        if (!ok) {
          console.error('Aborted.');
          return;
        }
      }

      await client.delete(`/lists/${list}/entries/${entryId}`);
      console.error(`Deleted entry ${entryId}.`);
    });
}
