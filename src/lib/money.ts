/**
 * Pure money helpers for the ride ledger (A1 + A2 fixes).
 *
 * This module has NO imports at runtime (only a type import from
 * ./wallet) so it stays runnable in vitest without a database.
 * The routes in src/app/api are thin wrappers around these helpers —
 * the amounts below are the single source of truth for every ledger
 * move a booking / accept / cancel makes.
 *
 * Ledger invariants (balance = SUM(wallet_transactions.amount)):
 * - A passenger's totalPrice = fareShare + appFee (5%). The driver is
 *   credited ONLY the fareShare ('ride_earning'); the 5% app fee is
 *   never credited to anyone — it is recorded per booking in
 *   bookings.app_fee and is the app's implicit take. There is no
 *   app/system user row, and wallet_transactions.user_id FKs to
 *   user.id, so no ledger row can own the fee. The fee is therefore
 *   tracked implicitly, never as a driver debit.
 * - Every driver debit on a refund / cancel MUST be the fare portion
 *   only (see splitRefund). Debiting the full totalPrice short-changes
 *   the driver by the fee portion (A2: 173 MMK on the worked example).
 * - bookings.driverPayment MUST always equal the fareShare the driver
 *   was actually credited. The book route's fair-split refund updates
 *   it (see repricedBookingAmounts); the cancel routes debit exactly
 *   driverPayment, so a stale value would over-debit the driver.
 * - At ride-request accept the driver is credited fareShare per member
 *   (A1). Members already paid totalPrice as 'prepayment' when
 *   creating/joining, so accept moves no passenger money — it only
 *   releases the fare part to the driver. Cancel then reverses exactly
 *   what accept credited, so accept-then-cancel leaves the driver at 0.
 */

import type { WalletTxType } from "./wallet";

/** One ledger row's amount, before the route adds its description. */
export interface LedgerDelta {
  userId: string;
  type: WalletTxType;
  /** Signed amount: negative = money out, positive = money in. */
  amount: number;
}

/** Split of a refund into the part the driver bears vs the app's fee. */
export interface RefundSplit {
  /** What the passenger gets back: old totalPrice - new totalPrice. */
  refundTotal: number;
  /** Fare reduction — the ONLY part ever debited from the driver. */
  farePortion: number;
  /** App-fee reduction — absorbed by the app's implicit take, never by
   * the driver. refundTotal = farePortion + feePortion, always. */
  feePortion: number;
}

/**
 * Split a repricing refund (fare + fee) into its fare and fee parts.
 *
 * Worked example from the review (13.8 km, base 8,400, two full-route
 * riders): first rider was 8,400 fare + 420 fee = 8,820; fair split is
 * 4,950 fare + 247 fee = 5,197. Refund 3,623 = 3,450 fare + 173 fee.
 * The old code debited the driver the whole 3,623, leaving the driver
 * 173 MMK short; the correct driver debit is 3,450.
 */
export function splitRefund(
  oldFareShare: number,
  oldAppFee: number,
  newFareShare: number,
  newAppFee: number,
): RefundSplit {
  const refundTotal =
    oldFareShare + oldAppFee - (newFareShare + newAppFee);
  if (refundTotal <= 0) {
    return { refundTotal: 0, farePortion: 0, feePortion: 0 };
  }
  // The fee is floor(fare * 5%), so it can only fall when the fare falls;
  // the fare portion is the fare drop, the rest of the refund is the fee.
  const farePortion = Math.max(0, oldFareShare - newFareShare);
  const feePortion = refundTotal - farePortion;
  return { refundTotal, farePortion, feePortion };
}

/**
 * Driver credit at ride-request accept (A1): +fareShare per member
 * ('ride_earning'). Passengers already prepaid, so there is no
 * passenger move here — accept only releases the fare part to the
 * driver. Zero/negative shares are skipped.
 */
export function acceptDriverDeltas(
  driverId: string,
  fareShares: number[],
): LedgerDelta[] {
  return fareShares
    .filter((s) => s > 0)
    .map((amount) => ({ userId: driverId, type: "ride_earning" as const, amount }));
}

/**
 * Ledger deltas for cancelling one confirmed booking: the passenger is
 * refunded the full totalPrice, the driver is debited exactly
 * driverPayment — which, by the driverPayment invariant above, is the
 * fareShare the driver was credited at book/accept time. Cash bookings
 * move no wallet money, so they produce no deltas.
 */
export function cancelBookingDeltas(
  booking: {
    passengerId: string;
    totalPrice: number;
    driverPayment: number;
    paymentMethod: string;
  },
  driverId: string,
): LedgerDelta[] {
  if (booking.paymentMethod === "cash") return [];
  return [
    { userId: booking.passengerId, type: "refund" as const, amount: booking.totalPrice },
    { userId: driverId, type: "adjustment" as const, amount: -booking.driverPayment },
  ];
}

/**
 * Ledger deltas for a fair-split refund to an earlier rider (a new
 * rider joined and the earlier rider's share dropped): the passenger
 * gets the full refundTotal back, the driver is debited ONLY the fare
 * portion — never the fee portion. Cash riders produce no deltas
 * (their booking amounts are still repriced by the caller).
 */
export function fairSplitRefundDeltas(
  passengerId: string,
  driverId: string,
  split: RefundSplit,
  isCash: boolean,
): LedgerDelta[] {
  if (isCash || split.refundTotal <= 0) return [];
  return [
    { userId: passengerId, type: "refund" as const, amount: split.refundTotal },
    { userId: driverId, type: "adjustment" as const, amount: -split.farePortion },
  ];
}

/**
 * Booking amounts after a fair-split reprice. driverPayment is set to
 * the new fareShare — never left at the old value — so a later cancel
 * debits exactly what the driver still holds for this booking.
 */
export function repricedBookingAmounts(breakdown: {
  fareShare: number;
  appCommissionPerPassenger: number;
  passengerPrice: number;
}): {
  fareShare: number;
  appFee: number;
  totalPrice: number;
  driverPayment: number;
} {
  return {
    fareShare: breakdown.fareShare,
    appFee: breakdown.appCommissionPerPassenger,
    totalPrice: breakdown.passengerPrice,
    driverPayment: breakdown.fareShare,
  };
}

// ---------------------------------------------------------------------------
// D1 — complete-ride settlement (2026-11-22).
//
// MONEY STATE MACHINE, as actually implemented (reconciled with Batch 1):
//
//   Direct booking (POST /api/rides/:id/book):
//     - e-wallet: at BOOK time the passenger pays totalPrice
//       (fareShare + 5% appFee) as 'ride_payment', and the driver is
//       credited fareShare as 'ride_earning' AT THE SAME TIME.
//       bookings.driverPayment = fareShare records what the driver holds.
//     - cash: NO ledger move at book time — the driver collects cash in
//       person. driverPayment is still recorded, but nothing was credited.
//     - 2nd+ rider: earlier e-wallet riders are refunded the fair-split
//       difference and the driver is debited the fare portion only
//       (splitRefund); driverPayment is repriced to the new fareShare.
//   Ride-request flow (create/join -> accept):
//     - create/join: the passenger prepays totalPrice as 'prepayment'.
//       No driver credit yet — the money is held, not paid out.
//     - accept (A1): the driver is credited fareShare per member
//       ('ride_earning'); bookings are created with
//       driverPayment = fareShare. No passenger money moves at accept.
//   Cancel (passenger booking cancel, or driver ride cancel):
//     - e-wallet: passenger refunded the full totalPrice ('refund'),
//       driver debited exactly driverPayment ('adjustment') — the fare
//       part only, never the app-fee part. Cash: no ledger moves.
//     - Accept-then-cancel therefore nets the driver to exactly 0.
//   Completion (this section):
//     - The driver was ALREADY credited at book/accept time for every
//       e-wallet booking, so completion credits NOTHING — a second
//       credit here would double-pay the driver. Completion is a status
//       transition only: ride open/full -> completed, each confirmed
//       booking -> completed. The 5% app fee stays where it always was:
//       recorded per booking in bookings.app_fee, never a ledger row.
//     - Cash bookings: still no ledger move at completion — the cash
//       was collected (or not) in person, outside the ledger.
//     - No-show: a passenger who did not show is NOT refunded — the
//       driver keeps the fareShare already credited, because the seat
//       was held and the driver turned up. This differs deliberately
//       from cancel (full refund), which is only possible BEFORE
//       departure; once the ride has gone, a no-show forfeits the fare.
//       The booking is marked 'no_show' (not 'completed') so it stays
//       visible and is never rateable/cancellable afterwards.
// ---------------------------------------------------------------------------

/** Minimal ride shape needed to decide whether completion is allowed. */
export interface CompletableRide {
  status: string;
  departureTime: Date | string;
}

/**
 * Gate for POST /api/rides/:id/complete: only rides still open/full,
 * and only once the departure time has passed. Completing early would
 * let a driver settle (and lock in no-shows) before the ride exists;
 * completing a cancelled/completed ride would be a double-settle.
 */
export function canCompleteRide(
  ride: CompletableRide,
  now: Date = new Date(),
): { ok: true } | { ok: false; error: string } {
  if (ride.status !== "open" && ride.status !== "full") {
    return {
      ok: false,
      error:
        ride.status === "completed"
          ? "Ride is already completed"
          : `Ride cannot be completed while it is ${ride.status}`,
    };
  }
  const departure =
    ride.departureTime instanceof Date
      ? ride.departureTime
      : new Date(ride.departureTime);
  if (Number.isNaN(departure.getTime())) {
    return { ok: false, error: "Ride has no valid departure time" };
  }
  if (departure.getTime() > now.getTime()) {
    return { ok: false, error: "Ride has not departed yet" };
  }
  return { ok: true };
}

/** Minimal booking shape needed for settlement. */
export interface CompletionBooking {
  id: string;
  paymentMethod: string;
  driverPayment: number;
  status: string;
}

export interface RideCompletion {
  /** Confirmed bookings that rode: -> status 'completed'. */
  completedIds: string[];
  /** Confirmed bookings marked no-show: -> status 'no_show'. */
  noShowIds: string[];
  /**
   * Ledger moves for completion. ALWAYS empty: the driver was already
   * credited fareShare at book/accept time (e-wallet) and cash never
   * touches the ledger, so there is nothing left to credit — and a
   * no-show forfeits the fare, so there is nothing to refund either.
   * The empty array is the double-credit guard: any future change
   * that puts a credit here must prove the driver was NOT already
   * credited for that booking first.
   */
  deltas: LedgerDelta[];
}

/**
 * Settle a completed ride: split confirmed bookings into rode vs
 * no-show. Only 'confirmed' bookings settle — already-cancelled ones
 * were refunded at cancel time and are skipped. Unknown no-show ids
 * (not a confirmed booking of this ride) are ignored.
 */
export function settleRideCompletion(
  bookings: CompletionBooking[],
  noShowIds: string[],
): RideCompletion {
  const noShow = new Set(noShowIds);
  const completedIds: string[] = [];
  const settledNoShowIds: string[] = [];
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    if (noShow.has(b.id)) settledNoShowIds.push(b.id);
    else completedIds.push(b.id);
  }
  return { completedIds, noShowIds: settledNoShowIds, deltas: [] };
}
