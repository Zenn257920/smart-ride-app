/**
 * POST /api/admin/topups/:id/confirm — admin only. Confirms a pending
 * top-up: the row flips pending -> completed, and because balance =
 * SUM(amount over completed rows), that flip IS the credit — the
 * passenger's ledger gains the amount exactly once.
 *
 * Idempotency: the update is conditional on status = 'pending'. A
 * second confirm finds no pending row and returns 409 instead of
 * crediting again — there is no second ledger row, so a double credit
 * is impossible by construction.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { walletTransactions } from "@/db/schema";
import { getSessionUser, jsonError, requireAdmin } from "@/lib/api-helpers";
import { notifyUser } from "@/lib/notify";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: topupId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);
  if (!(await requireAdmin(sessionUser.id))) {
    return jsonError("Admin only", 403);
  }

  const [updated] = await db
    .update(walletTransactions)
    .set({ status: "completed" })
    .where(
      and(
        eq(walletTransactions.id, topupId),
        eq(walletTransactions.type, "topup"),
        eq(walletTransactions.status, "pending"),
      ),
    )
    .returning();
  if (!updated) {
    const [existing] = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.id, topupId))
      .limit(1);
    if (!existing) return jsonError("Top-up not found", 404);
    return jsonError(
      `Top-up was already ${existing.status} — it cannot be confirmed again`,
      409,
    );
  }

  await notifyUser(
    updated.userId,
    `Your top-up of ${updated.amount.toLocaleString()} MMK was confirmed. Your wallet balance is updated.`,
    "topup",
  );

  return NextResponse.json({ transaction: updated });
}
