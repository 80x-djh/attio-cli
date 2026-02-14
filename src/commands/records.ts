import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, confirm, type OutputFormat } from '../output.js';
import { parseFilterFlag, combineFilters, parseSort } from '../filters.js';
import { flattenRecord, resolveValues } from '../values.js';
import { paginate } from '../pagination.js';

// ---------------------------------------------------------------------------
// Core action functions — exported so people.ts / companies.ts can reuse them
// ---------------------------------------------------------------------------

export async function listRecords(object: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  // Build filter
  let filter: Record<string, any> | undefined;
  if (cmdOpts.filterJson) {
    filter = JSON.parse(cmdOpts.filterJson);
  } else if (cmdOpts.filter && cmdOpts.filter.length > 0) {
    const parsed = (cmdOpts.filter as string[]).map(parseFilterFlag);
    filter = combineFilters(parsed);
  }

  // Build sorts
  let sorts: any[] | undefined;
  if (cmdOpts.sort && cmdOpts.sort.length > 0) {
    sorts = (cmdOpts.sort as string[]).map(parseSort);
  }

  const limit = Number(cmdOpts.limit) || 25;
  const offset = Number(cmdOpts.offset) || 0;
  const all = cmdOpts.all ?? false;

  const fetchPage = async (pageLimit: number, pageOffset: number) => {
    const body: Record<string, any> = {};
    if (filter && Object.keys(filter).length > 0) body.filter = filter;
    if (sorts && sorts.length > 0) body.sorts = sorts;
    body.limit = pageLimit;
    body.offset = pageOffset;

    const res = await client.post<{ data: any[] }>(
      `/objects/${encodeURIComponent(object)}/records/query`,
      body,
    );
    return res.data;
  };

  const records = await paginate(fetchPage, { limit, offset, all });

  if (format === 'quiet') {
    for (const r of records) {
      console.log(r.id?.record_id ?? '');
    }
    return;
  }

  if (format === 'json') {
    outputList(records, { format });
    return;
  }

  // table or csv — flatten each record
  const flat = records.map(flattenRecord);
  outputList(flat, { format });
}

export async function getRecord(object: string, recordId: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  const res = await client.get<{ data: any }>(
    `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`,
  );
  const record = res.data;

  if (format === 'quiet') {
    console.log(record.id?.record_id ?? '');
    return;
  }

  if (format === 'json') {
    outputSingle(record, { format });
    return;
  }

  outputSingle(flattenRecord(record), { format });
}

export async function createRecord(object: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  const values = await resolveValues(cmdOpts);

  const res = await client.post<{ data: any }>(
    `/objects/${encodeURIComponent(object)}/records`,
    { data: { values } },
  );
  const record = res.data;

  if (format === 'quiet') {
    console.log(record.id?.record_id ?? '');
    return;
  }

  if (format === 'json') {
    outputSingle(record, { format });
    return;
  }

  outputSingle(flattenRecord(record), { format });
}

export async function updateRecord(object: string, recordId: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  const values = await resolveValues(cmdOpts);

  const res = await client.patch<{ data: any }>(
    `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`,
    { data: { values } },
  );
  const record = res.data;

  if (format === 'quiet') {
    console.log(record.id?.record_id ?? '');
    return;
  }

  if (format === 'json') {
    outputSingle(record, { format });
    return;
  }

  outputSingle(flattenRecord(record), { format });
}

export async function deleteRecord(object: string, recordId: string, cmdOpts: any): Promise<void> {
  const yes = cmdOpts.yes ?? false;

  if (!yes) {
    const ok = await confirm(`Delete record ${recordId} from ${object}?`);
    if (!ok) {
      console.error('Aborted.');
      return;
    }
  }

  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);

  await client.delete(
    `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}`,
  );

  console.error('Deleted.');
}

// ---------------------------------------------------------------------------
// Internal helpers for subcommands not shared via people/companies
// ---------------------------------------------------------------------------

async function upsertRecord(object: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  const matchAttr: string | undefined = cmdOpts.match;
  if (!matchAttr) {
    throw new Error('--match <attribute-slug> is required for upsert');
  }

  const values = await resolveValues(cmdOpts);

  // CRITICAL: matching_attribute is a QUERY PARAMETER, not in the body
  const res = await client.put<{ data: any }>(
    `/objects/${encodeURIComponent(object)}/records?matching_attribute=${encodeURIComponent(matchAttr)}`,
    { data: { values } },
  );
  const record = res.data;

  if (format === 'quiet') {
    console.log(record.id?.record_id ?? '');
    return;
  }

  if (format === 'json') {
    outputSingle(record, { format });
    return;
  }

  outputSingle(flattenRecord(record), { format });
}

export async function searchRecords(object: string, query: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);
  const limit = Number(cmdOpts.limit) || 25;

  // CRITICAL: The actual API path is POST /v2/objects/records/search (NOT per-object!)
  const res = await client.post<{ data: any[] }>(
    '/objects/records/search',
    {
      query,
      objects: [object],
      request_as: { type: 'workspace' },
      limit,
    },
  );
  const records = res.data;

  if (format === 'quiet') {
    for (const r of records) {
      console.log(r.id?.record_id ?? '');
    }
    return;
  }

  if (format === 'json') {
    outputList(records, { format });
    return;
  }

  const flat = records.map(flattenRecord);
  outputList(flat, { format });
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function register(program: Command): void {
  const records = program
    .command('records')
    .description('Manage records in any Attio object');

  // --- list ---
  records
    .command('list')
    .description('List or query records for an object')
    .argument('<object>', 'Object slug or ID (e.g. companies, people)')
    .option(
      '--filter <expr>',
      'Filter expression, e.g. "name~Acme" (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option('--filter-json <json>', 'Raw JSON filter (overrides --filter)')
    .option(
      '--sort <expr>',
      'Sort expression, e.g. "name:asc" (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option('--limit <n>', 'Maximum records to return', '25')
    .option('--offset <n>', 'Number of records to skip', '0')
    .option('--all', 'Auto-paginate to fetch all records')
    .action(async (object: string, _opts: any, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      await listRecords(object, opts);
    });

  // --- get ---
  records
    .command('get')
    .description('Get a single record by ID')
    .argument('<object>', 'Object slug or ID')
    .argument('<record-id>', 'Record ID')
    .action(async (object: string, recordId: string, _opts: any, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      await getRecord(object, recordId, opts);
    });

  // --- create ---
  records
    .command('create')
    .description('Create a new record')
    .argument('<object>', 'Object slug or ID')
    .option('--values <json>', 'JSON string or @file of attribute values')
    .option(
      '--set <key=value>',
      'Set an attribute value (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .action(async (object: string, _opts: any, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      await createRecord(object, opts);
    });

  // --- update ---
  records
    .command('update')
    .description('Update an existing record')
    .argument('<object>', 'Object slug or ID')
    .argument('<record-id>', 'Record ID')
    .option('--values <json>', 'JSON string or @file of attribute values')
    .option(
      '--set <key=value>',
      'Set an attribute value (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .action(async (object: string, recordId: string, _opts: any, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      await updateRecord(object, recordId, opts);
    });

  // --- delete ---
  records
    .command('delete')
    .description('Delete a record')
    .argument('<object>', 'Object slug or ID')
    .argument('<record-id>', 'Record ID')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (object: string, recordId: string, _opts: any, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      await deleteRecord(object, recordId, opts);
    });

  // --- upsert ---
  records
    .command('upsert')
    .description('Create or update a record by matching attribute')
    .argument('<object>', 'Object slug or ID')
    .requiredOption('--match <attribute-slug>', 'Attribute slug to match on (required)')
    .option('--values <json>', 'JSON string or @file of attribute values')
    .option(
      '--set <key=value>',
      'Set an attribute value (repeatable)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .action(async (object: string, _opts: any, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      await upsertRecord(object, opts);
    });

  // --- search ---
  records
    .command('search')
    .description('Full-text search for records within an object')
    .argument('<object>', 'Object slug or ID (e.g. companies, people)')
    .argument('<query>', 'Search query string')
    .option('--limit <n>', 'Maximum results to return', '25')
    .action(async (object: string, query: string, _opts: any, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      await searchRecords(object, query, opts);
    });
}
