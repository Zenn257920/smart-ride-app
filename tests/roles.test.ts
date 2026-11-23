/**
 * Separate passenger/driver accounts (2026-11-23).
 *
 * One account = one role, chosen once at signup and never changed.
 * Tests cover, without touching the production DB:
 *   1. signup role validation (zod enum + default),
 *   2. Better Auth actually storing user_type at signup (memory
 *      adapter — the same pattern as admin-portal.test.ts),
 *   3. the pure role decision behind requireRole,
 *   4. source checks that the role gates are wired into the routes
 *      and that Nav / BottomNav / dashboard are role-branched.
 */
import { describe, expect, test } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSignupRole,
  roleMatches,
  signupRoleSchema,
  USER_ROLES,
} from "../src/lib/roles";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

/** hrefs of a `const NAME = [ { href: "..." }, ... ]` array in a source file. */
function hrefsOf(source: string, name: string): string[] {
  const m = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) return [];
  return [...m[1].matchAll(/href: "([^"]+)"/g)].map((x) => x[1]);
}

describe("signup role validation", () => {
  test("passenger and driver are the only roles", () => {
    expect(USER_ROLES).toEqual(["passenger", "driver"]);
  });

  test("schema accepts passenger/driver and rejects anything else", () => {
    expect(signupRoleSchema.safeParse("passenger").success).toBe(true);
    expect(signupRoleSchema.safeParse("driver").success).toBe(true);
    expect(signupRoleSchema.safeParse("admin").success).toBe(false);
    expect(signupRoleSchema.safeParse("").success).toBe(false);
    expect(signupRoleSchema.safeParse(undefined).success).toBe(false);
    expect(signupRoleSchema.safeParse(123).success).toBe(false);
  });

  test("missing role defaults to passenger; invalid role throws", () => {
    expect(parseSignupRole(undefined)).toBe("passenger");
    expect(parseSignupRole(null)).toBe("passenger");
    expect(parseSignupRole("")).toBe("passenger");
    expect(parseSignupRole("driver")).toBe("driver");
    expect(parseSignupRole("passenger")).toBe("passenger");
    expect(() => parseSignupRole("admin")).toThrow(/အကောင့် အမျိုးအစား/);
  });
});

describe("roleMatches — the decision behind requireRole", () => {
  test("exact match only; admins are not exempt", () => {
    expect(roleMatches("driver", "driver")).toBe(true);
    expect(roleMatches("passenger", "passenger")).toBe(true);
    expect(roleMatches("passenger", "driver")).toBe(false);
    expect(roleMatches("driver", "passenger")).toBe(false);
    expect(roleMatches(undefined, "driver")).toBe(false);
    expect(roleMatches(null, "passenger")).toBe(false);
    expect(roleMatches("", "passenger")).toBe(false);
  });
});

describe("Better Auth stores user_type at signup", () => {
  function testAuth() {
    return betterAuth({
      // Same additionalFields as src/lib/auth.ts (phone + user_type).
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      emailAndPassword: { enabled: true },
      user: {
        additionalFields: {
          phone: { type: "string", required: false },
          user_type: { type: "string", required: false },
        },
      },
      secret: "test-secret-for-roles-test-only",
    });
  }

  test("signUpEmail with user_type driver stores driver", async () => {
    const auth = testAuth();
    const res = await auth.api.signUpEmail({
      body: {
        email: "driver@example.com",
        password: "driver-pass-1",
        name: "Driver",
        user_type: "driver",
      },
      headers: new Headers(),
    });
    expect(
      (res?.user as { user_type?: string } | undefined)?.user_type,
    ).toBe("driver");
  });

  test("signUpEmail without user_type does not store a driver role", async () => {
    const auth = testAuth();
    const res = await auth.api.signUpEmail({
      body: {
        email: "pax@example.com",
        password: "pax-pass-1",
        name: "Pax",
      },
      headers: new Headers(),
    });
    expect(
      (res?.user as { user_type?: string } | undefined)?.user_type,
    ).not.toBe("driver");
  });
});

describe("role enforcement is wired into the API routes", () => {
  test("offer requires the driver role", () => {
    const f = src("app/api/rides/route.ts");
    expect(f).toContain('requireRole(sessionUser.id, "driver")');
    expect(f).toContain("ယာဉ်မောင်း အကောင့်ဖြင့်သာ");
    expect(f).toContain('jsonError("ယာဉ်မောင်း အကောင့်ဖြင့်သာ ခရီးစဉ် ကမ်းလှမ်းနိုင်ပါသည်။", 403)');
  });

  test("book requires the passenger role", () => {
    const f = src("app/api/rides/[id]/book/route.ts");
    expect(f).toContain('requireRole(userId, "passenger")');
    expect(f).toContain('err("ခရီးသည် အကောင့်ဖြင့်သာ ဘွတ်ကင်လုပ်နိုင်ပါသည်။", 403)');
  });

  test("create ride request requires the passenger role", () => {
    const f = src("app/api/ride-requests/route.ts");
    expect(f).toContain('requireRole(sessionUser.id, "passenger")');
    expect(f).toContain("ခရီးသည် အကောင့်ဖြင့်သာ တောင်းဆိုမှု ဖန်တီးနိုင်ပါသည်။");
  });

  test("pending requests list requires the driver role", () => {
    const f = src("app/api/ride-requests/route.ts");
    expect(f).toContain('requireRole(sessionUser.id, "driver")');
    expect(f).toContain("ယာဉ်မောင်း အကောင့်ဖြင့်သာ စောင့်ဆိုင်းနေသော တောင်းဆိုမှုများ ကြည့်နိုင်ပါသည်။");
  });

  test("join and leave require the passenger role", () => {
    expect(src("app/api/ride-requests/[id]/join/route.ts")).toContain(
      'requireRole(sessionUser.id, "passenger")',
    );
    expect(src("app/api/ride-requests/[id]/leave/route.ts")).toContain(
      'requireRole(sessionUser.id, "passenger")',
    );
  });

  test("accept and reject require the driver role", () => {
    expect(src("app/api/ride-requests/[id]/accept/route.ts")).toContain(
      'requireRole(sessionUser.id, "driver")',
    );
    expect(src("app/api/ride-requests/[id]/reject/route.ts")).toContain(
      'requireRole(sessionUser.id, "driver")',
    );
  });

  test("driver/register requires the driver role and no longer converts passengers", () => {
    const f = src("app/api/driver/register/route.ts");
    expect(f).toContain('requireRole(sessionUser.id, "driver")');
    expect(f).not.toContain('set({ user_type: "driver" })');
  });

  test("complete-signup passes the chosen role to signUpEmail", () => {
    const f = src("app/api/auth/otp/complete-signup/route.ts");
    expect(f).toContain("signupRoleSchema");
    expect(f).toContain("user_type: role");
  });
});

describe("role-branched navigation", () => {
  test("top nav: passenger never sees Offer, driver never sees Ride Requests", () => {
    const nav = src("components/Nav.tsx");
    expect(hrefsOf(nav, "PASSENGER_LINKS")).toEqual([
      "/dashboard",
      "/find-ride",
      "/ride-requests",
      "/my-rides",
      "/wallet",
    ]);
    expect(hrefsOf(nav, "DRIVER_LINKS")).toEqual([
      "/dashboard",
      "/offer-ride",
      "/driver/dashboard",
      "/my-rides",
      "/wallet",
    ]);
    expect(nav).toContain("PASSENGER_LINKS");
    expect(nav).toContain("DRIVER_LINKS");
  });

  test("bottom nav: passenger gets Request, driver gets Offer + Driver", () => {
    const bottom = src("components/BottomNav.tsx");
    expect(hrefsOf(bottom, "PASSENGER_ITEMS")).toEqual([
      "/dashboard",
      "/find-ride",
      "/ride-requests",
      "/my-rides",
      "/wallet",
    ]);
    expect(hrefsOf(bottom, "DRIVER_ITEMS")).toEqual([
      "/dashboard",
      "/offer-ride",
      "/driver/dashboard",
      "/my-rides",
      "/wallet",
    ]);
  });

  test("dashboard cards are role-filtered and the become-a-driver card is gone", () => {
    const d = src("app/dashboard/page.tsx");
    expect(d).not.toContain("ယာဉ်မောင်း ဖြစ်ပါ");
    expect(d).not.toContain("/driver/register");
    expect(d).toContain("isDriver");
    expect(d).toContain("/ride-requests");
    expect(d).toContain("/offer-ride");
  });

  test("ride-requests page has no driver Accept/Skip branch", () => {
    const p = src("app/ride-requests/page.tsx");
    expect(p).not.toContain("Accept as driver");
    expect(p).not.toContain("driverAction");
    expect(p).not.toContain('user_type === "driver"');
  });

  test("page guards are in place", () => {
    expect(src("app/find-ride/page.tsx")).toContain('allow={["passenger"]}');
    expect(src("app/ride-requests/page.tsx")).toContain('allow={["passenger"]}');
    expect(src("app/offer-ride/page.tsx")).toContain('allow={["driver"]}');
    const reg = src("app/driver/register/page.tsx");
    expect(reg).toContain('allow={["driver"]}');
    expect(reg).not.toContain("redirectTo");
  });

  test("register page offers the role choice", () => {
    const r = src("app/register/page.tsx");
    expect(r).toContain("အကောင့် အမျိုးအစား");
    expect(r).toContain("ခရီးသည်");
    expect(r).toContain("ယာဉ်မောင်း");
    expect(r).toContain('"/driver/register"');
  });
});
