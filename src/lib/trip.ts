/**
 * D4 — live trip tracking: trip states + driver location (pure logic).
 *
 * A ride's `status` (open/full/completed/cancelled) says whether the
 * ride exists; `tripStatus` says where the driver is IN the trip:
 *
 *   scheduled -> started -> arrived
 *
 * - 'scheduled': the ride is booked but the driver has not left yet.
 * - 'started': the driver tapped "Start trip" — the trip is under way
 *   and the driver posts their location every ~10s.
 * - 'arrived': the driver tapped "Arrived" at the destination. The
 *   ride is still open/full until the driver marks it completed (D1);
 *   'arrived' is a trip state, not a settlement.
 *
 * Trip states live on the rides row (trip_status / driver_lat /
 * driver_lng / driver_location_at) — no separate locations table, so
 * the passenger live view is one row read and the driver's location
 * is always the latest one (no history is needed in v1). The
 * transitions are guarded the same way as the accept/cancel guards
 * (conditional UPDATE on the current trip_status, affected-row count
 * decides), so two concurrent "Start trip" taps can only start the
 * trip once and only one "started" notification goes out.
 *
 * This module has NO imports at runtime so it stays runnable in
 * vitest without a database.
 */

/** The trip states, in order. */
export const TRIP_STATUSES = ["scheduled", "started", "arrived"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
export type TripAction = "start" | "arrive";

/** How early (before departure) a driver may start the trip. */
export const TRIP_START_EARLY_MINUTES = 120;
/** A driver location older than this is shown as stale, not live. */
export const DRIVER_LOCATION_STALE_SECONDS = 30;

/**
 * Pure form of the guarded trip transition: the next trip status for
 * `action` when the current status allows it, otherwise null (the
 * caller lost the race, or the trip is already past that step).
 *   start:  scheduled -> started
 *   arrive: started   -> arrived
 */
export function tripTransition(
  currentStatus: string,
  action: TripAction,
): TripStatus | null {
  if (action === "start") {
    return currentStatus === "scheduled" ? "started" : null;
  }
  return currentStatus === "started" ? "arrived" : null;
}

/** Minimal ride shape needed to decide whether the trip may start. */
export interface StartableTrip {
  status: string;
  tripStatus: string;
  departureTime: Date | string;
}

/**
 * Gate for "Start trip": the ride must still be live (open/full), the
 * trip must still be scheduled, and the departure must be no more
 * than TRIP_START_EARLY_MINUTES away (a driver may leave a little
 * early for pickup, but may not start a trip days ahead). Starting
 * after the departure time is allowed — the driver may simply be late.
 */
export function canStartTrip(
  ride: StartableTrip,
  now: Date = new Date(),
): { ok: true } | { ok: false; error: string } {
  if (ride.status !== "open" && ride.status !== "full") {
    return {
      ok: false,
      error:
        ride.status === "completed"
          ? "Ride is already completed"
          : `Trip cannot start while the ride is ${ride.status}`,
    };
  }
  if (ride.tripStatus !== "scheduled") {
    return {
      ok: false,
      error:
        ride.tripStatus === "started"
          ? "Trip has already started"
          : `Trip is already ${ride.tripStatus}`,
    };
  }
  const departure =
    ride.departureTime instanceof Date
      ? ride.departureTime
      : new Date(ride.departureTime);
  if (Number.isNaN(departure.getTime())) {
    return { ok: false, error: "Ride has no valid departure time" };
  }
  const minutesUntil =
    (departure.getTime() - now.getTime()) / (1000 * 60);
  if (minutesUntil > TRIP_START_EARLY_MINUTES) {
    return {
      ok: false,
      error: `Trip can only start within ${TRIP_START_EARLY_MINUTES / 60} hours of departure`,
    };
  }
  return { ok: true };
}

/** Gate for "Arrived": only a started trip can arrive. */
export function canArriveTrip(tripStatus: string): {
  ok: true;
} | { ok: false; error: string } {
  if (tripStatus === "started") return { ok: true };
  return {
    ok: false,
    error:
      tripStatus === "arrived"
        ? "Trip has already arrived"
        : "Trip has not started yet",
  };
}

/** True while the driver is on the road — the passenger live view is active. */
export function isLiveTripStatus(tripStatus: string): boolean {
  return tripStatus === "started" || tripStatus === "arrived";
}

/**
 * True when a driver location timestamp is fresh enough to show as
 * live (within DRIVER_LOCATION_STALE_SECONDS of `now`). A null
 * timestamp is never fresh.
 */
export function isFreshDriverLocation(
  updatedAt: Date | string | null | undefined,
  now: Date = new Date(),
  maxAgeSeconds: number = DRIVER_LOCATION_STALE_SECONDS,
): boolean {
  if (!updatedAt) return false;
  const at =
    updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return false;
  return now.getTime() - at.getTime() <= maxAgeSeconds * 1000;
}

/**
 * Model of N racing trip transitions (e.g. two "Start trip" taps):
 * each attempt only succeeds when the guard still holds — exactly
 * one attempt wins, the rest lose and must notify nothing.
 */
export function simulateGuardedTripTransitions(
  startStatus: string,
  action: TripAction,
  attempts: number,
): { succeeded: number; finalStatus: string } {
  let status = startStatus;
  let succeeded = 0;
  for (let i = 0; i < attempts; i++) {
    const next = tripTransition(status, action);
    if (next === null) continue;
    status = next;
    succeeded++;
  }
  return { succeeded, finalStatus: status };
}
