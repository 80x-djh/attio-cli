import { Command } from 'commander';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord, assertRecord, searchRecords } from './records.js';

export function register(program: Command): void {
  const cmd = program
    .command('deals')
    .description('Manage deal records (shortcut for: records <cmd> deals)');

  cmd
    .command('list')
    .description('List deals')
    .option('--filter <expr>', 'Filter: = != ~ !~ ^ > >= < <= ? (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--filter-json <json>', 'Raw JSON filter')
    .option('--sort <expr>', 'Sort expression (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--limit <n>', 'Max results per page', '25')
    .option('--offset <n>', 'Starting offset', '0')
    .option('--all', 'Fetch all pages')
    .action(async (_options: any, command: Command) => {
      await listRecords('deals', command.optsWithGlobals());
    });

  cmd
    .command('get <record-id>')
    .description('Get a deal by record ID')
    .action(async (recordId: string, _options: any, command: Command) => {
      await getRecord('deals', recordId, command.optsWithGlobals());
    });

  cmd
    .command('create')
    .description('Create a deal')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (_options: any, command: Command) => {
      await createRecord('deals', command.optsWithGlobals());
    });

  cmd
    .command('update <record-id>')
    .description('Update a deal')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (recordId: string, _options: any, command: Command) => {
      await updateRecord('deals', recordId, command.optsWithGlobals());
    });

  cmd
    .command('delete <record-id>')
    .description('Delete a deal')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (recordId: string, _options: any, command: Command) => {
      await deleteRecord('deals', recordId, command.optsWithGlobals());
    });

  cmd
    .command('assert')
    .description('Create or update a deal by matching attribute')
    .requiredOption('--match <attribute-slug>', 'Attribute slug to match on (required)')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (_options: any, command: Command) => {
      await assertRecord('deals', command.optsWithGlobals());
    });

  cmd
    .command('search <query>')
    .description('Search deals')
    .option('--limit <n>', 'Maximum results', '25')
    .action(async (query: string, _options: any, command: Command) => {
      await searchRecords(query, command.optsWithGlobals(), ['deals']);
    });
}
