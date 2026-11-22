/**
 * One-off applier for the drizzle-generated migration.
 * `drizzle-kit push` / `migrate` fail silently in this environment with the
 * neon-http driver (exit 1, no error text, after the spinner), while
 * `drizzle-kit generate` works — so this applies the generated SQL file
 * statement-by-statement through the Neon HTTP driver, which does work.
 * Safe to re-run: CREATE TABLE / ADD CONSTRAINT use IF NOT EXISTS guards
 * via a pre-check, and the migration journal row is recorded so a future
 * `drizzle-kit migrate` will not re-apply it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const file = resolve(process.cwd(), process.argv[2] || "drizzle/0000_huge_arclight.sql");
  const text = readFileSync(file, "utf8");
  const statements = text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await sql.query(stmt, []);
      applied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Idempotent re-runs: already-exists errors are fine.
      if (/already exists/i.test(msg)) {
        skipped++;
        continue;
      }
      throw new Error(`statement failed: ${stmt.slice(0, 80)}… — ${msg}`);
    }
  }
  console.log(`migration statements: ${applied} applied, ${skipped} skipped (already existed)`);

  // Record the migration in drizzle-kit's journal table so future
  // `drizzle-kit migrate` runs skip it. Hash = sha256 of the SQL file,
  // matching what drizzle-kit stores.
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(text).digest("hex");
  await sql.query(`CREATE SCHEMA IF NOT EXISTS drizzle;`, []);
  await sql.query(
    `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     );`,
    [],
  );
  const existing = await sql.query(
    `SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = $1`,
    [hash],
  );
  if ((existing as unknown as unknown[]).length === 0) {
    await sql.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, Date.now()],
    );
    console.log("migration journal row recorded");
  } else {
    console.log("migration journal row already present");
  }
}

main().catch((err) => {
  console.error("apply-migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
