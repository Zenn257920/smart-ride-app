import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("nav visibility (desktop top nav, admin hides rider nav, bell panel)", () => {
  test("desktop nav is at the top from md up, bottom bar only below md", () => {
    const nav = src("components/Nav.tsx");
    expect(nav).toContain("md:flex");
    expect(nav).not.toContain('lg:flex" aria-label="Main"');
    expect(nav).not.toContain('aria-label="Menu"');
    const bottom = src("components/BottomNav.tsx");
    expect(bottom).toContain("md:hidden");
    expect(bottom).not.toContain("lg:hidden");
  });

  test("admin accounts see no rider/driver navigation", () => {
    const nav = src("components/Nav.tsx");
    // Admin branch renders only the Admin link; rider links render for others.
    expect(nav).toMatch(/isAdmin \? \([\s\S]*?Admin[\s\S]*?\) : \(/);
    const bottom = src("components/BottomNav.tsx");
    expect(bottom).toContain("/api/admin/me");
    expect(bottom).toContain("if (isAdmin) return null");
  });

  test("notifications panel is anchored to the viewport, not the bell", () => {
    const bell = src("components/NotificationsBell.tsx");
    expect(bell).toContain("fixed inset-x-4");
    expect(bell).toContain("sm:right-4 sm:w-[22rem]");
    expect(bell).not.toContain("absolute right-0 top-11");
  });
});
