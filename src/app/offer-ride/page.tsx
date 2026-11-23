"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import AuthGuard from "@/components/AuthGuard";
import RoleGuard from "@/components/RoleGuard";
import LocationField from "@/components/LocationField";
import PricePreview from "@/components/PricePreview";
import RideCard from "@/components/RideCard";
import {
  apiFetch,
  asArray,
  fetchRoute,
  geocode,
  localInputValue,
  YANGON,
  type GeocodeHit,
  type LatLng,
  type RideLike,
} from "@/lib/api";
import { resolveTypedLocation } from "@/lib/geocode-fallback";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false, loading: () => <div className="flex h-80 items-center justify-center rounded-[20px] bg-mint-soft text-sm text-forest/60">မြေပုံကို ဖွင့်နေသည်…</div> });

export default function OfferRidePage() {
  return (
    <AuthGuard>
      <RoleGuard
        allow={["driver"]}
        redirectTo="/dashboard"
        message="ဤစာမျက်နှာသည် ယာဉ်မောင်း အကောင့်အတွက်သာ ဖြစ်သည်။ ခရီးသည် အကောင့်ဖြင့် ခရီးစဉ် ကမ်းလှမ်း၍ မရပါ — ဒက်ရှ်ဘုတ်သို့ ပို့ဆောင်နေပါသည်။"
      >
        <OfferRideInner />
      </RoleGuard>
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
      return;
    }
    let alive = true;
    fetchRoute(start, end).then((r) => {
      if (!alive) return;
      setRouteCoords(r?.coordinates);
    });
    return () => {
      alive = false;
    };
  }, [start, end]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
      setError(
        `${missing.join(" နှင့် ")} ကို ရှာ၍ မရပါ — နေရာအမည်ကို ရိုက်ပြီး အကြံပြုချက်ကို နှိပ်ပါ၊ သို့မဟုတ် မြေပုံပေါ်တွင် နှိပ်ပြီး ရွေးပါ။`,
      );
      return;
    }
    // A6: departure must be in the future (server enforces this too).
    if (Number.isNaN(new Date(departureTime).getTime()) || new Date(departureTime) <= new Date()) {
      setError("ထွက်မည့်အချိန်သည် အနာဂတ် အချိန် ဖြစ်ရပါမည်။");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/rides", {
        method: "POST",
        body: JSON.stringify({
          startLabel,
          startLat: s.lat,
          startLng: s.lng,
          endLabel,
          endLat: en.lat,
          endLng: en.lng,
          departureTime: new Date(departureTime).toISOString(),
          carModel,
          carPlate,
          seatsTotal: seats,
          routeCoordinates: routeCoords,
        }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ဤခရီးစဉ်ကို ကမ်းလှမ်း၍ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။");
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
      <h1 className="page-title">ခရီးစဉ် ကမ်းလှမ်းပါ</h1>
      <p className="section-sub">လွတ်နေသော ထိုင်ခုံများကို မျှဝေပြီး သင်သွားနေကျ လမ်းကြောင်းပေါ်မှာ ဝင်ငွေရယူပါ။</p>

      {driverChecked && !isDriver ? (
        <div className="card mt-5 border-2 border-forest/20 dark:border-mint/20">
          <h2 className="text-lg font-medium">ယာဉ်မောင်း စာရင်းသွင်းရန် လိုအပ်သည်</h2>
          <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">
            ခရီးစဉ် ကမ်းလှမ်းနိုင်ဖို့ ယာဉ်မောင်း အချက်အလက် (လိုင်စင်၊ မှတ်ပုံတင်နှင့် ကား) လိုအပ်သည်။
          </p>
          <Link href="/driver/register" className="btn-primary mt-4">ယာဉ်မောင်းအဖြစ် စာရင်းသွင်းပါ →</Link>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card min-w-0 space-y-4">
          <LocationField id="startLocation" label="ထွက်မည့်နေရာ" value={startLabel} onChange={(v) => { setStartLabel(v); setStart(null); }} onSelect={(h: GeocodeHit) => { setStartLabel(h.label); setStart({ lat: h.lat, lng: h.lng }); }} />
          <LocationField id="endLocation" label="ဦးတည်ရာ" value={endLabel} onChange={(v) => { setEndLabel(v); setEnd(null); }} onSelect={(h: GeocodeHit) => { setEndLabel(h.label); setEnd({ lat: h.lat, lng: h.lng }); }} />
          <div>
            <label htmlFor="departureTime" className="label">ထွက်မည့်အချိန်</label>
            <input id="departureTime" className="input" type="datetime-local" min={localInputValue(new Date())} value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="carModel" className="label">ကားအမျိုးအစား</label>
              <input id="carModel" className="input" value={carModel} onChange={(e) => setCarModel(e.target.value)} placeholder="ဥပမာ Toyota Corolla" required />
            </div>
            <div>
              <label htmlFor="carPlate" className="label">ကားနံပါတ်</label>
              <input id="carPlate" className="input" value={carPlate} onChange={(e) => setCarPlate(e.target.value)} placeholder="ဥပမာ YGN 1A-1234" required />
            </div>
          </div>
          <div>
            <label htmlFor="seats" className="label">လွတ်သော ထိုင်ခုံ (၁–၄)</label>
            <input id="seats" className="input" type="number" min={1} max={4} value={seats} onChange={(e) => setSeats(Math.max(1, Math.min(4, Number(e.target.value) || 1)))} required />
          </div>
          {error ? <p role="alert" className="rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          <button type="submit" disabled={loading || !isDriver} className="btn-primary w-full">
            {loading ? "ကမ်းလှမ်းနေသည်…" : "ဤခရီးစဉ်ကို ကမ်းလှမ်းမယ်"}
          </button>
          {!isDriver && driverChecked ? <p className="text-center text-xs text-forest/60 dark:text-mint/60">ကမ်းလှမ်းနိုင်ဖို့ ယာဉ်မောင်းအဖြစ် စာရင်းသွင်းပါ။</p> : null}
        </div>

        <div className="min-w-0">
          <RideMap
            center={start ?? YANGON}
            markers={markers}
            routeCoordinates={routeCoords}
            onPick={(lat, lng) => {
              if (!start) {
                setStart({ lat, lng });
                setStartLabel("မြေပုံပေါ်တွင် ရွေးထားသည်");
              } else if (!end) {
                setEnd({ lat, lng });
                setEndLabel("မြေပုံပေါ်တွင် ရွေးထားသည်");
              }
            }}
            height={360}
          />
          <p className="mt-2 text-xs text-forest/60 dark:text-mint/60">ထွက်မည့်နေရာ၊ ပြီးမှ ဦးတည်ရာကို မြေပုံပေါ်တွင် နှိပ်ပြီး ရွေးပါ။</p>
          <div className="mt-4">
            {/* B4: the preview prices from the straight-line distance the
                server uses — no OSRM road distance is passed in any more. */}
            <PricePreview start={start} end={end} passengerCount={seats} label="ဝင်ငွေ ခန့်မှန်းချက် — ကားအပြည့်" />
          </div>
        </div>
      </form>

      {success ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/60 p-4" role="dialog" aria-modal="true" aria-label="Ride offered">
          <div className="card w-full max-w-sm text-center">
            <p aria-hidden className="text-4xl">✅</p>
            <h2 className="mt-2 text-lg font-medium">ခရီးစဉ် ကမ်းလှမ်းပြီးပါပြီ!</h2>
            <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">သင့်လမ်းကြောင်းပေါ်က ခရီးသည်များ ဤခရီးစဉ်ကို ယခု မြင်ရပါမည်။</p>
            <button type="button" className="btn-primary mt-5 w-full" onClick={() => setSuccess(false)}>ပြီးပါပြီ</button>
          </div>
        </div>
      ) : null}

      <div className="mt-10">
        <h2 className="text-lg font-medium text-forest dark:text-mint">ကျွန်တော် ကမ်းလှမ်းထားသော ခရီးစဉ်များ</h2>
        {myRides.length === 0 ? (
          <p className="mt-2 text-sm text-forest/60 dark:text-mint/60">ခရီးစဉ် တစ်ခုမှ မကမ်းလှမ်းရသေးပါ။</p>
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
