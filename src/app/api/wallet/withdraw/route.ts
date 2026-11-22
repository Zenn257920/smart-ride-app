/**
 * POST /api/wallet/withdraw — { amount >= 1000 }. Balance check first
 * (409 when insufficient), then a completed ledger row 'withdraw' -amount.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { addTransaction, getBalance } from "@/lib/wallet";

const withdrawSchema = z.object({
  amount: z.number().int().min(1000),
});

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { amount } = parsed.data;

  const balance = await getBalance(sessionUser.id);
  if (balance < amount) return jsonError("Insufficient Balance", 409);

  const tx = await addTransaction({
    userId: sessionUser.id,
    type: "withdraw",
    amount: -amount,
    description: `Withdraw ${amount.toLocaleString()} Kyats`,
    status: "completed",
  });

  return NextResponse.json(
    { transaction: tx, balance: balance - amount },
    { status: 201 },
  );
}
