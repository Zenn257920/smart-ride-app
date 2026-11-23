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
              <Link href="/dashboard" className="block max-w-[160px] truncate rounded-full bg-mint px-4 py-2 text-sm font-medium text-forest transition-colors hover:bg-mint-deep">
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
          {/* Mobile logout: the hamburger is gone, and the full user chip
              only shows at sm+. On phones the logout is this icon button;
              the Dashboard (bottom nav) shows the user's name. */}
          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="flex h-8 w-8 items-center justify-center rounded-full text-mint/80 hover:bg-white/10 hover:text-mint sm:hidden"
              aria-label="Logout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
