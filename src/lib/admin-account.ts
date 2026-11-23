/**
 * Shared helpers for the separate admin portal (2026-11-23).
 *
 * The admin area is NOT part of public signup: the admin account is
 * pre-created by scripts/create-admin.ts, and admins sign in at
 * /admin/login (a separate page from public /login).
 *
 * NOTE: this module is imported by the client-side /admin/login page,
 * so it must stay client-safe — it deliberately does NOT import
 * src/lib/otp (which pulls in node:crypto). The one-line normalisation
 * below mirrors normalizeEmail() in src/lib/otp.ts.
 */

/**
 * The one error /admin/login ever shows, for every failure — wrong
 * password, unknown email, or a signed-in account that is not an
 * admin. One message for all three, so the page never leaks whether
 * an account exists or which half of the credentials was wrong.
 */
export const ADMIN_LOGIN_GENERIC_ERROR =
  "ဒီစာမျက်နှာကို စီမံခန့်ခွဲသူသာ ဝင်ရောက်နိုင်ပါသည်။";

/** Env needed by scripts/create-admin.ts. The password is never logged. */
export interface AdminAccountEnv {
  email: string;
  password: string;
}

/**
 * Read ADMIN_EMAIL + ADMIN_PASSWORD from the environment.
 *
 * - No defaults containing real values: either var unset/empty throws
 *   a usage error and the caller must create nothing.
 * - The email is normalised (trim + lowercase, the same as Better Auth
 *   and the OTP routes) so `Admin@Example.com` and `admin@example.com`
 *   can never become two different accounts.
 * - The password is returned untouched and must never be printed.
 */
export function parseAdminEnv(env: Record<string, string | undefined>): AdminAccountEnv {
  const rawEmail = (env.ADMIN_EMAIL ?? "").trim();
  const password = env.ADMIN_PASSWORD ?? "";
  if (!rawEmail || !password) {
    throw new Error(
      "Usage: ADMIN_EMAIL=<email> ADMIN_PASSWORD=<password> npx tsx scripts/create-admin.ts\n" +
        "Both ADMIN_EMAIL and ADMIN_PASSWORD must be set in the environment. Nothing was created.",
    );
  }
  const email = rawEmail.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`ADMIN_EMAIL is not a valid email address: ${email}`);
  }
  if (password.length < 6) {
    throw new Error(
      "ADMIN_PASSWORD must be at least 6 characters (Better Auth minimum).",
    );
  }
  return { email, password };
}
