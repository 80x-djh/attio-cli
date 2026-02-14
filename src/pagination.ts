export interface PaginationOptions {
  limit: number;
  offset: number;
  all: boolean;
}

const MAX_ALL_RECORDS = 10_000;

export async function paginate<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  options: PaginationOptions
): Promise<T[]> {
  if (!options.all) {
    return fetchPage(options.limit, options.offset);
  }

  const allResults: T[] = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const page = await fetchPage(pageSize, offset);
    allResults.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
    if (allResults.length >= MAX_ALL_RECORDS) {
      console.error(`Warning: --all stopped after ${MAX_ALL_RECORDS} records. Use --limit and --offset for manual pagination.`);
      break;
    }
  }

  return allResults;
}
