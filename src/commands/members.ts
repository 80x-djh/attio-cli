import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, type OutputFormat } from '../output.js';

interface WorkspaceMember {
  id: {
    workspace_id: string;
    workspace_member_id: string;
  };
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  email_address: string;
  access_level: string;
}

interface MembersListResponse {
  data: WorkspaceMember[];
}

export function register(program: Command): void {
  const members = program
    .command('members')
    .description('Manage workspace members');

  members
    .command('list')
    .description('List all workspace members')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const response = await client.get<MembersListResponse>('/workspace_members');
      const rawItems = response.data;

      // For --json, output the raw array as-is
      if (format === 'json') {
        console.log(JSON.stringify(rawItems, null, 2));
        return;
      }

      // For --quiet, output workspace_member_id values
      if (format === 'quiet') {
        for (const member of rawItems) {
          console.log(member.id.workspace_member_id);
        }
        return;
      }

      // Flatten the nested id for table/csv display
      const flattened = rawItems.map((m) => ({
        id: m.id.workspace_member_id,
        first_name: m.first_name,
        last_name: m.last_name,
        email_address: m.email_address,
        access_level: m.access_level,
      }));

      outputList(flattened, {
        format,
        columns: ['id', 'first_name', 'last_name', 'email_address', 'access_level'],
        idField: 'id',
      });
    });
}
