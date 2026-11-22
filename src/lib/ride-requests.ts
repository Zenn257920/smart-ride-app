/**
 * Shared ride-request pricing: rebuild the fair segment-based price
 * breakdown for everyone on a request (creator + joined passengers),
 * mirroring the old app's `_recalculatePriceBreakdown`
 * (database.js 1581-1638).
 *
 * Returns the breakdowns in the same order as the `members` array passed
 * in, so callers can map breakdown[i] back to members[i].
 */
import { routeMatcher } from "@/lib/matching";
import type { PriceBreakdown } from "@/lib/matching";

export interface RequestMember {
  passengerId: string;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
}

export interface RequestRoute {
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  /** Optional override; otherwise the straight-line route distance. */
  distanceKm?: number | null;
  routeCoordinates?: Array<[number, number]> | null;
}

export function recalcRequestBreakdown(
  members: RequestMember[],
  req: RequestRoute,
): PriceBreakdown[] {
  if (members.length === 0) return [];
  const distances = members.map((p) =>
    p.startLat != null && p.endLat != null
      ? routeMatcher.calculateDistance(
          p.startLat,
          p.startLng as number,
          p.endLat,
          p.endLng as number,
        )
      : req.distanceKm || 10,
  );
  // ride_requests has no distance_km column — derive it from the coords.
  const routeKm =
    req.distanceKm ??
    (req.startLat != null && req.endLat != null
      ? routeMatcher.calculateDistance(
          req.startLat,
          req.startLng as number,
          req.endLat,
          req.endLng as number,
        )
      : 0);
  const totalRouteKm =
    routeKm || distances.reduce((a, b) => Math.max(a, b), 0);
  const segmentData = routeMatcher.buildSegmentData(
    members.map((p) => ({
      id: p.passengerId,
      startLat: p.startLat ?? req.startLat,
      startLng: p.startLng ?? req.startLng,
      endLat: p.endLat ?? req.endLat,
      endLng: p.endLng ?? req.endLng,
    })),
    {
      startLat: req.startLat,
      startLng: req.startLng,
      endLat: req.endLat,
      endLng: req.endLng,
      routeCoordinates: req.routeCoordinates ?? undefined,
    },
    totalRouteKm,
  );
  return segmentData
    ? routeMatcher.calculateFairPriceBreakdown(0, distances, { segmentData })
    : routeMatcher.calculateFairPriceBreakdown(0, distances);
}
