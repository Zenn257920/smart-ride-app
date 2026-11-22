/**
 * GET  /api/wallet/topup — list my top-up records, newest first.
 * POST /api/wallet/topup — { amount >= 1000, method KBZPay|WavePay|Cash,
 *      phone? }. Creates a wallet_transactions row type 'topup',
 *      amount +amount, status 'pending'.
 *
 * v1 has no payment gateway: a top-up does NOT change the balance
 * until an admin confirms it in the admin section (D2). The response
 * says so ('waiting for confirmation'), and every admin is notified
 * (D7) so the pending top-up is not only discovered by opening the
 * admin page.
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user, walletTransactions } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { notifyUser } from "@/lib/notify";
import { addTransaction } from "@/lib/wallet";

const topupSchema = z.object({
  amount: z.number().int().min(1000),
  method: z.enum(["KBZPay", "WavePay", "Cash"]),
  phone: z.string().min(1).optional(),
});

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const topups = await db
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, sessionUser.id),
        eq(walletTransactions.type, "topup"),
      ),
    )
    .orderBy(desc(walletTransactions.createdAt));

  return NextResponse.json({ topups });
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = topupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { amount, method, phone } = parsed.data;

  const tx = await addTransaction({
    userId: sessionUser.id,
    type: "topup",
    amount,
    description: `Top-up via ${method}${phone ? ` (${phone})` : ""} — waiting for confirmation`,
    status: "pending",
  });

  // D7: the top-up is pending until an admin confirms it (D2) — tell
  // every admin it is waiting, so it is not only discovered by opening
  // the admin page. Best-effort: a missing admin row must not fail the
  // top-up itself.
  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.is_admin, true));
  for (const admin of admins) {
    if (admin.id === sessionUser.id) continue;
    await notifyUser(
      admin.id,
      `Top-up pending: ${sessionUser.name ?? "A user"} requested ${amount.toLocaleString()} MMK via ${method}. Confirm it in the admin section.`,
      "topup",
    );
  }

  return NextResponse.json(
    {
      transaction: tx,
      message:
        "Top-up request recorded and waiting for confirmation. Your balance will update once the payment is confirmed.",
    },
    { status: 201 },
  );
}
