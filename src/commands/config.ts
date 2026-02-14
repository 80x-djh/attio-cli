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

  cmd
    .command('claude-md')
    .description('Print a CLAUDE.md snippet for AI agent discovery')
    .action(() => {
      console.log(CLAUDE_MD_SNIPPET);
    });
}

const CLAUDE_MD_SNIPPET = `## Attio CLI (\`attio\`)

Use the \`attio\` CLI for all Attio CRM operations. Always pass \`--yes\` on delete commands to avoid interactive prompts.

### Discovery & setup

\`\`\`
attio whoami                                   Show workspace info
attio objects list                             List all objects (people, companies, custom...)
attio attributes list <object>                 List attributes for an object (shows slugs, types)
attio lists list                               List all lists
attio members list                             List workspace members (get member IDs for tasks)
\`\`\`

### Records (CRUD — works for any object)

\`\`\`
attio records list <object> [--filter <expr>] [--sort <expr>] [--limit N] [--all]
attio records get <object> <record-id>
attio records create <object> --set key=value [--set key2=value2]
attio records update <object> <record-id> --set key=value
attio records delete <object> <record-id> --yes
attio records upsert <object> --match <attr-slug> --set key=value
attio records search <object> <query>
\`\`\`

### Shortcuts

\`\`\`
attio people list|get|create|update|delete|search    (same as: records ... people)
attio companies list|get|create|update|delete|search (same as: records ... companies)
\`\`\`

### Lists & entries

\`\`\`
attio entries list <list> [--filter <expr>] [--sort <expr>] [--limit N] [--all]
attio entries get <list> <entry-id>
attio entries create <list> --record <record-id> --object <obj> [--set key=value]
attio entries update <list> <entry-id> --set key=value
attio entries delete <list> <entry-id> --yes
\`\`\`

### Tasks

\`\`\`
attio tasks list [--assignee <member-id>] [--is-completed] [--limit N]
attio tasks get <task-id>
attio tasks create --content "..." [--assignee <member-id>] [--deadline <ISO-date>] [--record <object:record-id>]
attio tasks update <task-id> [--complete] [--incomplete] [--deadline <ISO-date>] [--content "..."]
attio tasks delete <task-id> --yes
\`\`\`

### Notes & comments

\`\`\`
attio notes list [--object <obj> --record <id>]
attio notes get <note-id>
attio notes create --object <obj> --record <id> --title "..." --content "..."
attio notes delete <note-id> --yes
attio comments list --object <obj> --record <id>
attio comments create --object <obj> --record <id> --content "..."
attio comments delete <comment-id> --yes
\`\`\`

### Output modes

Auto-detects: table for TTY, JSON when piped. Force with \`--json\`, \`--csv\`, or \`--table\`.
Use \`-q\` for IDs only (one per line) — ideal for chaining:

\`\`\`bash
ID=$(attio records create companies --set name="Acme" -q)
attio notes create --object companies --record $ID --title "Note" --content "..."
\`\`\`

### Filter syntax

\`--filter\` supports: \`=\` (equals), \`!=\` (not equals), \`~\` (contains), \`!~\` (not contains), \`^\` (starts with), \`>\`, \`>=\`, \`<\`, \`<=\`, \`?\` (is set/not empty).
Multiple \`--filter\` flags are ANDed. Use \`--filter-json '{...}'\` for raw Attio filter JSON.

\`\`\`
--filter 'name~Acme' --filter 'revenue>=1000000' --sort name:asc
\`\`\`

### Values for create/update

\`--set key=value\` (repeatable), \`--values '{"key":"value"}'\`, \`--values @file.json\`, or pipe JSON to stdin.`;
