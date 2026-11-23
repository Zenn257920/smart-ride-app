import { z } from "zod";

/**
 * One account = one role, chosen once at signup and never changed.
 * A person who wants both roles registers two accounts with two
 * emails — there is no way to switch a role or convert an account.
 *
 * - passenger: books rides, creates / joins ride requests.
 * - driver: offers rides, accepts / skips ride requests.
 *
 * The role lives on the DB user row (user_type, default "passenger").
 * Server routes must check it via requireRole in src/lib/api-helpers
 * (DB row, never the session copy). The UI reads the session copy
 * for navigation only — the role can never change, so it cannot go
 * stale.
 */
export type UserRole = "passenger" | "driver";

export const USER_ROLES: readonly UserRole[] = ["passenger", "driver"];

export const ROLE_LABELS: Record<UserRole, string> = {
  passenger: "ခရီးသည်",
  driver: "ယာဉ်မောင်း",
};

/** Zod enum for the signup role field — anything else is rejected (400). */
export const signupRoleSchema = z.enum(["passenger", "driver"]);

/**
 * Parse a client-supplied role: missing / empty means the default
 * (passenger); a value that is not a known role is rejected.
 */
export function parseSignupRole(value: unknown): UserRole {
  if (value === undefined || value === null || value === "") {
    return "passenger";
  }
  const parsed = signupRoleSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("အကောင့် အမျိုးအစား မှားနေပါသည်။");
  }
  return parsed.data;
}

/**
 * Pure role decision — the DB-backed requireRole in api-helpers
 * reads the row and applies exactly this check.
 */
export function roleMatches(
  userType: string | null | undefined,
  role: UserRole,
): boolean {
  return userType === role;
}
