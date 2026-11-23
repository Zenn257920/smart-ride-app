import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("admin shell (separate admin dashboard chrome)", () => {
  test("admin pages get their own shell with no user navigation", () => {
    const shell = src("components/AdminShell.tsx");
    // Own chrome: logo (links to the admin panel, NOT the main site —
    // the logo must keep the admin inside the panel), Admin title,
    // theme toggle, bell, logout.
    expect(shell).toContain('href="/admin"');
    expect(shell).not.toContain('href="/"');
    expect(shell).toContain("Admin");
    expect(shell).toContain("ThemeToggle");
    expect(shell).toContain("NotificationsBell");
    expect(shell).toContain("Logout");
    // Renders only on /admin*.
    expect(shell).toContain('startsWith("/admin")');
    // No user navigation links anywhere in the shell.
    for (const href of ["/find-ride", "/offer-ride", "/ride-requests", "/my-rides", "/wallet", "/dashboard"]) {
      expect(shell).not.toContain(`href="${href}"`);
    }
    // No footer rendered in the admin shell.
    expect(shell).not.toContain("<Footer");
  });

  test("admin shell logo links to /admin, not the main site", () => {
    const shell = src("components/AdminShell.tsx");
    // The logo is the first link in the shell; it must keep the admin
    // inside the panel. The "Admin" text link also points at /admin
    // (kept as-is) — so the shell has two /admin links and no "/" link.
    const logoMatch = shell.match(/<Link href="([^"]+)" className="flex min-w-0 items-center gap-2\.5">/);
    expect(logoMatch?.[1]).toBe("/admin");
    expect(shell).not.toContain('href="/"');
    expect(shell).toContain('href="/admin"');
  });

  test("user Nav, Footer and BottomNav all hide on /admin*", () => {
    const nav = src("components/Nav.tsx");
    expect(nav).toContain('startsWith("/admin")');
    expect(nav).toMatch(/if \(pathname\?\.startsWith\("\/admin"\)\) return null/);

    const footer = src("components/Footer.tsx");
    expect(footer).toContain('startsWith("/admin")');
    expect(footer).toMatch(/if \(pathname\?\.startsWith\("\/admin"\)\) return null/);

    const bottom = src("components/BottomNav.tsx");
    expect(bottom).toContain('startsWith("/admin")');
    expect(bottom).toContain('if (pathname.startsWith("/admin")) return null');
  });

  test("root layout renders the admin shell alongside the user chrome", () => {
    const layout = src("app/layout.tsx");
    expect(layout).toContain("AdminShell");
    expect(layout).toContain("<AdminShell />");
    expect(layout).toContain("<Nav />");
    expect(layout).toContain("<Footer />");
    expect(layout).toContain("<BottomNav />");
  });

  test("footer Admin link is logged-out-only and points at /admin/login", () => {
    const footer = src("components/Footer.tsx");
    expect(footer).toContain('href="/admin/login"');
    // Gated on the session having settled with no user — logged-in
    // passengers/drivers never see it.
    expect(footer).toContain("!isPending && !user");
    // It lives in the footer only — the admin shell has no Admin link
    // (its logout navigates to /admin/login via router.push, which is
    // not a link).
    const shell = src("components/AdminShell.tsx");
    expect(shell).not.toContain('href="/admin/login"');
  });

  test("user pages keep their nav and footer links", () => {
    // The user chrome is untouched apart from the /admin* gate:
    // logged-out visitors still get the full public nav and footer.
    const nav = src("components/Nav.tsx");
    expect(nav).toContain("PUBLIC_LINKS");
    expect(nav).toContain("PASSENGER_LINKS");
    expect(nav).toContain("DRIVER_LINKS");
    const footer = src("components/Footer.tsx");
    expect(footer).toContain('href="/find-ride"');
    expect(footer).toContain('href="/offer-ride"');
    expect(footer).toContain('href="/ride-requests"');
  });
});
