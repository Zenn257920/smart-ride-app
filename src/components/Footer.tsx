"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { MapPin } from "lucide-react";

/**
 * Site footer. It is a client component for two session-dependent
 * behaviours:
 *  - it renders nothing on /admin* pages — the admin panel has its
 *    own shell (AdminShell) and no user navigation, footer included;
 *  - it shows a discreet "Admin" link in the bottom bar ONLY to
 *    logged-out visitors (the admin entry point from the landing
 *    page). Logged-in passengers/drivers never see it.
 *
 * The link renders only once the session check has settled
 * (!isPending), so a logged-in user never sees it flash in.
 */
export default function Footer() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const user = session?.user;

  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="bg-forest text-mint">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="SharedRide logo" className="h-7 w-7 rounded-md object-contain" />
            <span className="font-medium text-white">Innovix SharedRide Myanmar</span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-mint/80">
            Carpooling Platform — ရန်ကုန်မြို့ပေါ်ရှိ No.1 လမ်းကြုံမျှစီးဝန်ဆောင်မှု
          </p>
        </div>
        <div>
          <h5 className="mb-3 text-sm font-medium text-white">Rides</h5>
          <ul className="space-y-2 text-sm text-mint/80">
            <li><Link href="/find-ride" className="hover:text-white">Find Ride</Link></li>
            <li><Link href="/offer-ride" className="hover:text-white">Drive</Link></li>
            <li><Link href="/ride-requests" className="hover:text-white">Ride Requests</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="mb-3 text-sm font-medium text-white">Company</h5>
          <ul className="space-y-2 text-sm text-mint/80">
            <li><Link href="/" className="hover:text-white">About us</Link></li>
            <li><Link href="/" className="hover:text-white">Career</Link></li>
            <li><Link href="/" className="hover:text-white">News</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="mb-3 text-sm font-medium text-white">Help</h5>
          <ul className="space-y-2 text-sm text-mint/80">
            <li><Link href="/wallet" className="hover:text-white">Wallet</Link></li>
            <li><Link href="/dashboard" className="hover:text-white">Dashboard</Link></li>
            <li><Link href="/my-rides" className="hover:text-white">My Rides</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-mint/70 sm:px-6">
          <span>© 2026 Innovix SharedRide Myanmar. All rights reserved.</span>
          <span className="flex items-center gap-3">
            {!isPending && !user ? (
              <Link href="/admin/login" className="hover:text-white">
                Admin
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-3.5 w-3.5" /> ရန်ကုန်မြို့</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
