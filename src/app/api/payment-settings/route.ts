/**
 * GET /api/payment-settings — any signed-in user. Returns the ENABLED
 * receiving accounts only (provider + account number + name), so the
 * top-up flow can show where to send the money. Providers the admin
 * has not configured (or has disabled) are simply absent — the wallet
 * page shows them as unavailable. No admin-only fields are exposed.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentSettings } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { PAYMENT_PROVIDERS } from "@/lib/payment-settings";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const rows = await db
    .select({
      provider: paymentSettings.provider,
      accountNumber: paymentSettings.accountNumber,
      accountName: paymentSettings.accountName,
    })
    .from(paymentSettings)
    .where(eq(paymentSettings.enabled, true));

  // Stable KBZPay-then-WavePay order for the wallet UI.
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const settings = PAYMENT_PROVIDERS.filter((p) => byProvider.has(p)).map(
    (p) => byProvider.get(p)!,
  );

  return NextResponse.json({ settings });
}
