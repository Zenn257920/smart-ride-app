/**
 * C3 — per-IP rate limiting + short-TTL result caching for the public
 * proxy endpoints (geocode / route / rides search).
 *
 * Limits (per client IP, fixed window, in-memory):
 *   GET /api/geocode       30 req / 60s — LocationField debounces 400ms
 *                            and needs >= 3 chars, so normal typing is
 *                            ~1 req per pause; 30/min leaves headroom.
 *   GET /api/route         60 req / 60s — map moves / previews refetch
 *                            the route often; still far below OSRM abuse.
 *   GET /api/rides/search  30 req / 60s — one search per form submit.
 *   POST /api/auth/phone-login 10 req / 60s — login brute-force guard
 *                            for the custom phone-login route (Better
 *                            Auth's own limiter doesn't cover it; see
 *                            src/lib/auth.ts for the /api/auth/* limit).
 *   These counters live in process memory: they reset on redeploy and
 *   are per Vercel instance, not global. That is acceptable for a
 *   small app behind one region — the goal is to stop casual abuse
 *   and to keep Nominatim (1 req/s policy) from getting the Vercel IP
 *   blocked, not to provide distributed rate limiting.
 *
 * Caches (in-memory, same caveats):
 *   geocode results: 10 min TTL, keyed by the normalised query.
 *   route results:   10 min TTL, keyed by start/end rounded to 5dp
 *                    (~1m precision — same route, same response).
 * Only successful (upstream 200) responses are cached. Search is NOT
 * cached: its results depend on live seats / bookings.
 *
 * The factories take an injectable `now` so vitest can test window
 * expiry and TTL eviction without waiting.
 */

import { NextResponse } from "next/server";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitCheck {
  allowed: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
  remaining: number;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/** Fixed-window per-key counter. */
export function createRateLimiter() {
  const windows = new Map<string, WindowState>();

  function prune(now: number): void {
    if (windows.size < 1000) return;
    for (const [k, w] of windows) {
      if (w.resetAt <= now) windows.delete(k);
    }
  }

  return {
    check(
      key: string,
      opts: RateLimitOptions,
      now: number = Date.now(),
    ): RateLimitCheck {
      prune(now);
      const state = windows.get(key);
      if (!state || state.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + opts.windowMs });
        return { allowed: true, retryAfterSec: 0, remaining: opts.max - 1 };
      }
      if (state.count >= opts.max) {
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
          remaining: 0,
        };
      }
      state.count += 1;
      return {
        allowed: true,
        retryAfterSec: 0,
        remaining: opts.max - state.count,
      };
    },
  };
}

/** Tiny TTL cache: values expire `ttlMs` after being set. */
export function createTtlCache<T>(ttlMs: number) {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string, now: number = Date.now()): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T, now: number = Date.now()): void {
      entries.set(key, { value, expiresAt: now + ttlMs });
    },
  };
}

/** Best-effort client IP: Vercel sets x-forwarded-for (first = client). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

// One limiter + one cache per endpoint, shared module-wide (per server
// instance). Tests use the factories above, not these singletons.
const limiter = createRateLimiter();
export const geocodeCache = createTtlCache<unknown>(10 * 60 * 1000);
export const routeCache = createTtlCache<unknown>(10 * 60 * 1000);

export const RATE_LIMITS = {
  geocode: { windowMs: 60_000, max: 30 },
  route: { windowMs: 60_000, max: 60 },
  search: { windowMs: 60_000, max: 30 },
  phoneLogin: { windowMs: 60_000, max: 10 },
  // Email-OTP signup (see src/lib/otp.ts for the constants):
  //   otpSendCooldown — 1 send / 60s per email (resend button cooldown).
  //   otpSendEmailHourly — 5 sends / hour per email.
  //   otpSendIpHourly — 20 sends / hour per IP (across all emails).
  otpSendCooldown: { windowMs: 60_000, max: 1 },
  otpSendEmailHourly: { windowMs: 3_600_000, max: 5 },
  otpSendIpHourly: { windowMs: 3_600_000, max: 20 },
} as const;

/**
 * Generic per-key check against the shared limiter (routes compose
 * their own keys, e.g. `otpSend:email:${email}`). Tests use the
 * createRateLimiter factory directly; this is the server-side entry.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now(),
): RateLimitCheck {
  return limiter.check(key, opts);
}

/**
 * Check the per-IP limit for an endpoint. Returns a 429 response when
 * the limit is hit (with a Retry-After header), or null to continue.
 */
export function rateLimitResponse(
  request: Request,
  which: keyof typeof RATE_LIMITS,
): NextResponse | null {
  const opts = RATE_LIMITS[which];
  const key = `${which}:${getClientIp(request)}`;
  const check = limiter.check(key, opts);
  if (check.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests — please wait a moment and try again." },
    {
      status: 429,
      headers: { "Retry-After": String(check.retryAfterSec) },
    },
  );
}
