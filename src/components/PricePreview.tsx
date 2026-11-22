"use client";

import { useMemo } from "react";
import { routeMatcher } from "@/lib/matching";
import { fmtMMK } from "@/lib/api";
import type { LatLng } from "@/lib/api";

interface PricePreviewProps {
  start?: LatLng | null;
  end?: LatLng | null;
  /** Extra riders sharing (1 = solo). */
  passengerCount?: number;
  label?: string;
}

/**
 * Live fare preview using the shared routeMatcher pricing (1500 + 500/km, 5% fee).
 *
 * B4: the preview prices from the STRAIGHT-LINE (haversine) distance —
 * the same distance the server uses (POST /api/rides prices via
 * calculatePriceFromCoords, which is haversine). It used to take an
 * OSRM road distance, which runs 20–40% longer in Yangon, so the
 * preview overstated what the driver would actually earn. There is no
 * distanceKm prop any more: no caller may pass a road distance in.
 */
export default function PricePreview({ start, end, passengerCount = 1, label }: PricePreviewProps) {
  const preview = useMemo(() => {
    if (!start || !end) return null;
    const km = routeMatcher.calculateDistance(start.lat, start.lng, end.lat, end.lng);
    const est = routeMatcher.estimatePrice(km, passengerCount > 1 ? passengerCount : undefined);
    const solo = routeMatcher.calculatePriceFromCoords(start.lat, start.lng, end.lat, end.lng);
    return { km, est, solo };
  }, [start, end, passengerCount]);

  if (!preview) {
    return (
      <div className="rounded-[12px] bg-mint-soft px-4 py-3 text-sm text-forest/70 dark:bg-forest-soft dark:text-mint/70">
        ဈေးနှုန်းကို ကြည့်ရန် ထွက်မည့်နေရာနှင့် ဦးတည်ရာကို ရွေးပါ။
      </div>
    );
  }

  return (
    <div className="rounded-[12px] bg-mint-soft px-4 py-3 text-sm dark:bg-forest-soft">
      <p className="font-medium text-forest dark:text-mint">{label ?? "ဈေးနှုန်း ခန့်မှန်းချက်"}</p>
      <dl className="mt-2 space-y-1 text-forest/80 dark:text-mint/80">
        <div className="flex justify-between"><dt>အကွာအဝေး</dt><dd>{preview.km.toFixed(1)} km</dd></div>
        <div className="flex justify-between"><dt>အခြေခံခရီးစဉ်ခ</dt><dd>{fmtMMK(preview.est.basePrice)}</dd></div>
        {preview.est.savings > 0 ? (
          <div className="flex justify-between"><dt>မျှဝေစီးလို့ သက်သာသောငွေ</dt><dd>−{fmtMMK(preview.est.savings)}</dd></div>
        ) : null}
        <div className="flex justify-between"><dt>အက်ပ်အခွန် (5%)</dt><dd>{fmtMMK(preview.est.appCommissionTotal)}</dd></div>
        <div className="flex justify-between border-t border-forest/10 pt-1.5 font-medium text-forest dark:border-mint/10 dark:text-mint">
          <dt>{passengerCount > 1 ? `တစ်ဦးလျှင် (${passengerCount} ဦး မျှဝေစီးလျှင်)` : "စုစုပေါင်း"}</dt>
          <dd>{fmtMMK(preview.est.discountedPrice)}</dd>
        </div>
      </dl>
    </div>
  );
}
