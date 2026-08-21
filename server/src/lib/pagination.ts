import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@nemomemo/shared';

export function parsePageParams(query: { pageSize?: string; pageToken?: string }): {
  limit: number;
  offset: number;
} {
  let limit = Number(query.pageSize ?? DEFAULT_PAGE_SIZE);
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;
  let offset = 0;
  if (query.pageToken) {
    try {
      const decoded = JSON.parse(Buffer.from(query.pageToken, 'base64url').toString('utf8')) as {
        o?: number;
      };
      if (Number.isInteger(decoded.o) && decoded.o! >= 0) offset = decoded.o!;
    } catch {
      offset = 0;
    }
  }
  return { limit, offset };
}

export function nextPageToken(offset: number, limit: number, gotExtraRow: boolean): string | null {
  if (!gotExtraRow) return null;
  return Buffer.from(JSON.stringify({ o: offset + limit })).toString('base64url');
}
