import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, type OutputFormat } from '../output.js';

interface AttributesListResponse {
  data: Record<string, any>[];
}

export function register(program: Command): void {
  const attributes = program
    .command('attributes')
    .description('Manage object attributes');

  attributes
    .command('list')
    .description('List attributes for an object')
    .argument('<object>', 'Object API slug (e.g. people, companies)')
    .action(async function (this: Command, object: string) {
      const opts = this.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const response = await client.get<AttributesListResponse>(
        `/objects/${encodeURIComponent(object)}/attributes`,
      );
      const items = response.data;

      outputList(items, {
        format,
        columns: ['api_slug', 'title', 'type', 'is_required', 'is_unique', 'is_multiselect'],
        idField: 'api_slug',
      });
    });
}
