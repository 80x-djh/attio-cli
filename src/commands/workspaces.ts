import { Command } from 'commander';
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord, assertRecord, searchRecords } from './records.js';

export function register(program: Command): void {
  const cmd = program
    .command('workspaces')
    .description('Manage workspace records (shortcut for: records <cmd> workspaces)');

  cmd
    .command('list')
    .description('List workspaces')
    .option('--filter <expr>', 'Filter: = != ~ !~ ^ > >= < <= ? (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--filter-json <json>', 'Raw JSON filter')
    .option('--sort <expr>', 'Sort expression (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .option('--limit <n>', 'Max results per page', '25')
    .option('--offset <n>', 'Starting offset', '0')
    .option('--all', 'Fetch all pages')
    .action(async (_options: any, command: Command) => {
      await listRecords('workspaces', command.optsWithGlobals());
    });

  cmd
    .command('get <record-id>')
    .description('Get a workspace by record ID')
    .action(async (recordId: string, _options: any, command: Command) => {
      await getRecord('workspaces', recordId, command.optsWithGlobals());
    });

  cmd
    .command('create')
    .description('Create a workspace')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (_options: any, command: Command) => {
      await createRecord('workspaces', command.optsWithGlobals());
    });

  cmd
    .command('update <record-id>')
    .description('Update a workspace')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (recordId: string, _options: any, command: Command) => {
      await updateRecord('workspaces', recordId, command.optsWithGlobals());
    });

  cmd
    .command('delete <record-id>')
    .description('Delete a workspace')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (recordId: string, _options: any, command: Command) => {
      await deleteRecord('workspaces', recordId, command.optsWithGlobals());
    });

  cmd
    .command('assert')
    .description('Create or update a workspace by matching attribute')
    .requiredOption('--match <attribute-slug>', 'Attribute slug to match on (required)')
    .option('--values <json>', 'Values as JSON string or @file')
    .option('--set <key=value>', 'Set a field value (repeatable)', (v: string, p: string[]) => [...p, v], [] as string[])
    .action(async (_options: any, command: Command) => {
      await assertRecord('workspaces', command.optsWithGlobals());
    });

  cmd
    .command('search <query>')
    .description('Search workspaces')
    .option('--limit <n>', 'Maximum results', '25')
    .action(async (query: string, _options: any, command: Command) => {
      await searchRecords(query, command.optsWithGlobals(), ['workspaces']);
    });
}
