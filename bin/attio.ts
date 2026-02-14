#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { AttioApiError, AttioAuthError, AttioRateLimitError } from '../src/errors.js';

// Import all command registration functions
import { register as registerWhoami } from '../src/commands/whoami.js';
import { register as registerObjects } from '../src/commands/objects.js';
import { register as registerAttributes } from '../src/commands/attributes.js';
import { register as registerRecords } from '../src/commands/records.js';
import { register as registerPeople } from '../src/commands/people.js';
import { register as registerCompanies } from '../src/commands/companies.js';
import { register as registerLists } from '../src/commands/lists.js';
import { register as registerEntries } from '../src/commands/entries.js';
import { register as registerTasks } from '../src/commands/tasks.js';
import { register as registerNotes } from '../src/commands/notes.js';
import { register as registerComments } from '../src/commands/comments.js';
import { register as registerMembers } from '../src/commands/members.js';
import { register as registerConfig } from '../src/commands/config.js';
import { register as registerOpen } from '../src/commands/open.js';

// Global error handler
function handleError(err: unknown): never {
  if (err instanceof AttioApiError) {
    console.error(err.display());
    process.exit(err.exitCode);
  }
  if (err instanceof AttioAuthError) {
    console.error(err.display());
    process.exit(err.exitCode);
  }
  if (err instanceof AttioRateLimitError) {
    console.error(err.display());
    process.exit(err.exitCode);
  }
  if (err instanceof Error) {
    console.error(chalk.red(`Error: ${err.message}`));
    if (process.env.ATTIO_DEBUG || program.opts().debug) {
      console.error(err.stack);
    }
  } else {
    console.error(chalk.red('An unexpected error occurred'));
  }
  process.exit(1);
}

// Setup program
program
  .name('attio')
  .version('0.1.0')
  .description('CLI for the Attio CRM API. Built for scripts, agents, and humans who prefer terminals.')
  .option('--api-key <key>', 'Override API key')
  .option('--json', 'Force JSON output')
  .option('--table', 'Force table output')
  .option('--csv', 'Force CSV output')
  .option('-q, --quiet', 'Only output IDs')
  .option('--no-color', 'Disable colors')
  .option('--debug', 'Print request/response details to stderr');

// Register all commands
registerWhoami(program);
registerObjects(program);
registerAttributes(program);
registerRecords(program);
registerPeople(program);
registerCompanies(program);
registerLists(program);
registerEntries(program);
registerTasks(program);
registerNotes(program);
registerComments(program);
registerMembers(program);
registerConfig(program);
registerOpen(program);

// Parse and run
program.parseAsync(process.argv).catch(handleError);

// Also handle uncaught exceptions
process.on('uncaughtException', handleError);
process.on('unhandledRejection', (reason) => handleError(reason as Error));
