/**
 * Unified matching — the ONE place where a ride request and a driver
 * offer are compared as two sides of the same trip (A → B, time T,
 * seats N). Pure logic, no I/O, no DB imports, so it stays runnable in
 * vitest.
 *
 * Used by:
 * - GET /api/rides/search — a passenger's search also returns open
 *   ride requests on the same route (requestMatches).
 * - GET /api/ride-requests (scored variant) — a driver entering a
 *   route/time sees the open requests that fit it, best-first.
 * - GET /api/ride-requests?pending=1 + GET /api/driver/dashboard —
 *   pending requests are scored against the driver's own offered rides
 *   and sorted best-first.
 * - POST /api/rides — a newly published offer notifies the creators
 *   (+ joiners) of matching open requests.
 *
 * TIME WINDOW: the new request-matching paths use ±60 minutes
 * (REQUEST_MATCH_TIME_WINDOW_MINUTES), NOT the RouteMatcher's 120 —
 * a request is a passenger waiting for a specific departure, so the
 * match must be tighter than the general search window. The score
 * threshold is the same as search: score > 30
 * (REQUEST_MATCH_MIN_SCORE).
 *
 * CAPACITY: an accepted request becomes a ride with seats_total 4
 * (see POST /api/ride-requests/:id/accept), so a request can hold at
 * most 4 joined members (creator + up to 3 joiners) —
 * MAX_REQUEST_MEMBERS.
 */
import { RouteMatcher, routeMatcher } from "./matching";
import type { RideCoords } from "./matching";

/** ± minutes around the searched/offered departure a request may depart. */
export const REQUEST_MATCH_TIME_WINDOW_MINUTES = 60;
/** Same threshold as findOptimalMatches: score must be > 30. */
export const REQUEST_MATCH_MIN_SCORE = 30;
/** Max joined members on one request (accept creates a 4-seat ride). */
export const MAX_REQUEST_MEMBERS = 4;

/** True when the two departures are within the request-match window. */
export function isWithinRequestMatchWindow(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
): boolean {
  if (!a || !b) return true;
  const diffMin =
    Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
  return diffMin <= REQUEST_MATCH_TIME_WINDOW_MINUTES;
}

/**
 * Score one request against one trip (offered ride, or the searched
 * route). 0 when the departures are more than 60 minutes apart —
 * RouteMatcher.calculateMatchScore alone would still score up to its
 * own 120-minute window, so the 60-minute gate is applied here first.
 * Otherwise the RouteMatcher corridor/polyline score (0–100).
 */
export function scoreRequestAgainstTrip(
  matcher: RouteMatcher,
  request: RideCoords,
  trip: RideCoords,
): number {
  if (
    !isWithinRequestMatchWindow(request.departureTime, trip.departureTime)
  ) {
    return 0;
  }
  return matcher.calculateMatchScore(request, trip);
}

/** A request enriched with its best match score against a trip. */
export interface ScoredRequest<T> {
  request: T;
  matchScore: number;
  matchPercentage: number;
}

/**
 * Score requests against one trip, best-first, keeping only matches
 * above the threshold. The trip is the "driver" side and each request
 * the "passenger" side of RouteMatcher.calculateMatchScore.
 */
export function scoreRequestsAgainstTrip<T extends RideCoords>(
  requests: T[],
  trip: RideCoords,
  matcher: RouteMatcher = routeMatcher,
): ScoredRequest<T>[] {
  return requests
    .map((request) => {
      const matchScore = scoreRequestAgainstTrip(matcher, request, trip);
      return { request, matchScore, matchPercentage: matchScore };
    })
    .filter((s) => s.matchScore > REQUEST_MATCH_MIN_SCORE)
    .sort((a, b) => b.matchScore - a.matchScore);
}

/** One offered ride, reduced to what pending-request scoring needs. */
export interface OfferedRideForScoring extends RideCoords {
  id: string;
  startLabel: string;
  endLabel: string;
}

/** Best match of one request against a driver's offered rides. */
export interface PendingRequestMatch {
  /** Best score across the driver's rides, or null when nothing fits. */
  matchScore: number | null;
  /** The ride that produced the best score, or null. */
  matchedRide: { id: string; startLabel: string; endLabel: string } | null;
}

/**
 * Score each request against the driver's own offered rides and keep
 * the best ride per request. Rides that cannot take more riders
 * (status other than "open", or no seats left) are skipped by the
 * caller — this helper only scores the rides it is given.
 */
export function scorePendingRequests<T extends RideCoords>(
  requests: T[],
  driverRides: OfferedRideForScoring[],
  matcher: RouteMatcher = routeMatcher,
): Map<T, PendingRequestMatch> {
  const out = new Map<T, PendingRequestMatch>();
  for (const request of requests) {
    let best: PendingRequestMatch = { matchScore: null, matchedRide: null };
    for (const ride of driverRides) {
      const score = scoreRequestAgainstTrip(matcher, request, ride);
      if (score <= REQUEST_MATCH_MIN_SCORE) continue;
      if (best.matchScore == null || score > best.matchScore) {
        best = {
          matchScore: score,
          matchedRide: {
            id: ride.id,
            startLabel: ride.startLabel,
            endLabel: ride.endLabel,
          },
        };
      }
    }
    out.set(request, best);
  }
  return out;
}

/**
 * Sort pending requests best-match-first. Requests with a match come
 * before requests without one (best score first); requests with no
 * match keep their input (chronological) order. Drivers with no offers
 * therefore see the plain chronological list.
 */
export function sortPendingByMatch<T>(
  requests: T[],
  matches: Map<T, PendingRequestMatch>,
): T[] {
  return [...requests].sort((a, b) => {
    const sa = matches.get(a)?.matchScore;
    const sb = matches.get(b)?.matchScore;
    if (sa != null && sb != null) return sb - sa;
    if (sa != null) return -1;
    if (sb != null) return 1;
    return 0; // stable sort keeps chronological order for both-unmatched
  });
}

/** True when a request already has the maximum joined members. */
export function isRequestFull(joinedMemberCount: number): boolean {
  return joinedMemberCount >= MAX_REQUEST_MEMBERS;
}

// ---------------------------------------------------------------------------
// Lazy expiry (pure decision part; the DB work lives in
// src/lib/request-expiry.ts).
// ---------------------------------------------------------------------------

/**
 * Whether an open request is overdue for lazy expiry: its departure
 * has passed and no driver accepted it (status still 'open').
 * Expired / accepted / cancelled requests never expire again — the
 * guarded status update in request-expiry.ts is what makes the refund
 * exactly-once, and this predicate is its read-side mirror.
 */
export function shouldExpireRequest(
  status: string,
  departureTime: Date | string,
  now: Date = new Date(),
): boolean {
  if (status !== "open") return false;
  const departure =
    departureTime instanceof Date ? departureTime : new Date(departureTime);
  if (Number.isNaN(departure.getTime())) return false;
  return departure.getTime() <= now.getTime();
}
