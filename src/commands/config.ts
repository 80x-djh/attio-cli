import { Command } from 'commander';
import chalk from 'chalk';
import { resolveApiKey, setApiKey, getConfigPath } from '../config.js';

export function register(program: Command): void {
  const cmd = program
    .command('config')
    .description('Manage CLI configuration');

  cmd
    .command('set <key> <value>')
    .description('Set a config value (e.g., attio config set api-key <key>)')
    .action((key: string, value: string) => {
      if (key === 'api-key') {
        setApiKey(value);
        console.error(chalk.green(`API key saved to ${getConfigPath()}`));
      } else {
        console.error(chalk.red(`Unknown config key: ${key}. Supported: api-key`));
        process.exit(1);
      }
    });

  cmd
    .command('get <key>')
    .description('Get a config value (e.g., attio config get api-key)')
    .action((key: string) => {
      if (key === 'api-key') {
        const apiKey = resolveApiKey();
        if (apiKey) {
          const masked = '•'.repeat(Math.max(0, apiKey.length - 4)) + apiKey.slice(-4);
          console.log(masked);
        } else {
          console.error(chalk.dim('No API key configured.'));
        }
      } else {
        console.error(chalk.red(`Unknown config key: ${key}. Supported: api-key`));
        process.exit(1);
      }
    });

  cmd
    .command('path')
    .description('Print config file location')
    .action(() => {
      console.log(getConfigPath());
    });
}
