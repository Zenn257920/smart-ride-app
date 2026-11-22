/**
 * POST /api/auth/phone-login — { phone, password }. Looks the user up by
 * phone, then signs in with their email via Better Auth. Returns the
 * Better Auth sign-in result (with its session cookie) or 401.
 *
 * The Better Auth handler itself (src/app/api/auth/[...all]) is owned by
 * another agent; this route only calls auth.api.signInEmail.
 */
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

const phoneLoginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
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
