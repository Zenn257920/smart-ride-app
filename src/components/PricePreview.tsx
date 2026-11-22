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
  /** Optional route distance in km (from OSRM); falls back to straight-line. */
  distanceKm?: number | null;
  label?: string;
}

/** Live fare preview using the shared routeMatcher pricing (1500 + 500/km, 5% fee). */
export default function PricePreview({ start, end, passengerCount = 1, distanceKm, label }: PricePreviewProps) {
  const preview = useMemo(() => {
    if (!start || !end) return null;
    const km =
      distanceKm ??
      routeMatcher.calculateDistance(start.lat, start.lng, end.lat, end.lng);
    const est = routeMatcher.estimatePrice(km, passengerCount > 1 ? passengerCount : undefined);
    const solo = routeMatcher.calculatePriceFromCoords(start.lat, start.lng, end.lat, end.lng);
    return { km, est, solo };
  }, [start, end, passengerCount, distanceKm]);

  if (!preview) {
    return (
      <div className="rounded-[12px] bg-mint-soft px-4 py-3 text-sm text-forest/70 dark:bg-forest-soft dark:text-mint/70">
        Pick a start and destination to see the price.
      </div>
    );
  }

  return (
    <div className="rounded-[12px] bg-mint-soft px-4 py-3 text-sm dark:bg-forest-soft">
      <p className="font-medium text-forest dark:text-mint">{label ?? "Price preview"}</p>
      <dl className="mt-2 space-y-1 text-forest/80 dark:text-mint/80">
        <div className="flex justify-between"><dt>Distance</dt><dd>{preview.km.toFixed(1)} km</dd></div>
        <div className="flex justify-between"><dt>Base fare</dt><dd>{fmtMMK(preview.est.basePrice)}</dd></div>
        {preview.est.savings > 0 ? (
          <div className="flex justify-between"><dt>Shared-ride savings</dt><dd>−{fmtMMK(preview.est.savings)}</dd></div>
        ) : null}
        <div className="flex justify-between"><dt>App fee (5%)</dt><dd>{fmtMMK(preview.est.appCommissionTotal)}</dd></div>
        <div className="flex justify-between border-t border-forest/10 pt-1.5 font-medium text-forest dark:border-mint/10 dark:text-mint">
          <dt>{passengerCount > 1 ? `Per person (${passengerCount} sharing)` : "Total"}</dt>
          <dd>{fmtMMK(preview.est.discountedPrice)}</dd>
        </div>
      </dl>
    </div>
  );
}
