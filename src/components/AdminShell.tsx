"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationsBell from "@/components/NotificationsBell";

/**
 * The admin panel's own shell — a minimal dark-green header with no
 * user navigation at all. It renders ONLY on /admin* pages; the user
 * Nav / Footer / BottomNav each return null there (see those
 * components), so an admin never sees Find Ride / Drive / Ride
 * Requests / My Rides / Wallet / Dashboard links inside the panel.
 *
 * Gating is by pathname (usePathname works during SSR too, so the
 * server HTML already has the right shell — no flash of the user nav).
 * The shell itself is only chrome: /admin and every /api/admin/*
 * route still enforce the admin flag server-side (requireAdmin).
 */
export default function AdminShell() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();

  if (!pathname?.startsWith("/admin")) return null;

  async function handleSignOut() {
    await signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 bg-forest">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SharedRide logo" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-medium text-white">Innovix SharedRide</span>
              <span className="block text-[11px] text-mint/80">Myanmar</span>
            </span>
          </Link>
          <span aria-hidden className="hidden h-6 w-px shrink-0 bg-white/20 sm:block" />
          <Link href="/admin" className="shrink-0 text-sm font-medium text-mint transition-colors hover:text-white">
            Admin
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle />
          {user ? <NotificationsBell /> : null}
          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full px-3 py-2 text-sm text-mint/90 hover:bg-white/10 hover:text-white"
            >
              Logout
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
