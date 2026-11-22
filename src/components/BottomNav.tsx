"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/find-ride", label: "Find", icon: "🔍" },
  { href: "/offer-ride", label: "Offer", icon: "🚗" },
  { href: "/my-rides", label: "Rides", icon: "🎫" },
  { href: "/wallet", label: "Wallet", icon: "👛" },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/login" || pathname === "/register") return null;
  if (!pathname) return null;
  return (
    <nav
      aria-label="Bottom"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-forest/10 bg-white pb-[env(safe-area-inset-bottom)] dark:border-mint/10 dark:bg-[#122b19] md:hidden"
    >
      <div className="grid grid-cols-5">
        {ITEMS.map((it) => {
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
