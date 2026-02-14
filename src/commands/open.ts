import { Command } from 'commander';
import { execFile } from 'child_process';
import { platform } from 'os';
import chalk from 'chalk';
import { AttioClient } from '../client.js';

export function register(program: Command): void {
  program
    .command('open <object> [record-id]')
    .description('Open an object or record in the Attio web app')
    .action(async (object: string, recordId: string | undefined, options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const objectSlug = encodeURIComponent(object);
      let url: string;

      if (recordId) {
        // Fetch record to get web_url
        const client = new AttioClient(opts.apiKey, opts.debug);
        const res = await client.get<any>(`/objects/${objectSlug}/records/${encodeURIComponent(recordId)}`);
        const record = res.data;
        url = record.web_url;
        if (!url) {
          console.error(chalk.red('Record has no web_url.'));
          process.exit(1);
        }
      } else {
        // Open object listing page
        // First get workspace slug from /v2/self
        const client = new AttioClient(opts.apiKey, opts.debug);
        const self = await client.get<Record<string, any>>('/self');
        const slug = self.workspace_slug || '';
        url = `https://app.attio.com/${encodeURIComponent(slug)}/${objectSlug}`;
      }

      const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'explorer' : 'xdg-open';
      execFile(cmd, [url], (err) => {
        if (err) {
          console.log(url);
        }
      });
    });
}
