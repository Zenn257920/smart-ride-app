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

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false, loading: () => <div className="flex h-80 items-center justify-center rounded-[20px] bg-mint-soft text-sm text-forest/60">မြေပုံကို ဖွင့်နေသည်…</div> });

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
  // D8c: max-price filter — client-side, applied to the search results
  // (the server already priced every match, so no new query is needed).
  const [maxPrice, setMaxPrice] = useState("");
  const maxPriceNum = maxPrice.trim() === "" ? null : Number(maxPrice);
  const visibleResults = maxPriceNum != null && Number.isFinite(maxPriceNum)
    ? results.filter((r) => {
        const total = r.totalPrice ?? r.total_price ?? r.discountedPrice ?? r.discounted_price ?? r.price;
        return total == null || total <= maxPriceNum;
      })
    : results;
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
    const label = picking === "start" ? "မြေပုံပေါ်တွင် ရွေးထားသည်" : "မြေပုံပေါ်တွင် ရွေးထားသည်";
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
      setError("ဤစက်တွင် တည်နေရာ ဝန်ဆောင်မှု မရပါ။");
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
          setStartLabel(hits[0]?.label ?? "ကျွန်တော့်တည်နေရာ");
        } catch {
          setStartLabel("ကျွန်တော့်တည်နေရာ");
        }
        setLocating(false);
      },
      () => {
        setError("သင့်တည်နေရာကို ရယူ၍ မရပါ။ တည်နေရာ ခွင့်ပြုချက် ပေးပါ သို့မဟုတ် မြေပုံပေါ်တွင် ရွေးပါ။");
        setLocating(false);
      },
    );
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setLoading(true);
    let s = start;
    let en = end;
    // If the user typed a place name but never tapped a suggestion, resolve
    // the text to coordinates instead of failing outright.
    if (!s && startLabel.trim()) {
      try {
        const hits = await geocode(startLabel.trim());
        if (hits[0]) {
          s = { lat: hits[0].lat, lng: hits[0].lng };
          setStart(s);
          setStartLabel(hits[0].label);
        }
      } catch {
        // No match — handled by the check below.
      }
    }
    if (!en && endLabel.trim()) {
      try {
        const hits = await geocode(endLabel.trim());
        if (hits[0]) {
          en = { lat: hits[0].lat, lng: hits[0].lng };
          setEnd(en);
          setEndLabel(hits[0].label);
        }
      } catch {
        // No match — handled by the check below.
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
      setLoading(false);
      return;
    }
    setSearched(true);
    try {
      const q = new URLSearchParams({
        startLat: String(s.lat),
        startLng: String(s.lng),
        endLat: String(en.lat),
        endLng: String(en.lng),
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
      setError(err instanceof Error ? err.message : "ရှာဖွေ၍ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။");
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
      <h1 className="page-title">ခရီးစဉ် ရှာပါ</h1>
      <p className="section-sub">နေရာဖြင့် ရှာပါ သို့မဟုတ် မြေပုံပေါ်တွင် နှိပ်ပါ — သင့်လမ်းကြောင်းတူ ယာဉ်မောင်းများကို ရှာပေးပါမည်။</p>

      <form onSubmit={search} className="card mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <LocationField
          id="startLocation"
          label="ထွက်မည့်နေရာ"
          value={startLabel}
          onChange={(v) => { setStartLabel(v); setStart(null); }}
          onSelect={(h: GeocodeHit) => { setStartLabel(h.label); setStart({ lat: h.lat, lng: h.lng }); }}
          onUseMyLocation={useMyLocation}
          locating={locating}
        />
        <LocationField
          id="endLocation"
          label="ဦးတည်ရာ"
          value={endLabel}
          onChange={(v) => { setEndLabel(v); setEnd(null); }}
          onSelect={(h: GeocodeHit) => { setEndLabel(h.label); setEnd({ lat: h.lat, lng: h.lng }); }}
        />
        <p className="text-xs leading-relaxed text-forest/60 dark:text-mint/60 md:col-span-2">
          နေရာအမည်ကို ရိုက်ပြီး အကြံပြုချက်ကို နှိပ်ပါ — သို့မဟုတ် မြေပုံပေါ်တွင် နှိပ်ပြီး ရွေးပါ။
        </p>
        <div>
          <label htmlFor="departureTime" className="label">ထွက်မည့်အချိန်</label>
          <input id="departureTime" className="input" type="datetime-local" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="maxPrice" className="label">အများဆုံး ဈေး (MMK) — မသတ်မှတ်လျှင် အားလုံးပြမည်</label>
          <input id="maxPrice" className="input" type="number" min={0} step={500} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="e.g. 10000" />
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
                မြေပုံပေါ်တွင် {k === "start" ? "ထွက်မည့်နေရာ" : "ဦးတည်ရာ"} ရွေးပါ
              </button>
            ))}
          </div>
          <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? "ရှာဖွေနေသည်…" : "ခရီးစဉ်ရှာပါ"}</button>
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
            {searched ? `ကိုက်ညီသော ခရီးစဉ် ${visibleResults.length} ခု${visibleResults.length !== results.length ? ` (${results.length} ခုထဲမှ ဈေးစစ်ပြီး)` : ""}` : "ကိုက်ညီသော ခရီးစဉ်များ ဤနေရာတွင် ပေါ်လာပါမည်"}
          </h2>
          {loading ? (
            <p className="text-sm text-forest/60 dark:text-mint/60">သင့်လမ်းကြောင်းပေါ်က ယာဉ်မောင်းများကို ရှာဖွေနေသည်…</p>
          ) : searched && results.length === 0 ? (
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">ဤလမ်းကြောင်းနှင့် အချိန်အတွက် ကိုက်ညီသော ခရီးစဉ် မရှိသေးပါ။ အချိန်ကို အနီးအနား ပြောင်းကြည့်ပါ၊ သို့မဟုတ် ခရီးစဉ် တောင်းဆိုမှုတစ်ခု ဖန်တီးပါ။</p></div>
          ) : searched && visibleResults.length === 0 ? (
            <div className="card"><p className="text-sm text-forest/70 dark:text-mint/70">သတ်မှတ်ထားသော ဈေးအတွင်း ကိုက်ညီသော ခရီးစဉ် မရှိပါ — အများဆုံး ဈေးကို မြှင့်ကြည့်ပါ။</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {visibleResults.map((r) => (
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
          pickup={start}
          dropoff={end}
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
