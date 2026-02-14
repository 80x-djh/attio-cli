import { readFileSync } from 'fs';
import { Command } from 'commander';
import { AttioClient } from '../client.js';
import { detectFormat, outputList, outputSingle, confirm, type OutputFormat } from '../output.js';

const WEBHOOK_EVENT_TYPES = [
  'call-recording.created',
  'comment.created',
  'comment.resolved',
  'comment.unresolved',
  'comment.deleted',
  'list.created',
  'list.updated',
  'list.deleted',
  'list-attribute.created',
  'list-attribute.updated',
  'list-entry.created',
  'list-entry.updated',
  'list-entry.deleted',
  'object-attribute.created',
  'object-attribute.updated',
  'note.created',
  'note-content.updated',
  'note.updated',
  'note.deleted',
  'record.created',
  'record.merged',
  'record.updated',
  'record.deleted',
  'task.created',
  'task.updated',
  'task.deleted',
  'workspace-member.created',
] as const;

type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

function parseJsonInput(raw: string): any {
  if (raw.startsWith('@')) {
    return JSON.parse(readFileSync(raw.slice(1), 'utf-8'));
  }
  return JSON.parse(raw);
}

function flattenWebhook(item: any): Record<string, string | number> {
  return {
    id: item.id?.webhook_id || '',
    target_url: item.target_url || '',
    status: item.status || '',
    subscriptions: Array.isArray(item.subscriptions) ? item.subscriptions.length : 0,
    created_at: item.created_at || '',
  };
}

function collectEvents(rawEvents: string[]): WebhookEventType[] {
  if (rawEvents.length === 0) return [];

  const invalid = rawEvents.filter((event) => !WEBHOOK_EVENT_TYPES.includes(event as WebhookEventType));
  if (invalid.length > 0) {
    throw new Error(`Unsupported webhook event type(s): ${invalid.join(', ')}`);
  }

  return rawEvents as WebhookEventType[];
}

function parseSubscriptions(opts: any): any[] {
  if (opts.subscriptions) {
    const parsed = parseJsonInput(opts.subscriptions);
    if (!Array.isArray(parsed)) {
      throw new Error('--subscriptions must be a JSON array or @file containing a JSON array.');
    }
    return parsed;
  }

  const events = collectEvents((opts.event as string[] | undefined) ?? []);
  if (events.length === 0) {
    throw new Error('Provide at least one --event or --subscriptions for webhook subscriptions.');
  }

  const filter = opts.filterJson ? parseJsonInput(opts.filterJson) : null;
  return events.map((eventType) => ({ event_type: eventType, filter }));
}

export function register(program: Command): void {
  const cmd = program
    .command('webhooks')
    .description('Manage webhooks');

  cmd
    .command('events')
    .description('List all supported webhook event types')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const format: OutputFormat = detectFormat(opts);
      const events = WEBHOOK_EVENT_TYPES.map((eventType) => ({ event_type: eventType }));
      outputList(events, { format, columns: ['event_type'], idField: 'event_type' });
    });

  cmd
    .command('list')
    .description('List webhooks')
    .option('--limit <n>', 'Maximum webhooks to return', '25')
    .option('--offset <n>', 'Number of webhooks to skip', '0')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const params = new URLSearchParams();
      params.set('limit', String(Number(opts.limit) || 25));
      params.set('offset', String(Number(opts.offset) || 0));

      const res = await client.get<{ data: any[] }>(`/webhooks?${params.toString()}`);
      const webhooks = res.data;

      if (format === 'quiet') {
        for (const webhook of webhooks) {
          console.log(webhook.id?.webhook_id || '');
        }
        return;
      }

      if (format === 'json') {
        outputList(webhooks, { format, idField: 'id' });
        return;
      }

      outputList(webhooks.map(flattenWebhook), {
        format,
        columns: ['id', 'target_url', 'status', 'subscriptions', 'created_at'],
        idField: 'id',
      });
    });

  cmd
    .command('get <id>')
    .description('Get a webhook by ID')
    .action(async (id: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const res = await client.get<{ data: any }>(`/webhooks/${encodeURIComponent(id)}`);
      const webhook = res.data;

      if (format === 'json') {
        outputSingle(webhook, { format, idField: 'id' });
        return;
      }

      outputSingle(flattenWebhook(webhook), { format, idField: 'id' });
    });

  cmd
    .command('create')
    .description('Create a webhook')
    .requiredOption('--target-url <url>', 'Webhook destination URL (https only)')
    .option(
      '--event <event-type>',
      'Webhook event type (repeatable). Use "webhooks events" to list all',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option('--filter-json <json>', 'JSON filter for all --event subscriptions')
    .option('--subscriptions <json>', 'Full subscriptions JSON array or @file (overrides --event)')
    .action(async (_options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const subscriptions = parseSubscriptions(opts);

      const res = await client.post<{ data: any }>('/webhooks', {
        data: {
          target_url: opts.targetUrl,
          subscriptions,
        },
      });

      outputSingle(res.data, { format, idField: 'id' });
    });

  cmd
    .command('update <id>')
    .description('Update a webhook')
    .option('--target-url <url>', 'Webhook destination URL (https only)')
    .option(
      '--event <event-type>',
      'Webhook event type (repeatable). Use "webhooks events" to list all',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option('--filter-json <json>', 'JSON filter for all --event subscriptions')
    .option('--subscriptions <json>', 'Full subscriptions JSON array or @file (overrides --event)')
    .action(async (id: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);
      const format: OutputFormat = detectFormat(opts);

      const data: Record<string, any> = {};
      if (opts.targetUrl) {
        data.target_url = opts.targetUrl;
      }

      const hasSubscriptionFlags =
        !!opts.subscriptions ||
        !!opts.filterJson ||
        (((opts.event as string[] | undefined) ?? []).length > 0);

      if (hasSubscriptionFlags) {
        data.subscriptions = parseSubscriptions(opts);
      }

      if (Object.keys(data).length === 0) {
        throw new Error('Nothing to update. Provide --target-url and/or subscription options.');
      }

      const res = await client.patch<{ data: any }>(`/webhooks/${encodeURIComponent(id)}`, { data });
      outputSingle(res.data, { format, idField: 'id' });
    });

  cmd
    .command('delete <id>')
    .description('Delete a webhook')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id: string, _options: any, command: Command) => {
      const opts = command.optsWithGlobals();
      const client = new AttioClient(opts.apiKey, opts.debug);

      if (!opts.yes) {
        const ok = await confirm(`Delete webhook ${id}?`);
        if (!ok) {
          console.error('Aborted.');
          return;
        }
      }

      await client.delete(`/webhooks/${encodeURIComponent(id)}`);
      console.error('Deleted.');
    });
}
