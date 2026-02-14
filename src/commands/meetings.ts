import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, type OutputFormat } from '../output.js';

function flattenMeeting(meeting: any): Record<string, string | number | boolean> {
  return {
    id: meeting.id?.meeting_id || '',
    title: meeting.title || '',
    start: meeting.start || '',
    end: meeting.end || '',
    is_all_day: meeting.is_all_day ?? false,
    participants: Array.isArray(meeting.participants) ? meeting.participants.length : 0,
  };
}

async function listMeetings(opts: any): Promise<any[]> {
  const client = new AttioClient(opts.apiKey, opts.debug);
  const limit = Number(opts.limit) || 50;
  const all = !!opts.all;

  const baseParams = new URLSearchParams();
  baseParams.set('limit', String(limit));
  if (opts.linkedObject) baseParams.set('linked_object', opts.linkedObject);
  if (opts.linkedRecordId) baseParams.set('linked_record_id', opts.linkedRecordId);
  if (opts.participants) baseParams.set('participants', opts.participants);
  if (opts.sort) baseParams.set('sort', opts.sort);
  if (opts.endsFrom) baseParams.set('ends_from', opts.endsFrom);
  if (opts.startsBefore) baseParams.set('starts_before', opts.startsBefore);
  if (opts.timezone) baseParams.set('timezone', opts.timezone);

  const allMeetings: any[] = [];
  let cursor = opts.cursor as string | undefined;

  while (true) {
    const params = new URLSearchParams(baseParams);
    if (cursor) params.set('cursor', cursor);

    const res = await client.get<{ data: any[]; pagination?: { next_cursor?: string | null } }>(
      `/meetings?${params.toString()}`,
    );

    allMeetings.push(...res.data);

    if (!all) break;
    cursor = res.pagination?.next_cursor ?? undefined;
    if (!cursor) break;
  }

  return allMeetings;
}

export function register(program: Command): void {
  const cmd = program
    .command('meetings')
    .description('Manage meetings (Beta API)');

  cmd
    .command('list')
    .description('List meetings (Beta API)')
    .option('--limit <n>', 'Maximum meetings per page', '50')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--all', 'Auto-paginate through all pages')
    .option('--linked-object <object>', 'Filter by linked object slug or ID')
    .option('--linked-record-id <id>', 'Filter by linked record ID')
    .option('--participants <emails>', 'Comma-separated participant email addresses')
    .option('--sort <order>', 'Sort order (e.g. start_asc, start_desc)')
    .option('--ends-from <iso-timestamp>', 'Only include meetings ending after this time')
    .option('--starts-before <iso-timestamp>', 'Only include meetings starting before this time')
    .option('--timezone <tz>', 'Timezone used with date filters (defaults to UTC)')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const format: OutputFormat = detectFormat(opts);

      if (opts.linkedRecordId && !opts.linkedObject) {
        throw new Error('--linked-record-id requires --linked-object.');
      }

      const meetings = await listMeetings(opts);

      if (format === 'quiet') {
        for (const meeting of meetings) {
          console.log(meeting.id?.meeting_id || '');
        }
        return;
      }

      if (format === 'json') {
        outputList(meetings, { format, idField: 'id' });
        return;
      }

      outputList(meetings.map(flattenMeeting), {
        format,
        columns: ['id', 'title', 'start', 'end', 'is_all_day', 'participants'],
        idField: 'id',
      });
    });

  cmd
    .command('get <id>')
    .description('Get a meeting by ID (Beta API)')
    .action(async (id: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(`/meetings/${encodeURIComponent(id)}`);
      const meeting = res.data;

      if (format === 'json') {
        outputSingle(meeting, { format, idField: 'id' });
        return;
      }

      outputSingle(flattenMeeting(meeting), { format, idField: 'id' });
    });
}
