/**
 * Admin portal tests (2026-11-23).
 *
 * 1. parseAdminEnv — the create-admin script refuses to run without
 *    env vars (usage error, nothing created).
 * 2. Better Auth duplicate rejection — the backstop behind every
 *    signup path. The public OTP routes refuse duplicates in code
 *    (POST /api/auth/otp/send and .../complete-signup both query the
 *    user table first — verified by reading them), but the direct
 *    signUpEmail path (/api/auth/sign-up/email, exposed by the
 *    [...all] handler) has no route code of its own: it relies on
 *    Better Auth itself. This test proves that rejection is actually
 *    active in the installed better-auth version, using a real auth
 *    instance against the in-memory adapter — no network, no prod DB.
 */
import { describe, expect, test } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { parseAdminEnv } from "../src/lib/admin-account";
import { ADMIN_LOGIN_GENERIC_ERROR } from "../src/lib/admin-account";

describe("parseAdminEnv — create-admin refuses to run without env", () => {
  test("missing both vars → usage error", () => {
    expect(() => parseAdminEnv({})).toThrow(/Usage:.*create-admin\.ts/);
    expect(() => parseAdminEnv({})).toThrow(/Nothing was created/);
  });

  test("missing password only → usage error", () => {
    expect(() => parseAdminEnv({ ADMIN_EMAIL: "admin@example.com" })).toThrow(
      /Usage:/,
    );
  });

  test("missing email only → usage error", () => {
    expect(() => parseAdminEnv({ ADMIN_PASSWORD: "some-password" })).toThrow(
      /Usage:/,
    );
  });

  test("blank values count as missing", () => {
    expect(() =>
      parseAdminEnv({ ADMIN_EMAIL: "  ", ADMIN_PASSWORD: "some-password" }),
    ).toThrow(/Usage:/);
    expect(() =>
      parseAdminEnv({ ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "" }),
    ).toThrow(/Usage:/);
  });

  test("bad email shape → error, nothing to run", () => {
    expect(() =>
      parseAdminEnv({ ADMIN_EMAIL: "not-an-email", ADMIN_PASSWORD: "some-password" }),
    ).toThrow(/not a valid email/);
  });

  test("password shorter than Better Auth's 6-char minimum → error", () => {
    expect(() =>
      parseAdminEnv({ ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "abc" }),
    ).toThrow(/at least 6 characters/);
  });

  test("valid env → normalised email, password untouched", () => {
    expect(
      parseAdminEnv({
        ADMIN_EMAIL: "  Admin@Example.COM ",
        ADMIN_PASSWORD: "some-password",
      }),
    ).toEqual({ email: "admin@example.com", password: "some-password" });
  });
});

describe("admin login error — one generic message, no leak", () => {
  test("the generic error says 'admin only' and nothing about the account", () => {
    expect(ADMIN_LOGIN_GENERIC_ERROR).toContain("စီမံခန့်ခွဲသူ");
    expect(ADMIN_LOGIN_GENERIC_ERROR).not.toMatch(/စကားဝှက်|မရှိ|မှား/);
  });
});

describe("Better Auth duplicate rejection — the signup backstop", () => {
  function testAuth() {
    return betterAuth({
      // The memory adapter needs one array per model, created up
      // front — an empty db object throws "Model user not found".
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      emailAndPassword: { enabled: true },
      secret: "admin-portal-test-secret-only",
    });
  }

  test("first sign-up succeeds, second with the same email is rejected", async () => {
    const auth = testAuth();
    const first = await auth.api.signUpEmail({
      body: { email: "admin@example.com", password: "admin-pass-1", name: "Admin" },
      headers: new Headers(),
    });
    expect(first?.user?.email).toBe("admin@example.com");

    await expect(
      auth.api.signUpEmail({
        body: { email: "admin@example.com", password: "attacker-pass", name: "Attacker" },
        headers: new Headers(),
      }),
    ).rejects.toThrow(/User already exists. Use another email./);
  });

  test("duplicate check is case-insensitive (no squatting via casing)", async () => {
    const auth = testAuth();
    await auth.api.signUpEmail({
      body: { email: "Admin@Example.com", password: "admin-pass-1", name: "Admin" },
      headers: new Headers(),
    });
    await expect(
      auth.api.signUpEmail({
        body: { email: "admin@example.com", password: "attacker-pass", name: "Attacker" },
        headers: new Headers(),
      }),
    ).rejects.toThrow(/User already exists. Use another email./);
  });

  test("a different email still signs up fine after a rejection", async () => {
    const auth = testAuth();
    await auth.api.signUpEmail({
      body: { email: "admin@example.com", password: "admin-pass-1", name: "Admin" },
      headers: new Headers(),
    });
    await expect(
      auth.api.signUpEmail({
        body: { email: "admin@example.com", password: "attacker-pass", name: "Attacker" },
        headers: new Headers(),
      }),
    ).rejects.toThrow(/User already exists. Use another email./);
    const other = await auth.api.signUpEmail({
      body: { email: "other@example.com", password: "other-pass-1", name: "Other" },
      headers: new Headers(),
    });
    expect(other?.user?.email).toBe("other@example.com");
  });
});
