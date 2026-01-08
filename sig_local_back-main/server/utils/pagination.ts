// server/utils/pagination.ts
export function parsePagination(query: any, defaults = { page: 1, limit: 20, maxLimit: 100 }) {
  const page = Math.max(1, Number(query?.page) || defaults.page);
  const limitRaw = Number(query?.limit) || defaults.limit;
  const limit = Math.min(defaults.maxLimit, Math.max(1, limitRaw));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPaginationMeta(page: number, limit: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    pages,
    hasPrev: page > 1,
    hasNext: page < pages,
  };
}
