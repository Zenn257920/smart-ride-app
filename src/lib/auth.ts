import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { db } from "@/db";
import { OTP_EXPIRY_SECONDS, OTP_LENGTH, OTP_MAX_ATTEMPTS } from "./otp";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  plugins: [
    // Email-OTP signup (2026-11-23). The plugin provides OTP
    // generation + storage in the `verification` table (6 digits,
    // 10-minute expiry, 5 attempts per code) — see src/lib/otp.ts.
    // `sendVerificationOTP` is intentionally a throwing stub: OTPs are
    // sent only through our own POST /api/auth/otp/send route, which
    // enforces the duplicate-email check + OTP send rate limits first.
    // Wiring a real sender here would also expose the plugin's
    // /sign-in/email-otp endpoint (a passwordless login path) and let
    // anyone send OTPs to arbitrary emails — login must stay
    // email+password only. With this stub the plugin's send endpoint
    // still answers {"success":true} (Better Auth runs the send as a
    // background task) but no mail is ever sent — the stub throws and
    // Better Auth logs "Failed to run background task". The
    // server-only createVerificationOTP API is what the route uses.
    emailOTP({
      otpLength: OTP_LENGTH,
      expiresIn: OTP_EXPIRY_SECONDS,
      allowedAttempts: OTP_MAX_ATTEMPTS,
      sendVerificationOTP: async () => {
        throw new Error(
          "OTP email is sent only via /api/auth/otp/send — the emailOTP plugin's own send endpoint is disabled.",
        );
      },
    }),
  ],
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
