import { HTTPException } from 'hono/http-exception';

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'ALREADY_EXISTS'
  | 'RESOURCE_EXHAUSTED'
  | 'UPSTREAM'
  | 'INTERNAL';

const STATUS: Record<ApiErrorCode, 401 | 403 | 404 | 400 | 409 | 429 | 500 | 502> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_ARGUMENT: 400,
  ALREADY_EXISTS: 409,
  RESOURCE_EXHAUSTED: 429,
  UPSTREAM: 502,
  INTERNAL: 500,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  headers: Record<string, string> = {},
): HTTPException {
  return new HTTPException(STATUS[code], {
    res: new Response(JSON.stringify({ error: { code, message } }), {
      status: STATUS[code],
      headers: { 'content-type': 'application/json', ...headers },
    }),
  });
}
