/**
 * A3 — idempotency for POST /api/rides/:id/book and /api/wallet/withdraw.
 *
 * Design (kept small, consistent with the ledger = SUM(amount) rule):
 * - The client sends a per-operation UUID as the `Idempotency-Key`
 *   header or the `idempotencyKey` body field. Bookings get one key per
 *   modal-open (see BookingModal); withdrawals one per dialog-open.
 *   A key is NEVER reused for a different operation — the store is
 *   keyed by (user, key), so reusing a key replays the old response.
 * - State lives in the `idempotency_keys` table (see src/db/schema):
 *   claim = insert row (response NULL = in flight); complete = store
 *   { status, body }; release = delete row. The unique index on
 *   (user_id, key) makes the claim itself the race guard: two
 *   concurrent requests with the same key can't both claim it.
 * - Only 2xx results are stored. A 4xx/5xx result releases the key so
 *   the client can retry cleanly — nothing moved, so a retry is safe.
 * - A replay returns the stored response verbatim, with the same HTTP
 *   status the first attempt returned.
 *
 * `runIdempotent` is generic over a tiny store interface so vitest can
 * exercise the exact double-submit logic with an in-memory store while
 * the routes use the Postgres-backed store (`dbIdempotencyStore` in
 * ./idempotency-db — kept in a separate module because this file must
 * stay importable by vitest without the `@/` alias or a database).
 */

import { isUniqueViolation } from "./race-guards";

export { isUniqueViolation };

/** What a finished operation stored: replay this verbatim. */
export interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Lookup outcome: never seen, in flight, or done with a stored response. */
export type KeyLookup =
  | { state: "missing" }
  | { state: "in-flight" }
  | { state: "done"; response: StoredResponse };

export interface IdempotencyStore {
  lookup(key: string): Promise<KeyLookup>;
  /** Insert the claim row. False when the key is already claimed/done. */
  claim(key: string): Promise<boolean>;
  complete(key: string, response: StoredResponse): Promise<void>;
  /** Delete the claim row (failed attempt — client may retry). */
  release(key: string): Promise<void>;
}

export interface IdempotentOutcome {
  response: StoredResponse;
  /** True when this is a replay of a previous attempt's stored result. */
  replayed: boolean;
}

/** 409 body for a duplicate that arrives while the first is in flight. */
export const IN_FLIGHT_ERROR = "This request is already in progress — please wait a moment and retry.";

/**
 * Run `fn` once per key. Without a key this is a plain passthrough.
 * With a key: a stored result is replayed, an in-flight key returns
 * the 409 outcome, and a fresh key claims, runs, stores (2xx only)
 * and returns the result.
 */
export async function runIdempotent(
  store: IdempotencyStore | null,
  key: string | null,
  fn: () => Promise<StoredResponse>,
): Promise<IdempotentOutcome> {
  if (!store || !key) {
    return { response: await fn(), replayed: false };
  }
  const seen = await store.lookup(key);
  if (seen.state === "done") {
    return { response: seen.response, replayed: true };
  }
  if (seen.state === "in-flight") {
    return {
      response: { status: 409, body: { error: IN_FLIGHT_ERROR } },
      replayed: false,
    };
  }
  const claimed = await store.claim(key);
  if (!claimed) {
    // Lost the race to claim: re-read — the winner either finished
    // (replay it) or is still running (409).
    const again = await store.lookup(key);
    if (again.state === "done") {
      return { response: again.response, replayed: true };
    }
    return {
      response: { status: 409, body: { error: IN_FLIGHT_ERROR } },
      replayed: false,
    };
  }
  const response = await fn().catch(async (err) => {
    // A crash / 500 after claiming must not leave the key stuck
    // in-flight forever — release it so the client can retry.
    await store.release(key);
    throw err;
  });
  if (response.status >= 200 && response.status < 300) {
    await store.complete(key, response);
  } else {
    await store.release(key);
  }
  return { response, replayed: false };
}

/** In-memory store — same semantics as the DB store, for tests. */
export function memoryIdempotencyStore(): IdempotencyStore {
  const rows = new Map<string, StoredResponse | null>();
  return {
    async lookup(key: string): Promise<KeyLookup> {
      if (!rows.has(key)) return { state: "missing" };
      const stored = rows.get(key);
      if (stored == null) return { state: "in-flight" };
      return { state: "done", response: stored };
    },
    async claim(key: string): Promise<boolean> {
      if (rows.has(key)) return false;
      rows.set(key, null);
      return true;
    },
    async complete(key: string, response: StoredResponse): Promise<void> {
      rows.set(key, response);
    },
    async release(key: string): Promise<void> {
      rows.delete(key);
    },
  };
}

/** Header wins; body field is the fallback. Returns null when absent. */
export function extractIdempotencyKey(
  request: Request,
  body: unknown,
): string | null {
  const header = request.headers.get("Idempotency-Key")?.trim();
  if (header) return header;
  if (body && typeof body === "object") {
    const fromBody = (body as Record<string, unknown>).idempotencyKey;
    if (typeof fromBody === "string" && fromBody.trim()) {
      return fromBody.trim();
    }
  }
  return null;
}

/** Keys are client UUIDs; anything else is rejected as a 400 by the route. */
export function isValidIdempotencyKey(key: string): boolean {
  return /^[A-Za-z0-9._-]{8,128}$/.test(key);
}
