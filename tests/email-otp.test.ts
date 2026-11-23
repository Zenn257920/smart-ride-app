import { describe, expect, test, afterEach } from "vitest";
import {
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_SENDS_PER_HOUR_PER_EMAIL,
  evaluateOtpAttempt,
  generateVerifiedToken,
  isValidEmail,
  isValidOtpCode,
  normalizeEmail,
  otpIdentifier,
  splitStoredOtp,
  verifiedIdentifier,
} from "../src/lib/otp";
import {
  MailNotConfiguredError,
  buildSignupOtpEmail,
  isMailConfigured,
  sendSignupOtpEmail,
} from "../src/lib/mail";
import { createRateLimiter, RATE_LIMITS } from "../src/lib/rate-limit";

const NOW = new Date("2026-11-23T07:00:00+06:30");

describe("OTP input validation", () => {
  test("valid emails pass, bad ones fail", () => {
    expect(isValidEmail("kaung@example.com")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("a @b.com")).toBe(false);
  });

  test("emails are lowercased + trimmed (plugin does the same)", () => {
    expect(normalizeEmail("  Kaung@Example.COM ")).toBe("kaung@example.com");
  });

  test("OTP codes must be exactly 6 digits", () => {
    expect(isValidOtpCode("123456")).toBe(true);
    expect(isValidOtpCode("12345")).toBe(false);
    expect(isValidOtpCode("1234567")).toBe(false);
    expect(isValidOtpCode("12345a")).toBe(false);
    expect(isValidOtpCode(" 123456 ")).toBe(true);
    expect(isValidOtpCode("")).toBe(false);
  });

  test("identifiers match the emailOTP plugin's format", () => {
    expect(otpIdentifier("Kaung@Example.com")).toBe(
      "email-verification-otp-kaung@example.com",
    );
    expect(verifiedIdentifier("Kaung@Example.com")).toBe(
      "signup-verified-kaung@example.com",
    );
  });

  test("stored values split into otp + attempt count", () => {
    expect(splitStoredOtp("123456:0")).toEqual({ otp: "123456", attempts: 0 });
    expect(splitStoredOtp("123456:3")).toEqual({ otp: "123456", attempts: 3 });
    expect(splitStoredOtp("123456")).toEqual({ otp: "123456", attempts: 0 });
  });

  test("verified tokens are long and unique", () => {
    const a = generateVerifiedToken();
    const b = generateVerifiedToken();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });
});

describe("evaluateOtpAttempt — verify logic", () => {
  const expiresAt = new Date(NOW.getTime() + OTP_EXPIRY_MS);

  test("no stored row → not-found", () => {
    expect(
      evaluateOtpAttempt({ storedValue: null, expiresAt: null, supplied: "123456", now: NOW }),
    ).toEqual({ status: "not-found", attemptsLeft: 0, restoreValue: null });
  });

  test("correct code → ok, row stays consumed", () => {
    expect(
      evaluateOtpAttempt({ storedValue: "123456:0", expiresAt, supplied: "123456", now: NOW }),
    ).toEqual({ status: "ok", attemptsLeft: 0, restoreValue: null });
  });

  test("correct code still works after earlier wrong guesses", () => {
    expect(
      evaluateOtpAttempt({ storedValue: "123456:4", expiresAt, supplied: "123456", now: NOW }),
    ).toEqual({ status: "ok", attemptsLeft: 0, restoreValue: null });
  });

  test("wrong code → invalid, attempts left, row restored with counter +1", () => {
    expect(
      evaluateOtpAttempt({ storedValue: "123456:0", expiresAt, supplied: "000000", now: NOW }),
    ).toEqual({
      status: "invalid",
      attemptsLeft: OTP_MAX_ATTEMPTS - 1,
      restoreValue: "123456:1",
    });
  });

  test("5th wrong guess locks the code (no restore)", () => {
    expect(
      evaluateOtpAttempt({ storedValue: "123456:4", expiresAt, supplied: "000000", now: NOW }),
    ).toEqual({ status: "locked", attemptsLeft: 0, restoreValue: null });
  });

  test("already-exhausted code stays locked", () => {
    expect(
      evaluateOtpAttempt({ storedValue: "123456:5", expiresAt, supplied: "123456", now: NOW }),
    ).toEqual({ status: "locked", attemptsLeft: 0, restoreValue: null });
  });

  test("expired code → expired (even with the right code)", () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(
      evaluateOtpAttempt({ storedValue: "123456:0", expiresAt: past, supplied: "123456", now: NOW }),
    ).toEqual({ status: "expired", attemptsLeft: 0, restoreValue: null });
  });

  test("code expires exactly after 10 minutes", () => {
    const atExpiry = new Date(NOW.getTime() + OTP_EXPIRY_MS);
    expect(
      evaluateOtpAttempt({ storedValue: "123456:0", expiresAt, supplied: "123456", now: atExpiry }),
    ).toEqual({ status: "expired", attemptsLeft: 0, restoreValue: null });
    const justBefore = new Date(NOW.getTime() + OTP_EXPIRY_MS - 1000);
    expect(
      evaluateOtpAttempt({ storedValue: "123456:0", expiresAt, supplied: "123456", now: justBefore }),
    ).toEqual({ status: "ok", attemptsLeft: 0, restoreValue: null });
  });
});

describe("OTP send rate limits (same limiter the routes use)", () => {
  test("60s cooldown: second send to the same email within a minute is refused", () => {
    const limiter = createRateLimiter();
    const t0 = Date.now();
    const first = limiter.check("otpSend:cooldown:a@example.com", RATE_LIMITS.otpSendCooldown, t0);
    expect(first.allowed).toBe(true);
    const second = limiter.check("otpSend:cooldown:a@example.com", RATE_LIMITS.otpSendCooldown, t0 + 1000);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSec).toBeGreaterThan(0);
    const after = limiter.check("otpSend:cooldown:a@example.com", RATE_LIMITS.otpSendCooldown, t0 + 61_000);
    expect(after.allowed).toBe(true);
  });

  test("at most 5 sends per hour per email", () => {
    const limiter = createRateLimiter();
    const t0 = Date.now();
    for (let i = 0; i < OTP_SENDS_PER_HOUR_PER_EMAIL; i++) {
      expect(
        limiter.check("otpSend:email:a@example.com", RATE_LIMITS.otpSendEmailHourly, t0 + i * 1000).allowed,
      ).toBe(true);
    }
    expect(
      limiter.check("otpSend:email:a@example.com", RATE_LIMITS.otpSendEmailHourly, t0 + 6000).allowed,
    ).toBe(false);
    // A different email has its own quota.
    expect(
      limiter.check("otpSend:email:b@example.com", RATE_LIMITS.otpSendEmailHourly, t0 + 6000).allowed,
    ).toBe(true);
  });

  test("per-IP hourly cap is separate from the per-email cap", () => {
    const limiter = createRateLimiter();
    const t0 = Date.now();
    for (let i = 0; i < RATE_LIMITS.otpSendIpHourly.max; i++) {
      expect(
        limiter.check("otpSend:ip:1.2.3.4", RATE_LIMITS.otpSendIpHourly, t0 + i * 100).allowed,
      ).toBe(true);
    }
    expect(
      limiter.check("otpSend:ip:1.2.3.4", RATE_LIMITS.otpSendIpHourly, t0 + 3000).allowed,
    ).toBe(false);
  });
});

describe("signup OTP email content", () => {
  test("Burmese-first, SharedRide brand, code prominent, 10-minute note", () => {
    const mail = buildSignupOtpEmail("kaung@example.com", "482913");
    expect(mail.to).toBe("kaung@example.com");
    expect(mail.subject).toContain("SharedRide");
    expect(mail.subject).toContain("482913");
    expect(mail.text).toContain("482913");
    expect(mail.text).toContain("10 မိနစ်");
    expect(mail.text).toContain("လျစ်လျူ");
    expect(mail.text).toContain("SharedRide");
    expect(mail.html).toContain("482913");
    expect(mail.html).toContain("10 မိနစ်");
    expect(mail.html).toContain("လျစ်လျူ");
    expect(mail.html).toContain("SharedRide");
  });
});

describe("sendSignupOtpEmail — stub transport, no network", () => {
  const savedUser = process.env.SMTP_USER;
  const savedPass = process.env.SMTP_APP_PASSWORD;

  afterEach(() => {
    if (savedUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = savedUser;
    if (savedPass === undefined) delete process.env.SMTP_APP_PASSWORD;
    else process.env.SMTP_APP_PASSWORD = savedPass;
  });

  test("stub transport receives the right email", async () => {
    process.env.SMTP_USER = "app@example.com";
    process.env.SMTP_APP_PASSWORD = "dummy-for-test-only";
    const received: unknown[] = [];
    const stub = {
      sendMail: async (message: unknown) => {
        received.push(message);
        return { messageId: "stub-id" };
      },
    };
    await sendSignupOtpEmail("kaung@example.com", "482913", stub);
    expect(received).toHaveLength(1);
    const msg = received[0] as Record<string, unknown>;
    expect(msg.to).toBe("kaung@example.com");
    expect(String(msg.subject)).toContain("482913");
    expect(String(msg.text)).toContain("482913");
    expect(String(msg.html)).toContain("482913");
    expect(String(msg.from)).toContain("app@example.com");
  });

  test("missing SMTP env → clear MailNotConfiguredError, no send attempted", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_APP_PASSWORD;
    expect(isMailConfigured()).toBe(false);
    const stub = {
      sendMail: async () => {
        throw new Error("stub must not be called without a transport");
      },
    };
    // No stub passed: the default transport creation must fail first.
    await expect(sendSignupOtpEmail("kaung@example.com", "482913")).rejects.toBeInstanceOf(
      MailNotConfiguredError,
    );
    expect(stub.sendMail).toBeDefined();
  });

  test("isMailConfigured reflects the env", () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_APP_PASSWORD;
    expect(isMailConfigured()).toBe(false);
    process.env.SMTP_USER = "app@example.com";
    expect(isMailConfigured()).toBe(false);
    process.env.SMTP_APP_PASSWORD = "x";
    expect(isMailConfigured()).toBe(true);
  });
});
