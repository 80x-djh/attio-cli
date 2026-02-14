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
import { register as registerInit } from '../src/commands/init.js';
import { isConfigured } from '../src/config.js';

// Global error handler
function handleError(err: unknown): never {
  const jsonMode = program.opts().json || !process.stdout.isTTY;

  if (err instanceof AttioApiError) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: true, status: err.statusCode, type: err.type, message: err.detail }));
    } else {
      console.error(err.display());
    }
    process.exit(err.exitCode);
  }
  if (err instanceof AttioAuthError) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: true, status: 401, type: 'auth_error', message: err.message }));
    } else {
      console.error(err.display());
    }
    process.exit(err.exitCode);
  }
  if (err instanceof AttioRateLimitError) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: true, status: 429, type: 'rate_limit', message: err.message }));
    } else {
      console.error(err.display());
    }
    process.exit(err.exitCode);
  }
  if (err instanceof Error) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: true, type: 'unknown_error', message: err.message }));
    } else {
      console.error(chalk.red(`Error: ${err.message}`));
      if (process.env.ATTIO_DEBUG || program.opts().debug) {
        console.error(err.stack);
      }
    }
  } else {
    if (jsonMode) {
      console.error(JSON.stringify({ error: true, type: 'unknown_error', message: 'An unexpected error occurred' }));
    } else {
      console.error(chalk.red('An unexpected error occurred'));
    }
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

if (process.argv.includes('--no-color')) {
  process.env.NO_COLOR = '1';
}

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
registerInit(program);

// Smart bare invocation: nudge unconfigured users toward `attio init`
program.action(() => {
  if (!isConfigured()) {
    console.error('');
    console.error(chalk.bold('  Welcome to attio-cli!'));
    console.error('');
    console.error(`  You haven't configured an API key yet. Run:`);
    console.error('');
    console.error(`    ${chalk.cyan('attio init')}`);
    console.error('');
    console.error('  to connect to your Attio workspace.');
    console.error('');
  } else {
    program.outputHelp();
  }
});

// Parse and run
program.parseAsync(process.argv).catch(handleError);

// Also handle uncaught exceptions
process.on('uncaughtException', handleError);
process.on('unhandledRejection', (reason) => handleError(reason as Error));
