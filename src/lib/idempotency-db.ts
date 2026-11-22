/**
 * A3 — Postgres-backed idempotency store (see ./idempotency for the
 * design). Kept in its own module because idempotency.ts must stay
 * importable by vitest without the `@/` alias or a database.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { idempotencyKeys } from "@/db/schema";
import {
  type IdempotencyStore,
  type KeyLookup,
  type StoredResponse,
} from "./idempotency";
import { isUniqueViolation } from "./race-guards";

/** Postgres-backed store for one user + one endpoint. */
export function dbIdempotencyStore(
  userId: string,
  endpoint: string,
): IdempotencyStore {
  return {
    async lookup(key: string): Promise<KeyLookup> {
      const [row] = await db
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, userId),
            eq(idempotencyKeys.key, key),
          ),
        )
        .limit(1);
      if (!row) return { state: "missing" };
      if (row.responseStatus == null || row.responseBody == null) {
        return { state: "in-flight" };
      }
      return {
        state: "done",
        response: { status: row.responseStatus, body: row.responseBody },
      };
    },
    async claim(key: string): Promise<boolean> {
      try {
        await db.insert(idempotencyKeys).values({
          userId,
          key,
          endpoint,
          responseStatus: null,
          responseBody: null,
        });
        return true;
      } catch (err) {
        // Unique violation (23505): another request already holds it.
        if (isUniqueViolation(err)) return false;
        throw err;
      }
    },
    async complete(key: string, response: StoredResponse): Promise<void> {
      await db
        .update(idempotencyKeys)
        .set({ responseStatus: response.status, responseBody: response.body })
        .where(
          and(
            eq(idempotencyKeys.userId, userId),
            eq(idempotencyKeys.key, key),
          ),
        );
    },
    async release(key: string): Promise<void> {
      await db
        .delete(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, userId),
            eq(idempotencyKeys.key, key),
          ),
        );
    },
  };
}
