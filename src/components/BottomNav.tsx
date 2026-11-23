"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Car, Home, IdCard, Search, Ticket, Users, Wallet, type LucideIcon } from "lucide-react";
import { useSession } from "@/lib/auth-client";

/**
 * One account = one role, so the bottom tab bar is role-based too.
 * A passenger never sees Offer (they get Request instead); a driver
 * never sees Request (they accept pending requests in their Driver
 * dashboard). Logged-out visitors see the current 5 items.
 */
const PUBLIC_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/find-ride", label: "Find", icon: Search },
  { href: "/offer-ride", label: "Offer", icon: Car },
  { href: "/my-rides", label: "Rides", icon: Ticket },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

const PASSENGER_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/find-ride", label: "Find", icon: Search },
  { href: "/ride-requests", label: "Request", icon: Users },
  { href: "/my-rides", label: "Rides", icon: Ticket },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

const DRIVER_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/offer-ride", label: "Offer", icon: Car },
  { href: "/driver/dashboard", label: "Driver", icon: IdCard },
  { href: "/my-rides", label: "Rides", icon: Ticket },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as { user_type?: string } | undefined;
  // Admin accounts get no rider/driver tab bar — the admin panel is
  // their whole interface. Same /api/admin/me check as Nav.
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
        /* non-admin / offline — tab bar stays */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (pathname === "/login" || pathname === "/register") return null;
  if (!pathname) return null;
  // Admin pages have their own shell (AdminShell) — no bottom tab bar
  // there, including /admin/login when logged out (the isAdmin check
  // below only covers signed-in admins).
  if (pathname.startsWith("/admin")) return null;
  if (isAdmin) return null;
  const items = !user
    ? PUBLIC_ITEMS
    : user.user_type === "driver"
      ? DRIVER_ITEMS
      : PASSENGER_ITEMS;
  return (
    <nav
      aria-label="Bottom"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-forest/10 bg-white pb-[env(safe-area-inset-bottom)] dark:border-mint/10 dark:bg-[#122b19] md:hidden"
    >
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                active ? "font-medium text-forest dark:text-mint" : "text-forest/50 dark:text-mint/50"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
