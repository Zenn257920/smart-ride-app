"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import AuthGuard from "@/components/AuthGuard";
import { apiFetch, asArray, fmtMMK, fmtTime, type BookingLike, type NotificationLike, type RideLike, type WalletTx } from "@/lib/api";

interface BalanceRes {
  balance?: number;
  data?: { balance?: number };
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  );
}

function DashboardInner() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; user_type?: string } | undefined;
  const [balance, setBalance] = useState<number | null>(null);
  const [bookings, setBookings] = useState<BookingLike[]>([]);
  const [offers, setOffers] = useState<RideLike[]>([]);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [notifs, setNotifs] = useState<NotificationLike[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [bal, rides, txList, notifList] = await Promise.allSettled([
          apiFetch<BalanceRes>("/api/wallet/balance"),
          apiFetch<unknown>("/api/rides"),
          apiFetch<unknown>("/api/wallet/transactions"),
          apiFetch<unknown>("/api/notifications"),
        ]);
        if (bal.status === "fulfilled") {
          const b = bal.value;
          setBalance(typeof b.balance === "number" ? b.balance : b.data?.balance ?? null);
        }
        if (rides.status === "fulfilled") {
          const all = asArray<RideLike>(rides.value);
          const mine = all.filter(
            (r) => (r.driverId ?? r.driver_id) === session?.user?.id || (r.driver as { id?: string } | undefined)?.id === session?.user?.id,
          );
          setOffers(mine);
          // Bookings are derived from rides that list me as a passenger, when the API exposes them;
          // the dedicated bookings view lives on /my-rides.
          const mineBooked = all.filter((r) =>
            (r.passengers ?? []).some((p) => (p.id ?? p.passengerId ?? p.passenger_id) === session?.user?.id),
          );
          setBookings(mineBooked as unknown as BookingLike[]);
        }
        if (txList.status === "fulfilled") setTxs(asArray<WalletTx>(txList.value));
        if (notifList.status === "fulfilled") setNotifs(asArray<NotificationLike>(notifList.value));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your dashboard.");
      }
    })();
  }, [session?.user?.id]);

  const cards = [
    { href: "/find-ride", icon: "🔍", title: "Find a ride", desc: "Search matched carpools on your route" },
    { href: "/offer-ride", icon: "🚗", title: "Offer a ride", desc: "Drive and share your empty seats" },
    { href: "/my-rides", icon: "🎫", title: "My rides", desc: "Bookings and rides you offered" },
    { href: "/wallet", icon: "👛", title: "Wallet", desc: "Balance, top-up and history" },
    { href: "/ride-requests", icon: "👥", title: "Ride requests", desc: "Join or create a shared request" },
    { href: "/driver/register", icon: "🪪", title: "Become a driver", desc: "Register your car and licence" },
  ];

  return (
    <div className="page-wrap">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">မင်္ဂလာပါ{user?.name ? `, ${user.name}` : ""} 👋</h1>
          <p className="section-sub">Your SharedRide dashboard — {user?.user_type === "driver" ? "driver" : "passenger"} account</p>
        </div>
        <Link href="/driver/dashboard" className="btn-outline">Driver dashboard →</Link>
      </div>

      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">Wallet balance</p>
          <p className="mt-1 text-2xl font-medium">{balance != null ? fmtMMK(balance) : "—"}</p>
        </div>
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">My bookings</p>
          <p className="mt-1 text-2xl font-medium">{bookings.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">Rides I offered</p>
          <p className="mt-1 text-2xl font-medium">{offers.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">Transactions</p>
          <p className="mt-1 text-2xl font-medium">{txs.length}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card transition-shadow hover:shadow-[0_4px_24px_rgba(30,73,39,0.16)]">
            <span aria-hidden className="text-3xl">{c.icon}</span>
            <h2 className="mt-3 text-lg font-medium text-forest dark:text-mint">{c.title}</h2>
            <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">{c.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium text-forest dark:text-mint">Recent notifications</h2>
        <div className="card mt-3">
          {notifs.length === 0 ? (
            <p className="text-sm text-forest/60 dark:text-mint/60">No notifications yet.</p>
          ) : (
            <ul className="space-y-3">
              {notifs.slice(0, 5).map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3 border-b border-forest/5 pb-3 text-sm last:border-0 last:pb-0 dark:border-mint/5">
                  <span className="min-w-0">{n.message ?? "Notification"}</span>
                  <span className="shrink-0 text-xs text-forest/50 dark:text-mint/50">{fmtTime(n.createdAt ?? n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
