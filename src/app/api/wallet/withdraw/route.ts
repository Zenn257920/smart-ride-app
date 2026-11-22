/**
 * POST /api/wallet/withdraw — { amount >= 1000 }. Balance check first
 * (409 when insufficient), then a completed ledger row 'withdraw' -amount.
 *
 * A3 race guards (Neon HTTP driver has no transactions):
 * - Idempotency: an `Idempotency-Key` header (or `idempotencyKey` body
 *   field) makes a retried request replay the stored 201 instead of
 *   withdrawing twice (see src/lib/idempotency).
 * - Post-write overdraw guard: the pre-check can pass twice for two
 *   simultaneous withdrawals, so after inserting the row the balance
 *   is re-read; if the completed-ledger balance went negative, the row
 *   is flipped to 'failed' (failed rows never count toward the balance)
 *   and the caller gets 409. The loser of the race therefore fails
 *   cleanly instead of driving the balance negative. A crash between
 *   insert and re-read can still leave an over-withdrawal — the known
 *   residual risk of having no transactions.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { walletTransactions } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import {
  extractIdempotencyKey,
  isValidIdempotencyKey,
  runIdempotent,
  type StoredResponse,
} from "@/lib/idempotency";
import { dbIdempotencyStore } from "@/lib/idempotency-db";
import { withdrawWouldOverdraw } from "@/lib/race-guards";
import { addTransaction, getBalance } from "@/lib/wallet";

const withdrawSchema = z.object({
  amount: z.number().int().min(1000),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const key = extractIdempotencyKey(request, body);
  if (key !== null && !isValidIdempotencyKey(key)) {
    return jsonError("Invalid Idempotency-Key", 400);
  }

  const outcome = await runIdempotent(
    dbIdempotencyStore(sessionUser.id, "POST /api/wallet/withdraw"),
    key,
    () => doWithdraw(sessionUser.id, parsed.data.amount),
  );
  return NextResponse.json(outcome.response.body, {
    status: outcome.response.status,
  });
}

async function doWithdraw(
  userId: string,
  amount: number,
): Promise<StoredResponse> {
  const balance = await getBalance(userId);
  if (balance < amount) {
    return { status: 409, body: { error: "Insufficient Balance" } };
  }

  const tx = await addTransaction({
    userId,
    type: "withdraw",
    amount: -amount,
    description: `Withdraw ${amount.toLocaleString()} Kyats`,
    status: "completed",
  });

  // A3 post-write guard: another withdrawal may have slipped in
  // between the check above and this insert. Re-read the completed
  // balance; if it went negative, void this row instead of letting
  // the balance stay negative.
  const balanceAfter = await getBalance(userId);
  if (withdrawWouldOverdraw(balanceAfter, 0)) {
    await db
      .update(walletTransactions)
      .set({ status: "failed" })
      .where(eq(walletTransactions.id, tx.id));
    return { status: 409, body: { error: "Insufficient Balance" } };
  }

  return {
    status: 201,
    body: { transaction: tx, balance: balanceAfter },
  };
}
