import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, confirm, type OutputFormat } from '../output.js';
import { parseFilterFlag, combineFilters, parseSort } from '../filters.js';
import { flattenRecord, flattenValue, resolveValues, requireValues } from '../values.js';
import { paginate } from '../pagination.js';

function parseLimit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function flattenEntry(entry: any): Record<string, string> {
  const flat: Record<string, string> = {
    id: entry.id?.entry_id || '',
    list_id: entry.id?.list_id || '',
    parent_record_id: entry.parent_record_id || entry.record_id || '',
    created_at: entry.created_at?.slice(0, 10) || '',
  };

  const values = entry.entry_values || entry.values || {};
  for (const [key, attrValues] of Object.entries(values)) {
    flat[key] = flattenValue(attrValues as any[]);
  }

  return flat;
}

// ---------------------------------------------------------------------------
// Core action functions - exported so shortcut commands can reuse them
// ---------------------------------------------------------------------------

export async function listRecords(object: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  let filter: Record<string, any> | undefined;
  if (cmdOpts.filterJson) {
    filter = JSON.parse(cmdOpts.filterJson);
  } else if (cmdOpts.filter && cmdOpts.filter.length > 0) {
    const parsed = (cmdOpts.filter as string[]).map(parseFilterFlag);
    filter = combineFilters(parsed);
  }

  let sorts: any[] | undefined;
  if (cmdOpts.sort && cmdOpts.sort.length > 0) {
    sorts = (cmdOpts.sort as string[]).map(parseSort);
  }

  const limit = parseLimit(cmdOpts.limit, 25);
  const offset = parseOffset(cmdOpts.offset);
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
    for (const record of records) {
      console.log(record.id?.record_id ?? '');
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

  const values = requireValues(await resolveValues(cmdOpts));

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

  const values = requireValues(await resolveValues(cmdOpts));

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

export async function assertRecord(object: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  const matchAttr: string | undefined = cmdOpts.match;
  if (!matchAttr) {
    throw new Error('--match <attribute-slug> is required for assert');
  }

  const values = requireValues(await resolveValues(cmdOpts));

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

export async function searchRecords(query: string, cmdOpts: any, objectScope?: string[]): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);
  const limit = parseLimit(cmdOpts.limit, 25);

  const optionObjects = (cmdOpts.object as string[] | undefined) ?? [];
  let objects = objectScope && objectScope.length > 0 ? objectScope : optionObjects;

  if (objects.length === 0) {
    const objectsRes = await client.get<{ data: any[] }>('/objects');
    objects = objectsRes.data
      .map((obj) => obj.api_slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);
  }

  if (objects.length === 0) {
    throw new Error('No objects available for search.');
  }

  const res = await client.post<{ data: any[] }>(
    '/objects/records/search',
    {
      query,
      objects,
      request_as: { type: 'workspace' },
      limit,
    },
  );

  const records = res.data;

  if (format === 'quiet') {
    for (const record of records) {
      console.log(record.id?.record_id ?? '');
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

async function listRecordValues(object: string, recordId: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  const requestedAttributes = cmdOpts.attribute
    ? [cmdOpts.attribute]
    : (cmdOpts.attributes as string[] | undefined) ?? [];

  let attributes = requestedAttributes;
  if (attributes.length === 0) {
    const attrRes = await client.get<{ data: any[] }>(
      `/objects/${encodeURIComponent(object)}/attributes`,
    );
    attributes = attrRes.data
      .map((attr) => attr.api_slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);
  }

  const showHistoric = cmdOpts.historic !== false;
  const limit = parseLimit(cmdOpts.limit, 25);
  const offset = parseOffset(cmdOpts.offset);
  const all = cmdOpts.all ?? false;

  const allValues: Array<Record<string, any>> = [];

  for (const attribute of attributes) {
    const fetchPage = async (pageLimit: number, pageOffset: number) => {
      const params = new URLSearchParams();
      params.set('show_historic', showHistoric ? 'true' : 'false');
      params.set('limit', String(pageLimit));
      params.set('offset', String(pageOffset));

      const res = await client.get<{ data: any[] }>(
        `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}/attributes/${encodeURIComponent(attribute)}/values?${params.toString()}`,
      );
      return res.data;
    };

    const attributeValues = await paginate(fetchPage, { limit, offset, all });
    for (const value of attributeValues) {
      allValues.push({ attribute, ...value });
    }
  }

  if (format === 'json') {
    outputList(allValues, { format });
    return;
  }

  const flat = allValues.map((value) => ({
    attribute: value.attribute,
    value: flattenValue([value]),
    active_from: value.active_from || '',
    active_until: value.active_until || '',
    created_by_type: value.created_by_actor?.type || '',
    created_by_id: value.created_by_actor?.id || '',
  }));

  outputList(flat, {
    format,
    columns: ['attribute', 'value', 'active_from', 'active_until', 'created_by_type', 'created_by_id'],
    idField: 'attribute',
  });
}

async function listRecordEntries(object: string, recordId: string, cmdOpts: any): Promise<void> {
  const client = new AttioClient(cmdOpts.apiKey, cmdOpts.debug);
  const format: OutputFormat = detectFormat(cmdOpts);

  const limit = parseLimit(cmdOpts.limit, 25);
  const offset = parseOffset(cmdOpts.offset);
  const all = cmdOpts.all ?? false;

  const entries = await paginate<any>(
    async (pageLimit, pageOffset) => {
      const params = new URLSearchParams();
      params.set('limit', String(pageLimit));
      params.set('offset', String(pageOffset));

      const res = await client.get<{ data: any[] }>(
        `/objects/${encodeURIComponent(object)}/records/${encodeURIComponent(recordId)}/entries?${params.toString()}`,
      );
      return res.data;
    },
    { limit, offset, all },
  );

  if (format === 'quiet') {
    for (const entry of entries) {
      console.log(entry.id?.entry_id ?? '');
    }
    return;
  }

  if (format === 'json') {
    outputList(entries, { format, idField: 'id' });
    return;
  }

  const flat = entries.map(flattenEntry);
  outputList(flat, { format, idField: 'id' });
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function register(program: Command): void {
  const records = program
    .command('records')
    .description('Manage records in any Attio object');

  records
    .command('list')
    .description('List or query records for an object')
    .argument('<object>', 'Object slug or ID (e.g. companies, people)')
    .option(
      '--filter <expr>',
      'Filter: = != ~ !~ ^ > >= < <= ? (e.g. "name~Acme", "revenue>=1000", "email?"). Repeatable',
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
      await listRecords(object, cmd.optsWithGlobals());
    });

  records
    .command('get')
    .description('Get a single record by ID')
    .argument('<object>', 'Object slug or ID')
    .argument('<record-id>', 'Record ID')
    .action(async (object: string, recordId: string, _opts: any, cmd: Command) => {
      await getRecord(object, recordId, cmd.optsWithGlobals());
    });

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
      await createRecord(object, cmd.optsWithGlobals());
    });

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
      await updateRecord(object, recordId, cmd.optsWithGlobals());
    });

  records
    .command('delete')
    .description('Delete a record')
    .argument('<object>', 'Object slug or ID')
    .argument('<record-id>', 'Record ID')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (object: string, recordId: string, _opts: any, cmd: Command) => {
      await deleteRecord(object, recordId, cmd.optsWithGlobals());
    });

  records
    .command('assert')
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
      await assertRecord(object, cmd.optsWithGlobals());
    });

  records
    .command('upsert')
    .description('Alias for records assert')
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
      await assertRecord(object, cmd.optsWithGlobals());
    });

  records
    .command('search')
    .description('Search records across one or more objects')
    .argument('<query>', 'Search query string')
    .option(
      '--object <object>',
      'Object slug or ID to scope search (repeatable). Defaults to all objects',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option('--limit <n>', 'Maximum results to return', '25')
    .action(async (query: string, _opts: any, cmd: Command) => {
      await searchRecords(query, cmd.optsWithGlobals());
    });

  records
    .command('values')
    .description('List current and historic attribute values for a record')
    .argument('<object>', 'Object slug or ID')
    .argument('<record-id>', 'Record ID')
    .option('--attribute <attribute>', 'Only include a single attribute slug')
    .option('--limit <n>', 'Max values per page', '25')
    .option('--offset <n>', 'Starting offset', '0')
    .option('--all', 'Fetch all pages')
    .option('--no-historic', 'Exclude historic values and show active values only')
    .action(async (object: string, recordId: string, _opts: any, cmd: Command) => {
      await listRecordValues(object, recordId, cmd.optsWithGlobals());
    });

  records
    .command('entries')
    .description('List list entries where this record is the parent')
    .argument('<object>', 'Object slug or ID')
    .argument('<record-id>', 'Record ID')
    .option('--limit <n>', 'Max entries per page', '25')
    .option('--offset <n>', 'Starting offset', '0')
    .option('--all', 'Fetch all pages')
    .action(async (object: string, recordId: string, _opts: any, cmd: Command) => {
      await listRecordEntries(object, recordId, cmd.optsWithGlobals());
    });
}
