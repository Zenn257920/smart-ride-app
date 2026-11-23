/**
 * Pre-create the admin account for the separate admin portal.
 *
 * Usage:
 *   ADMIN_EMAIL=<email> ADMIN_PASSWORD=<password> npx tsx scripts/create-admin.ts
 *
 * - The admin account is created by this script — NEVER via public
 *   signup (/register refuses already-registered emails, and the OTP
 *   flow cannot set is_admin). Run it AFTER the production data wipe
 *   (a later step the coordinator owns); the wipe deletes every user,
 *   so an admin created now would be wiped with them.
 * - ADMIN_EMAIL + ADMIN_PASSWORD come from the environment only. There
 *   are no defaults and no values in this file: if either is unset the
 *   script prints usage and exits 2, creating nothing. The password is
 *   NEVER printed, logged, or written anywhere.
 * - The account is created THROUGH Better Auth (auth.api.signUpEmail,
 *   same as scripts/seed.ts) so the password hash is one Better Auth
 *   itself verifies — never hand-rolled, never plaintext. is_admin and
 *   emailVerified are then set on the row directly (Better Auth sign-up
 *   does not set them).
 * - If the email already exists: already an admin → exit 0 saying so;
 *   exists but not an admin → grant admin, exit 0 saying so. Either
 *   way the existing password is left untouched.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { user } from "../src/db/schema";
import { auth } from "../src/lib/auth";
import { parseAdminEnv } from "../src/lib/admin-account";

async function main() {
  let env: { email: string; password: string };
  try {
    env = parseAdminEnv(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
  const { email, password } = env;

  const raw: unknown = await db.execute(
    sql`SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'is_admin'`,
  );
  // Neon-HTTP drizzle returns either a row array or { rows: [...] }.
  const colRows: unknown[] = Array.isArray(raw)
    ? raw
    : ((raw as { rows?: unknown[] }).rows ?? []);
  if (colRows.length === 0) {
    throw new Error("user.is_admin column is missing — apply the migration first");
  }

  const [existing] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing) {
    if (existing.is_admin) {
      console.log(`already an admin: ${email} (id ${existing.id})`);
      return;
    }
    const [updated] = await db
      .update(user)
      .set({ is_admin: true })
      .where(eq(user.id, existing.id))
      .returning({ id: user.id, email: user.email, is_admin: user.is_admin });
    console.log("admin granted to existing account:", JSON.stringify(updated));
    return;
  }

  // Create through Better Auth so the credential hash is one it
  // verifies on sign-in (seed.ts uses this same call). A duplicate
  // racing in between the check above and this call throws
  // USER_ALREADY_EXISTS — re-read the row and fall through to the
  // grant path instead of failing.
  try {
    await auth.api.signUpEmail({
      body: { email, password, name: "Admin" },
      headers: new Headers(),
    });
  } catch (err) {
    const [raced] = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (!raced) throw err;
    if (raced.is_admin) {
      console.log(`already an admin: ${email} (id ${raced.id})`);
      return;
    }
    const [updated] = await db
      .update(user)
      .set({ is_admin: true })
      .where(eq(user.id, raced.id))
      .returning({ id: user.id, email: user.email, is_admin: user.is_admin });
    console.log("admin granted to existing account:", JSON.stringify(updated));
    return;
  }

  const [created] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!created) throw new Error(`signUpEmail did not create ${email}`);
  const [updated] = await db
    .update(user)
    .set({ is_admin: true, emailVerified: true })
    .where(eq(user.id, created.id))
    .returning({ id: user.id, email: user.email, is_admin: user.is_admin });
  console.log("admin created:", JSON.stringify(updated));
}

main().catch((err) => {
  console.error("create-admin failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
