/**
 * GET /api/admin/ledger — admin only. The most recent 100 ledger rows
 * (any type/status) with the owning user's name/email, newest first.
 * Read-only view over wallet_transactions — it never moves money.
 */
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, walletTransactions } from "@/db/schema";
import { getSessionUser, jsonError, requireAdmin } from "@/lib/api-helpers";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);
  if (!(await requireAdmin(sessionUser.id))) {
    return jsonError("Admin only", 403);
  }

  const rows = await db
    .select({
      id: walletTransactions.id,
      userId: walletTransactions.userId,
      type: walletTransactions.type,
      amount: walletTransactions.amount,
      description: walletTransactions.description,
      referenceId: walletTransactions.referenceId,
      status: walletTransactions.status,
      createdAt: walletTransactions.createdAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(walletTransactions)
    .leftJoin(user, eq(walletTransactions.userId, user.id))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(100);

  return NextResponse.json({ transactions: rows });
}
