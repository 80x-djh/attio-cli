export function flattenValue(attrValues: any[]): string {
  if (!attrValues || attrValues.length === 0) return '';
  if (attrValues.length > 1) return attrValues.map(v => flattenSingleValue(v)).join(', ');
  return flattenSingleValue(attrValues[0]);
}

function flattenSingleValue(val: any): string {
  if (!val) return '';
  const type = val.attribute_type;
  switch (type) {
    case 'text': case 'number': case 'checkbox': case 'date': case 'timestamp': case 'rating':
      return String(val.value ?? '');
    case 'currency':
      return String(val.currency_value ?? val.value ?? '');
    case 'personal-name':
      return val.full_name || `${val.first_name || ''} ${val.last_name || ''}`.trim();
    case 'email-address':
      return val.email_address || val.original_email_address || '';
    case 'phone-number':
      return val.original_phone_number || val.phone_number || '';
    case 'domain':
      return val.domain || '';
    case 'select':
      return val.option?.title || '';
    case 'status':
      return val.status?.title || '';
    case 'location':
      return [val.locality, val.region, val.country_code].filter(Boolean).join(', ');
    case 'record-reference':
      return `${val.target_object}:${val.target_record_id}`;
    case 'actor-reference':
      return `member:${val.referenced_actor_id}`;
    case 'interaction':
      return `${val.interaction_type} @ ${val.interacted_at?.slice(0, 10) || ''}`;
    default:
      return String(val.value ?? val.title ?? JSON.stringify(val));
  }
}

export function flattenRecord(record: any): Record<string, string> {
  const flat: Record<string, string> = {
    id: record.id?.record_id || record.id?.entry_id || '',
    created_at: record.created_at?.slice(0, 10) || '',
  };
  if (record.web_url) flat.web_url = record.web_url;
  for (const [key, values] of Object.entries(record.values || {})) {
    flat[key] = flattenValue(values as any[]);
  }
  return flat;
}

export function parseSets(sets: string[]): Record<string, any> {
  const values: Record<string, any> = {};
  for (const set of sets) {
    const eqIdx = set.indexOf('=');
    if (eqIdx === -1) throw new Error(`Invalid --set format: "${set}". Expected: key=value`);
    const key = set.slice(0, eqIdx).trim();
    const raw = set.slice(eqIdx + 1).trim();
    if (raw === 'true') { values[key] = true; continue; }
    if (raw === 'false') { values[key] = false; continue; }
    if (/^-?\d+(\.\d+)?$/.test(raw)) { values[key] = Number(raw); continue; }
    if (raw.startsWith('[') && raw.endsWith(']')) {
      values[key] = raw.slice(1, -1).split(',').map(s => s.trim());
      continue;
    }
    values[key] = raw;
  }
  return values;
}

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function resolveValues(options: { values?: string; set?: string[] }): Promise<Record<string, any>> {
  if (options.values) {
    if (options.values.startsWith('@')) {
      const { readFileSync } = await import('fs');
      return JSON.parse(readFileSync(options.values.slice(1), 'utf-8'));
    }
    return JSON.parse(options.values);
  }
  if (options.set && options.set.length > 0) {
    return parseSets(options.set);
  }
  const stdin = await readStdin();
  if (stdin.trim()) return JSON.parse(stdin);
  return {};
}

export function requireValues(values: Record<string, any>): Record<string, any> {
  if (Object.keys(values).length === 0) {
    throw new Error('No values provided. Use --set key=value, --values \'{"key":"value"}\', or pipe JSON to stdin.');
  }
  return values;
}
