/**
 * Shared helpers for Smart Ride API routes.
 *
 * NOTE (Neon limitation): the @neondatabase/serverless HTTP driver does NOT
 * support multi-statement interactive transactions, so no route in this
 * module uses `db.transaction()`. Money operations are ordered sequential
 * writes (check -> write ledger -> update booking/ride). A crash between
 * steps can therefore leave a half-applied operation; routes are written so
 * each step is idempotent where possible and the ledger remains the source
 * of truth for balances.
 */
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { drivers, user } from "@/db/schema";

/** The signed-in Better Auth user, or null when there is no session. */
export async function getSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}

/** JSON `{ error }` response with the given HTTP status. */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * The drivers row for a user, or null when the user has never registered
 * as a driver. Use this to gate driver-only routes.
 */
export async function requireDriver(userId: string) {
  const [row] = await db
    .select()
    .from(drivers)
    .where(eq(drivers.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * D2 — admin gate. Reads the flag from the DB user row on every call
 * (never from the session copy, which can be stale), or null when the
 * user is not an admin. Every /api/admin/* route must call this and
 * return 403 when it is null.
 */
export async function requireAdmin(userId: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.isAdmin ? row : null;
}

/** Parse a request body as JSON, returning null when the body is not JSON. */
export async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

/** Parse an ISO date string; returns null when it is not a valid date. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
