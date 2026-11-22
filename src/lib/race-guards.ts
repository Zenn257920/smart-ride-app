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
  return guardedDecrementN(seatsAvailable, 1);
}

/**
 * B6 — the guarded seat decrement for N seats: null unless at least N
 * seats are left. This is the pure form of the book route's guarded
 * UPDATE:
 *   UPDATE rides SET seats_available = seats_available - N
 *   WHERE id = $1 AND seats_available >= N
 * The affected-row count decides success, so two simultaneous
 * multi-seat bookings cannot overbook — the count can never go below
 * zero. `guardedDecrement` above is the N = 1 case.
 */
export function guardedDecrementN(
  seatsAvailable: number,
  seats: number,
): number | null {
  if (
    !Number.isFinite(seatsAvailable) ||
    !Number.isInteger(seats) ||
    seats < 1
  ) {
    return null;
  }
  if (seatsAvailable < seats) return null;
  return seatsAvailable - seats;
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
  return simulateGuardedDecrementsN(startSeats, 1, attempts);
}

/**
 * B6 — model of N racing multi-seat decrement attempts against a
 * shared seat counter, each attempt taking `seatsPerAttempt` seats and
 * only succeeding when the guard (`seats >= seatsPerAttempt`) holds at
 * the moment it runs — i.e. what the atomic SQL UPDATE does. A plain
 * check-then-write would let all attempts through; the guard lets
 * through exactly floor(startSeats / seatsPerAttempt) of them and the
 * count never goes below zero.
 */
export function simulateGuardedDecrementsN(
  startSeats: number,
  seatsPerAttempt: number,
  attempts: number,
): { succeeded: number; finalSeats: number } {
  let seats = startSeats;
  let succeeded = 0;
  for (let i = 0; i < attempts; i++) {
    const next = guardedDecrementN(seats, seatsPerAttempt);
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

// ---------------------------------------------------------------------------
// Guarded accept (Batch 5a follow-up to A3) — guarded status transition.
//
// Same pattern Batch 4 used for booking cancel: the route performs
//   UPDATE ride_requests SET status = 'accepted'
//   WHERE id = $1 AND status = 'open'
// and the affected-row count decides. Two concurrent accepts both pass
// the pre-check (status reads 'open'), but only the first UPDATE
// matches a row — the loser gets 0 rows and a 409, and credits nothing,
// so the driver can never be double-credited for one request.
// ---------------------------------------------------------------------------

/**
 * Pure form of the guarded transition: the new status when the current
 * status is exactly `from`, otherwise null (the caller lost the race).
 */
export function guardedStatusTransition(
  currentStatus: string,
  from: string,
  to: string,
): string | null {
  return currentStatus === from ? to : null;
}

/**
 * Model of N racing guarded transitions (e.g. two accepts of the same
 * open request): each attempt only succeeds when the guard
 * (status == `from`) still holds at the moment it runs — i.e. what the
 * atomic conditional UPDATE does. Exactly one attempt wins; the rest
 * lose and must credit/create nothing.
 */
export function simulateGuardedTransitions(
  startStatus: string,
  from: string,
  to: string,
  attempts: number,
): { succeeded: number; finalStatus: string } {
  let status = startStatus;
  let succeeded = 0;
  for (let i = 0; i < attempts; i++) {
    const next = guardedStatusTransition(status, from, to);
    if (next === null) continue;
    status = next;
    succeeded++;
  }
  return { succeeded, finalStatus: status };
}

// ---------------------------------------------------------------------------
// Guarded driver ride-cancel (Batch 5c leftover from Batch 5a).
//
// Same pattern as the guarded accept above, but a ride can be cancelled
// from TWO live statuses — 'open' or 'full' — so the guard is a set,
// not one `from` value. The route performs
//   UPDATE rides SET status = 'cancelled'
//   WHERE id = $1 AND status IN ('open', 'full')
// and the affected-row count decides. Two concurrent driver cancels
// both pass the pre-check (status reads 'open'/'full'), but only the
// first UPDATE matches a row — the loser gets 0 rows and a 409, and
// refunds nothing, so passengers can never be refunded twice for one
// ride. The D6 cancellation-policy refund logic is unchanged; only the
// status transition is guarded.
// ---------------------------------------------------------------------------

/** Statuses a ride can be cancelled from (a live, not-yet-departed ride). */
export const CANCELLABLE_RIDE_STATUSES = ["open", "full"] as const;

/**
 * Pure form of the guarded ride-cancel transition: 'cancelled' when
 * the current status is 'open' or 'full', otherwise null (the caller
 * lost the race, or the ride was already cancelled/completed).
 */
export function guardedRideCancelStatus(
  currentStatus: string,
): "cancelled" | null {
  return (CANCELLABLE_RIDE_STATUSES as readonly string[]).includes(
    currentStatus,
  )
    ? "cancelled"
    : null;
}

/**
 * Model of N racing guarded ride cancels: exactly one attempt wins
 * from 'open'/'full'; from any other status none wins. The losers
 * must refund nothing.
 */
export function simulateGuardedRideCancels(
  startStatus: string,
  attempts: number,
): { succeeded: number; finalStatus: string } {
  let status = startStatus;
  let succeeded = 0;
  for (let i = 0; i < attempts; i++) {
    const next = guardedRideCancelStatus(status);
    if (next === null) continue;
    status = next;
    succeeded++;
  }
  return { succeeded, finalStatus: status };
}
