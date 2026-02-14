import chalk from 'chalk';
import Table from 'cli-table3';
import { createInterface } from 'readline';

export type OutputFormat = 'json' | 'table' | 'csv' | 'quiet';

export function detectFormat(opts: { json?: boolean; table?: boolean; csv?: boolean; quiet?: boolean }): OutputFormat {
  if (opts.quiet) return 'quiet';
  if (opts.json) return 'json';
  if (opts.csv) return 'csv';
  if (opts.table) return 'table';
  return process.stdout.isTTY ? 'table' : 'json';
}

export function outputList(items: Record<string, any>[], opts: {
  format: OutputFormat;
  columns?: string[];
  idField?: string;
}): void {
  const format = opts.format;
  const idField = opts.idField || 'id';

  if (format === 'quiet') {
    for (const item of items) {
      const raw = typeof item === 'string' ? item : (item[idField] || '');
      const id = typeof raw === 'object' && raw !== null ? Object.values(raw)[0] : raw;
      if (id) console.log(id);
    }
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (items.length === 0) {
    if (format === 'table') console.log(chalk.dim('No results.'));
    return;
  }

  const columns = opts.columns || Object.keys(items[0]).slice(0, 8);

  if (format === 'csv') {
    console.log(columns.join(','));
    for (const row of items) {
      console.log(columns.map(c => {
        const v = String(row[c] ?? '');
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(','));
    }
    return;
  }

  // table
  const table = new Table({
    head: columns.map(c => chalk.cyan(c)),
    style: { head: [], border: [] },
    wordWrap: true,
  });
  for (const row of items) {
    table.push(columns.map(c => {
      const v = String(row[c] ?? '');
      return v.length > 60 ? v.slice(0, 57) + '...' : v;
    }));
  }
  console.log(table.toString());
}

export function outputSingle(item: Record<string, any>, opts: {
  format: OutputFormat;
  idField?: string;
}): void {
  if (opts.format === 'quiet') {
    const raw = item[opts.idField || 'id'] || '';
    const id = typeof raw === 'object' && raw !== null ? Object.values(raw)[0] : raw;
    console.log(id || '');
    return;
  }
  if (opts.format === 'json') {
    console.log(JSON.stringify(item, null, 2));
    return;
  }
  // table format: key-value pairs
  const table = new Table({ style: { head: [], border: [] } });
  for (const [key, value] of Object.entries(item)) {
    const display = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    table.push({ [chalk.cyan(key)]: display.length > 80 ? display.slice(0, 77) + '...' : display });
  }
  console.log(table.toString());
}

export async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(`${message} [y/N] `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
