import { Command } from 'commander';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord, searchRecords } from './records.js';

export function register(program: Command): void {
  const cmd = program
    .command('people')
    .description('Manage people records (shortcut for: records <cmd> people)');

  cmd
    .command('list')
    .description('List people')
    .option('--filter <expr>', 'Filter: = != ~ !~ ^ > >= < <= ? (e.g. "name~Acme"). Repeatable', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--filter-json <json>', 'Raw JSON filter')
    .option('--sort <expr>', 'Sort expression (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--limit <n>', 'Max results per page', '25')
    .option('--offset <n>', 'Starting offset', '0')
    .option('--all', 'Fetch all pages')
    .action(async (options: any, command: Command) => {
      await listRecords('people', command.optsWithGlobals());
    });

  cmd
    .command('get <record-id>')
    .description('Get a person by record ID')
    .action(async (recordId: string, options: any, command: Command) => {
      await getRecord('people', recordId, command.optsWithGlobals());
    });

  cmd
    .command('create')
    .description('Create a person')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (options: any, command: Command) => {
      await createRecord('people', command.optsWithGlobals());
    });

  cmd
    .command('update <record-id>')
    .description('Update a person')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (recordId: string, options: any, command: Command) => {
      await updateRecord('people', recordId, command.optsWithGlobals());
    });

  cmd
    .command('delete <record-id>')
    .description('Delete a person')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (recordId: string, options: any, command: Command) => {
      await deleteRecord('people', recordId, command.optsWithGlobals());
    });

  cmd
    .command('search <query>')
    .description('Search people by name or email')
    .option('--limit <n>', 'Maximum results', '25')
    .action(async (query: string, options: any, command: Command) => {
      await searchRecords('people', query, command.optsWithGlobals());
    });
}
