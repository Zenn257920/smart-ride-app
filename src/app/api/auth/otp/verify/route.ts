/**
 * POST /api/auth/otp/verify — { email, otp }.
 * Step 2 of email-OTP signup: check the 6-digit code.
 *
 * The stored row is consumed atomically (DELETE ... RETURNING) and the
 * guess is evaluated with evaluateOtpAttempt() from src/lib/otp.ts —
 * the same semantics as better-auth's atomicVerifyOTP: expired codes
 * are dead, a code dies after 5 wrong guesses, and a wrong guess with
 * attempts left restores the row with the counter incremented.
 *
 * A correct guess mints a short-lived "signup-verified" marker row and
 * returns its token. The token — not the OTP — is what step 3
 * (complete-signup) consumes to create the account, so a verified
 * email cannot be replayed after the marker is used or expires.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { jsonError } from "@/lib/api-helpers";
import {
  OTP_LENGTH,
  VERIFIED_TOKEN_TTL_MS,
  evaluateOtpAttempt,
  generateVerifiedToken,
  normalizeEmail,
  otpIdentifier,
  verifiedIdentifier,
} from "@/lib/otp";

const verifySchema = z.object({
  email: z.email({ message: "အီးမေးလ် မှားနေပါသည်။" }),
  otp: z
    .string()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), "ကုဒ်သည် ဂဏန်း ၆ လုံး ဖြစ်ရပါမည်။"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "ကုဒ် မှားနေပါသည်။",
      400,
    );
  }
  const email = normalizeEmail(parsed.data.email);
  const supplied = parsed.data.otp.trim();

  // Atomic consume: exactly one caller can hold the row, so a correct
  // guess cannot be replayed by a concurrent request.
  const identifier = otpIdentifier(email);
  const [consumed] = await db
    .delete(verification)
    .where(eq(verification.identifier, identifier))
    .returning();

  const result = evaluateOtpAttempt({
    storedValue: consumed?.value ?? null,
    expiresAt: consumed?.expiresAt ?? null,
    supplied,
  });

  if (result.status === "not-found") {
    return jsonError("ကုဒ် မှားနေပါသည်။ ကုဒ်အသစ် တောင်းကြည့်ပါ။", 400);
  }
  if (result.status === "expired") {
    return jsonError("ကုဒ် သက်တမ်း ကုန်သွားပါပြီ။ ကုဒ်အသစ် တောင်းပါ။", 400);
  }
  if (result.status === "locked") {
    return jsonError(
      "အကြိမ် အများကြီး မှားသွားပါပြီ။ ကုဒ်အသစ် တောင်းပါ။",
      403,
    );
  }
  if (result.status === "invalid" && result.restoreValue) {
    // Wrong guess, attempts remain: put the row back with the counter
    // incremented and the original expiry.
    await db.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: result.restoreValue,
      expiresAt: consumed!.expiresAt,
    });
    return NextResponse.json(
      {
        error: `ကုဒ် မှားနေပါသည်။ ${result.attemptsLeft} ကြိမ် ကျန်ပါသေးတယ်။`,
        attemptsLeft: result.attemptsLeft,
      },
      { status: 400 },
    );
  }

  // Correct: mint the verified-email marker (30 min) and hand its
  // token to the client for step 3. Any older marker is replaced.
  const token = generateVerifiedToken();
  const markerId = verifiedIdentifier(email);
  await db.delete(verification).where(eq(verification.identifier, markerId));
  await db.insert(verification).values({
    id: randomUUID(),
    identifier: markerId,
    value: token,
    expiresAt: new Date(Date.now() + VERIFIED_TOKEN_TTL_MS),
  });
  return NextResponse.json({ ok: true, token });
}
