import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, type OutputFormat } from '../output.js';

function flattenRecording(recording: any): Record<string, string> {
  return {
    id: recording.id?.call_recording_id || '',
    meeting_id: recording.id?.meeting_id || '',
    status: recording.status || '',
    created_at: recording.created_at || '',
    web_url: recording.web_url || '',
  };
}

async function listRecordingsForMeeting(meetingId: string, opts: any): Promise<any[]> {
  const client = new AttioClient(opts.apiKey, opts.debug);
  const all = !!opts.all;
  const limit = Number(opts.limit) || 50;

  const allRecordings: any[] = [];
  let cursor = opts.cursor as string | undefined;

  while (true) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);

    const res = await client.get<{ data: any[]; pagination?: { next_cursor?: string | null } }>(
      `/meetings/${encodeURIComponent(meetingId)}/call_recordings?${params.toString()}`,
    );

    allRecordings.push(...res.data);

    if (!all) break;
    cursor = res.pagination?.next_cursor ?? undefined;
    if (!cursor) break;
  }

  return allRecordings;
}

async function fetchTranscript(
  client: AttioClient,
  meetingId: string,
  recordingId: string,
  opts: any,
): Promise<any> {
  const transcriptSegments: any[] = [];
  let cursor = opts.cursor as string | undefined;

  while (true) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);

    const query = params.toString();
    const path = `/meetings/${encodeURIComponent(meetingId)}/call_recordings/${encodeURIComponent(recordingId)}/transcript${query ? `?${query}` : ''}`;

    const res = await client.get<{ data: any; pagination?: { next_cursor?: string | null } }>(path);
    const segmentData = res.data;

    if (Array.isArray(segmentData.transcript)) {
      transcriptSegments.push(...segmentData.transcript);
    }

    if (!opts.allTranscript) {
      return { ...segmentData, transcript: transcriptSegments };
    }

    cursor = res.pagination?.next_cursor ?? undefined;
    if (!cursor) {
      return { ...segmentData, transcript: transcriptSegments };
    }
  }
}

export function register(program: Command): void {
  const cmd = program
    .command('recordings')
    .description('Manage call recordings (Beta API)');

  cmd
    .command('list')
    .description('List call recordings for a meeting (Beta API)')
    .requiredOption('--meeting <meeting-id>', 'Meeting ID (required)')
    .option('--limit <n>', 'Maximum recordings per page', '50')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--all', 'Auto-paginate through all pages')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const format: OutputFormat = detectFormat(opts);

      const recordings = await listRecordingsForMeeting(opts.meeting, opts);

      if (format === 'quiet') {
        for (const recording of recordings) {
          console.log(recording.id?.call_recording_id || '');
        }
        return;
      }

      if (format === 'json') {
        outputList(recordings, { format, idField: 'id' });
        return;
      }

      outputList(recordings.map(flattenRecording), {
        format,
        columns: ['id', 'meeting_id', 'status', 'created_at', 'web_url'],
        idField: 'id',
      });
    });

  cmd
    .command('get <id>')
    .description('Get a call recording by ID (Beta API)')
    .requiredOption('--meeting <meeting-id>', 'Meeting ID (required)')
    .option('--transcript', 'Include transcript data in the response')
    .option('--cursor <cursor>', 'Transcript pagination cursor')
    .option('--all-transcript', 'Fetch all transcript pages when using --transcript')
    .action(async (id: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(
        `/meetings/${encodeURIComponent(opts.meeting)}/call_recordings/${encodeURIComponent(id)}`,
      );

      const recording = res.data;

      if (opts.transcript) {
        const transcript = await fetchTranscript(client, opts.meeting, id, opts);
        recording.transcript = transcript;
      }

      if (format === 'json') {
        outputSingle(recording, { format, idField: 'id' });
        return;
      }

      outputSingle(flattenRecording(recording), { format, idField: 'id' });
    });
}
