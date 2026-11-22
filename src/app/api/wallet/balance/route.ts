/**
 * GET /api/wallet/balance — { balance, pendingTopups }.
 * balance = completed-ledger sum; pendingTopups = sum of pending top-ups
 * (money sent, awaiting confirmation — NOT spendable).
 */
import { NextResponse } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { getBalance, getPendingTopups } from "@/lib/wallet";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const [balance, pendingTopups] = await Promise.all([
    getBalance(sessionUser.id),
    getPendingTopups(sessionUser.id),
  ]);
  return NextResponse.json({ balance, pendingTopups });
}
