"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import RideCard from "@/components/RideCard";
import {
  apiFetch,
  asArray,
  fmtMMK,
  fmtNum,
  rideEnd,
  rideEndLat,
  rideEndLng,
  ridePassengers,
  rideRoute,
  rideStart,
  rideStartLat,
  rideStartLng,
  rideTime,
  rideTripStatus,
  type RideLike,
  type RideRequestLike,
} from "@/lib/api";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false, loading: () => <div className="flex h-64 items-center justify-center rounded-[20px] bg-mint-soft text-sm text-forest/60">Loading map…</div> });

interface DriverInfo {
  licenseNumber?: string;
  license_number?: string;
  nrcNumber?: string;
  nrc_number?: string;
  carModel?: string;
  car_model?: string;
  carPlate?: string;
  car_plate?: string;
  carColor?: string;
  car_color?: string;
  carYear?: number;
  car_year?: number;
  verified?: boolean;
  [key: string]: unknown;
}

interface DashboardData {
  driver?: DriverInfo;
  rides?: RideLike[];
  offeredRides?: RideLike[];
  stats?: Record<string, number>;
  earnings?: { base?: number; bonus?: number; total?: number; rideCount?: number; passengerCount?: number };
  balance?: number;
  // Feature B — cash to collect (server-computed, see
  // /api/driver/dashboard): cash bookings are paid in person, never
  // through the wallet. byRide covers confirmed + completed cash
  // bookings only; cancelled / no-show owe nothing.
  cashToCollect?: {
    total?: number;
    byRide?: Array<{ rideId: string; count: number; amount: number }>;
  };
  pendingRequests?: RideRequestLike[];
  [key: string]: unknown;
}

export default function DriverDashboardPage() {
  return (
    <AuthGuard>
      <DriverDashboardInner />
    </AuthGuard>
  );
}

function DriverDashboardInner() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pending, setPending] = useState<RideRequestLike[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notDriver, setNotDriver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<RideRequestLike | null>(null);
  const [acceptMsg, setAcceptMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // D1: no-show booking ids picked per ride (booking id -> checked).
  const [noShowByRide, setNoShowByRide] = useState<Record<string, string[]>>({});
  const [completeMsg, setCompleteMsg] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  // D4: trip state actions (start / arrive) + location posting.
  const [tripMsg, setTripMsg] = useState("");
  const [tripBusyId, setTripBusyId] = useState<string | null>(null);
  const locatingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<DashboardData>("/api/driver/dashboard");
      setData(d);
      setNotDriver(false);
      // The dashboard response already carries pendingRequests; only fetch
      // ?pending=1 when it is absent.
      if (Array.isArray((d as { pendingRequests?: unknown }).pendingRequests)) {
        setPending(asArray<RideRequestLike>((d as { pendingRequests?: unknown }).pendingRequests));
      } else {
        try {
          const reqs = await apiFetch<unknown>("/api/ride-requests?pending=1");
          setPending(asArray<RideRequestLike>(reqs).filter((r) => r.status === "open" || r.status === "pending" || !r.status));
        } catch {
          /* pending list is optional */
        }
      }
      const bal = (d as { balance?: number; walletBalance?: number }).balance ?? (d as { walletBalance?: number }).walletBalance;
      if (typeof bal === "number") setBalance(bal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/404|409|driver/i.test(msg)) setNotDriver(true);
      setError(msg || "Could not load the driver dashboard.");
    }
    try {
      const b = await apiFetch<{ balance?: number }>("/api/wallet/balance");
      setBalance(typeof b.balance === "number" ? b.balance : null);
    } catch {
      /* keep dashboard balance */
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function acceptRequest(req: RideRequestLike) {
    setAcceptMsg("");
    try {
      await apiFetch(`/api/ride-requests/${req.id}/accept`, { method: "POST", body: JSON.stringify({}) });
      setAccepting(null);
      setAcceptMsg("Request accepted — an offered ride was created from it.");
      await load();
    } catch (e) {
      setAcceptMsg(e instanceof Error ? e.message : "Could not accept this request.");
    }
  }

  async function skipRequest(req: RideRequestLike) {
    setAcceptMsg("");
    try {
      await apiFetch(`/api/ride-requests/${req.id}/reject`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setAcceptMsg(e instanceof Error ? e.message : "Could not skip this request.");
    }
  }

  // D1: mark a ride completed (only after its departure time — the
  // server enforces this too). Checked passengers are marked no-show:
  // they are not refunded and the driver keeps their fareShare, which
  // was already credited at booking/accept time. Completion itself
  // moves no money.
  async function completeRide(ride: RideLike) {
    setCompleteMsg("");
    setCompletingId(ride.id);
    try {
      const res = await apiFetch<{ noShow?: string[] }>(`/api/rides/${ride.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ noShowBookingIds: noShowByRide[ride.id] ?? [] }),
      });
      const noShowCount = res.noShow?.length ?? 0;
      setCompleteMsg(
        noShowCount > 0
          ? `Ride completed — ${noShowCount} passenger${noShowCount === 1 ? "" : "s"} marked no-show (e-wallet fares are not refunded; cash no-shows pay nothing).`
          : "Ride completed — all passengers marked as rode.",
      );
      setNoShowByRide((prev) => {
        const next = { ...prev };
        delete next[ride.id];
        return next;
      });
      await load();
    } catch (e) {
      setCompleteMsg(e instanceof Error ? e.message : "Could not complete this ride.");
    } finally {
      setCompletingId(null);
    }
  }

  function toggleNoShow(rideId: string, bookingId: string) {
    setNoShowByRide((prev) => {
      const list = prev[rideId] ?? [];
      return {
        ...prev,
        [rideId]: list.includes(bookingId)
          ? list.filter((id) => id !== bookingId)
          : [...list, bookingId],
      };
    });
  }

  // D4: move the trip through its states. The server guards the
  // transition (scheduled -> started -> arrived) and notifies the
  // passengers; the button is only a request — the error message
  // (e.g. "can only start within 2 hours of departure") comes back
  // from the server when the gate refuses.
  async function tripAction(ride: RideLike, action: "start" | "arrive") {
    setTripMsg("");
    setTripBusyId(ride.id);
    try {
      await apiFetch(`/api/rides/${ride.id}/trip`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setTripMsg(
        action === "start"
          ? "Trip started — your location is now shared live with passengers. Keep this page open."
          : "Arrival recorded — passengers have been notified.",
      );
      await load();
    } catch (e) {
      setTripMsg(e instanceof Error ? e.message : "Could not update the trip.");
    } finally {
      setTripBusyId(null);
    }
  }

  const rides = data?.rides ?? data?.offeredRides ?? [];

  // D4: while any offered trip is 'started', post this phone's
  // geolocation to the server every ~10s so passengers can follow the
  // trip live. Only runs while the dashboard is open; a failed post
  // (e.g. location permission denied) is silent — the trip still works,
  // passengers just see the last known position marked stale.
  const startedRideIds = rides
    .filter((r) => (r.status === "open" || r.status === "full") && rideTripStatus(r) === "started")
    .map((r) => r.id);
  useEffect(() => {
    if (startedRideIds.length === 0) return;
    if (!navigator.geolocation) return;
    const post = () => {
      if (locatingRef.current) return;
      locatingRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locatingRef.current = false;
          for (const rideId of startedRideIds) {
            void apiFetch(`/api/rides/${rideId}/location`, {
              method: "POST",
              body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            }).catch(() => undefined);
          }
        },
        () => {
          locatingRef.current = false;
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
      );
    };
    post();
    const t = setInterval(post, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedRideIds.join(",")]);

  const stats = data?.stats ?? {};
  const earnings = data?.earnings ?? {};
  const driver = data?.driver ?? {};
  const activeRides = rides.filter((r) => r.status === "open" || r.status === "full").length;
  const availableSeats = rides.reduce((s, r) => s + ((r.seatsAvailable ?? r.seats_available ?? 0) as number), 0);
  const totalPassengers = rides.reduce((s, r) => s + ridePassengers(r).length, 0);
  const totalEarnings = (earnings.total as number | undefined) ?? (stats.totalEarnings as number | undefined) ?? (stats.total_earnings as number | undefined) ?? 0;

  if (loading) {
    return <div className="page-wrap"><p className="text-sm text-forest/60 dark:text-mint/60">Loading driver dashboard…</p></div>;
  }

  if (notDriver) {
    return (
      <div className="page-wrap max-w-xl">
        <div className="card text-center">
          <h1 className="page-title">You are not a driver yet</h1>
          <p className="section-sub mt-2">Register your licence, NRC and car to open the driver dashboard.</p>
          <Link href="/driver/register" className="btn-primary mt-5">Register as a driver →</Link>
        </div>
      </div>
    );
  }

  const firstRide = rides[0];
  const mapMarkers = firstRide && rideStartLat(firstRide) != null
    ? [
        { lat: rideStartLat(firstRide)!, lng: rideStartLng(firstRide)!, label: "Start", color: "green" as const },
        ...(rideEndLat(firstRide) != null ? [{ lat: rideEndLat(firstRide)!, lng: rideEndLng(firstRide)!, label: "End", color: "dark" as const }] : []),
      ]
    : [];

  return (
    <div className="page-wrap">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Driver dashboard</h1>
          <p className="section-sub">
            {driver.carModel ?? driver.car_model ?? "Your car"}{driver.carPlate ?? driver.car_plate ? ` · ${driver.carPlate ?? driver.car_plate}` : ""}
            {driver.carColor ?? driver.car_color ? ` · ${driver.carColor ?? driver.car_color}` : ""}
            {driver.carYear ?? driver.car_year ? ` · ${driver.carYear ?? driver.car_year}` : ""}
            {driver.verified === false ? " · Not verified yet" : ""}
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} className="btn-outline">{refreshing ? "Refreshing…" : "↻ Refresh"}</button>
      </div>

      {error && !data ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card"><p className="text-sm text-forest/60 dark:text-mint/60">Active rides</p><p className="mt-1 text-2xl font-medium">{stats.activeRides ?? stats.active_rides ?? activeRides}</p></div>
        <div className="card"><p className="text-sm text-forest/60 dark:text-mint/60">Available seats</p><p className="mt-1 text-2xl font-medium">{stats.availableSeats ?? stats.available_seats ?? availableSeats}</p></div>
        <div className="card"><p className="text-sm text-forest/60 dark:text-mint/60">Total earnings</p><p className="mt-1 text-2xl font-medium">{fmtMMK(totalEarnings)}</p></div>
        <div className="card"><p className="text-sm text-forest/60 dark:text-mint/60">Total passengers</p><p className="mt-1 text-2xl font-medium">{fmtNum(stats.totalPassengers ?? stats.total_passengers ?? totalPassengers)}</p></div>
      </div>

      {/* Feature B — cash to collect. Cash bookings never touch the
          wallet, so this is the only place the driver sees what
          passengers still owe in person: confirmed + completed cash
          bookings (cancelled / no-show owe nothing). Per-ride rows
          join the route label from the offered rides below. */}
      {(data?.cashToCollect?.total ?? 0) > 0 ? (
        <div className="card mt-6 border-2 border-forest/20 dark:border-mint/25">
          <h2 className="text-lg font-medium">💵 ငွေသား ကောက်ခံရန်</h2>
          <p className="mt-1 text-2xl font-medium">{fmtMMK(data?.cashToCollect?.total ?? 0)}</p>
          <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
            ငွေသားဖြင့် ဘွတ်ကင်လုပ်ထားသော ခရီးသည်များထံမှ တိုက်ရိုက် ကောက်ခံရမည့်ငွေ — ငွေအိတ်ထဲ ဝင်မည် မဟုတ်ပါ။
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
            {(data?.cashToCollect?.byRide ?? []).map((row) => {
              const ride = rides.find((r) => r.id === row.rideId);
              return (
                <div key={row.rideId} className="flex justify-between gap-3">
                  <dt className="min-w-0">
                    {ride ? `${rideStart(ride)} → ${rideEnd(ride)}` : row.rideId}
                    {ride?.status ? ` · ${ride.status === "completed" ? "ပြီးဆုံးပြီး" : "အတည်ပြုပြီး"}` : ""}
                    {` · ${row.count} ယောက်`}
                  </dt>
                  <dd className="shrink-0 font-medium">{fmtMMK(row.amount)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-medium">Earnings summary</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt>Base fares</dt><dd>{fmtMMK((earnings.base as number | undefined) ?? 0)}</dd></div>
            <div className="flex justify-between"><dt>Bonus</dt><dd>{fmtMMK((earnings.bonus as number | undefined) ?? 0)}</dd></div>
            <div className="flex justify-between border-t border-forest/10 pt-1.5 font-medium dark:border-mint/10"><dt>Estimated total</dt><dd>{fmtMMK(totalEarnings)}</dd></div>
            <div className="flex justify-between"><dt>Rides</dt><dd>{fmtNum((earnings.rideCount as number | undefined) ?? rides.length)}</dd></div>
            <div className="flex justify-between"><dt>Passengers</dt><dd>{fmtNum((earnings.passengerCount as number | undefined) ?? totalPassengers)}</dd></div>
          </dl>
          <p className="mt-4 text-sm">Wallet balance: <span className="font-medium">{balance != null ? fmtMMK(balance) : "—"}</span></p>
          <Link href="/wallet" className="btn-outline mt-3">Open wallet →</Link>
        </div>
        <div className="min-w-0">
          {firstRide ? (
            <RideMap center={{ lat: rideStartLat(firstRide)!, lng: rideStartLng(firstRide)! }} markers={mapMarkers} routeCoordinates={rideRoute(firstRide)} height={280} />
          ) : (
            <div className="card"><p className="text-sm text-forest/60 dark:text-mint/60">No offered rides yet — your routes will show on the map here.</p></div>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-medium text-forest dark:text-mint">Offered rides</h2>
        {completeMsg ? <p className="mt-3 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{completeMsg}</p> : null}
        {tripMsg ? <p className="mt-3 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{tripMsg}</p> : null}
        {rides.length === 0 ? (
          <p className="mt-2 text-sm text-forest/60 dark:text-mint/60">No rides offered yet. <Link href="/offer-ride" className="underline">Offer one →</Link></p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rides.map((r) => (
              <div key={r.id}>
                <RideCard ride={r} showMatch={false} />
                {/* D3: passenger phones — the dashboard response includes
                    them only for this ride's driver, confirmed bookings
                    only. */}
                {ridePassengers(r).length > 0 ? (
                  <p className="mt-2 px-1 text-sm text-forest/70 dark:text-mint/70">
                    Passengers: {ridePassengers(r).map((p, i) => (
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
                    ))}
                  </p>
                ) : null}
                {r.status === "completed" ? (
                  <p className="mt-2 px-1 text-sm font-medium text-forest dark:text-mint">Completed ✓</p>
                ) : (r.status === "open" || r.status === "full") ? (
                  <div className="mt-3 px-1">
                    {/* D4: trip states. Start becomes available within 2
                        hours of departure (server enforces it); while the
                        trip is started this page posts the phone's
                        location every ~10s for the passenger live view. */}
                    <p className="text-sm text-forest/70 dark:text-mint/70">
                      ခရီးစဉ် အခြေအနေ: {rideTripStatus(r) === "started" ? "သွားနေသည် (တည်နေရာ live မျှဝေနေသည်)" : rideTripStatus(r) === "arrived" ? "ရောက်ရှိနေသည်" : "မစရသေးပါ"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rideTripStatus(r) === "scheduled" ? (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={tripBusyId === r.id}
                          onClick={() => tripAction(r, "start")}
                        >
                          {tripBusyId === r.id ? "စတင်နေသည်…" : "▶ Start trip"}
                        </button>
                      ) : null}
                      {rideTripStatus(r) === "started" ? (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={tripBusyId === r.id}
                          onClick={() => tripAction(r, "arrive")}
                        >
                          {tripBusyId === r.id ? "မှတ်တမ်းတင်နေသည်…" : "📍 Arrived"}
                        </button>
                      ) : null}
                    </div>
                    {(() => {
                      const t = rideTime(r);
                      const departed = t ? new Date(t).getTime() <= Date.now() : false;
                      if (!departed) {
                        return <p className="mt-3 text-sm text-forest/60 dark:text-mint/60">Mark completed becomes available after departure ({t ? new Date(t).toLocaleString() : "—"}).</p>;
                      }
                      return (
                        <>
                          {ridePassengers(r).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                              {ridePassengers(r).map((p) =>
                                p.id ? (
                                  <label key={p.id} className="flex items-center gap-1.5 text-sm text-forest/80 dark:text-mint/80">
                                    <input
                                      type="checkbox"
                                      checked={(noShowByRide[r.id] ?? []).includes(p.id)}
                                      onChange={() => toggleNoShow(r.id, p.id!)}
                                    />
                                    {p.name} did not show
                                  </label>
                                ) : null,
                              )}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="btn-primary mt-2"
                            disabled={completingId === r.id}
                            onClick={() => completeRide(r)}
                          >
                            {completingId === r.id ? "Completing…" : "Mark completed"}
                          </button>
                          <p className="mt-1 text-xs text-forest/60 dark:text-mint/60">No-show passengers are not refunded — you keep their e-wallet fare; a cash no-show owes nothing.</p>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-medium text-forest dark:text-mint">Pending ride requests ({pending.length})</h2>
        <p className="section-sub">Accept a request to turn it into an offered ride on your route.</p>
        {acceptMsg ? <p className="mt-3 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{acceptMsg}</p> : null}
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-forest/60 dark:text-mint/60">No pending requests right now.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((req) => (
              <div key={req.id} className="card">
                <p className="font-medium">{req.startLabel ?? req.start_label} → {req.endLabel ?? req.end_label}</p>
                <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                  {req.passengerName ?? req.passenger_name ?? "Passenger"} · Estimated {fmtMMK(req.estimatedPrice ?? req.estimated_price)}
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-primary flex-1" onClick={() => setAccepting(req)}>Accept</button>
                  <button type="button" className="btn-outline flex-1" onClick={() => skipRequest(req)}>Skip</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {accepting ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Accept ride request">
          <div className="card w-full max-w-md rounded-b-none p-6 sm:rounded-b-[20px]">
            <h2 className="text-lg font-medium">Accept this request?</h2>
            <p className="mt-2 text-sm">{accepting.startLabel ?? accepting.start_label} → {accepting.endLabel ?? accepting.end_label}</p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                <tr className="border-b border-forest/10 dark:border-mint/10"><td className="py-2">Passenger fare</td><td className="py-2 text-right">{fmtMMK(accepting.estimatedPrice ?? accepting.estimated_price)}</td></tr>
                <tr className="border-b border-forest/10 dark:border-mint/10"><td className="py-2">App fee (5%)</td><td className="py-2 text-right">{fmtMMK(Math.floor((accepting.estimatedPrice ?? accepting.estimated_price ?? 0) * 0.05))}</td></tr>
                <tr><td className="py-2 font-medium">Your earnings</td><td className="py-2 text-right font-medium">{fmtMMK(Math.floor((accepting.estimatedPrice ?? accepting.estimated_price ?? 0) * 0.95))}</td></tr>
              </tbody>
            </table>
            <div className="mt-5 flex gap-3">
              <button type="button" className="btn-outline flex-1" onClick={() => setAccepting(null)}>Cancel</button>
              <button type="button" className="btn-primary flex-1" onClick={() => acceptRequest(accepting)}>Confirm accept</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
