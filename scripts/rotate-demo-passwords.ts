/**
 * Rotate the demo-account passwords in the database (C1 fix).
 *
 * The demo accounts used to share the publicly known password from the old
 * seed (`demo1234`, visible in the public repo history). This script
 * replaces the stored Better Auth credential hash for every demo account
 * with a fresh hash of a new password, using exactly the hashing Better
 * Auth itself uses (`hashPassword` / `verifyPassword` from
 * `better-auth/crypto` — the same functions the sign-in flow verifies
 * against), then proves the new password works through the normal login
 * flow (`auth.api.signInEmail`) and that the old password no longer does.
 *
 * The new password is NEVER written to a file:
 *   - pass it via env:  DEMO_PASSWORD=<secret> npx tsx scripts/rotate-demo-passwords.ts
 *   - or omit it and a fresh 24-char random password is generated
 *     in-process (crypto.randomBytes) and printed ONCE at the end — copy
 *     it into a safe place (e.g. the coordinator's report) and delete it
 *     from your scrollback.
 *
 * Optional: OLD_DEMO_PASSWORD=<previous password> adds a negative check
 * that the old password no longer verifies against the new hash.
 *
 * DATABASE_URL comes from the environment (or .env.local, same loader as
 * scripts/seed.ts). The connection URI and the password hashes are never
 * printed or logged.
 *
 * Run: npx tsx scripts/rotate-demo-passwords.ts
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";

// NOTE: src modules are imported dynamically inside main() — static imports
// are hoisted and would evaluate src/db + src/lib/auth BEFORE the .env.local
// loading below runs (tsx does not load .env files itself).
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

// Every user scripts/seed.ts seeds with the demo password.
const DEMO_EMAILS = [
  "passenger@demo.com",
  "driver@demo.com",
  "kyawswa@smartride.mm",
  "ayeaye@smartride.mm",
  "zawzaw@smartride.com",
  "maysin@smartride.mm",
  "thantzin@smartride.mm",
  "minmin@smartride.mm",
  "khinkhin@smartride.mm",
  "htunhtun@smartride.mm",
];

async function main() {
  const newPassword =
    process.env.DEMO_PASSWORD ?? randomBytes(12).toString("hex");
  const generated = !process.env.DEMO_PASSWORD;
  const oldPassword = process.env.OLD_DEMO_PASSWORD;

  // Dynamic imports AFTER .env.local is loaded (see note at top of file).
  const { db } = await import("../src/db");
  const { account, user } = await import("../src/db/schema");
  const { auth } = await import("../src/lib/auth");
  const { hashPassword, verifyPassword } = await import("better-auth/crypto");

  let updated = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const email of DEMO_EMAILS) {
    const [row] = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (!row) {
      console.log(`- ${email}: no such user in this DB, skipped`);
      skipped++;
      continue;
    }

    const [cred] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, row.id),
          eq(account.providerId, "credential"),
        ),
      )
      .limit(1);
    if (!cred) {
      console.log(`- ${email}: no credential account row, skipped`);
      skipped++;
      continue;
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(account)
      .set({ password: newHash })
      .where(eq(account.id, cred.id));

    // Verify against the freshly stored hash, exactly as sign-in does.
    const [stored] = await db
      .select()
      .from(account)
      .where(eq(account.id, cred.id))
      .limit(1);
    const verifies = await verifyPassword({
      hash: stored?.password ?? "",
      password: newPassword,
    });
    if (!verifies) {
      failures.push(`${email}: verifyPassword failed for the new password`);
      console.log(`- ${email}: FAILED — new password does not verify`);
      continue;
    }

    if (oldPassword) {
      const oldStillWorks = await verifyPassword({
        hash: stored?.password ?? "",
        password: oldPassword,
      });
      if (oldStillWorks) {
        failures.push(`${email}: old password still verifies`);
        console.log(`- ${email}: FAILED — old password still verifies`);
        continue;
      }
    }

    // Prove the normal login flow accepts the new password.
    try {
      const result = await auth.api.signInEmail({
        body: { email, password: newPassword },
        headers: new Headers(),
      });
      if (!result?.user) throw new Error("signInEmail returned no user");
    } catch (err) {
      failures.push(
        `${email}: signInEmail failed (${err instanceof Error ? err.message : err})`,
      );
      console.log(`- ${email}: FAILED — signInEmail rejected the new password`);
      continue;
    }

    console.log(
      `- ${email}: rotated ✓ (new hash verifies, sign-in works` +
        (oldPassword ? ", old password rejected" : "") +
        ")",
    );
    updated++;
  }

  console.log(`\nrotated: ${updated}, skipped: ${skipped}, failed: ${failures.length}`);
  if (failures.length > 0) {
    console.error("failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  if (updated === 0) {
    console.error("no demo accounts were rotated — nothing to do?");
    process.exit(1);
  }
  if (generated) {
    console.log(
      "\nNEW DEMO PASSWORD (generated in-process, not stored anywhere): " +
        newPassword,
    );
  } else {
    console.log("\n(new password was supplied via DEMO_PASSWORD env — not printed)");
  }
}

main().catch((err) => {
  console.error("rotate failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
