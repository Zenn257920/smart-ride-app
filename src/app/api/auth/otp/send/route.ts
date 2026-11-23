/**
 * POST /api/auth/otp/send — { email }.
 * Step 1 of email-OTP signup: validate the email, refuse it when an
 * account already exists, rate-limit sends, then mint a 6-digit code
 * (Better Auth emailOTP plugin storage) and email it via Gmail SMTP.
 *
 * No account is created here — that waits for
 * POST /api/auth/otp/complete-signup after the code is verified.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { user, verification } from "@/db/schema";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import {
  MailNotConfiguredError,
  isMailConfigured,
  sendSignupOtpEmail,
} from "@/lib/mail";
import {
  normalizeEmail,
  otpIdentifier,
} from "@/lib/otp";
import {
  RATE_LIMITS,
  checkRateLimit,
  getClientIp,
} from "@/lib/rate-limit";

const sendSchema = z.object({
  email: z.email({ message: "အီးမေးလ် မှားနေပါသည်။" }),
});

function tooManyResponse(retryAfterSec: number) {
  return NextResponse.json(
    {
      error:
        "တောင်းဆိုမှု များနေပါတယ်။ ခဏစောင့်ပြီး ထပ်ကြိုးစားပါ။",
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "အီးမေးလ် မှားနေပါသည်။",
      400,
    );
  }
  const email = normalizeEmail(parsed.data.email);

  // Duplicate email: refuse to send — no one may squat an existing
  // email (this also protects the pre-created admin email).
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) {
    return jsonError(
      "ဒီအီးမေးလ်နဲ့ အကောင့် ရှိပြီးသားပါ။ အကောင့်ဝင်ပါ။",
      400,
    );
  }

  // Fail fast with a clear error when SMTP is not configured — the
  // UI shows "email sending is not configured yet" instead of
  // crashing, no OTP row is created for a mail that never goes out,
  // and the failure does not burn any of the send quotas below.
  if (!isMailConfigured()) {
    return jsonError(
      "အီးမေးလ် ပို့ဆောင်မှု မပြင်ဆင်ရသေးပါ။ နောက်မှ ထပ်ကြိုးစားပါ။",
      503,
    );
  }

  // Rate limits: 60s cooldown per email, 5 sends/hour per email,
  // 20 sends/hour per IP. Cooldown first so a double-tap gets the
  // short "wait a moment" answer instead of burning the hourly quota.
  const cooldown = checkRateLimit(
    `otpSend:cooldown:${email}`,
    RATE_LIMITS.otpSendCooldown,
  );
  if (!cooldown.allowed) return tooManyResponse(cooldown.retryAfterSec);
  const perEmail = checkRateLimit(
    `otpSend:email:${email}`,
    RATE_LIMITS.otpSendEmailHourly,
  );
  if (!perEmail.allowed) return tooManyResponse(perEmail.retryAfterSec);
  const perIp = checkRateLimit(
    `otpSend:ip:${getClientIp(request)}`,
    RATE_LIMITS.otpSendIpHourly,
  );
  if (!perIp.allowed) return tooManyResponse(perIp.retryAfterSec);

  // Rotate: drop any still-valid earlier code for this email so only
  // the newest code works (the plugin's create API does not do this
  // itself). The OTP itself is generated + stored by the emailOTP
  // plugin in the `verification` table (value `${otp}:0`, 10-min
  // expiry) — see src/lib/otp.ts.
  const identifier = otpIdentifier(email);
  await db.delete(verification).where(eq(verification.identifier, identifier));
  let otp: string;
  try {
    otp = await auth.api.createVerificationOTP({
      body: { email, type: "email-verification" },
    });
  } catch {
    // A concurrent send may have recreated the row between our delete
    // and create — clear it and try exactly once more.
    await db
      .delete(verification)
      .where(eq(verification.identifier, identifier));
    otp = await auth.api.createVerificationOTP({
      body: { email, type: "email-verification" },
    });
  }

  try {
    await sendSignupOtpEmail(email, otp);
  } catch (err) {
    // The mail never went out — delete the useless code so a retry
    // mints a fresh one, and say so plainly.
    await db
      .delete(verification)
      .where(eq(verification.identifier, identifier));
    if (err instanceof MailNotConfiguredError) {
      return jsonError(
        "အီးမေးလ် ပို့ဆောင်မှု မပြင်ဆင်ရသေးပါ။ နောက်မှ ထပ်ကြိုးစားပါ။",
        503,
      );
    }
    return jsonError("အီးမေးလ် ပို့၍ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။", 502);
  }

  return NextResponse.json({ ok: true });
}
