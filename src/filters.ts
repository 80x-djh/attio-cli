export interface AttioFilter {
  [key: string]: any;
}

const OPERATORS = [
  { cli: '>=', attio: '$gte', numeric: true },
  { cli: '<=', attio: '$lte', numeric: true },
  { cli: '!=', attio: '$not', wrapEq: true },
  { cli: '>', attio: '$gt', numeric: true },
  { cli: '<', attio: '$lt', numeric: true },
  { cli: '!~', attio: '$not', wrapContains: true },
  { cli: '~', attio: '$contains' },
  { cli: '^', attio: '$starts_with' },
  { cli: '?', attio: '$not_empty', unary: true },
  { cli: '=', attio: '$eq' },
] as const;

export function parseFilterFlag(filterStr: string): AttioFilter {
  if (filterStr.endsWith('?')) {
    const attr = filterStr.slice(0, -1);
    return { [attr]: { '$not_empty': true } };
  }

  for (const op of OPERATORS) {
    if ('unary' in op && op.unary) continue;
    const idx = filterStr.indexOf(op.cli);
    if (idx === -1) continue;

    const attribute = filterStr.slice(0, idx).trim();
    const rawValue = filterStr.slice(idx + op.cli.length).trim();
    const value = ('numeric' in op && op.numeric) && !isNaN(Number(rawValue)) ? Number(rawValue) : rawValue;

    if (op.cli === '=') return { [attribute]: value };
    if (op.cli === '!=') return { '$not': { [attribute]: value } };
    if (op.cli === '!~') return { '$not': { [attribute]: { '$contains': value } } };
    return { [attribute]: { [op.attio]: value } };
  }

  throw new Error(`Invalid filter syntax: "${filterStr}". Expected: attribute<operator>value`);
}

export function combineFilters(filters: AttioFilter[]): AttioFilter {
  if (filters.length === 0) return {};
  if (filters.length === 1) return filters[0];
  return { '$and': filters };
}

export function parseSort(sortStr: string): { attribute: string; field?: string; direction: 'asc' | 'desc' } {
  const [attrPart, direction = 'asc'] = sortStr.split(':');
  const [attribute, field] = attrPart.split('.');
  return { attribute, ...(field ? { field } : {}), direction: direction as 'asc' | 'desc' };
}
