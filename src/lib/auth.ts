import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  // C3 — login brute-force: Better Auth HAS a built-in limiter, so no
  // custom auth limiter was built. It is off by default outside
  // production, so it is enabled explicitly here:
  //   - general: 100 requests / 60s per IP (window 60, max 100).
  //   - built-in special rules (better-auth rate-limiter defaults):
  //     /sign-in, /sign-up, /change-password, /change-email get
  //     3 requests / 10s per IP — that is the real brute-force guard.
  //   - storage is in-memory: counters reset on redeploy and are per
  //     server instance, not shared across Vercel instances.
  // The custom /api/auth/phone-login route is NOT covered by this —
  // it has its own 10/min per-IP limit (see that route).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "memory",
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false },
      user_type: { type: "string", required: false },
      // D2: admin flag (column user.is_admin). Exposed on the session
      // user so the UI can hide the Admin link; server routes must
      // still check the DB row via requireAdmin — never the session copy.
      is_admin: { type: "boolean", required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

/** Resolve the signed-in user from request headers, or null. */
export async function getSessionUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}
