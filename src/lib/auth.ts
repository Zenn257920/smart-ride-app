import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
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
