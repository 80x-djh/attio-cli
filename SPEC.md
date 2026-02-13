# Attio CLI — Codex One-Shot Prompt (v2)

## Instructions for Codex

You are building `attio-cli`, an open-source CLI for the Attio CRM API. This is a developer tool designed for scripting, automation, and agentic workflows — NOT a replacement for the Attio UI. Think `gh` (GitHub CLI) or `stripe` CLI in spirit.

**IMPORTANT:** Before writing any code, fetch the OpenAPI spec from `https://api.attio.com/openapi/api` and use it as the source of truth for endpoint paths, request/response shapes, and query parameters. The guidance below supplements the spec with implementation details the spec alone won't tell you.

---

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Runtime:** Node.js >=18 (use built-in `fetch`, no axios/node-fetch)
- **CLI framework:** Commander.js
- **HTTP:** Built-in fetch (Node 18+)
- **Output formatting:** chalk for colors, cli-table3 for tables
- **Config:** dotenv for `.env`, XDG-compliant config dir (`~/.config/attio/config.json`)
- **Package manager:** npm
- **Build:** tsup (single-file ESM bundle)
- **License:** MIT

---

## Project Structure

```
attio-cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── .env.example            # ATTIO_API_KEY=your_key_here
├── README.md
├── LICENSE
├── bin/
│   └── attio.ts            # Entry point with #!/usr/bin/env node shebang
└── src/
    ├── client.ts           # API client wrapper
    ├── config.ts           # Config loading
    ├── output.ts           # Output formatting (table/json/csv/quiet)
    ├── pagination.ts       # Auto-pagination helper
    ├── filters.ts          # CLI filter shorthand → Attio filter JSON parser
    ├── values.ts           # Record value flattening + input parsing
    ├── errors.ts           # Typed error classes
    ├── commands/
    │   ├── objects.ts      # attio objects list|get
    │   ├── records.ts      # attio records list|get|create|update|delete|search|upsert
    │   ├── people.ts       # attio people list|get|create|update|delete (shortcut)
    │   ├── companies.ts    # attio companies list|get|create|update|delete (shortcut)
    │   ├── lists.ts        # attio lists list|get
    │   ├── entries.ts      # attio entries list|create|update|delete
    │   ├── tasks.ts        # attio tasks list|create|update|delete
    │   ├── notes.ts        # attio notes list|get|create
    │   ├── comments.ts     # attio comments list|create|delete
    │   ├── attributes.ts   # attio attributes list
    │   ├── members.ts      # attio members list
    │   ├── config.ts       # attio config set|get|path
    │   ├── open.ts         # attio open <object> [record-id]
    │   └── whoami.ts       # attio whoami
    └── types.ts            # Shared TypeScript types
```

---

## API Fundamentals

### Base URL & Auth
- **Base URL:** `https://api.attio.com/v2`
- **Auth:** `Authorization: Bearer <ATTIO_API_KEY>` header on every request
- **Content-Type:** `application/json` on all POST/PUT/PATCH requests
- **Tokens do not expire** but can be revoked. Get them at workspace Settings → Developers.

### Response Envelope
**CRITICAL:** All Attio API responses wrap data in a `{"data": ...}` envelope.

Single record:
```json
{"data": {"id": {"record_id": "...", "object_id": "...", "workspace_id": "..."}, "values": {...}, "created_at": "...", "web_url": "..."}}
```

List of records (from query endpoints):
```json
{"data": [{"id": {...}, "values": {...}, ...}, ...]}
```

Always unwrap `.data` before processing. For list commands, the array is at `.data`. For get commands, the object is at `.data`.

### Rate Limits
- **Limit:** ~10 req/sec
- **429 response includes:** `Retry-After` header (HTTP date string)
- **Error body:** `{"status_code": 429, "type": "rate_limit_exceeded", "message": "..."}`
- **Strategy:** Exponential backoff, 3 retries (1s → 2s → 4s), then fail with exit code 5

### Error Response Format
All API errors return JSON:
```json
{
  "status_code": 404,
  "type": "not_found",
  "message": "Record not found"
}
```

Common status codes: 400 (validation), 401 (auth), 403 (scope/permission), 404 (not found), 409 (conflict/unique violation), 429 (rate limit).

---

## CRITICAL: Endpoints That Use POST for Reading

**Codex: do NOT use GET for these.** Attio uses POST for query/list endpoints because filters go in the request body:

```
POST /v2/objects/{object}/records/query     ← list/filter records (NOT GET)
POST /v2/lists/{list}/entries/query         ← list/filter entries (NOT GET)
POST /v2/notes/query                        ← list notes
```

These accept `{"filter": {...}, "sorts": [...], "limit": N, "offset": N}` in the body.

The following are normal GET endpoints:
```
GET  /v2/objects                            ← list objects
GET  /v2/objects/{object}                   ← get single object
GET  /v2/objects/{object}/attributes        ← list attributes
GET  /v2/objects/{object}/records/{record}  ← get single record
GET  /v2/lists                              ← list all lists
GET  /v2/lists/{list}                       ← get single list
GET  /v2/tasks                              ← list tasks (query params for filtering)
GET  /v2/workspace_members                  ← list members
GET  /v2/self                               ← whoami
```

---

## Command Reference with Exact API Mappings

### Objects
```bash
attio objects list          → GET /v2/objects
attio objects get <slug>    → GET /v2/objects/{slug}
```

### Attributes
```bash
attio attributes list <object>  → GET /v2/objects/{object}/attributes
```

### Records (generic, works for any object)
```bash
attio records list <object> [--filter ...] [--sort ...] [--limit N]
  → POST /v2/objects/{object}/records/query
  → Body: {"filter": {...}, "sorts": [...], "limit": N, "offset": N}

attio records get <object> <record-id>
  → GET /v2/objects/{object}/records/{record_id}

attio records create <object> --values '{}' | --set key=value
  → POST /v2/objects/{object}/records
  → Body: {"data": {"values": {...}}}

attio records update <object> <record-id> --values '{}' | --set key=value
  → PATCH /v2/objects/{object}/records/{record_id}
  → Body: {"data": {"values": {...}}}

attio records delete <object> <record-id> [--yes]
  → DELETE /v2/objects/{object}/records/{record_id}

attio records upsert <object> --match <attribute-slug> --values '{}'
  → PUT /v2/objects/{object}/records
  → Body: {"data": {"values": {...}, "matching_attribute": "..."}}

attio records search <object> <query>
  → POST /v2/objects/{object}/records/search   (BETA)
  → Body: {"query": "..."}
```

### People & Companies (shortcuts that delegate to records)
```bash
attio people list [--filter ...]      → same as: attio records list people [--filter ...]
attio people get <id>                 → same as: attio records get people <id>
attio people create --set email=...   → same as: attio records create people --set ...
attio companies list [--filter ...]   → same as: attio records list companies [--filter ...]
attio companies get <id>              → same as: attio records get companies <id>
```
These are purely convenience aliases. Implement them by calling the same records logic with the object hardcoded.

### Lists
```bash
attio lists list            → GET /v2/lists
attio lists get <slug>      → GET /v2/lists/{slug}
```

### Entries (records within lists)
```bash
attio entries list <list> [--filter ...] [--sort ...] [--limit N]
  → POST /v2/lists/{list}/entries/query
  → Body: {"filter": {...}, "sorts": [...], "limit": N, "offset": N}

attio entries create <list> --record <record-id> [--values '{}']
  → POST /v2/lists/{list}/entries
  → Body: {"data": {"parent_record_id": "...", "parent_object": "...", "values": {...}}}

attio entries get <list> <entry-id>
  → GET /v2/lists/{list}/entries/{entry_id}

attio entries update <list> <entry-id> --values '{}'
  → PATCH /v2/lists/{list}/entries/{entry_id}
  → Body: {"data": {"values": {...}}}

attio entries delete <list> <entry-id> [--yes]
  → DELETE /v2/lists/{list}/entries/{entry_id}
```

### Tasks
```bash
attio tasks list [--assignee <member-id>] [--completed] [--limit N]
  → GET /v2/tasks?limit=N&assignee=...&is_completed=true/false

attio tasks create --content "..." [--assignee <id>] [--deadline <ISO-date>] [--record <object>:<record-id>]
  → POST /v2/tasks
  → Body: {"data": {"content": "...", "assignees": [...], "deadline_at": "...", "linked_records": [...]}}

attio tasks update <task-id> [--complete] [--deadline <ISO-date>]
  → PATCH /v2/tasks/{task_id}

attio tasks delete <task-id> [--yes]
  → DELETE /v2/tasks/{task_id}
```

### Notes
```bash
attio notes list [--object <obj> --record <id>]
  → POST /v2/notes/query
  → Body: {"filter": {"parent_object": "...", "parent_record_id": "..."}}

attio notes get <note-id>
  → GET /v2/notes/{note_id}

attio notes create --object <obj> --record <id> --title "..." --content "..."
  → POST /v2/notes
  → Body: {"data": {"parent_object": "...", "parent_record_id": "...", "title": "...", "format": "plaintext", "content": "..."}}
```

### Comments
```bash
attio comments list --object <obj> --record <id>
  → GET /v2/comments?record_id=...&object=...

attio comments create --object <obj> --record <id> --content "..."
  → POST /v2/comments
  → Body: {"data": {"record_id": "...", "object": "...", "format": "plaintext", "content": "..."}}

attio comments delete <comment-id> [--yes]
  → DELETE /v2/comments/{comment_id}
```

### Workspace Members
```bash
attio members list    → GET /v2/workspace_members
```

### Whoami
```bash
attio whoami          → GET /v2/self
```

### Open (browser)
```bash
attio open <object> [record-id]
```
If record-id provided, use the `web_url` field from a record GET. If not, open `https://app.attio.com/<workspace-slug>/<object-slug>`. Use `open` (macOS), `xdg-open` (Linux), or `start` (Windows) to launch browser.

### Config
```bash
attio config set api-key <key>   → Save to ~/.config/attio/config.json
attio config get api-key         → Print masked key (show last 4 chars)
attio config path                → Print config file location
```

---

## HARD PART 1: Filter Shorthand Parser (src/filters.ts)

Attio's API uses a **verbose filter format** with `$and`, `$or`, `$not`, `$eq`, `$contains`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$not_empty`. The CLI needs to translate human-friendly flags into this format.

### Attio's Actual Filter Formats

**Shorthand (simple equality, Attio supports this natively):**
```json
{"filter": {"name": "Acme Corp", "email_addresses": "[email protected]"}}
```

**Verbose (operators):**
```json
{
  "filter": {
    "$and": [
      {"name": {"$contains": "Acme"}},
      {"employee_count": {"$gte": 50}}
    ]
  }
}
```

### CLI Filter Syntax → Attio Filter JSON

Implement a parser for `--filter` flags:

```bash
# Simple equality → use Attio shorthand
attio records list companies --filter "name=Acme"
→ {"filter": {"name": "Acme"}}

# Contains
attio records list companies --filter "name~Acme"
→ {"filter": {"name": {"$contains": "Acme"}}}

# Numeric comparison
attio records list companies --filter "employee_count>=50"
→ {"filter": {"employee_count": {"$gte": 50}}}

# Multiple filters → $and
attio records list companies --filter "name~Acme" --filter "employee_count>=50"
→ {"filter": {"$and": [{"name": {"$contains": "Acme"}}, {"employee_count": {"$gte": 50}}]}}

# Has any value (not empty)
attio records list companies --filter "phone_numbers?"
→ {"filter": {"phone_numbers": {"$not_empty": true}}}

# Raw JSON escape hatch
attio records list companies --filter-json '{"$and": [...]}'
→ passes JSON directly as filter
```

### Parser Implementation Guide

```typescript
// src/filters.ts

interface AttioFilter {
  [key: string]: any;
}

// Operator precedence: parse longest operators first to avoid ambiguity
// Order matters: >= before >, != before =, !~ before ~
const OPERATORS = [
  { cli: '>=', attio: '$gte', numeric: true },
  { cli: '<=', attio: '$lte', numeric: true },
  { cli: '!=', attio: '$not', wrapEq: true },  // Attio uses $not wrapping
  { cli: '>', attio: '$gt', numeric: true },
  { cli: '<', attio: '$lt', numeric: true },
  { cli: '!~', attio: '$not', wrapContains: true },
  { cli: '~', attio: '$contains' },
  { cli: '^', attio: '$starts_with' },
  { cli: '?', attio: '$not_empty', unary: true },  // no value needed
  { cli: '=', attio: '$eq' },
] as const;

export function parseFilterFlag(filterStr: string): AttioFilter {
  // Check for unary operators first (e.g., "phone_numbers?")
  if (filterStr.endsWith('?')) {
    const attr = filterStr.slice(0, -1);
    return { [attr]: { '$not_empty': true } };
  }

  // Try each operator (longest first)
  for (const op of OPERATORS) {
    const idx = filterStr.indexOf(op.cli);
    if (idx === -1) continue;
    
    const attribute = filterStr.slice(0, idx).trim();
    const rawValue = filterStr.slice(idx + op.cli.length).trim();
    
    // Auto-detect numeric values
    const value = op.numeric && !isNaN(Number(rawValue)) ? Number(rawValue) : rawValue;
    
    if (op.cli === '=') {
      // Simple equality → use Attio shorthand
      return { [attribute]: value };
    }
    
    if (op.cli === '!=') {
      return { '$not': { [attribute]: value } };
    }
    
    if (op.cli === '!~') {
      return { '$not': { [attribute]: { '$contains': value } } };
    }
    
    return { [attribute]: { [op.attio]: value } };
  }
  
  throw new Error(`Invalid filter syntax: "${filterStr}". Expected: attribute<operator>value`);
}

export function combineFilters(filters: AttioFilter[]): AttioFilter {
  if (filters.length === 0) return {};
  if (filters.length === 1) return filters[0];
  return { '$and': filters };
}
```

---

## HARD PART 2: Record Value Flattening (src/values.ts)

Attio returns attribute values in a verbose nested format. The CLI must flatten these for table display while preserving the raw format for `--json` output.

### Attio Value Response Shapes by Attribute Type

```typescript
// What Attio returns for a company record:
{
  "values": {
    // TEXT attribute
    "name": [{
      "value": "Acme Corp",
      "attribute_type": "text",
      "active_from": "2023-01-01T...",
      "active_until": null,
      "created_by_actor": {"type": "workspace-member", "id": "..."}
    }],
    
    // DOMAIN attribute (multiselect by default)
    "domains": [{
      "domain": "acme.com",
      "root_domain": "acme.com",
      "attribute_type": "domain"
    }],
    
    // EMAIL attribute (multiselect by default)
    "email_addresses": [{
      "email_address": "[email protected]",
      "email_domain": "acme.com",
      "original_email_address": "[email protected]",
      "attribute_type": "email-address"
    }],
    
    // PHONE attribute
    "phone_numbers": [{
      "original_phone_number": "+15558675309",
      "country_code": "US",
      "phone_number": "+15558675309",
      "attribute_type": "phone-number"
    }],
    
    // PERSONAL NAME attribute
    "name": [{
      "first_name": "John",
      "last_name": "Smith",
      "full_name": "John Smith",
      "attribute_type": "personal-name"
    }],
    
    // NUMBER attribute
    "employee_count": [{
      "value": 150,
      "attribute_type": "number"
    }],
    
    // CURRENCY attribute
    "deal_value": [{
      "value": 50000,
      "currency_value": 50000,
      "attribute_type": "currency"
    }],
    
    // CHECKBOX attribute
    "is_customer": [{
      "value": true,
      "attribute_type": "checkbox"
    }],
    
    // DATE attribute
    "founded_date": [{
      "value": "2020-01-15",
      "attribute_type": "date"
    }],
    
    // TIMESTAMP attribute
    "created_at": [{
      "value": "2023-06-15T10:30:00.000Z",
      "attribute_type": "timestamp"
    }],
    
    // SELECT attribute
    "industry": [{
      "option": {"id": {"...", "title": "SaaS"}},
      "attribute_type": "select"
    }],
    
    // STATUS attribute
    "stage": [{
      "status": {"id": {"...", "title": "Active"}},
      "attribute_type": "status"
    }],
    
    // RATING attribute
    "priority": [{
      "value": 4,
      "attribute_type": "rating"
    }],
    
    // LOCATION attribute
    "primary_location": [{
      "line_1": "1 Infinite Loop",
      "line_2": null,
      "locality": "Cupertino",
      "region": "CA",
      "postcode": "95014",
      "country_code": "US",
      "latitude": "37.331741",
      "longitude": "-122.030333",
      "attribute_type": "location"
    }],
    
    // RECORD REFERENCE attribute (link to another record)
    "company": [{
      "target_object": "companies",
      "target_record_id": "abc-123",
      "attribute_type": "record-reference"
    }],
    
    // ACTOR REFERENCE attribute (workspace member)
    "owner": [{
      "referenced_actor_type": "workspace-member",
      "referenced_actor_id": "def-456",
      "attribute_type": "actor-reference"
    }],
    
    // INTERACTION attribute (read-only, system-generated)
    "last_interaction": [{
      "interaction_type": "email",
      "interacted_at": "2024-01-15T...",
      "attribute_type": "interaction"
    }]
  }
}
```

### Flattening Implementation

```typescript
// src/values.ts

/**
 * Extract a human-readable display value from an Attio attribute value array.
 * Each attribute in a record's values is an ARRAY (even single-value attributes).
 * We take the first element and extract the display value based on attribute_type.
 */
export function flattenValue(attrValues: any[]): string {
  if (!attrValues || attrValues.length === 0) return '';
  
  // For multiselect attributes, join all values
  if (attrValues.length > 1) {
    return attrValues.map(v => flattenSingleValue(v)).join(', ');
  }
  
  return flattenSingleValue(attrValues[0]);
}

function flattenSingleValue(val: any): string {
  if (!val) return '';
  
  const type = val.attribute_type;
  
  switch (type) {
    case 'text':
    case 'number':
    case 'checkbox':
    case 'date':
    case 'timestamp':
    case 'rating':
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
      // Compact: "Cupertino, CA, US"
      return [val.locality, val.region, val.country_code]
        .filter(Boolean)
        .join(', ');
      
    case 'record-reference':
      // Show as "object:id" — can't resolve name without extra API call
      return `${val.target_object}:${val.target_record_id}`;
      
    case 'actor-reference':
      return `member:${val.referenced_actor_id}`;
      
    case 'interaction':
      return `${val.interaction_type} @ ${val.interacted_at?.slice(0, 10) || ''}`;
      
    default:
      // Fallback: try common value fields
      return String(val.value ?? val.title ?? JSON.stringify(val));
  }
}

/**
 * Flatten an entire record's values object into a flat key-value map.
 * Used for table display.
 */
export function flattenRecord(record: any): Record<string, string> {
  const flat: Record<string, string> = {
    id: record.id?.record_id || '',
    created_at: record.created_at?.slice(0, 10) || '',
  };
  
  if (record.web_url) {
    flat.web_url = record.web_url;
  }
  
  for (const [key, values] of Object.entries(record.values || {})) {
    flat[key] = flattenValue(values as any[]);
  }
  
  return flat;
}
```

---

## HARD PART 3: Value Input Parsing for Create/Update

When users create or update records, they can pass values in several formats. The CLI needs to construct the correct API payload.

### Input Formats

```bash
# JSON string (full control)
attio records create companies --values '{"domains": ["acme.com"], "name": "Acme"}'

# Read from file
attio records create companies --values @company.json

# Key-value pairs (simple types only)
attio records create companies --set name="Acme" --set employee_count=150 --set is_customer=true

# Stdin (JSON)
echo '{"name": "Acme"}' | attio records create companies
```

### Implementation for --set Flag

```typescript
// Parse --set flags into a values object
// Auto-detect types: numbers, booleans, arrays (comma-separated with [])
export function parseSets(sets: string[]): Record<string, any> {
  const values: Record<string, any> = {};
  
  for (const set of sets) {
    const eqIdx = set.indexOf('=');
    if (eqIdx === -1) throw new Error(`Invalid --set format: "${set}". Expected: key=value`);
    
    const key = set.slice(0, eqIdx).trim();
    const raw = set.slice(eqIdx + 1).trim();
    
    // Boolean
    if (raw === 'true') { values[key] = true; continue; }
    if (raw === 'false') { values[key] = false; continue; }
    
    // Number (only if it looks like a pure number)
    if (/^-?\d+(\.\d+)?$/.test(raw)) { values[key] = Number(raw); continue; }
    
    // Array (bracket syntax: [a,b,c])
    if (raw.startsWith('[') && raw.endsWith(']')) {
      values[key] = raw.slice(1, -1).split(',').map(s => s.trim());
      continue;
    }
    
    // String (default)
    values[key] = raw;
  }
  
  return values;
}
```

### Values Payload Wrapping

**CRITICAL:** Create/update endpoints expect values inside a `{"data": {"values": {...}}}` wrapper:

```typescript
// For create:
const body = { data: { values: parsedValues } };

// For upsert (PUT assert):
const body = { data: { values: parsedValues, matching_attribute: matchAttr } };

// For update (PATCH):
const body = { data: { values: parsedValues } };
```

---

## Output Formatting (src/output.ts)

### Auto-Detection

```typescript
import { createWriteStream } from 'fs';

export type OutputFormat = 'json' | 'table' | 'csv' | 'quiet';

export function detectFormat(flags: { json?: boolean; table?: boolean; csv?: boolean; quiet?: boolean }): OutputFormat {
  if (flags.quiet) return 'quiet';
  if (flags.json) return 'json';
  if (flags.csv) return 'csv';
  if (flags.table) return 'table';
  
  // Auto-detect: if stdout is a pipe or file, default to JSON
  // If it's a terminal (TTY), default to table
  return process.stdout.isTTY ? 'table' : 'json';
}
```

### Table Display

For records, show a table with columns for the most common attributes. Auto-detect which attributes have values and only show non-empty columns. Always show `id` as the first column.

For tasks, show: id, content, assignee, deadline, completed.
For notes, show: id, title, parent_object, parent_record_id, created_at.
For lists, show: id, api_slug, name, parent_object.

### Quiet Mode

`-q` / `--quiet` outputs ONLY the ID(s), one per line. This is the killer feature for agent scripting:

```bash
# Returns just: bf071e1f-6035-429d-b874-d83ea64ea13b
NEW_ID=$(attio records create companies --set name="Acme" -q)
attio notes create --object companies --record $NEW_ID --title "First contact" --content "Met at conference"
```

---

## Pagination (src/pagination.ts)

```typescript
export interface PaginationOptions {
  limit: number;    // per-page, default 25
  offset: number;   // starting offset, default 0
  all: boolean;     // auto-paginate everything
}

// For --all mode, keep fetching until we get fewer results than the limit
export async function paginate<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  options: PaginationOptions
): Promise<T[]> {
  if (!options.all) {
    return fetchPage(options.limit, options.offset);
  }
  
  const allResults: T[] = [];
  let offset = 0;
  const pageSize = 500; // max per Attio API
  
  while (true) {
    const page = await fetchPage(pageSize, offset);
    allResults.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  
  return allResults;
}
```

---

## API Client (src/client.ts)

```typescript
import { resolveApiKey } from './config.js';
import { AttioApiError, AttioAuthError, AttioRateLimitError } from './errors.js';

export class AttioClient {
  private baseUrl = 'https://api.attio.com/v2';
  private apiKey: string;
  private maxRetries = 3;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || resolveApiKey();
    if (!this.apiKey) {
      throw new AttioAuthError();
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.ok) {
        // DELETE returns 204 No Content
        if (res.status === 204) return undefined as T;
        const json = await res.json();
        return json as T;
      }

      const errorBody = await res.json().catch(() => ({}));

      if (res.status === 429) {
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new AttioRateLimitError();
      }

      if (res.status === 401) {
        throw new AttioAuthError();
      }

      throw new AttioApiError(res.status, errorBody.type || 'unknown', errorBody.message || res.statusText);
    }

    throw lastError || new Error('Request failed after retries');
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }
}
```

---

## Error Classes (src/errors.ts)

```typescript
import chalk from 'chalk';

export class AttioApiError extends Error {
  constructor(
    public statusCode: number,
    public type: string,
    public detail: string
  ) {
    super(`Attio API Error: ${detail} (${statusCode})`);
  }

  display(): string {
    return [
      chalk.red(`Error: ${this.detail} (${this.statusCode})`),
      chalk.dim(`  Type: ${this.type}`),
    ].join('\n');
  }

  get exitCode(): number {
    if (this.statusCode === 401 || this.statusCode === 403) return 2;
    if (this.statusCode === 404) return 3;
    if (this.statusCode === 400 || this.statusCode === 409) return 4;
    if (this.statusCode === 429) return 5;
    return 1;
  }
}

export class AttioAuthError extends Error {
  display(): string {
    return [
      chalk.red('Error: Authentication failed'),
      '',
      '  No valid API key found. Set one of:',
      `    1. ${chalk.cyan('ATTIO_API_KEY')} environment variable`,
      `    2. ${chalk.cyan('attio config set api-key <key>')}`,
      `    3. ${chalk.cyan('--api-key <key>')} flag`,
      '',
      `  Get your API key at: ${chalk.underline('https://app.attio.com/settings/developers')}`,
    ].join('\n');
  }

  get exitCode(): number { return 2; }
}

export class AttioRateLimitError extends Error {
  display(): string {
    return chalk.red('Error: Rate limited after 3 retries. Try again in a few seconds.');
  }
  get exitCode(): number { return 5; }
}
```

---

## Config (src/config.ts)

```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as dotenv from 'dotenv';

dotenv.config();

const CONFIG_DIR = join(homedir(), '.config', 'attio');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface Config {
  apiKey?: string;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Resolution order:
 * 1. --api-key flag (passed as argument)
 * 2. ATTIO_API_KEY environment variable
 * 3. Config file
 */
export function resolveApiKey(flagValue?: string): string {
  return flagValue || process.env.ATTIO_API_KEY || loadConfig().apiKey || '';
}

export function setApiKey(key: string): void {
  const config = loadConfig();
  config.apiKey = key;
  saveConfig(config);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
```

---

## Sorting

The CLI sort flag should map to Attio's sort format:

```bash
attio records list companies --sort "name:asc"
attio records list people --sort "name.last_name:desc"
```

Maps to:
```json
{"sorts": [{"attribute": "name", "direction": "asc"}]}
{"sorts": [{"attribute": "name", "field": "last_name", "direction": "desc"}]}
```

Parser:
```typescript
export function parseSort(sortStr: string): { attribute: string; field?: string; direction: 'asc' | 'desc' } {
  const [attrPart, direction = 'asc'] = sortStr.split(':');
  const [attribute, field] = attrPart.split('.');
  return { attribute, ...(field ? { field } : {}), direction: direction as 'asc' | 'desc' };
}
```

---

## Confirmation Prompts

For delete commands, prompt for confirmation unless `--yes` / `-y` is passed:

```typescript
import { createInterface } from 'readline';

export async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(`${message} [y/N] `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
```

Note: prompts go to stderr so they don't pollute piped output.

---

## Exit Codes

```
0 — Success
1 — General API error
2 — Auth error
3 — Not found
4 — Validation error
5 — Rate limited (after retries exhausted)
```

---

## Global Flags (on every command)

```
--api-key <key>     Override API key
--json              Force JSON output
--table             Force table output
--csv               Force CSV output
-q, --quiet         Only output IDs
--no-color          Disable colors
--debug             Print request/response details to stderr
```

---

## Entry Point (bin/attio.ts)

```typescript
#!/usr/bin/env node
import { program } from 'commander';
// import all command modules and register them
// Handle uncaught errors globally:
process.on('uncaughtException', (err) => {
  if (err instanceof AttioApiError || err instanceof AttioAuthError || err instanceof AttioRateLimitError) {
    console.error(err.display());
    process.exit(err.exitCode);
  }
  console.error(chalk.red(`Unexpected error: ${err.message}`));
  process.exit(1);
});
```

---

## package.json Key Fields

```json
{
  "name": "attio-cli",
  "version": "0.1.0",
  "description": "CLI for the Attio CRM API. Built for scripts, agents, and humans who prefer terminals.",
  "license": "MIT",
  "type": "module",
  "bin": {
    "attio": "./dist/attio.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsx bin/attio.ts"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

---

## tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['bin/attio.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  noExternal: [/.*/],  // bundle everything
});
```

---

## README.md

Write a README that includes:

1. **One-liner:** "CLI for the Attio CRM API. Built for scripts, agents, and humans who prefer terminals."
2. **Install:** `npm install -g attio-cli`
3. **Quick start:**
   ```bash
   export ATTIO_API_KEY=your_key
   # or
   attio config set api-key your_key

   attio whoami
   attio objects list
   attio people list --limit 5
   ```
4. **Command reference** — table of all commands with one-line descriptions
5. **Filtering examples** — show all operator syntaxes
6. **Scripting examples:**
   ```bash
   # Create a company and immediately add a note
   ID=$(attio records create companies --set name="Acme" --set domains='["acme.com"]' -q)
   attio notes create --object companies --record $ID --title "New lead" --content "From website"

   # Find all stale entries and create follow-up tasks
   attio entries list sales-pipeline --filter "last_activity<2025-01-01" -q | \
     xargs -I{} attio tasks create --content "Follow up on stale deal" --record companies:{}

   # Export all companies to JSON
   attio records list companies --all --json > companies.json

   # Pipe company names to another tool
   attio records list companies --all --json | jq -r '.[].values.name[0].value'
   ```
7. **Why CLI over MCP for agents** — 1 paragraph: deterministic, cheaper (no LLM tokens), faster, composable, debuggable
8. **Contributing** section
9. **License** (MIT)

---

## What NOT to Build

- No interactive/TUI mode
- No OAuth flow (API key auth only)
- No webhook management
- No file uploads
- No batch endpoints
- No watch/streaming mode

---

## Final Checklist

- [ ] Every command has `--help` with usage examples
- [ ] TTY detection for auto-format switching
- [ ] All POST-for-reading endpoints are POST, not GET
- [ ] Response `.data` envelope is always unwrapped
- [ ] Filter parser handles all operators without ambiguity
- [ ] Value flattener handles all 15+ Attio attribute types
- [ ] `--quiet` returns only IDs
- [ ] Delete commands prompt for confirmation
- [ ] Rate limit retry with exponential backoff
- [ ] Config stored in `~/.config/attio/config.json`
- [ ] Errors display human-friendly messages with hints
- [ ] Exit codes are consistent
- [ ] tsup produces a single executable bundle
