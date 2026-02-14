export interface AttioResponse<T> {
  data: T;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
  all: boolean;
}

export interface OutputOptions {
  json?: boolean;
  table?: boolean;
  csv?: boolean;
  quiet?: boolean;
}
