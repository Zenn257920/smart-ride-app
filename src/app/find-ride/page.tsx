"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import RideCard from "@/components/RideCard";
import BookingModal from "@/components/BookingModal";
import LocationField from "@/components/LocationField";
import PricePreview from "@/components/PricePreview";
import {
  apiFetch,
  asArray,
  fetchRoute,
  geocode,
  localInputValue,
  rideEndLat,
  rideEndLng,
  rideRoute,
  rideStartLat,
  rideStartLng,
  YANGON,
  type GeocodeHit,
  type LatLng,
  type RideLike,
} from "@/lib/api";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false, loading: () => <div className="flex h-80 items-center justify-center rounded-[20px] bg-mint-soft text-sm text-forest/60">Loading map…</div> });

export default function FindRidePage() {
  return (
    <AuthGuard>
      <FindRideInner />
    </AuthGuard>
  );
}

function FindRideInner() {
  const router = useRouter();
  const [startLabel, setStartLabel] = useState("");
  const [endLabel, setEndLabel] = useState("");
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [departureTime, setDepartureTime] = useState(() => localInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [locating, setLocating] = useState(false);
  const [results, setResults] = useState<RideLike[]>([]);
  const [selected, setSelected] = useState<RideLike | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<Array<[number, number]> | undefined>(undefined);
  const [bookingRide, setBookingRide] = useState<RideLike | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ balance?: number }>("/api/wallet/balance")
      .then((b) => setBalance(typeof b.balance === "number" ? b.balance : (b as { data?: { balance?: number } }).data?.balance ?? null))
      .catch(() => undefined);
  }, []);

  const onPick = useCallback((lat: number, lng: number) => {
    const label = picking === "start" ? "Picked on map" : "Picked on map";
    if (picking === "start") {
      setStart({ lat, lng });
      setStartLabel(label);
    } else {
      setEnd({ lat, lng });
      setEndLabel(label);
    }
  }, [picking]);

  async function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available on this device.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setStart({ lat, lng });
        try {
          const hits = await geocode(`${lat},${lng}`);
          setStartLabel(hits[0]?.label ?? "My location");
        } catch {
          setStartLabel("My location");
        }
        setLocating(false);
      },
      () => {
        setError("Could not get your location. Please allow location access or pick on the map.");
        setLocating(false);
      },
    );
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    if (!start || !end) {
      setError("Please pick both a start and a destination (search or tap the map).");
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const q = new URLSearchParams({
        startLat: String(start.lat),
        startLng: String(start.lng),
        endLat: String(end.lat),
        endLng: String(end.lng),
        departureTime: new Date(departureTime).toISOString(),
      });
      const data = await apiFetch<unknown>(`/api/rides/search?${q.toString()}`);
      // Search returns { matches: [{ ride, driverName, carModel, carPlate,
      // seatsAvailable, departureTime, matchScore, fareShare,
      // appCommissionPerPassenger, discountedPrice, savings, ... }] } —
      // flatten each match onto its ride row for RideCard.
      const raw = asArray<Record<string, unknown>>(data);
      setResults(
        raw.map((m) => {
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
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function selectRide(ride: RideLike) {
    setSelected(ride);
    const existing = rideRoute(ride);
    if (existing && existing.length > 1) {
      setSelectedRoute(existing);
      return;
    }
    const sLat = rideStartLat(ride);
    const sLng = rideStartLng(ride);
    const eLat = rideEndLat(ride);
    const eLng = rideEndLng(ride);
    if (sLat != null && sLng != null && eLat != null && eLng != null) {
      const r = await fetchRoute({ lat: sLat, lng: sLng }, { lat: eLat, lng: eLng });
      setSelectedRoute(r?.coordinates ?? [[sLat, sLng], [eLat, eLng]]);
    } else {
      setSelectedRoute(undefined);
    }
  }

  const markers = [
    ...(start ? [{ lat: start.lat, lng: start.lng, label: `Start: ${startLabel}`, color: "green" as const }] : []),
    ...(end ? [{ lat: end.lat, lng: end.lng, label: `End: ${endLabel}`, color: "dark" as const }] : []),
    ...(selected && rideStartLat(selected) != null ? [{ lat: rideStartLat(selected)!, lng: rideStartLng(selected)!, label: "Ride start", color: "mint" as const }] : []),
  ];

  return (
    <div className="page-wrap">
      <h1 className="page-title">Find a ride</h1>
      <p className="section-sub">Search by place or tap the map — AI matches you with drivers going your way.</p>

      <form onSubmit={search} className="card mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <LocationField
          id="startLocation"
          label="Start location"
          value={startLabel}
          onChange={(v) => { setStartLabel(v); setStart(null); }}
          onSelect={(h: GeocodeHit) => { setStartLabel(h.label); setStart({ lat: h.lat, lng: h.lng }); }}
          onUseMyLocation={useMyLocation}
          locating={locating}
        />
        <LocationField
          id="endLocation"
          label="Destination"
          value={endLabel}
          onChange={(v) => { setEndLabel(v); setEnd(null); }}
          onSelect={(h: GeocodeHit) => { setEndLabel(h.label); setEnd({ lat: h.lat, lng: h.lng }); }}
        />
        <div>
          <label htmlFor="departureTime" className="label">Departure time</label>
          <input id="departureTime" className="input" type="datetime-local" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} required />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex rounded-[12px] border border-forest/20 p-1 dark:border-mint/25">
            {(["start", "end"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPicking(k)}
                aria-pressed={picking === k}
                className={`rounded-[8px] px-3 py-2 text-sm ${picking === k ? "bg-forest text-mint dark:bg-mint dark:text-forest" : "text-forest/70 dark:text-mint/70"}`}
              >
                Pick {k === "start" ? "start" : "end"} on map
              </button>
            ))}
          </div>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? "Searching…" : "Search rides"}</button>
        </div>
      </form>

      {error ? <p role="alert" className="mt-4 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <RideMap center={start ?? YANGON} markers={markers} routeCoordinates={selectedRoute} onPick={onPick} height={360} />
          <div className="mt-4">
            <PricePreview start={start} end={end} />
          </div>
        </div>
        <div className="min-w-0">
          <h2 className="mb-3 text-lg font-medium text-forest dark:text-mint">
            {searched ? `${results.length} matched ride${results.length === 1 ? "" : "s"}` : "Matched rides will appear here"}
          </h2>
          {loading ? (
            <p className="text-sm text-forest/60 dark:text-mint/60">Searching for drivers on your route…</p>
          ) : searched && results.length === 0 ? (
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">No matched rides yet for this route and time. Try a nearby time, or create a ride request instead.</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {results.map((r) => (
                <RideCard key={r.id} ride={r} selected={selected?.id === r.id} onSelect={selectRide} onBook={setBookingRide} />
              ))}
            </div>
          )}
        </div>
      </div>

      {bookingRide ? (
        <BookingModal
          ride={bookingRide}
          balance={balance}
          onClose={() => setBookingRide(null)}
          onBooked={() => {
            setBookingRide(null);
            router.push("/my-rides");
          }}
        />
      ) : null}
    </div>
  );
}
