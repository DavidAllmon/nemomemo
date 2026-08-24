import type { Context, MiddlewareHandler } from 'hono';
import { apiError } from '../lib/errors.js';

/** Real client IP: Cloudflare's header behind the tunnel, else the proxy chain head. */
export function clientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}

/**
 * Small fixed-window in-memory limiter, one state map per instance so tests and
 * per-reef apps stay independent. Deliberately no external store: a restart
 * resetting the counters is an acceptable trade for zero infrastructure.
 */
export function makeRateLimiter(options: {
  scope: string;
  windowMs: number;
  max: number;
  /** Override the 429 copy — "attempts" only fits the auth paths. */
  message?: string;
}): MiddlewareHandler {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }
    const key = `${options.scope}:${clientIp(c)}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    } else if (++bucket.count > options.max) {
      throw apiError(
        'RESOURCE_EXHAUSTED',
        options.message ?? 'Too many attempts — catch your breath and swim back in a minute',
        {
          'retry-after': String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
        },
      );
    }
    await next();
  };
}
