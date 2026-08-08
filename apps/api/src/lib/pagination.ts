import type { Paginated, PaginationQuery } from '@poetree/shared';

export function toSkipTake(query: Pick<PaginationQuery, 'page' | 'pageSize'>): {
  skip: number;
  take: number;
} {
  return {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export function paginate<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQuery, 'page' | 'pageSize'>,
): Paginated<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
