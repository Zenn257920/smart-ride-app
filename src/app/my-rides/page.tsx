"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import AuthGuard from "@/components/AuthGuard";
import {
  apiFetch,
  asArray,
  fmtMMK,
  fmtTime,
  rideCar,
  rideDriverName,
  rideEnd,
  ridePassengers,
  ridePlate,
  rideStart,
  rideTime,
  type BookingLike,
  type RideLike,
} from "@/lib/api";

type Tab = "passenger" | "driver";

export default function MyRidesPage() {
  return (
    <AuthGuard>
      <MyRidesInner />
    </AuthGuard>
  );
}

function MyRidesInner() {
  const { data: session } = useSession();
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
    const uid = session?.user?.id;
    try {
      const [ridesRes, bookingsRes] = await Promise.allSettled([
        apiFetch<unknown>("/api/rides"),
        apiFetch<unknown>("/api/bookings"),
      ]);
      if (ridesRes.status === "fulfilled") {
        const all = asArray<RideLike>(ridesRes.value);
        setOffers(all.filter((r) => (r.driverId ?? r.driver_id) === uid || (r.driver as { id?: string } | undefined)?.id === uid));
      }
      if (bookingsRes.status === "fulfilled") {
        setBookings(asArray<BookingLike>(bookingsRes.value));
      } else {
        // Fallback: derive bookings from rides listing me as a passenger.
        if (ridesRes.status === "fulfilled") {
          const all = asArray<RideLike>(ridesRes.value);
          const mine = all.filter((r) => (r.passengers ?? []).some((p) => (p.id ?? p.passengerId ?? p.passenger_id) === uid));
          setBookings(mine as unknown as BookingLike[]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your rides.");
    }
  }, [session?.user?.id]);

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
      await apiFetch(`/api/bookings/${cancelTarget.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Booking cancelled. Any refund due goes back to your wallet.");
      setCancelTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this booking.");
      setCancelTarget(null);
    }
  }

  async function cancelOffer(ride: RideLike) {
    setError("");
    try {
      await apiFetch(`/api/rides/${ride.id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Ride offer cancelled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this ride.");
    }
  }

  // D1: mark an offered ride completed (server allows it only after
  // departure). All confirmed passengers are marked as rode — use the
  // driver dashboard to mark individual no-shows.
  async function completeOffer(ride: RideLike) {
    setError("");
    try {
      await apiFetch(`/api/rides/${ride.id}/complete`, { method: "POST", body: JSON.stringify({ noShowBookingIds: [] }) });
      setNotice("Ride completed. Passengers can now rate you.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete this ride.");
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
      setRatingMsg("Thanks — your rating was saved.");
      setRatingTarget(null);
      setComment("");
      setStars(5);
    } catch (err) {
      setRatingMsg(err instanceof Error ? err.message : "Could not save your rating.");
    } finally {
      setRatingBusy(false);
    }
  }

  function bookingRide(b: BookingLike): RideLike | null {
    return (b.ride as RideLike | undefined) ?? null;
  }

  return (
    <div className="page-wrap">
      <h1 className="page-title">My rides</h1>
      <p className="section-sub">Bookings you made and rides you offered.</p>

      {notice ? <p className="mt-4 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="mt-5 flex gap-2">
        {(["passenger", "driver"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={`btn ${tab === t ? "btn-primary" : "btn-outline"}`}>
            {t === "passenger" ? `Passenger (${bookings.length})` : `Driver (${offers.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-forest/60 dark:text-mint/60">Loading your rides…</p>
      ) : tab === "passenger" ? (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {bookings.length === 0 ? (
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">No bookings yet. Find a ride to get started.</p></div>
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
                  {avg ? <p className="mt-1 text-sm">Driver rating: ★ {avg.average.toFixed(1)} ({avg.count} rating{avg.count === 1 ? "" : "s"})</p> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <p>Fare: {fmtMMK(b.fareShare ?? b.fare_share)}</p>
                    <p>App fee: {fmtMMK(b.appFee ?? b.app_fee)}</p>
                    <p>Total: <span className="font-medium">{fmtMMK(b.totalPrice ?? b.total_price)}</span></p>
                    <p>Payment: {b.paymentMethod ?? b.payment_method ?? "—"}</p>
                    <p>Status: {b.status ?? "—"}</p>
                    <p>Seats: {b.seats ?? 1}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {cancellable ? (
                      <button type="button" className="btn-outline" onClick={() => setCancelTarget(b)}>Cancel booking</button>
                    ) : null}
                    {rateable ? (
                      <button type="button" className="btn-primary" onClick={() => { setRatingTarget(b); setRatingMsg(""); }}>★ Rate driver</button>
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
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">You have not offered any rides yet.</p></div>
          ) : (
            offers.map((r) => (
              <article key={r.id} className="card">
                <p className="font-medium">{rideStart(r)} → {rideEnd(r)}</p>
                <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                  {fmtTime(rideTime(r))} · {rideCar(r)} {ridePlate(r)} · Status: {r.status ?? "—"}
                </p>
                <p className="mt-2 text-sm">Passengers: {ridePassengers(r).length ? ridePassengers(r).map((p) => p.name).join(", ") : "None yet"}</p>
                {(r.status === "open" || r.status === "full") ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={() => completeOffer(r)}>Mark completed</button>
                    <button type="button" className="btn-outline" onClick={() => cancelOffer(r)}>Cancel ride</button>
                  </div>
                ) : null}
                {r.status === "completed" ? (
                  <p className="mt-2 text-sm font-medium text-forest dark:text-mint">Completed ✓</p>
                ) : null}
              </article>
            ))
          )}
        </div>
      )}

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Cancel booking">
          <div className="card w-full max-w-sm">
            <h2 className="text-lg font-medium">Cancel this booking?</h2>
            <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">
              Cancelling frees your seat. If a refund applies under the cancellation rules, it goes back to your wallet.
            </p>
            <div className="mt-5 flex gap-3">
              <button type="button" className="btn-outline flex-1" onClick={() => setCancelTarget(null)}>Keep booking</button>
              <button type="button" className="btn-danger flex-1" onClick={cancelBooking}>Yes, cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {ratingTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Rate driver">
          <div className="card w-full max-w-sm">
            <h2 className="text-lg font-medium">Rate your driver</h2>
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
              <button type="button" className="btn-outline flex-1" onClick={() => setRatingTarget(null)}>Close</button>
              <button type="button" className="btn-primary flex-1" disabled={ratingBusy} onClick={submitRating}>{ratingBusy ? "Saving…" : "Save rating"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
