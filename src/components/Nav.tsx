"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationsBell from "@/components/NotificationsBell";

const LINKS = [
  { href: "/find-ride", label: "Find Ride" },
  { href: "/offer-ride", label: "Drive" },
  { href: "/ride-requests", label: "Ride Requests" },
  { href: "/my-rides", label: "My Rides" },
  { href: "/wallet", label: "Wallet" },
];

export default function Nav() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; user_type?: string } | undefined;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // D2: admin link is shown only when /api/admin/me says so (DB row).
  // The link is only a hint — /admin and every /api/admin/* route
  // enforce the flag server-side regardless.
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setIsAdmin(d?.isAdmin === true);
      })
      .catch(() => {
        /* non-admin / offline — link stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleSignOut() {
    await signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 bg-forest">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="SharedRide logo" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[15px] font-medium text-white">Innovix SharedRide</span>
            <span className="block text-[11px] text-mint/80">Myanmar</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 text-sm text-mint transition-colors hover:bg-white/10 hover:text-white">
              {l.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link href="/admin" className="rounded-full px-3 py-2 text-sm text-mint transition-colors hover:bg-white/10 hover:text-white">
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          {user ? <NotificationsBell /> : null}
          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/dashboard" className="rounded-full bg-mint px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-mint-deep">
                {user.name ?? "Dashboard"}
              </Link>
              <button type="button" onClick={handleSignOut} className="rounded-full px-3 py-2 text-sm text-mint/90 hover:bg-white/10 hover:text-white">
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login" className="rounded-full bg-mint px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-mint-deep">
              Login
            </Link>
          )}
          {/* Hamburger: hidden by default, shown ONLY below lg.
              Base `hidden` + `max-lg:flex` (not `flex` + `lg:hidden`) so
              the button can never show on desktop, even if the menu was
              opened on a narrow viewport and the window was then widened. */}
          <button
            type="button"
            className="hidden h-8 w-8 flex-col items-center justify-center gap-[3px] rounded-full text-mint/80 hover:bg-white/10 hover:text-mint max-lg:flex"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="block h-0.5 w-4 bg-current" />
            <span className="block h-0.5 w-4 bg-current" />
            <span className="block h-0.5 w-4 bg-current" />
          </button>
        </div>
      </div>

      {open ? (
        <nav className="hidden border-t border-white/10 px-4 pb-4 pt-2 max-lg:block" aria-label="Mobile">
          <div className="grid grid-cols-1 gap-1">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm text-mint hover:bg-white/10">
                {l.label}
              </Link>
            ))}
            {isAdmin ? (
              <Link href="/admin" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm text-mint hover:bg-white/10">
                Admin
              </Link>
            ) : null}
            {user ? (
              <>
                <Link href="/dashboard" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm text-mint hover:bg-white/10">
                  Dashboard
                </Link>
                <button type="button" onClick={handleSignOut} className="rounded-xl px-3 py-2.5 text-left text-sm text-mint hover:bg-white/10">
                  Logout
                </button>
              </>
            ) : (
              <Link href="/register" onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 text-sm text-mint hover:bg-white/10">
                Register
              </Link>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
