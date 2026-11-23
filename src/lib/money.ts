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
// B6 — multi-seat booking (2026-11-22).
//
// A booking is priced PER SEAT: the segment price search shows is the
// price of ONE seat, and booking N seats charges N x that per-seat
// price (fare, fee and total all scale — the fee stays 5% of the fare,
// so totalPrice == fareShare + appFee still holds). The driver is
// credited the scaled fareShare, so driverPayment == fareShare still
// holds and a later cancel debits exactly what the driver holds.
// The same scaling reprices an earlier multi-seat booking when a new
// rider joins: its new amounts are its seat count x the new per-seat
// breakdown, so a 2-seat booking is never repriced down to a 1-seat
// price by the fair-split refund step.
// ---------------------------------------------------------------------------

/** Per-seat booking amounts (the segment price search shows). */
export interface PerSeatAmounts {
  fareShare: number;
  appFee: number;
  totalPrice: number;
  driverPayment: number;
}

/**
 * Scale per-seat amounts to a booking of `seats` seats. Every amount
 * scales linearly, so the ledger invariants (total = fare + fee,
 * driverPayment = fare) hold for any seat count.
 */
export function multiSeatAmounts(
  perSeat: PerSeatAmounts,
  seats: number,
): PerSeatAmounts {
  return {
    fareShare: perSeat.fareShare * seats,
    appFee: perSeat.appFee * seats,
    totalPrice: perSeat.totalPrice * seats,
    driverPayment: perSeat.driverPayment * seats,
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

// ---------------------------------------------------------------------------
// A4 + D6 — cancellation policy (2026-11-22).
//
// ONE RULE for cancelling a confirmed booking / an offered ride, reusing
// the 3-hour pattern the ride-request cancel already had:
//
//   * More than 3 hours before departure: FREE cancellation — the
//     passenger is refunded the full totalPrice (fare + app fee) and
//     the driver is debited exactly driverPayment (the fareShare the
//     driver was credited). The app keeps nothing; driver keeps nothing.
//   * Inside 3 hours before departure: cancellation is STILL ALLOWED,
//     but only a PARTIAL refund — the passenger gets back HALF the
//     fareShare plus the FULL app fee (the app waives its fee on every
//     cancel, free or late), and the driver is debited exactly the
//     refunded fare half. The driver KEEPS the other half of the fare
//     as late-cancel compensation for the held seat.
//       refund = floor(fareShare / 2) + appFee
//       driver debit = floor(fareShare / 2)   (driver keeps fare - that)
//     Worked example (fare 4,950 + fee 247 = 5,197): the passenger gets
//     2,475 + 247 = 2,722 back, the driver is debited 2,475 and keeps
//     2,475. Passenger net loss = driver net gain = 2,475 — the ledger
//     stays consistent, and the fee is never a driver debit (A2 rule).
//   * After departure: NO cancellation at all. The ride should be
//     completed (D1), not cancelled — a departed ride's bookings are
//     settled as rode / no-show, and a no-show fare is forfeited.
//   * DRIVER cancelling inside 3 hours: the passenger gets the SAME
//     partial refund as above, but the driver is debited the FULL
//     driverPayment — the driver is the canceller, so they keep none
//     of the fare. The retained fare half is forfeited (it joins the
//     app's implicit take, like the fee — no ledger row owns it).
//   * Cash bookings: no ledger moves under any policy — no money ever
//     moved through the wallet, so there is nothing to refund or debit.
//     The policy (free / partial / not allowed) still applies to the
//     status change itself.
//   * Ride-request cancel is NOT changed by this: it already refuses
//     any cancel inside 3 hours (full refund before that), which is
//     stricter than the booking rule and stays as-is.
// ---------------------------------------------------------------------------

/** Free-cancellation deadline: hours before departure. */
export const FREE_CANCELLATION_HOURS = 3;
/** Late-cancel refund: fraction of the fareShare returned to the passenger. */
export const LATE_CANCEL_FARE_REFUND_RATE = 0.5;

/** Outcome of the cancellation-policy gate for one departure time. */
export type CancelPolicy =
  | { allowed: true; kind: "free" }
  | { allowed: true; kind: "partial" }
  | { allowed: false; error: string };

/**
 * Which cancellation rule applies at `now` for a ride departing at
 * `departureTime`. After departure nothing may be cancelled — the ride
 * must be completed instead (A4).
 */
export function cancelPolicy(
  departureTime: Date | string,
  now: Date = new Date(),
): CancelPolicy {
  const departure =
    departureTime instanceof Date ? departureTime : new Date(departureTime);
  if (Number.isNaN(departure.getTime())) {
    return { allowed: false, error: "Ride has no valid departure time" };
  }
  if (departure.getTime() <= now.getTime()) {
    return {
      allowed: false,
      error:
        "This ride has already departed and cannot be cancelled — it should be completed instead",
    };
  }
  const hoursUntil = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntil > FREE_CANCELLATION_HOURS) return { allowed: true, kind: "free" };
  return { allowed: true, kind: "partial" };
}

/** The partial (inside-3-hours) refund split for one booking. */
export interface PartialRefund {
  /** What the passenger gets back: refunded fare half + full app fee. */
  refundTotal: number;
  /** Fare half returned to the passenger — also the passenger-canceller
   * driver debit. floor() so refunded + retained always equals the fare. */
  refundedFare: number;
  /** Fare half the driver keeps on a passenger late-cancel. */
  retainedFare: number;
  /** The app fee, refunded in full on every cancel (never a driver debit). */
  feePortion: number;
}

export function partialCancelRefund(
  fareShare: number,
  appFee: number,
): PartialRefund {
  const refundedFare = Math.floor(fareShare * LATE_CANCEL_FARE_REFUND_RATE);
  const retainedFare = fareShare - refundedFare;
  return {
    refundTotal: refundedFare + appFee,
    refundedFare,
    retainedFare,
    feePortion: appFee,
  };
}

/**
 * Ledger deltas for cancelling one confirmed booking under a policy.
 *
 * - kind "free": identical to cancelBookingDeltas — passenger +totalPrice,
 *   driver -driverPayment.
 * - kind "partial", canceller "passenger": passenger gets the partial
 *   refund (half fare + full fee), driver is debited only the refunded
 *   fare half and keeps the rest.
 * - kind "partial", canceller "driver": passenger gets the SAME partial
 *   refund, but the driver is debited the FULL driverPayment — the
 *   cancelling driver keeps nothing.
 * - cash bookings: no deltas under any policy.
 *
 * The caller is responsible for the departure gate (cancelPolicy) and
 * for reporting the passenger refund (see passengerRefundForPolicy).
 */
export function cancelBookingDeltasForPolicy(
  booking: {
    passengerId: string;
    fareShare: number;
    appFee: number;
    totalPrice: number;
    driverPayment: number;
    paymentMethod: string;
  },
  driverId: string,
  policy: { kind: "free" | "partial" },
  canceller: "passenger" | "driver",
): LedgerDelta[] {
  if (booking.paymentMethod === "cash") return [];
  if (policy.kind === "free") {
    return [
      { userId: booking.passengerId, type: "refund" as const, amount: booking.totalPrice },
      { userId: driverId, type: "adjustment" as const, amount: -booking.driverPayment },
    ];
  }
  const partial = partialCancelRefund(booking.fareShare, booking.appFee);
  const driverDebit =
    canceller === "driver" ? booking.driverPayment : partial.refundedFare;
  return [
    { userId: booking.passengerId, type: "refund" as const, amount: partial.refundTotal },
    { userId: driverId, type: "adjustment" as const, amount: -driverDebit },
  ];
}

/** The amount the passenger is refunded for a cancel under a policy (0 for cash). */
export function passengerRefundForPolicy(
  booking: {
    fareShare: number;
    appFee: number;
    totalPrice: number;
    paymentMethod: string;
  },
  policy: { kind: "free" | "partial" },
): number {
  if (booking.paymentMethod === "cash") return 0;
  if (policy.kind === "free") return booking.totalPrice;
  return partialCancelRefund(booking.fareShare, booking.appFee).refundTotal;
}

// ---------------------------------------------------------------------------
// Cash fares — app-fee treatment in v1 (Feature B, 2026-11-23).
//
// EXPLICIT RULE: cash fares move NO wallet money at all — not the fare,
// not the 5% app fee, not a refund, not a driver debit, at book, reprice,
// cancel or completion time. The fee on a cash fare is WAIVED and NOT
// TRACKED: bookings.app_fee still records the 5% figure for display
// (so totalPrice == fareShare + appFee still holds and the passenger
// sees the same price as an e-wallet rider), but no ledger row ever
// owns it, nobody is credited or debited it, and the driver simply
// collects the full totalPrice in cash in person — including the fee
// portion, which the app does not collect in v1. If a future version
// wants the app to take its cut on cash fares, that needs a settlement
// step (driver remits the fee) — it cannot be bolted onto the ledger
// helpers below, because the driver was never credited for a cash
// booking in the first place.
// ---------------------------------------------------------------------------

/** Minimal booking shape needed to work out cash the driver collects. */
export interface CashToCollectBooking {
  rideId: string;
  paymentMethod: string;
  status: string;
  totalPrice: number;
}

/**
 * Cash to collect for one ride's bookings: the sum of totalPrice over
 * CASH bookings that are confirmed or completed. Cancelled and
 * no-show bookings are excluded (nothing to collect: the ride did not
 * happen for that passenger), and e-wallet bookings are excluded
 * (already paid through the wallet). A completed cash booking stays
 * in the total: v1 has no "marked as collected" flag, so the driver
 * sees the full amount still to collect / collected in person.
 */
export function cashToCollectForRide(
  bookings: Array<Omit<CashToCollectBooking, "rideId">>,
): number {
  let total = 0;
  for (const b of bookings) {
    if (b.paymentMethod !== "cash") continue;
    if (b.status !== "confirmed" && b.status !== "completed") continue;
    total += b.totalPrice;
  }
  return total;
}

/** One ride's share of the driver's cash to collect. */
export interface CashToCollectByRide {
  rideId: string;
  /** Cash bookings counted (confirmed + completed). */
  count: number;
  amount: number;
}

/**
 * Cash to collect across the driver's rides, grouped per ride (rides
 * with no collectable cash are omitted). The caller supplies every
 * booking of the driver's rides — this helper only filters and sums,
 * it never reads the database. Total = sum of the per-ride amounts.
 */
export function cashToCollectByRide(
  bookings: CashToCollectBooking[],
): CashToCollectByRide[] {
  const byRide = new Map<string, CashToCollectByRide>();
  for (const b of bookings) {
    if (b.paymentMethod !== "cash") continue;
    if (b.status !== "confirmed" && b.status !== "completed") continue;
    const row = byRide.get(b.rideId) ?? { rideId: b.rideId, count: 0, amount: 0 };
    row.count += 1;
    row.amount += b.totalPrice;
    byRide.set(b.rideId, row);
  }
  return [...byRide.values()];
}

/** Total cash to collect across all of the driver's rides. */
export function cashToCollectTotal(bookings: CashToCollectBooking[]): number {
  return cashToCollectByRide(bookings).reduce((sum, r) => sum + r.amount, 0);
}

// ---------------------------------------------------------------------------
// A4 (ratings) + A6 (future departure) + A7 (dashboard earnings).
// ---------------------------------------------------------------------------

/**
 * A4: only a COMPLETED booking on a COMPLETED ride is rateable.
 * A confirmed (not yet ridden) booking must not be rateable — rating
 * before completion used to be allowed. A cancelled / no-show booking
 * is never rateable either.
 */
export function isRateableBooking(
  bookingStatus: string,
  rideStatus: string,
): { ok: true } | { ok: false; error: string } {
  if (bookingStatus !== "completed") {
    return {
      ok: false,
      error:
        bookingStatus === "confirmed"
          ? "Only completed bookings can be rated — this ride has not finished yet"
          : `Only completed bookings can be rated (booking is ${bookingStatus})`,
    };
  }
  if (rideStatus !== "completed") {
    return {
      ok: false,
      error: "Only completed rides can be rated — this ride has not finished yet",
    };
  }
  return { ok: true };
}

/** A6: a ride / ride request may only be created for a future departure. */
export function isFutureDeparture(
  departureTime: Date | string,
  now: Date = new Date(),
): boolean {
  const departure =
    departureTime instanceof Date ? departureTime : new Date(departureTime);
  if (Number.isNaN(departure.getTime())) return false;
  return departure.getTime() > now.getTime();
}

/**
 * A7: what the driver actually kept — completed 'ride_earning' rows
 * MINUS completed 'adjustment' debits (refunds / fair-split repricing
 * / cancels). Summing ride_earning alone overstates earnings after any
 * refund. Adjustment rows are negative by construction; both inputs
 * are plain amounts so the route can pass its two queries straight in.
 */
export function driverNetEarnings(
  earningAmounts: number[],
  adjustmentAmounts: number[],
): number {
  return (
    earningAmounts.reduce((sum, a) => sum + a, 0) +
    adjustmentAmounts.reduce((sum, a) => sum + a, 0)
  );
}

// ---------------------------------------------------------------------------
// A5 — leave-price freeze (2026-11-22).
//
// A member's fareShare / appFee / totalPrice is what they PREPAID
// (paidAmount). When a member leaves, the remaining members' prices are
// FROZEN at those prepaid amounts — the old code recalculated the fair
// split over the survivors, which RAISED their recorded totalPrice
// without anyone paying the difference, and accept then credited the
// driver the raised (never-paid) fareShares. Freezing is the fix: the
// leave route updates no remaining member's amounts at all, and accept
// credits exactly the stored (paid) fareShares.
//
// freezePricesOnLeave is the explicit, tested form of that rule: the
// amounts after a leave are the stored amounts, unchanged. The leave
// route calls it (and notifies the survivors) instead of recalculating.
// ---------------------------------------------------------------------------

/** Minimal stored price row for one ride-request member. */
export interface FrozenMemberPrice {
  fareShare: number;
  appFee: number;
  totalPrice: number;
  paidAmount: number;
}

/** A5: leaving freezes every remaining member's price at what they paid. */
export function freezePricesOnLeave(
  members: FrozenMemberPrice[],
): FrozenMemberPrice[] {
  return members.map((m) => ({
    fareShare: m.fareShare,
    appFee: m.appFee,
    totalPrice: m.totalPrice,
    paidAmount: m.paidAmount,
  }));
}

/**
 * A5 (join side): when a new rider joins and the fair split is
 * recomputed, an existing member's price may only move DOWN (with a
 * refund of the difference) — never UP. A recomputed share above what
 * the member already paid is frozen at the paid amount: nobody is
 * charged extra, and the recorded totalPrice never exceeds paidAmount,
 * so accept can never credit the driver money the passenger never paid.
 */
export function joinRepriceForMember(
  previousPaid: number,
  newPrice: number,
): { appliedPrice: number; refund: number } {
  if (newPrice < previousPaid) {
    return { appliedPrice: newPrice, refund: previousPaid - newPrice };
  }
  return { appliedPrice: previousPaid, refund: 0 };
}

// ---------------------------------------------------------------------------
// D8a — held prepayments (2026-11-23).
//
// Creating or joining a ride request deducts the fare as a 'prepayment'
// ledger row, but the money is only RELEASED to the driver at accept
// (A1) and only REFUNDED when the request is cancelled/left. While the
// request is still 'open' the money is HELD: it is already out of the
// spendable balance (balance = ledger sum, which includes the negative
// prepayment row), but the passenger has not actually ridden yet. The
// wallet shows it separately so the user can tell held money apart
// from money that is gone.
//
// A prepayment row's referenceId is its request id. Only rows whose
// request is still 'open' count as held — once the request is
// accepted the fare belongs to the driver, and once it is cancelled
// the refund row has already put the money back.
// ---------------------------------------------------------------------------

/** Minimal prepayment ledger row needed for the held total. */
export interface PrepaymentRow {
  referenceId: string | null;
  /** Signed amount: prepayments are negative (money out). */
  amount: number;
}

/**
 * Held prepayments: the sum of the (negative) prepayment amounts
 * whose request is still open, returned as a POSITIVE total to display
 * ("held: 8,400 MMK"). Rows for accepted/cancelled requests, rows
 * with no request id, and non-negative rows are ignored.
 */
export function heldPrepaymentTotal(
  prepayments: PrepaymentRow[],
  openRequestIds: Iterable<string>,
): number {
  const open = new Set(openRequestIds);
  let held = 0;
  for (const row of prepayments) {
    if (!row.referenceId || !open.has(row.referenceId)) continue;
    if (row.amount >= 0) continue;
    held += -row.amount;
  }
  return held;
}
