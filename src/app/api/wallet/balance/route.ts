/**
 * GET /api/wallet/balance — { balance, pendingTopups, heldPrepayments }.
 * balance = completed-ledger sum; pendingTopups = sum of pending top-ups
 * (money sent, awaiting confirmation — NOT spendable); heldPrepayments
 * (D8a) = prepayments for ride requests still 'open' — already out of
 * the spendable balance, but not yet released to a driver or refunded.
 */
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { rideRequests, walletTransactions } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { heldPrepaymentTotal } from "@/lib/money";
import { getBalance, getPendingTopups } from "@/lib/wallet";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const [balance, pendingTopups] = await Promise.all([
    getBalance(sessionUser.id),
    getPendingTopups(sessionUser.id),
  ]);

  // D8a: held = my completed 'prepayment' rows whose request is still
  // open. Accepted requests release the fare to the driver and
  // cancelled ones refund it, so neither counts as held any more.
  const prepayments = await db
    .select({
      referenceId: walletTransactions.referenceId,
      amount: walletTransactions.amount,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, sessionUser.id),
        eq(walletTransactions.type, "prepayment"),
        eq(walletTransactions.status, "completed"),
      ),
    );
  const refIds = [
    ...new Set(
      prepayments.map((p) => p.referenceId).filter((id): id is string => !!id),
    ),
  ];
  const openRequestIds =
    refIds.length > 0
      ? (
          await db
            .select({ id: rideRequests.id })
            .from(rideRequests)
            .where(
              and(
                inArray(rideRequests.id, refIds),
                eq(rideRequests.status, "open"),
              ),
            )
        ).map((r) => r.id)
      : [];
  const heldPrepayments = heldPrepaymentTotal(prepayments, openRequestIds);

  return NextResponse.json({ balance, pendingTopups, heldPrepayments });
}
