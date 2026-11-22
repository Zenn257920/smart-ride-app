/**
 * A3 — pure guard helpers for the no-transaction race fixes.
 *
 * The Neon HTTP driver has no multi-statement transactions, so the
 * routes can't do check-then-write safely. Each helper below mirrors
 * exactly one atomic DB guard; the route performs the guarded SQL and
 * this module holds the decision logic so vitest can exercise it
 * without a database.
 *
 * - Seats: the guarded UPDATE is
 *     UPDATE rides SET seats_available = seats_available - 1
 *     WHERE id = $1 AND seats_available > 0
 *   and the affected-row count decides success. `guardedDecrement`
 *   is the same rule in pure form: it never returns a negative count.
 * - Duplicate booking: the route pre-checks for a confirmed booking
 *   by the same passenger; the partial unique index
 *   bookings_ride_passenger_confirmed_unique is the backstop that
 *   enforces it even when two requests race past the pre-check.
 * - Own ride: a driver booking their own ride is rejected outright.
 * - Withdraw: the balance check is racy by itself, so the route also
 *   re-reads the balance AFTER inserting the withdrawal and flips the
 *   row to 'failed' when the completed-ledger balance went negative
 *   (a concurrent withdrawal won the race). `withdrawWouldOverdraw`
 *   is the pure form of that post-write check.
 */

/** The guarded seat decrement: null when no seat is left to take. */
export function guardedDecrement(seatsAvailable: number): number | null {
  if (!Number.isFinite(seatsAvailable) || seatsAvailable <= 0) return null;
  return seatsAvailable - 1;
}

/**
 * Model of N racing decrement attempts against a shared seat counter,
 * where each attempt only succeeds when the guard (`seats > 0`) holds
 * at the moment it runs — i.e. what the atomic SQL UPDATE does. Used
 * by the tests to prove the guard (not real concurrency): a plain
 * check-then-write would let all attempts through, the guard lets
 * exactly `startSeats` through and the count never goes below zero.
 */
export function simulateGuardedDecrements(
  startSeats: number,
  attempts: number,
): { succeeded: number; finalSeats: number } {
  let seats = startSeats;
  let succeeded = 0;
  for (let i = 0; i < attempts; i++) {
    const next = guardedDecrement(seats);
    if (next === null) continue;
    seats = next;
    succeeded++;
  }
  return { succeeded, finalSeats: seats };
}

/** Minimal booking shape for the duplicate-booking check. */
export interface ExistingBooking {
  rideId: string;
  passengerId: string;
  status: string;
}

/** True when this passenger already holds a confirmed booking on the ride. */
export function isDuplicateConfirmedBooking(
  existing: ExistingBooking[],
  rideId: string,
  passengerId: string,
): boolean {
  return existing.some(
    (b) =>
      b.rideId === rideId &&
      b.passengerId === passengerId &&
      b.status === "confirmed",
  );
}

/** True when the user trying to book IS the driver of the ride. */
export function isOwnRide(driverId: string, userId: string): boolean {
  return driverId === userId;
}

/** True when a withdrawal of `amount` would drive `balance` negative. */
export function withdrawWouldOverdraw(
  balance: number,
  amount: number,
): boolean {
  return balance - amount < 0;
}

/** True for Postgres unique-violation errors (code 23505). */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const rec = err as Record<string, unknown>;
  // Neon HTTP driver surfaces the Postgres code on the error object.
  return rec.code === "23505" || /duplicate key/i.test(String(rec.message ?? ""));
}
