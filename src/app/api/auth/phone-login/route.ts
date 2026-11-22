/**
 * POST /api/auth/phone-login — { phone, password }. Looks the user up by
 * phone, then signs in with their email via Better Auth. Returns the
 * Better Auth sign-in result (with its session cookie) or 401.
 *
 * The Better Auth handler itself (src/app/api/auth/[...all]) is owned by
 * another agent; this route only calls auth.api.signInEmail.
 *
 * C3: this custom route is NOT covered by Better Auth's built-in rate
 * limiter (that only guards /api/auth/*), so it has its own per-IP
 * limit: 10 attempts/min (see src/lib/rate-limit). A 429 here means
 * "slow down", not "wrong password".
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { rateLimitResponse } from "@/lib/rate-limit";

const phoneLoginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, "phoneLogin");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = phoneLoginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { phone, password } = parsed.data;

  const [found] = await db
    .select()
    .from(user)
    .where(eq(user.phone, phone))
    .limit(1);
  if (!found) return jsonError("Invalid phone or password", 401);

  try {
    // asResponse: true so the session cookie Better Auth sets is carried
    // back to the caller on the Response.
    const res = await auth.api.signInEmail({
      body: { email: found.email, password },
      headers: await headers(),
      asResponse: true,
    });
    if (!res.ok) return jsonError("Invalid phone or password", 401);
    return res;
  } catch {
    return jsonError("Invalid phone or password", 401);
  }
}
