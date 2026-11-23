"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";

/**
 * One account = one role, so the bottom tab bar is role-based too.
 * A passenger never sees Offer (they get Request instead); a driver
 * never sees Request (they accept pending requests in their Driver
 * dashboard). Logged-out visitors see the current 5 items.
 */
const PUBLIC_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/find-ride", label: "Find", icon: "🔍" },
  { href: "/offer-ride", label: "Offer", icon: "🚗" },
  { href: "/my-rides", label: "Rides", icon: "🎫" },
  { href: "/wallet", label: "Wallet", icon: "👛" },
];

const PASSENGER_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/find-ride", label: "Find", icon: "🔍" },
  { href: "/ride-requests", label: "Request", icon: "👥" },
  { href: "/my-rides", label: "Rides", icon: "🎫" },
  { href: "/wallet", label: "Wallet", icon: "👛" },
];

const DRIVER_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/offer-ride", label: "Offer", icon: "🚗" },
  { href: "/driver/dashboard", label: "Driver", icon: "🪪" },
  { href: "/my-rides", label: "Rides", icon: "🎫" },
  { href: "/wallet", label: "Wallet", icon: "👛" },
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
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                active ? "font-medium text-forest dark:text-mint" : "text-forest/50 dark:text-mint/50"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden className="text-lg leading-none">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
