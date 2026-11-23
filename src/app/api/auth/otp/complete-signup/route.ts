/**
 * POST /api/auth/otp/complete-signup — { email, token, name, phone, password }.
 * Step 3 of email-OTP signup: consume the verified-email marker token
 * (minted by POST /api/auth/otp/verify) and only then create the
 * account via Better Auth signUpEmail. Without a valid, unexpired,
 * unused token no account is created — the OTP gate is enforced
 * server-side, not by the client UI.
 *
 * Returns Better Auth's sign-up response (with the session cookie),
 * so the new user lands signed in, exactly like the old direct
 * sign-up did. The new account is marked emailVerified (the email
 * was just proven by OTP) and the duplicate-email check runs again
 * here as defence in depth (signUpEmail also rejects duplicates).
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { user, verification } from "@/db/schema";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { normalizeEmail, verifiedIdentifier } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";
import { signupRoleSchema } from "@/lib/roles";

const completeSchema = z.object({
  email: z.email({ message: "အီးမေးလ် မှားနေပါသည်။" }),
  token: z.string().min(1, "အတည်ပြုချက် မရှိပါ။ ကုဒ်အသစ် တောင်းပါ။"),
  name: z.string().trim().min(1, "အမည် ထည့်ပါ။"),
  phone: z.string().trim().min(1, "ဖုန်းနံပါတ် ထည့်ပါ။"),
  password: z.string().min(6, "စကားဝှက်သည် အနည်းဆုံး ၆ လုံး ရှိရပါမည်။"),
  // One account = one role, chosen once at signup and never changed.
  // Missing means the default (passenger); anything else is rejected.
  role: signupRoleSchema.optional(),
});

const TOKEN_ERROR =
  "အီးမေးလ် အတည်ပြုချက် သက်တမ်း ကုန်သွားပါပြီ။ ကုဒ်အသစ် တောင်းပြီး ထပ်ကြိုးစားပါ။";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "အချက်အလက် မှားနေပါသည်။",
      400,
    );
  }
  const email = normalizeEmail(parsed.data.email);
  const { token, name } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);
  const { password } = parsed.data;
  const role = parsed.data.role ?? "passenger";

  // Consume the marker atomically: one token, one account.
  const markerId = verifiedIdentifier(email);
  const [marker] = await db
    .delete(verification)
    .where(eq(verification.identifier, markerId))
    .returning();
  if (!marker || marker.value !== token) {
    return jsonError(TOKEN_ERROR, 400);
  }
  if (marker.expiresAt.getTime() <= Date.now()) {
    return jsonError(TOKEN_ERROR, 400);
  }

  // Defence in depth: the email must still be unregistered here.
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) {
    return jsonError("ဒီအီးမေးလ်နဲ့ အကောင့် ရှိပြီးသားပါ။ အကောင့်ဝင်ပါ။", 400);
  }

  // asResponse: true so the session cookie Better Auth sets is carried
  // back to the caller (same pattern as phone-login). user_type is a
  // Better Auth additional field (see src/lib/auth.ts) — it is stored
  // on the user row exactly like phone.
  const res = await auth.api
    .signUpEmail({
      body: { email, password, name, phone, user_type: role },
      headers: await headers(),
      asResponse: true,
    })
    .catch(() => null);
  if (!res || !res.ok) {
    return jsonError("စာရင်းသွင်း၍ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။", 400);
  }

  // The email was just proven by OTP, so the account is verified.
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email));
  return res;
}
