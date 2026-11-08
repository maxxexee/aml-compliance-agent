/**
 * API security helpers
 *
 * API key authentication for the expensive compliance routes, plus a
 * per-client fixed window rate limiter for everything under /api.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(value).digest();
}

/**
 * Compare a provided API key with the configured one.
 * Returns true when no key is configured, so authentication stays opt-in.
 */
export function apiKeysMatch(provided, expected) {
  if (!expected) return true;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Express middleware that requires a valid x-api-key header.
 * When `expected` is empty the middleware is a no-op.
 */
export function requireApiKey(expected) {
  return function apiKeyMiddleware(req, res, next) {
    if (apiKeysMatch(req.get('x-api-key'), expected)) return next();
    return res.status(401).json({
      error: 'unauthorized',
      hint: 'Send the API key in the x-api-key header.',
    });
  };
}

/**
 * Create a fixed window rate limiter keyed by client address.
 *
 * The limiter is in memory and per process. It is enough for a single
 * instance demo; a multi instance deployment needs a shared store.
 */
export function createRateLimiter({ windowMs = 60_000, max = 60, now = Date.now } = {}) {
  const buckets = new Map();
  const sweepEvery = windowMs * 10;
  let lastSweep = now();

  function sweep(current) {
    if (current - lastSweep < sweepEvery) return;
    lastSweep = current;
    for (const [key, bucket] of buckets) {
      if (current - bucket.start >= windowMs) buckets.delete(key);
    }
  }

  function middleware(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const current = now();
    sweep(current);

    let bucket = buckets.get(key);
    if (!bucket || current - bucket.start >= windowMs) {
      bucket = { start: current, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil((bucket.start + windowMs) / 1000);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(resetSeconds));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.start + windowMs - current) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'rate limit exceeded',
        limit: max,
        window_seconds: Math.ceil(windowMs / 1000),
        retry_after_seconds: retryAfter,
      });
    }

    return next();
  }

  middleware.reset = () => buckets.clear();

  return middleware;
}
