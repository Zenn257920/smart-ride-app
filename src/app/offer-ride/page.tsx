"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import AuthGuard from "@/components/AuthGuard";
import LocationField from "@/components/LocationField";
import PricePreview from "@/components/PricePreview";
import RideCard from "@/components/RideCard";
import {
  apiFetch,
  asArray,
  fetchRoute,
  localInputValue,
  YANGON,
  type GeocodeHit,
  type LatLng,
  type RideLike,
} from "@/lib/api";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false, loading: () => <div className="flex h-80 items-center justify-center rounded-[20px] bg-mint-soft text-sm text-forest/60">Loading map…</div> });

export default function OfferRidePage() {
  return (
    <AuthGuard>
      <OfferRideInner />
    </AuthGuard>
  );
}

function OfferRideInner() {
  const { data: session } = useSession();
  const [driverChecked, setDriverChecked] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [startLabel, setStartLabel] = useState("");
  const [endLabel, setEndLabel] = useState("");
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [departureTime, setDepartureTime] = useState(() => localInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [carModel, setCarModel] = useState("");
  const [carPlate, setCarPlate] = useState("");
  const [seats, setSeats] = useState(3);
  const [routeCoords, setRouteCoords] = useState<Array<[number, number]> | undefined>(undefined);
  const [routeKm, setRouteKm] = useState<number | null>(null);
  const [myRides, setMyRides] = useState<RideLike[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/driver/dashboard")
      .then((d) => {
        setIsDriver(true);
        const o = d as Record<string, unknown>;
        const driver = (o.driver ?? o) as Record<string, unknown>;
        if (typeof driver.car_model === "string") setCarModel(driver.car_model);
        if (typeof driver.carModel === "string") setCarModel(driver.carModel);
        if (typeof driver.car_plate === "string") setCarPlate(driver.car_plate);
        if (typeof driver.carPlate === "string") setCarPlate(driver.carPlate);
      })
      .catch(() => setIsDriver(false))
      .finally(() => setDriverChecked(true));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<unknown>("/api/rides?mine=1");
        let list = asArray<RideLike>(data);
        // If the ?mine=1 filter is not implemented server-side, filter client-side.
        const uid = session?.user?.id;
        if (uid && list.length > 0 && !list.every((r) => (r.driverId ?? r.driver_id) === uid)) {
          const mine = list.filter((r) => (r.driverId ?? r.driver_id) === uid || (r.driver as { id?: string } | undefined)?.id === uid);
          if (mine.length > 0) list = mine;
        }
        setMyRides(list);
      } catch {
        /* list is optional */
      }
    })();
  }, [session?.user?.id, success]);

  useEffect(() => {
    if (!start || !end) {
      setRouteCoords(undefined);
      setRouteKm(null);
      return;
    }
    let alive = true;
    fetchRoute(start, end).then((r) => {
      if (!alive) return;
      setRouteCoords(r?.coordinates);
      setRouteKm(r ? r.distanceKm : null);
    });
    return () => {
      alive = false;
    };
  }, [start, end]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!start || !end) {
      setError("Please pick both a start and a destination.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/rides", {
        method: "POST",
        body: JSON.stringify({
          startLabel,
          startLat: start.lat,
          startLng: start.lng,
          endLabel,
          endLat: end.lat,
          endLng: end.lng,
          departureTime: new Date(departureTime).toISOString(),
          carModel,
          carPlate,
          seatsTotal: seats,
          routeCoordinates: routeCoords,
        }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not offer this ride. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const markers = [
    ...(start ? [{ lat: start.lat, lng: start.lng, label: `Start: ${startLabel}`, color: "green" as const }] : []),
    ...(end ? [{ lat: end.lat, lng: end.lng, label: `End: ${endLabel}`, color: "dark" as const }] : []),
  ];

  return (
    <div className="page-wrap">
      <h1 className="page-title">Offer a ride</h1>
      <p className="section-sub">Share your empty seats and earn on routes you already drive.</p>

      {driverChecked && !isDriver ? (
        <div className="card mt-5 border-2 border-forest/20 dark:border-mint/20">
          <h2 className="text-lg font-medium">Driver registration needed</h2>
          <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
            You need driver details (licence, NRC and car) before you can offer rides.
          </p>
          <Link href="/driver/register" className="btn-primary mt-4">Register as a driver →</Link>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card min-w-0 space-y-4">
          <LocationField id="startLocation" label="Start location" value={startLabel} onChange={(v) => { setStartLabel(v); setStart(null); }} onSelect={(h: GeocodeHit) => { setStartLabel(h.label); setStart({ lat: h.lat, lng: h.lng }); }} />
          <LocationField id="endLocation" label="Destination" value={endLabel} onChange={(v) => { setEndLabel(v); setEnd(null); }} onSelect={(h: GeocodeHit) => { setEndLabel(h.label); setEnd({ lat: h.lat, lng: h.lng }); }} />
          <div>
            <label htmlFor="departureTime" className="label">Departure time</label>
            <input id="departureTime" className="input" type="datetime-local" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="carModel" className="label">Car model</label>
              <input id="carModel" className="input" value={carModel} onChange={(e) => setCarModel(e.target.value)} placeholder="e.g. Toyota Corolla" required />
            </div>
            <div>
              <label htmlFor="carPlate" className="label">Plate number</label>
              <input id="carPlate" className="input" value={carPlate} onChange={(e) => setCarPlate(e.target.value)} placeholder="e.g. YGN 1A-1234" required />
            </div>
          </div>
          <div>
            <label htmlFor="seats" className="label">Available seats (1–4)</label>
            <input id="seats" className="input" type="number" min={1} max={4} value={seats} onChange={(e) => setSeats(Math.max(1, Math.min(4, Number(e.target.value) || 1)))} required />
          </div>
          {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          <button type="submit" disabled={loading || !isDriver} className="btn-primary w-full">
            {loading ? "Offering…" : "Offer this ride"}
          </button>
          {!isDriver && driverChecked ? <p className="text-center text-xs text-forest/60 dark:text-mint/60">Register as a driver to enable offering.</p> : null}
        </div>

        <div className="min-w-0">
          <RideMap
            center={start ?? YANGON}
            markers={markers}
            routeCoordinates={routeCoords}
            onPick={(lat, lng) => {
              if (!start) {
                setStart({ lat, lng });
                setStartLabel("Picked on map");
              } else if (!end) {
                setEnd({ lat, lng });
                setEndLabel("Picked on map");
              }
            }}
            height={360}
          />
          <p className="mt-2 text-xs text-forest/60 dark:text-mint/60">Tap the map to pick your start, then your destination.</p>
          <div className="mt-4">
            <PricePreview start={start} end={end} passengerCount={seats} distanceKm={routeKm} label="Earnings preview — full car" />
            {routeKm != null ? <p className="mt-2 text-sm text-forest/70 dark:text-mint/70">Route distance: {routeKm.toFixed(1)} km</p> : null}
          </div>
        </div>
      </form>

      {success ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Ride offered">
          <div className="card w-full max-w-sm text-center">
            <p aria-hidden className="text-4xl">✅</p>
            <h2 className="mt-2 text-lg font-medium">Ride offered!</h2>
            <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">Passengers on your route will now see this ride.</p>
            <button type="button" className="btn-primary mt-5 w-full" onClick={() => setSuccess(false)}>Done</button>
          </div>
        </div>
      ) : null}

      <div className="mt-10">
        <h2 className="text-lg font-medium text-forest dark:text-mint">My offered rides</h2>
        {myRides.length === 0 ? (
          <p className="mt-2 text-sm text-forest/60 dark:text-mint/60">You have not offered any rides yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {myRides.map((r) => (
              <RideCard key={r.id} ride={r} showMatch={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
