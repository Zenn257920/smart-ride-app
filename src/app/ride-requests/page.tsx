"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import AuthGuard from "@/components/AuthGuard";
import RoleGuard from "@/components/RoleGuard";
import BookingModal from "@/components/BookingModal";
import LocationField from "@/components/LocationField";
import PricePreview from "@/components/PricePreview";
import {
  apiFetch,
  asArray,
  fmtMMK,
  fmtTime,
  geocode,
  localInputValue,
  YANGON,
  type GeocodeHit,
  type LatLng,
  type RideLike,
  type RideRequestLike,
} from "@/lib/api";
import { resolveTypedLocation } from "@/lib/geocode-fallback";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false, loading: () => <div className="flex h-80 items-center justify-center rounded-[20px] bg-mint-soft text-sm text-forest/60">Loading map…</div> });

type Tab = "all" | "create" | "mine";

export default function RideRequestsPage() {
  return (
    <AuthGuard>
      <RoleGuard
        allow={["passenger"]}
        redirectTo="/driver/dashboard"
        message="ဤစာမျက်နှာသည် ခရီးသည် အကောင့်အတွက်သာ ဖြစ်သည်။ ယာဉ်မောင်း အကောင့်ဖြင့် တောင်းဆိုမှု ဖန်တီး/ပါဝင်၍ မရပါ — တောင်းဆိုမှုများကို ယာဉ်မောင်း ဒက်ရှ်ဘုတ်မှာ လက်ခံရပါသည်။"
      >
        <RideRequestsInner />
      </RoleGuard>
    </AuthGuard>
  );
}

function RideRequestsInner() {
  const router = useRouter();
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("all");
  const [requests, setRequests] = useState<RideRequestLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Create form
  const [startLabel, setStartLabel] = useState("");
  const [endLabel, setEndLabel] = useState("");
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [departureTime, setDepartureTime] = useState(() => localInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [balance, setBalance] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  // Unified matching: before creating, check whether an offered ride
  // already covers this route/time (GET /api/rides/search — no new
  // endpoint). If so, show the rides inline with Book buttons and
  // let the user book one OR create the request anyway (never blocked).
  const [existingOffers, setExistingOffers] = useState<RideLike[]>([]);
  const [checkingOffers, setCheckingOffers] = useState(false);
  const [bookingOffer, setBookingOffer] = useState<RideLike | null>(null);

  // Join modal
  const [joining, setJoining] = useState<RideRequestLike | null>(null);
  const [joinStartLabel, setJoinStartLabel] = useState("");
  const [joinEndLabel, setJoinEndLabel] = useState("");
  const [joinStart, setJoinStart] = useState<LatLng | null>(null);
  const [joinEnd, setJoinEnd] = useState<LatLng | null>(null);
  const [joinError, setJoinError] = useState("");
  const [joiningBusy, setJoiningBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<unknown>("/api/ride-requests");
      setRequests(asArray<RideRequestLike>(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load ride requests.");
    }
    try {
      const b = await apiFetch<{ balance?: number }>("/api/wallet/balance");
      setBalance(typeof b.balance === "number" ? b.balance : null);
    } catch {
      /* balance optional */
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

  const myId = session?.user?.id;
  const mine = requests.filter((r) => (r.passengerId ?? r.passenger_id) === myId);
  const shown = tab === "mine" ? mine : requests;

  async function createRequest(e?: React.FormEvent | React.MouseEvent, force = false) {
    e?.preventDefault();
    setCreateError("");
    setNotice("");
    // Typed-only labels have no coords (LocationField sets them only
    // onSelect) — resolve them with /api/geocode first, same as
    // find-ride's search(). Only when nothing matches do we error,
    // naming the field that failed.
    let s = start;
    let en = end;
    if (!s && startLabel.trim()) {
      const resolved = await resolveTypedLocation(startLabel, s, geocode);
      if (resolved.coords) {
        s = resolved.coords;
        setStart(s);
        if (resolved.label) setStartLabel(resolved.label);
      }
    }
    if (!en && endLabel.trim()) {
      const resolved = await resolveTypedLocation(endLabel, en, geocode);
      if (resolved.coords) {
        en = resolved.coords;
        setEnd(en);
        if (resolved.label) setEndLabel(resolved.label);
      }
    }
    if (!s || !en) {
      const missing = [
        ...(!s ? [`ထွက်မည့်နေရာ${startLabel.trim() ? ` ("${startLabel.trim()}")` : ""}`] : []),
        ...(!en ? [`ဦးတည်ရာ${endLabel.trim() ? ` ("${endLabel.trim()}")` : ""}`] : []),
      ];
      setCreateError(
        `${missing.join(" နှင့် ")} ကို ရှာ၍ မရပါ — နေရာအမည်ကို ရိုက်ပြီး အကြံပြုချက်ကို နှိပ်ပါ၊ သို့မဟုတ် မြေပုံပေါ်တွင် နှိပ်ပြီး ရွေးပါ။`,
      );
      return;
    }
    // A6: departure must be in the future (server enforces this too).
    if (Number.isNaN(new Date(departureTime).getTime()) || new Date(departureTime) <= new Date()) {
      setCreateError("Departure time must be in the future.");
      return;
    }
    // Unified matching: check for an already-offered ride first.
    // force=true is the "create the request anyway" button — the
    // check never blocks creation.
    if (!force) {
      setCheckingOffers(true);
      try {
        const q = new URLSearchParams({
          startLat: String(s.lat),
          startLng: String(s.lng),
          endLat: String(en.lat),
          endLng: String(en.lng),
          departureTime: new Date(departureTime).toISOString(),
        });
        const data = await apiFetch<unknown>(`/api/rides/search?${q.toString()}`);
        const raw = asArray<Record<string, unknown>>(data);
        const offers = raw.map((m) => {
          const ride = (m.ride as Record<string, unknown> | undefined) ?? m;
          return {
            ...ride,
            driverName: m.driverName ?? ride.driverName,
            carModel: m.carModel ?? ride.carModel,
            carPlate: m.carPlate ?? ride.carPlate,
            seatsAvailable: m.seatsAvailable ?? ride.seatsAvailable,
            departureTime: m.departureTime ?? ride.departureTime,
            matchScore: m.matchScore,
            matchPercentage: m.matchPercentage,
            fareShare: m.fareShare,
            appFee: m.appCommissionPerPassenger,
            totalPrice: m.discountedPrice,
            savings: m.savings,
            distanceKm: m.passengerDistanceKm ?? ride.distanceKm,
          } as RideLike;
        });
        if (offers.length > 0) {
          setExistingOffers(offers);
          setCheckingOffers(false);
          return;
        }
      } catch {
        // Search failing must not block creating the request.
        setExistingOffers([]);
      } finally {
        setCheckingOffers(false);
      }
    }
    setExistingOffers([]);
    setCreating(true);
    try {
      await apiFetch("/api/ride-requests", {
        method: "POST",
        body: JSON.stringify({
          startLabel,
          startLat: s.lat,
          startLng: s.lng,
          endLabel,
          endLat: en.lat,
          endLng: en.lng,
          departureTime: new Date(departureTime).toISOString(),
        }),
      });
      setNotice("Ride request created — the prepayment was taken from your wallet.");
      setStartLabel("");
      setEndLabel("");
      setStart(null);
      setEnd(null);
      setTab("mine");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create the request.");
    } finally {
      setCreating(false);
    }
  }

  async function joinRequest() {
    // The modal only renders when joining is set; this is unreachable
    // in practice, but TypeScript needs the null narrowing.
    if (!joining) return;
    // Same typed-label fallback as create: resolve with /api/geocode
    // when coords are null, and name the field that failed.
    let js = joinStart;
    let je = joinEnd;
    if (!js && joinStartLabel.trim()) {
      const resolved = await resolveTypedLocation(joinStartLabel, js, geocode);
      if (resolved.coords) {
        js = resolved.coords;
        setJoinStart(js);
        if (resolved.label) setJoinStartLabel(resolved.label);
      }
    }
    if (!je && joinEndLabel.trim()) {
      const resolved = await resolveTypedLocation(joinEndLabel, je, geocode);
      if (resolved.coords) {
        je = resolved.coords;
        setJoinEnd(je);
        if (resolved.label) setJoinEndLabel(resolved.label);
      }
    }
    if (!js || !je) {
      const missing = [
        ...(!js ? [`တက်မည့်နေရာ${joinStartLabel.trim() ? ` ("${joinStartLabel.trim()}")` : ""}`] : []),
        ...(!je ? [`ဆင်းမည့်နေရာ${joinEndLabel.trim() ? ` ("${joinEndLabel.trim()}")` : ""}`] : []),
      ];
      setJoinError(
        `${missing.join(" နှင့် ")} ကို ရှာ၍ မရပါ — နေရာအမည်ကို ရိုက်ပြီး အကြံပြုချက်ကို နှိပ်ပါ၊ သို့မဟုတ် မြေပုံပေါ်တွင် နှိပ်ပြီး ရွေးပါ။`,
      );
      return;
    }
    setJoinError("");
    setJoiningBusy(true);
    try {
      await apiFetch(`/api/ride-requests/${joining.id}/join`, {
        method: "POST",
        body: JSON.stringify({
          startLabel: joinStartLabel,
          startLat: js.lat,
          startLng: js.lng,
          endLabel: joinEndLabel,
          endLat: je.lat,
          endLng: je.lng,
        }),
      });
      setNotice("You joined the ride request — fares were recalculated for everyone sharing.");
      setJoining(null);
      await load();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join this request.");
    } finally {
      setJoiningBusy(false);
    }
  }

  async function leaveRequest(id: string) {
    setNotice("");
    setError("");
    try {
      await apiFetch(`/api/ride-requests/${id}/leave`, { method: "POST", body: JSON.stringify({}) });
      setNotice("You left the ride request.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave this request.");
    }
  }

  async function cancelRequest(id: string) {
    setNotice("");
    setError("");
    try {
      await apiFetch(`/api/ride-requests/${id}/cancel`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Ride request cancelled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this request. Requests cannot be cancelled less than 3 hours before departure.");
    }
  }

  const markers = [
    ...(start ? [{ lat: start.lat, lng: start.lng, label: `Start: ${startLabel}`, color: "green" as const }] : []),
    ...(end ? [{ lat: end.lat, lng: end.lng, label: `End: ${endLabel}`, color: "dark" as const }] : []),
  ];

  return (
    <div className="page-wrap">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Ride requests</h1>
          <p className="section-sub">Shared requests from passengers — join one, or create your own and split the fare.</p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} className="btn-outline">{refreshing ? "Refreshing…" : "↻ Refresh"}</button>
      </div>

      {notice ? <p className="mt-4 rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">{notice}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="mt-5 flex gap-2">
        {(["all", "create", "mine"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`btn ${tab === t ? "btn-primary" : "btn-outline"}`}
          >
            {t === "all" ? `All (${requests.length})` : t === "create" ? "Create" : `Mine (${mine.length})`}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <form onSubmit={createRequest} className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="card min-w-0 space-y-4">
            <LocationField id="reqStartLocation" label="Start location" value={startLabel} onChange={(v) => { setStartLabel(v); setStart(null); }} onSelect={(h: GeocodeHit) => { setStartLabel(h.label); setStart({ lat: h.lat, lng: h.lng }); }} />
            <LocationField id="reqEndLocation" label="Destination" value={endLabel} onChange={(v) => { setEndLabel(v); setEnd(null); }} onSelect={(h: GeocodeHit) => { setEndLabel(h.label); setEnd({ lat: h.lat, lng: h.lng }); }} />
            <div>
              <label htmlFor="reqDepartureTime" className="label">Departure time</label>
              <input id="reqDepartureTime" className="input" type="datetime-local" min={localInputValue(new Date())} value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} required />
            </div>
            <p className="rounded-[12px] bg-mint-soft px-3 py-2 text-sm dark:bg-forest-soft">
              Creating a request takes a prepayment from your wallet. Balance: {balance != null ? fmtMMK(balance) : "—"}
            </p>
            {createError ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{createError}</p> : null}
            <button type="submit" disabled={creating || checkingOffers} className="btn-primary w-full">{checkingOffers ? "ရှိပြီးသား ride ရှာနေသည်…" : creating ? "Creating…" : "Create ride request"}</button>
            {existingOffers.length > 0 ? (
              <div className="rounded-[12px] border-2 border-forest/20 p-3 dark:border-mint/25">
                <p className="text-sm font-medium">ဒီ ride ရှိနေပြီ — Book လုပ်မလား?</p>
                <p className="mt-1 text-xs text-forest/60 dark:text-mint/60">ဒီလမ်းကြောင်းနဲ့ အချိန်အတွက် ယာဉ်မောင်း ကမ်းလှမ်းထားတဲ့ ride ရှိပါတယ်။ Book လုပ်ရင် တောင်းဆိုမှု ဖန်တီးစရာ မလိုတော့ပါ။</p>
                <div className="mt-3 space-y-3">
                  {existingOffers.map((offer) => (
                    <div key={offer.id} className="rounded-[12px] bg-mint-soft p-3 dark:bg-forest-soft">
                      <p className="text-sm font-medium">{offer.startLabel ?? offer.start_label} → {offer.endLabel ?? offer.end_label}</p>
                      <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                        {fmtTime(offer.departureTime ?? offer.departure_time)} · {offer.driverName ?? offer.driver_name ?? "Driver"}{offer.carModel ?? offer.car_model ? ` · ${offer.carModel ?? offer.car_model}` : ""} · {fmtMMK(offer.totalPrice ?? offer.total_price ?? offer.discountedPrice ?? offer.discounted_price)}
                      </p>
                      <button type="button" className="btn-primary mt-2 w-full" onClick={() => setBookingOffer(offer)}>Book လုပ်မယ်</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-outline mt-3 w-full" disabled={creating} onClick={(e) => createRequest(e, true)}>
                  တောင်းဆိုမှုကိုပဲ ဆက်ဖန်တီးမယ်
                </button>
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            <RideMap center={start ?? YANGON} markers={markers} onPick={(lat, lng) => {
              if (!start) { setStart({ lat, lng }); setStartLabel("Picked on map"); }
              else if (!end) { setEnd({ lat, lng }); setEndLabel("Picked on map"); }
            }} height={360} />
            <div className="mt-4"><PricePreview start={start} end={end} label="Estimated price" /></div>
          </div>
        </form>
      ) : (
        <div className="mt-5">
          {loading ? (
            <p className="text-sm text-forest/60 dark:text-mint/60">Loading requests…</p>
          ) : shown.length === 0 ? (
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">{tab === "mine" ? "You have no ride requests yet." : "No open ride requests right now."}</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {shown.map((req) => {
                const isMine = (req.passengerId ?? req.passenger_id) === myId;
                const joined = (req.passengers ?? []).some((p) => (p.passengerId ?? p.passenger_id ?? p.id) === myId);
                return (
                  <article key={req.id} className="card">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-medium">{req.startLabel ?? req.start_label} → {req.endLabel ?? req.end_label}</p>
                      <span className="badge shrink-0">{req.status ?? "open"}</span>
                    </div>
                    <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
                      {fmtTime(req.departureTime ?? req.departure_time)} · {req.passengerName ?? req.passenger_name ?? "Passenger"} · {(req.passengers ?? []).length || req.passengerCount || 1} rider(s)
                    </p>
                    <p className="mt-2 text-sm">Estimated: <span className="font-medium">{fmtMMK(req.estimatedPrice ?? req.estimated_price)}</span>{req.prepaidAmount ?? req.prepaid_amount ? ` · Prepaid ${fmtMMK(req.prepaidAmount ?? req.prepaid_amount)}` : ""}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!isMine && !joined && req.status === "open" ? (
                        <button type="button" className="btn-primary" onClick={() => { setJoining(req); setJoinError(""); setJoinStart(null); setJoinEnd(null); setJoinStartLabel(""); setJoinEndLabel(""); }}>Join</button>
                      ) : null}
                      {joined && !isMine ? (
                        <button type="button" className="btn-outline" onClick={() => leaveRequest(req.id)}>Leave</button>
                      ) : null}
                      {isMine ? (
                        <button type="button" className="btn-outline" onClick={() => cancelRequest(req.id)}>Cancel request</button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {joining ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Join ride request">
          <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 sm:rounded-b-[20px]">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-medium">Join this request</h2>
              <button type="button" onClick={() => setJoining(null)} aria-label="Close" className="rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60">✕</button>
            </div>
            <p className="mt-2 text-sm">{joining.startLabel ?? joining.start_label} → {joining.endLabel ?? joining.end_label}</p>
            <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">Estimated total: {fmtMMK(joining.estimatedPrice ?? joining.estimated_price)} · {(joining.passengers ?? []).length + 1} riders after you join</p>
            <div className="mt-4 space-y-4">
              <LocationField id="joinStartLocation" label="Your pickup" value={joinStartLabel} onChange={(v) => { setJoinStartLabel(v); setJoinStart(null); }} onSelect={(h: GeocodeHit) => { setJoinStartLabel(h.label); setJoinStart({ lat: h.lat, lng: h.lng }); }} />
              <LocationField id="joinEndLocation" label="Your drop-off" value={joinEndLabel} onChange={(v) => { setJoinEndLabel(v); setJoinEnd(null); }} onSelect={(h: GeocodeHit) => { setJoinEndLabel(h.label); setJoinEnd({ lat: h.lat, lng: h.lng }); }} />
              <PricePreview start={joinStart} end={joinEnd} passengerCount={(joining.passengers ?? []).length + 1} label="Your share preview" />
              <p className="text-xs text-forest/60 dark:text-mint/60">
                Compatibility is checked on direction and pickup/drop-off distance (≤ 2 km / 2.5 km). Joining recalculates the fair split — existing riders get a refund when their share drops.
              </p>
              {joinError ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{joinError}</p> : null}
              <div className="flex gap-3">
                <button type="button" className="btn-outline flex-1" onClick={() => setJoining(null)}>Cancel</button>
                <button type="button" className="btn-primary flex-1" disabled={joiningBusy} onClick={joinRequest}>{joiningBusy ? "Joining…" : "Join request"}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {bookingOffer ? (
        <BookingModal
          ride={bookingOffer}
          balance={balance}
          pickup={start}
          dropoff={end}
          onClose={() => setBookingOffer(null)}
          onBooked={() => {
            setBookingOffer(null);
            setExistingOffers([]);
            router.push("/my-rides");
          }}
        />
      ) : null}
    </div>
  );
}
