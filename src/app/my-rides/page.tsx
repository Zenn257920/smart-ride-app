"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AuthGuard from "@/components/AuthGuard";
import {
  apiFetch,
  asArray,
  fmtMMK,
  fmtTime,
  rideCar,
  rideDriverName,
  rideDriverPhone,
  rideEnd,
  ridePassengers,
  ridePlate,
  rideStart,
  rideTime,
  rideTripStatus,
  type BookingLike,
  type RideLike,
} from "@/lib/api";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false, loading: () => <div className="flex h-64 items-center justify-center rounded-[20px] bg-mint-soft text-sm text-forest/60">Loading map…</div> });

type Tab = "passenger" | "driver";

interface LiveTrip {
  rideId: string;
  status: string;
  tripStatus: string;
  isLive: boolean;
  driverName?: string;
  driverLat?: number | null;
  driverLng?: number | null;
  driverLocationAt?: string | null;
  locationFresh?: boolean;
  startLabel?: string;
  startLat?: number;
  startLng?: number;
  endLabel?: string;
  endLat?: number;
  endLng?: number;
  routeCoordinates?: Array<[number, number]> | null;
}

/**
 * D4 — passenger live view for one ride. Polls GET /api/rides/:id/live
 * every 10s while the trip is under way and shows the driver marker on
 * the map (autoFit off so the moving marker does not yank the view).
 * Only rendered for confirmed bookings whose trip has started/arrived.
 */
function LiveTripView({ rideId }: { rideId: string }) {
  const [live, setLive] = useState<LiveTrip | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await apiFetch<LiveTrip>(`/api/rides/${rideId}/live`);
        if (!cancelled) {
          setLive(d);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Live view unavailable.");
      }
    }
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [rideId]);

  if (error && !live) return <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>;
  if (!live) return <p className="mt-3 text-sm text-forest/60 dark:text-mint/60">Live trip ကို ဖွင့်နေသည်…</p>;

  const markers = [
    ...(live.startLat != null && live.startLng != null ? [{ lat: live.startLat, lng: live.startLng, label: live.startLabel ?? "Start", color: "green" as const }] : []),
    ...(live.endLat != null && live.endLng != null ? [{ lat: live.endLat, lng: live.endLng, label: live.endLabel ?? "End", color: "dark" as const }] : []),
    ...(live.driverLat != null && live.driverLng != null ? [{ lat: live.driverLat, lng: live.driverLng, label: `${live.driverName ?? "Driver"} (live)`, color: "mint" as const }] : []),
  ];
  const center = live.driverLat != null && live.driverLng != null
    ? { lat: live.driverLat, lng: live.driverLng }
    : live.startLat != null && live.startLng != null
      ? { lat: live.startLat, lng: live.startLng }
      : undefined;

  return (
    <div className="mt-3 rounded-[12px] bg-mint-soft p-3 dark:bg-forest-soft">
      <p className="text-sm font-medium">
        {live.tripStatus === "arrived"
          ? "ယာဉ်မောင်း ရောက်ရှိနေပါပြီ ✓"
          : live.locationFresh
            ? "ခရီးစဉ် သွားနေသည် — ယာဉ်မောင်း တည်နေရာ live"
            : "ခရီးစဉ် သွားနေသည် — ယာဉ်မောင်း တည်နေရာ အသစ်မရသေးပါ"}
      </p>
      {live.driverLocationAt ? (
        <p className="mt-1 text-xs text-forest/60 dark:text-mint/60">
          တည်နေရာ အပ်ဒိတ်: {fmtTime(live.driverLocationAt)}
          {live.locationFresh ? "" : " (ဟောင်းနေသည် — ယာဉ်မောင်း အင်တာနက်/တည်နေရာ ဖွင့်ထားခြင်း ရှိ/မရှိ စစ်ပါ)"}
        </p>
      ) : null}
      <div className="mt-3">
        <RideMap center={center} markers={markers} routeCoordinates={live.routeCoordinates ?? undefined} height={240} autoFit={false} />
      </div>
    </div>
  );
}

function tripStatusLabel(status: string): string {
  if (status === "started") return "သွားနေသည်";
  if (status === "arrived") return "ရောက်ရှိနေသည်";
  return "မစရသေးပါ";
}

export default function MyRidesPage() {
  return (
    <AuthGuard>
      <MyRidesInner />
    </AuthGuard>
  );
}

function MyRidesInner() {
  const [tab, setTab] = useState<Tab>("passenger");
  const [bookings, setBookings] = useState<BookingLike[]>([]);
  const [offers, setOffers] = useState<RideLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelTarget, setCancelTarget] = useState<BookingLike | null>(null);
  const [ratingTarget, setRatingTarget] = useState<BookingLike | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [ratingMsg, setRatingMsg] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [driverAvg, setDriverAvg] = useState<Record<string, { average: number; count: number }>>({});

  const load = useCallback(async () => {
    try {
      const [ridesRes, bookingsRes] = await Promise.allSettled([
        // B7: the server filters to my own offers (?mine=1) — the page
        // used to download every open ride and filter client-side.
        apiFetch<unknown>("/api/rides?mine=1"),
        apiFetch<unknown>("/api/bookings"),
      ]);
      if (ridesRes.status === "fulfilled") {
        setOffers(asArray<RideLike>(ridesRes.value));
      }
      if (bookingsRes.status === "fulfilled") {
        setBookings(asArray<BookingLike>(bookingsRes.value));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "သင့်ခရီးစဉ်များကို ဖွင့်၍ မရပါ။");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function loadDriverAvg(driverId: string) {
    if (driverAvg[driverId]) return;
    try {
      const d = await apiFetch<{ average?: number; rating?: number; count?: number; total?: number }>(`/api/drivers/${driverId}/rating`);
      const avg = d.average ?? d.rating ?? null;
      const count = d.count ?? d.total ?? 0;
      if (avg != null) setDriverAvg((prev) => ({ ...prev, [driverId]: { average: avg, count } }));
    } catch {
      /* average is optional */
    }
  }

  useEffect(() => {
    for (const b of bookings) {
      const ride = b.ride as RideLike | undefined;
      const did = (ride?.driverId ?? ride?.driver_id ?? (ride?.driver as { id?: string } | undefined)?.id) as string | undefined;
      if (did) void loadDriverAvg(did);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  async function cancelBooking() {
    if (!cancelTarget) return;
    setError("");
    try {
      const res = await apiFetch<{ note?: string; refunded?: number }>(`/api/bookings/${cancelTarget.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      // Feature B — a cash booking refunds nothing (nothing was ever
      // taken); the server says so in `note`, so show that instead of
      // the generic "refund back to your wallet" line.
      setNotice(res.note ?? "ဘွတ်ကင်ကို ပယ်ဖျက်ပြီးပါပြီ။ ပြန်အမ်းငွေ ရှိပါက သင့်ငွေအိတ်ထဲ ပြန်ရောက်ပါမည်။");
      setCancelTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ဤဘွတ်ကင်ကို ပယ်ဖျက်၍ မရပါ။");
      setCancelTarget(null);
    }
  }

  async function cancelOffer(ride: RideLike) {
    setError("");
    try {
      await apiFetch(`/api/rides/${ride.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      setNotice("ခရီးစဉ် ကမ်းလှမ်းမှုကို ပယ်ဖျက်ပြီးပါပြီ။");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ဤခရီးစဉ်ကို ပယ်ဖျက်၍ မရပါ။");
    }
  }

  // D1: mark an offered ride completed (server allows it only after
  // departure). All confirmed passengers are marked as rode — use the
  // driver dashboard to mark individual no-shows.
  async function completeOffer(ride: RideLike) {
    setError("");
    try {
      await apiFetch(`/api/rides/${ride.id}/complete`, { method: "POST", body: JSON.stringify({ noShowBookingIds: [] }) });
      setNotice("ခရီးစဉ် ပြီးဆုံးပါပြီ။ ခရီးသည်များ သင့်ကို အဆင့်သတ်မှတ်နိုင်ပါပြီ။");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ဤခရီးစဉ်ကို ပြီးဆုံးကြောင်း အတည်ပြု၍ မရပါ။");
    }
  }

  async function submitRating() {
    if (!ratingTarget) return;
    setRatingMsg("");
    setRatingBusy(true);
    try {
      await apiFetch("/api/ratings", {
        method: "POST",
        body: JSON.stringify({ bookingId: ratingTarget.id, stars, comment: comment.trim() }),
      });
      setRatingMsg("ကျေးဇူးတင်ပါတယ် — သင့်အဆင့်သတ်မှတ်ချက်ကို သိမ်းပြီးပါပြီ။");
      setRatingTarget(null);
      setComment("");
      setStars(5);
    } catch (err) {
      setRatingMsg(err instanceof Error ? err.message : "အဆင့်သတ်မှတ်ချက်ကို သိမ်း၍ မရပါ။");
    } finally {
      setRatingBusy(false);
    }
  }

  function bookingRide(b: BookingLike): RideLike | null {
    return (b.ride as RideLike | undefined) ?? null;
  }

  return (
    <div className="page-wrap">
      <h1 className="page-title">ကျွန်တော့်ခရီးစဉ်များ</h1>
      <p className="section-sub">သင် ဘွတ်ကင်လုပ်ထားသော ခရီးစဉ်များနှင့် သင် ကမ်းလှမ်းထားသော ခရီးစဉ်များ။</p>

      {notice ? <p className="mt-4 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="mt-5 flex gap-2">
        {(["passenger", "driver"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={`btn ${tab === t ? "btn-primary" : "btn-outline"}`}>
            {t === "passenger" ? `ခရီးသည် (${bookings.length})` : `ယာဉ်မောင်း (${offers.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-forest/60 dark:text-mint/60">သင့်ခရီးစဉ်များကို ဖွင့်နေသည်…</p>
      ) : tab === "passenger" ? (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {bookings.length === 0 ? (
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">ဘွတ်ကင်တစ်ခု မှ မရှိသေးပါ။ ခရီးစဉ် ရှာပြီး စတင်ပါ။</p></div>
          ) : (
            bookings.map((b) => {
              const ride = bookingRide(b);
              const did = (ride?.driverId ?? ride?.driver_id ?? (ride?.driver as { id?: string } | undefined)?.id) as string | undefined;
              const avg = did ? driverAvg[did] : undefined;
              const cancellable = b.status === "confirmed";
              const rateable = b.status === "confirmed" || b.status === "completed";
              return (
                <article key={b.id} className="card">
                  <p className="font-medium">{ride ? `${rideStart(ride)} → ${rideEnd(ride)}` : `Booking ${b.id.slice(0, 8)}`}</p>
                  <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                    {ride ? `${rideDriverName(ride)} · ${rideCar(ride)} ${ridePlate(ride)} · ${fmtTime(rideTime(ride))}` : fmtTime(b.departureTime ?? b.departure_time)}
                  </p>
                  {avg ? <p className="mt-1 text-sm">ယာဉ်မောင်း အဆင့်: ★ {avg.average.toFixed(1)} ({avg.count} ခု)</p> : null}
                  {/* D3: the driver's phone, shown only for a confirmed /
                      completed booking — the server drops the key
                      otherwise. */}
                  {ride && rideDriverPhone(ride) ? (
                    <p className="mt-2 text-sm">
                      ယာဉ်မောင်း ဖုန်း:{" "}
                      <a href={`tel:${rideDriverPhone(ride)}`} className="font-medium underline">
                        📞 {rideDriverPhone(ride)}
                      </a>
                    </p>
                  ) : null}
                  {ride && b.status === "confirmed" ? (
                    <p className="mt-1 text-sm">ခရီးစဉ် အခြေအနေ: {tripStatusLabel(rideTripStatus(ride))}</p>
                  ) : null}
                  {/* D4: live tracking while the trip is under way. */}
                  {ride && b.status === "confirmed" && (rideTripStatus(ride) === "started" || rideTripStatus(ride) === "arrived") ? (
                    <LiveTripView rideId={ride.id} />
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <p>Fare: {fmtMMK(b.fareShare ?? b.fare_share)}</p>
                    <p>App fee: {fmtMMK(b.appFee ?? b.app_fee)}</p>
                    <p>Total: <span className="font-medium">{fmtMMK(b.totalPrice ?? b.total_price)}</span></p>
                    {/* Feature B — payment badge. Cash is paid to the
                        driver in person, so the amount to hand over is
                        shown; e-wallet was already paid from the wallet. */}
                    {(b.paymentMethod ?? b.payment_method) === "cash" ? (
                      <p className="col-span-2">
                        <span className="inline-block rounded-full border border-forest/30 bg-mint-soft px-2.5 py-1 text-xs font-medium text-forest dark:border-mint/40 dark:bg-forest-soft dark:text-mint">
                          💵 ငွေသား — ယာဉ်မောင်းကို {fmtMMK(b.totalPrice ?? b.total_price)} ပေးပါ
                        </span>
                      </p>
                    ) : (
                      <p>
                        <span className="inline-block rounded-full bg-mint-soft px-2.5 py-1 text-xs text-forest/70 dark:bg-forest-soft dark:text-mint/70">
                          💳 E-Wallet — ငွေအိတ်မှ ပေးပြီးပါပြီ
                        </span>
                      </p>
                    )}
                    <p>Status: {b.status ?? "—"}</p>
                    <p>Seats: {b.seats ?? 1}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cancellable ? (
                      <button type="button" className="btn-outline" onClick={() => setCancelTarget(b)}>ဘွတ်ကင်ပယ်ဖျက်မယ်</button>
                    ) : null}
                    {rateable ? (
                      <button type="button" className="btn-primary" onClick={() => { setRatingTarget(b); setRatingMsg(""); }}>★ ယာဉ်မောင်းကို အဆင့်သတ်မှတ်မယ်</button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {offers.length === 0 ? (
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">ခရီးစဉ် တစ်ခုမှ မကမ်းလှမ်းရသေးပါ။</p></div>
          ) : (
            offers.map((r) => (
              <article key={r.id} className="card">
                <p className="font-medium">{rideStart(r)} → {rideEnd(r)}</p>
                <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                  {fmtTime(rideTime(r))} · {rideCar(r)} {ridePlate(r)} · Status: {r.status ?? "—"}
                </p>
                {(r.status === "open" || r.status === "full") ? (
                  <p className="mt-1 text-sm">ခရီးစဉ် အခြေအနေ: {tripStatusLabel(rideTripStatus(r))}</p>
                ) : null}
                {/* D3: passenger phones — the ?mine=1 response includes
                    them only for the ride's own driver, confirmed
                    bookings only. */}
                <p className="mt-2 text-sm">
                  Passengers: {ridePassengers(r).length ? ridePassengers(r).map((p, i) => (
                    <span key={p.id ?? i}>
                      {i > 0 ? ", " : ""}
                      {p.name}
                      {p.phone ? (
                        <>
                          {" "}
                          <a href={`tel:${p.phone}`} className="underline">📞 {p.phone}</a>
                        </>
                      ) : null}
                    </span>
                  )) : "None yet"}
                </p>
                {(r.status === "open" || r.status === "full") ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={() => completeOffer(r)}>ပြီးဆုံးကြောင်း အတည်ပြုမယ်</button>
                    <button type="button" className="btn-outline" onClick={() => cancelOffer(r)}>ခရီးစဉ် ပယ်ဖျက်မယ်</button>
                  </div>
                ) : null}
                {r.status === "completed" ? (
                  <p className="mt-2 text-sm font-medium text-forest dark:text-mint">ပြီးဆုံးပါပြီ ✓</p>
                ) : null}
              </article>
            ))
          )}
        </div>
      )}

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Cancel booking">
          <div className="card w-full max-w-sm">
            <h2 className="text-lg font-medium">ဤဘွတ်ကင်ကို ပယ်ဖျက်မလား?</h2>
            <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">
              ပယ်ဖျက်လိုက်လျှင် သင့်ထိုင်ခုံ လွတ်သွားပါမည်။ ပယ်ဖျက်မှုစည်းကမ်းအရ ပြန်အမ်းငွေ ရှိပါက သင့်ငွေအိတ်ထဲ ပြန်ရောက်ပါမည်။
            </p>
            {(cancelTarget.paymentMethod ?? cancelTarget.payment_method) === "cash" ? (
              <p className="mt-2 text-sm font-medium text-forest dark:text-mint">
                💵 ငွေသားဖြင့် ဘွတ်ကင်လုပ်ထားသောကြောင့် ပေးချေထားခြင်း မရှိသေးပါ — ပယ်ဖျက်လျှင် ပြန်အမ်းငွေ မရှိပါ။
              </p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button type="button" className="btn-outline flex-1" onClick={() => setCancelTarget(null)}>ဘွတ်ကင်ကို ဆက်ထားမယ်</button>
              <button type="button" className="btn-danger flex-1" onClick={cancelBooking}>ဟုတ်ကဲ့၊ ပယ်ဖျက်မယ်</button>
            </div>
          </div>
        </div>
      ) : null}

      {ratingTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Rate driver">
          <div className="card w-full max-w-sm">
            <h2 className="text-lg font-medium">ယာဉ်မောင်းကို အဆင့်သတ်မှတ်ပါ</h2>
            <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
              {bookingRide(ratingTarget) ? rideDriverName(bookingRide(ratingTarget)!) : "Driver"}
            </p>
            <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Stars">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" aria-label={`${s} star${s === 1 ? "" : "s"}`} aria-pressed={stars === s} onClick={() => setStars(s)} className={`rounded-[8px] px-2 py-1 text-2xl ${stars >= s ? "text-forest dark:text-mint" : "text-forest/25 dark:text-mint/25"}`}>
                  ★
                </button>
              ))}
            </div>
            <label htmlFor="ratingComment" className="label mt-4">Comment (optional)</label>
            <textarea id="ratingComment" className="input min-h-20" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the ride?" />
            {ratingMsg ? <p className="mt-3 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{ratingMsg}</p> : null}
            <div className="mt-5 flex gap-3">
              <button type="button" className="btn-outline flex-1" onClick={() => setRatingTarget(null)}>ပိတ်မယ်</button>
              <button type="button" className="btn-primary flex-1" disabled={ratingBusy} onClick={submitRating}>{ratingBusy ? "သိမ်းနေသည်…" : "အဆင့်သတ်မှတ်ချက် သိမ်းမယ်"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
