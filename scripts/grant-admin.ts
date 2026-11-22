/**
 * Grant the admin flag to one existing user by email.
 * Usage: npx tsx scripts/grant-admin.ts <email>
 *
 * - Verifies the `user.is_admin` column exists (migration applied).
 * - Looks the account up by email first: if it does not exist, it
 *   exits non-zero WITHOUT creating anything — the user must register
 *   that email first.
 * - Sets is_admin = true and prints the resulting row (id, email,
 *   is_admin). No secrets are printed or stored.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { user } from "../src/db/schema";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: npx tsx scripts/grant-admin.ts <email>");

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
  if (!existing) {
    console.error(`BLOCKED: no account with email ${email} exists — register that email first, then re-run.`);
    process.exit(2);
  }

  const [updated] = await db
    .update(user)
    .set({ is_admin: true })
    .where(eq(user.id, existing.id))
    .returning({ id: user.id, email: user.email, is_admin: user.is_admin });
  console.log("admin granted:", JSON.stringify(updated));
}

main().catch((err) => {
  console.error("grant-admin failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
