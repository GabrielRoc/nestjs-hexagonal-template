import type { PaginationMeta } from '../interfaces';

export interface PaginationParams {
  page: number;
  perPage: number;
}

export function parsePaginationParams(query: {
  page?: string;
  perPage?: string;
}): PaginationParams {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(query.perPage ?? '20', 10) || 20),
  );
  return { page, perPage };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  perPage: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / perPage);
  return {
    total,
    page,
    perPage,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

export function parseSortParam(
  sort?: string,
): { field: string; order: 'ASC' | 'DESC' } | null {
  if (!sort) return null;
  if (sort.startsWith('-')) {
    return { field: sort.slice(1), order: 'DESC' };
  }
  return { field: sort, order: 'ASC' };
}
