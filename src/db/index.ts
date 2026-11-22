import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Fallback for standalone scripts (tsx): Next.js loads .env.local itself,
// but a plain `tsx` run does not, so load it here if DATABASE_URL is unset.
// Values are never logged.
if (!process.env.DATABASE_URL) {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}

// Neon HTTP driver: no multi-statement interactive transactions — do not
// depend on db.transaction() anywhere in this codebase.
const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
export { schema };
