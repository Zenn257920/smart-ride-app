/**
 * /api/admin/payment-settings — admin only.
 *
 * GET   — list ALL receiving-account rows (enabled and disabled),
 *         newest first, so the admin page can edit them.
 * POST  — create or update the row for one provider (upsert by
 *         provider): { provider, accountNumber, accountName,
 *         enabled? }. One row per provider, enforced by the unique
 *         constraint on payment_settings.provider.
 * PATCH — update an existing provider's row: { provider,
 *         accountNumber?, accountName?, enabled? }. 404 when the
 *         provider has no row yet (use POST to create it).
 *
 * Nothing is seeded and nothing is hardcoded: until an admin saves a
 * row here, that provider shows as unavailable in the top-up flow.
 */
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentSettings } from "@/db/schema";
import { getSessionUser, jsonError, requireAdmin } from "@/lib/api-helpers";
import {
  validatePaymentSetting,
  validatePaymentSettingPatch,
} from "@/lib/payment-settings";

/** 401 when signed out, 403 when not an admin, null when allowed. */
async function adminError(): Promise<NextResponse | null> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);
  if (!(await requireAdmin(sessionUser.id))) {
    return jsonError("Admin only", 403);
  }
  return null;
}

export async function GET() {
  const error = await adminError();
  if (error) return error;

  const rows = await db
    .select()
    .from(paymentSettings)
    .orderBy(desc(paymentSettings.createdAt));

  return NextResponse.json({ settings: rows });
}

export async function POST(request: Request) {
  const error = await adminError();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = validatePaymentSetting(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  const { provider, accountNumber, accountName, enabled } = parsed.value;

  const [row] = await db
    .insert(paymentSettings)
    .values({ provider, accountNumber, accountName, enabled })
    .onConflictDoUpdate({
      target: paymentSettings.provider,
      set: {
        accountNumber,
        accountName,
        enabled,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ setting: row }, { status: 201 });
}

export async function PATCH(request: Request) {
  const error = await adminError();
  if (error) return error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Invalid payment setting.", 400);
  }
  const provider = (body as Record<string, unknown>).provider;
  if (typeof provider !== "string" || !provider) {
    return jsonError("Provider must be KBZPay or WavePay.", 400);
  }
  const parsed = validatePaymentSettingPatch(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const [row] = await db
    .update(paymentSettings)
    .set({ ...parsed.value, updatedAt: new Date() })
    .where(eq(paymentSettings.provider, provider))
    .returning();
  if (!row) {
    return jsonError(
      `No receiving account saved for ${provider} yet — use POST to create it.`,
      404,
    );
  }

  return NextResponse.json({ setting: row });
}
