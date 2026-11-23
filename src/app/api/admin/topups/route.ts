/**
 * GET /api/admin/topups — admin only. Lists PENDING top-up requests
 * (wallet_transactions type 'topup', status 'pending'), newest first,
 * with the requesting user's name/email. Confirming/rejecting happens
 * on /api/admin/topups/:id/confirm|reject.
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
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
      amount: walletTransactions.amount,
      description: walletTransactions.description,
      status: walletTransactions.status,
      // Feature A: the admin checks the transaction ID (and the
      // receipt screenshot, when the user attached one) against the
      // real transfer before confirming.
      transactionId: walletTransactions.transactionId,
      proofImageBase64: walletTransactions.proofImageBase64,
      createdAt: walletTransactions.createdAt,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone,
    })
    .from(walletTransactions)
    .leftJoin(user, eq(walletTransactions.userId, user.id))
    .where(
      and(
        eq(walletTransactions.type, "topup"),
        eq(walletTransactions.status, "pending"),
      ),
    )
    .orderBy(desc(walletTransactions.createdAt));

  return NextResponse.json({ topups: rows });
}
