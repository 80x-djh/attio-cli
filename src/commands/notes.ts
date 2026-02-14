import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, confirm, type OutputFormat } from '../output.js';

export function register(program: Command): void {
  const notes = program
    .command('notes')
    .description('Manage notes');

  // --- list ---
  notes
    .command('list')
    .description('List notes')
    .option('--object <obj>', 'Filter by parent object slug')
    .option('--record <id>', 'Filter by parent record ID')
    .option('--limit <n>', 'Maximum notes to return', '25')
    .option('--offset <n>', 'Number of notes to skip', '0')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const params = new URLSearchParams();
      params.set('limit', String(opts.limit ?? 25));
      params.set('offset', String(opts.offset ?? 0));
      if (opts.object) params.set('parent_object', opts.object);
      if (opts.record) params.set('parent_record_id', opts.record);

      const res = await client.get<{ data: any[] }>(`/notes?${params.toString()}`);
      const notesList = res.data;

      if (format === 'quiet') {
        for (const n of notesList) {
          console.log(n.id?.note_id ?? '');
        }
        return;
      }

      if (format === 'json') {
        outputList(notesList, { format });
        return;
      }

      const flat = notesList.map((n: any) => ({
        id: n.id?.note_id || '',
        title: n.title || '',
        parent_object: n.parent_object || '',
        parent_record_id: n.parent_record_id || '',
        created_at: n.created_at || '',
      }));

      outputList(flat, {
        format,
        columns: ['id', 'title', 'parent_object', 'parent_record_id', 'created_at'],
        idField: 'id',
      });
    });

  // --- get ---
  notes
    .command('get <note-id>')
    .description('Get a note by ID')
    .action(async (noteId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(`/notes/${encodeURIComponent(noteId)}`);
      outputSingle(res.data, { format, idField: 'id' });
    });

  // --- create ---
  notes
    .command('create')
    .description('Create a new note')
    .requiredOption('--object <obj>', 'Parent object slug (required)')
    .requiredOption('--record <id>', 'Parent record ID (required)')
    .requiredOption('--title <text>', 'Note title (required)')
    .requiredOption('--content <text>', 'Note content (required)')
    .option('--format <fmt>', 'Content format: plaintext or markdown', 'plaintext')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const body = {
        parent_object: opts.object,
        parent_record_id: opts.record,
        title: opts.title,
        format: opts.format ?? 'plaintext',
        content: opts.content,
      };

      const res = await client.post<{ data: any }>('/notes', { data: body });
      outputSingle(res.data, { format, idField: 'id' });
    });

  // --- delete ---
  notes
    .command('delete <note-id>')
    .description('Delete a note')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (noteId: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();

      if (!opts.yes) {
        const ok = await confirm(`Delete note ${noteId}?`);
        if (!ok) {
          console.error('Aborted.');
          return;
        }
      }

      const client = new AttioClient(opts.apiKey, opts.debug);
      await client.delete(`/notes/${encodeURIComponent(noteId)}`);
      console.error('Deleted.');
    });
}
