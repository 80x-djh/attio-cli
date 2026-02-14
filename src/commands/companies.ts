import { Command } from 'commander';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord, assertRecord, searchRecords } from './records.js';

export function register(program: Command): void {
  const cmd = program
    .command('companies')
    .description('Manage company records (shortcut for: records <cmd> companies)');

  cmd
    .command('list')
    .description('List companies')
    .option('--filter <expr>', 'Filter: = != ~ !~ ^ > >= < <= ? (e.g. "name~Acme"). Repeatable', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--filter-json <json>', 'Raw JSON filter')
    .option('--sort <expr>', 'Sort expression (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--limit <n>', 'Max results per page', '25')
    .option('--offset <n>', 'Starting offset', '0')
    .option('--all', 'Fetch all pages')
    .action(async (_options: any, command: Command) => {
      await listRecords('companies', command.optsWithGlobals());
    });

  cmd
    .command('get <record-id>')
    .description('Get a company by record ID')
    .action(async (recordId: string, _options: any, command: Command) => {
      await getRecord('companies', recordId, command.optsWithGlobals());
    });

  cmd
    .command('create')
    .description('Create a company')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (_options: any, command: Command) => {
      await createRecord('companies', command.optsWithGlobals());
    });

  cmd
    .command('update <record-id>')
    .description('Update a company')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (recordId: string, _options: any, command: Command) => {
      await updateRecord('companies', recordId, command.optsWithGlobals());
    });

  cmd
    .command('delete <record-id>')
    .description('Delete a company')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (recordId: string, _options: any, command: Command) => {
      await deleteRecord('companies', recordId, command.optsWithGlobals());
    });

  cmd
    .command('assert')
    .description('Create or update a company by matching attribute')
    .requiredOption('--match <attribute-slug>', 'Attribute slug to match on (required)')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (_options: any, command: Command) => {
      await assertRecord('companies', command.optsWithGlobals());
    });

  cmd
    .command('search <query>')
    .description('Search companies by name or domain')
    .option('--limit <n>', 'Maximum results', '25')
    .action(async (query: string, _options: any, command: Command) => {
      await searchRecords(query, command.optsWithGlobals(), ['companies']);
    });
}
