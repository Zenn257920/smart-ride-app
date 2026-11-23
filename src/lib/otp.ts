/**
 * Email-OTP signup — pure, testable logic (no DB, no network).
 *
 * Storage: the Better Auth emailOTP plugin keeps OTPs in the existing
 * `verification` table (see src/lib/auth.ts). Its identifier format is
 * `${type}-otp-${email}` (better-auth `toOTPIdentifier`), and the stored
 * value is `${otp}:${attempts}` — this module mirrors exactly that shape
 * so the routes below and the plugin agree on one record per email.
 * No new table or migration is needed for OTPs.
 *
 * Flow:
 *   1. POST /api/auth/otp/send   — validates the email, refuses
 *      already-registered emails, rate-limits, then asks the plugin
 *      (auth.api.createVerificationOTP) to generate + store a 6-digit
 *      code and emails it via src/lib/mail.ts.
 *   2. POST /api/auth/otp/verify — atomically consumes the stored row
 *      (DELETE ... RETURNING) and evaluates the guess with
 *      evaluateOtpAttempt(). A correct guess mints a short-lived
 *      "signup-verified" marker row (also in `verification`) and
 *      returns its token to the client.
 *   3. POST /api/auth/otp/complete-signup — consumes the marker token
 *      and only then creates the account via auth.api.signUpEmail.
 *      The OTP gate is therefore enforced server-side: calling sign-up
 *      directly without a verified token cannot create an account.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";

/** OTP length — matches the emailOTP plugin option `otpLength`. */
export const OTP_LENGTH = 6;
/** OTP expiry — matches the plugin option `expiresIn` (seconds). */
export const OTP_EXPIRY_SECONDS = 600;
export const OTP_EXPIRY_MS = OTP_EXPIRY_SECONDS * 1000;
/** Wrong guesses allowed per code — matches `allowedAttempts`. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between two OTP sends to the same email. */
export const OTP_SEND_COOLDOWN_MS = 60_000;
/** Max OTP sends per email per hour. */
export const OTP_SENDS_PER_HOUR_PER_EMAIL = 5;
/** Max OTP sends per client IP per hour (across all emails). */
export const OTP_SENDS_PER_HOUR_PER_IP = 20;
/** How long a verified email stays usable for step 3 (complete-signup). */
export const VERIFIED_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Identifier the emailOTP plugin uses for a signup OTP
 * (`toOTPIdentifier("email-verification", email)`).
 */
export function otpIdentifier(email: string): string {
  return `email-verification-otp-${email.toLowerCase()}`;
}

/** Identifier for the "this email passed OTP" marker row. */
export function verifiedIdentifier(email: string): string {
  return `signup-verified-${email.toLowerCase()}`;
}

/** Normalise an email the way the plugin does (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Loose email shape check; routes also validate with zod. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** A code is valid input when it is exactly 6 digits. */
export function isValidOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code.trim());
}

/** Split a stored `${otp}:${attempts}` value (attempts default to 0). */
export function splitStoredOtp(value: string): { otp: string; attempts: number } {
  const idx = value.lastIndexOf(":");
  if (idx === -1) return { otp: value, attempts: 0 };
  const attempts = Number.parseInt(value.slice(idx + 1), 10);
  return {
    otp: value.slice(0, idx),
    attempts: Number.isNaN(attempts) ? 0 : attempts,
  };
}

/** Random unguessable token for the verified-email marker. */
export function generateVerifiedToken(): string {
  return randomBytes(32).toString("base64url");
}

export type OtpVerifyStatus =
  | "ok"
  | "not-found"
  | "expired"
  | "invalid"
  | "locked";

export interface OtpVerifyResult {
  status: OtpVerifyStatus;
  /** Wrong guesses still allowed for this code (0 when locked/ok). */
  attemptsLeft: number;
  /**
   * Value to write back into the verification row when the guess was
   * wrong but attempts remain (`${otp}:${attempts + 1}`); null when
   * the row must stay consumed (ok / expired / locked / not-found).
   */
  restoreValue: string | null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Decide the outcome of one OTP guess against the stored row.
 *
 * Mirrors better-auth's `atomicVerifyOTP` semantics (plugin v1.7.27):
 * expired rows are dead, a code dies after OTP_MAX_ATTEMPTS wrong
 * guesses, a wrong guess with attempts left restores the row with the
 * counter incremented, and a correct guess consumes the row.
 *
 * The caller is responsible for the atomic consume: DELETE the row
 * (RETURNING *) first, evaluate with what came back, then re-INSERT
 * only when `restoreValue` is non-null. That keeps the check itself
 * pure and unit-testable here.
 */
export function evaluateOtpAttempt(args: {
  /** Null when no OTP row exists for this email. */
  storedValue: string | null;
  expiresAt: Date | null;
  supplied: string;
  now?: Date;
}): OtpVerifyResult {
  const now = args.now ?? new Date();
  if (args.storedValue === null || args.expiresAt === null) {
    return { status: "not-found", attemptsLeft: 0, restoreValue: null };
  }
  if (args.expiresAt.getTime() <= now.getTime()) {
    return { status: "expired", attemptsLeft: 0, restoreValue: null };
  }
  const { otp, attempts } = splitStoredOtp(args.storedValue);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return { status: "locked", attemptsLeft: 0, restoreValue: null };
  }
  if (constantTimeEqual(args.supplied.trim(), otp)) {
    return { status: "ok", attemptsLeft: 0, restoreValue: null };
  }
  const used = attempts + 1;
  if (used >= OTP_MAX_ATTEMPTS) {
    return { status: "locked", attemptsLeft: 0, restoreValue: null };
  }
  return {
    status: "invalid",
    attemptsLeft: OTP_MAX_ATTEMPTS - used,
    restoreValue: `${otp}:${used}`,
  };
}
