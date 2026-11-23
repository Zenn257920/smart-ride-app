/**
 * GET  /api/wallet/topup — list my top-up records, newest first.
 * POST /api/wallet/topup — { amount >= 1000, method KBZPay|WavePay,
 *      phone?, transactionId (required), proofImageBase64? (optional
 *      receipt screenshot, ~1MB cap) }. Creates a wallet_transactions
 *      row type 'topup', amount +amount, status 'pending', with the
 *      transaction ID + screenshot stored for the admin to check.
 *
 * v1 has no payment gateway: a top-up does NOT change the balance
 * until an admin confirms it in the admin section (D2). The response
 * says so ('waiting for confirmation'), and every admin is notified
 * (D7) so the pending top-up is not only discovered by opening the
 * admin page.
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, walletTransactions } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { notifyUser } from "@/lib/notify";
import { validateTopupPayload } from "@/lib/payment-settings";
import { addTransaction } from "@/lib/wallet";

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
  // Validation lives in src/lib/payment-settings.ts (single source of
  // truth, covered by tests/payment-settings.test.ts): amount >= 1000,
  // KBZPay|WavePay only, transaction ID required, screenshot optional
  // and capped at ~1MB. NOTE: "Cash" is no longer accepted here — a
  // manual top-up must go through a mobile-money transfer with a
  // transaction ID an admin can check.
  const parsed = validateTopupPayload(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }
  const { amount, method, phone, transactionId, proofImageBase64 } =
    parsed.value;

  const tx = await addTransaction({
    userId: sessionUser.id,
    type: "topup",
    amount,
    description: `Top-up via ${method}${phone ? ` (${phone})` : ""} — txn ${transactionId} — waiting for confirmation`,
    status: "pending",
    transactionId,
    proofImageBase64,
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
      `Top-up pending: ${sessionUser.name ?? "A user"} requested ${amount.toLocaleString()} MMK via ${method} (txn ${transactionId}). Confirm it in the admin section.`,
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
