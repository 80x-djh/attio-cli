import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputSingle, type OutputFormat } from '../output.js';

export function register(program: Command): void {
  program
    .command('whoami')
    .description('Show current workspace and authenticated user info')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      // /v2/self returns a flat token-info object (no {data} wrapper)
      const data = await client.get<Record<string, any>>('/self');

      if (format === 'json') {
        outputSingle(data, { format });
        return;
      }

      if (format === 'quiet') {
        console.log(data.workspace_id || '');
        return;
      }

      const flat: Record<string, any> = {
        workspace_id: data.workspace_id || '',
        workspace_name: data.workspace_name || '',
        workspace_slug: data.workspace_slug || '',
        authorized_by: data.authorized_by_workspace_member_id || '',
        scope: data.scope || '',
      };

      outputSingle(flat, { format, idField: 'workspace_id' });
    });
}
