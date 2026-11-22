/**
 * Wallet ledger helpers.
 *
 * The wallet_transactions table is the source of truth for balances — there
 * is NO balance column anywhere. Balance = SUM(amount) over rows with
 * status 'completed'. Amounts are signed: money in is positive, money out
 * is negative. No app-owner ledger rows are ever created; the app's 5%
 * commission lives only in booking.app_fee / request_passengers.app_fee.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { walletTransactions } from "@/db/schema";

export type WalletTxType =
  | "topup"
  | "withdraw"
  | "ride_payment"
  | "ride_earning"
  | "prepayment"
  | "refund"
  | "adjustment";

export type WalletTxStatus = "completed" | "pending" | "failed";

/** Completed-ledger balance for a user (0 when they have no rows). */
export async function getBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, userId),
        eq(walletTransactions.status, "completed"),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Sum of a user's PENDING top-ups (money sent, awaiting confirmation). */
export async function getPendingTopups(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, userId),
        eq(walletTransactions.type, "topup"),
        eq(walletTransactions.status, "pending"),
      ),
    );
  return Number(row?.total ?? 0);
}

export interface AddTransactionInput {
  userId: string;
  type: WalletTxType;
  /** Signed amount: negative = money out, positive = money in. */
  amount: number;
  description: string;
  referenceId?: string | null;
  status?: WalletTxStatus;
}

/** Insert a single ledger row and return it. Defaults to 'completed'. */
export async function addTransaction(input: AddTransactionInput) {
  const [row] = await db
    .insert(walletTransactions)
    .values({
      userId: input.userId,
      type: input.type,
      amount: input.amount,
      description: input.description,
      referenceId: input.referenceId ?? null,
      status: input.status ?? "completed",
    })
    .returning();
  return row;
}
