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
        const [bal, rides, bookingsRes, txList, notifList] = await Promise.allSettled([
          apiFetch<BalanceRes>("/api/wallet/balance"),
          // D8b: the server filters to my own offers (?mine=1) — the
          // page used to download every open ride and filter
          // client-side for the "Rides I offered" count (same fix
          // Batch 5b made in my-rides).
          apiFetch<unknown>("/api/rides?mine=1"),
          // Bookings come from the dedicated endpoint now — deriving
          // them from the open-rides list was wrong (it only ever saw
          // open rides, and only those that happened to list me).
          apiFetch<unknown>("/api/bookings"),
          apiFetch<unknown>("/api/wallet/transactions"),
          apiFetch<unknown>("/api/notifications"),
        ]);
        if (bal.status === "fulfilled") {
          const b = bal.value;
          setBalance(typeof b.balance === "number" ? b.balance : b.data?.balance ?? null);
        }
        if (rides.status === "fulfilled") {
          setOffers(asArray<RideLike>(rides.value));
        }
        if (bookingsRes.status === "fulfilled") {
          setBookings(asArray<BookingLike>(bookingsRes.value));
        }
        if (txList.status === "fulfilled") setTxs(asArray<WalletTx>(txList.value));
        if (notifList.status === "fulfilled") setNotifs(asArray<NotificationLike>(notifList.value));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your dashboard.");
      }
    })();
  }, [session?.user?.id]);

  // One account = one role, so the dashboard shows only that role's
  // cards. A passenger never sees Offer (and the "become a driver"
  // card is gone entirely — becoming a driver means opening a
  // separate driver account); a driver never sees Find / Request.
  const isDriver = user?.user_type === "driver";
  const cards = isDriver
    ? [
        { href: "/offer-ride", icon: "🚗", title: "ခရီးစဉ် ကမ်းလှမ်းပါ", desc: "မောင်းပြီး လွတ်နေသော ထိုင်ခုံများကို မျှဝေပါ" },
        { href: "/driver/dashboard", icon: "🪪", title: "ယာဉ်မောင်း ဒက်ရှ်ဘုတ်", desc: "ကမ်းလှမ်းထားသော ခရီးစဉ်များနှင့် စောင့်ဆိုင်းနေသော တောင်းဆိုမှုများ" },
        { href: "/my-rides", icon: "🎫", title: "ကျွန်တော့်ခရီးစဉ်များ", desc: "ဘွတ်ကင်များနှင့် သင် ကမ်းလှမ်းထားသော ခရီးစဉ်များ" },
        { href: "/wallet", icon: "👛", title: "ငွေအိတ်", desc: "လက်ကျန်ငွေ၊ ငွေဖြည့်ခြင်းနှင့် မှတ်တမ်း" },
      ]
    : [
        { href: "/find-ride", icon: "🔍", title: "ခရီးစဉ် ရှာပါ", desc: "သင့်လမ်းကြောင်းပေါ်က ကိုက်ညီသော မျှဝေခရီးစဉ်များကို ရှာပါ" },
        { href: "/ride-requests", icon: "👥", title: "ခရီးစဉ် တောင်းဆိုမှုများ", desc: "မျှဝေတောင်းဆိုမှုတစ်ခုမှာ ပါဝင်ပါ သို့မဟုတ် ဖန်တီးပါ" },
        { href: "/my-rides", icon: "🎫", title: "ကျွန်တော့်ခရီးစဉ်များ", desc: "ဘွတ်ကင်များနှင့် သင် ကမ်းလှမ်းထားသော ခရီးစဉ်များ" },
        { href: "/wallet", icon: "👛", title: "ငွေအိတ်", desc: "လက်ကျန်ငွေ၊ ငွေဖြည့်ခြင်းနှင့် မှတ်တမ်း" },
      ];

  return (
    <div className="page-wrap">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">မင်္ဂလာပါ{user?.name ? `, ${user.name}` : ""} 👋</h1>
          <p className="section-sub">သင့် SharedRide ဒက်ရှ်ဘုတ် — {isDriver ? "ယာဉ်မောင်း" : "ခရီးသည်"} အကောင့်</p>
        </div>
        {isDriver ? <Link href="/driver/dashboard" className="btn-outline">ယာဉ်မောင်း ဒက်ရှ်ဘုတ် →</Link> : null}
      </div>

      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">ငွေအိတ် လက်ကျန်ငွေ</p>
          <p className="mt-1 text-2xl font-medium">{balance != null ? fmtMMK(balance) : "—"}</p>
        </div>
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">ကျွန်တော့် ဘွတ်ကင်များ</p>
          <p className="mt-1 text-2xl font-medium">{bookings.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">ကျွန်တော် ကမ်းလှမ်းထားသော ခရီးစဉ်များ</p>
          <p className="mt-1 text-2xl font-medium">{offers.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-forest/60 dark:text-mint/60">ငွေလွှဲပြောင်းမှုများ</p>
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
        <h2 className="text-lg font-medium text-forest dark:text-mint">လတ်တလော အသိပေးချက်များ</h2>
        <div className="card mt-3">
          {notifs.length === 0 ? (
            <p className="text-sm text-forest/60 dark:text-mint/60">အသိပေးချက် မရှိသေးပါ။</p>
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
