/**
 * GET /api/wallet/transactions — my ledger rows, newest first.
 * ?limit= (default 50, max 100).
 */
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { walletTransactions } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const limit = parsed.data.limit ?? 50;

  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, sessionUser.id))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit);

  return NextResponse.json({ transactions });
}
