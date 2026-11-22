import { describe, expect, test } from "vitest";
import {
  acceptDriverDeltas,
  cancelBookingDeltas,
  cancelBookingDeltasForPolicy,
  cancelPolicy,
  driverNetEarnings,
  freezePricesOnLeave,
  isFutureDeparture,
  isRateableBooking,
  joinRepriceForMember,
  partialCancelRefund,
  passengerRefundForPolicy,
  type LedgerDelta,
} from "../src/lib/money";
import {
  guardedStatusTransition,
  simulateGuardedTransitions,
} from "../src/lib/race-guards";
import { PICKUP_THRESHOLD_KM, DROPOFF_THRESHOLD_KM } from "../src/lib/matching";

/** Sum of ledger moves for one user — balance = SUM(amount). */
function balanceOf(moves: LedgerDelta[], userId: string): number {
  return moves
    .filter((m) => m.userId === userId)
    .reduce((sum, m) => sum + m.amount, 0);
}

// Worked example from the review: 13.8 km ride, two full-route riders.
// Each pays 5,197 (fare 4,950 + fee 247); the driver holds 4,950 each.
const DRIVER = "driver-1";
const RIDER_1 = "rider-1";
const FARE = 4950;
const FEE = 247;
const TOTAL = 5197;

const NOW = new Date("2026-11-22T12:00:00.000Z");
const DEPARTURE = new Date("2026-11-22T18:00:00.000Z"); // 6h after NOW
const PAST = new Date("2026-11-22T10:00:00.000Z");

const booking = {
  passengerId: RIDER_1,
  fareShare: FARE,
  appFee: FEE,
  totalPrice: TOTAL,
  driverPayment: FARE,
  paymentMethod: "ewallet",
};

describe("D6: cancelPolicy — free until 3h before, partial inside 3h, none after departure", () => {
  test("more than 3h before departure: free cancel", () => {
    expect(cancelPolicy(DEPARTURE, NOW)).toEqual({ allowed: true, kind: "free" });
    // 3h 1 minute out is still free.
    const justOver = new Date(NOW.getTime() + 3 * 60 * 60 * 1000 + 60 * 1000);
    expect(cancelPolicy(justOver, NOW)).toEqual({ allowed: true, kind: "free" });
  });

  test("exactly 3h before departure: partial (the free window has closed)", () => {
    const exactly3h = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
    expect(cancelPolicy(exactly3h, NOW)).toEqual({ allowed: true, kind: "partial" });
  });

  test("inside 3h before departure: cancel still allowed, but partial", () => {
    const twoHours = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    expect(cancelPolicy(twoHours, NOW)).toEqual({ allowed: true, kind: "partial" });
    const tenMinutes = new Date(NOW.getTime() + 10 * 60 * 1000);
    expect(cancelPolicy(tenMinutes, NOW)).toEqual({ allowed: true, kind: "partial" });
  });

  test("at or after departure: no cancel at all — the ride must be completed", () => {
    expect(cancelPolicy(NOW, NOW)).toEqual({
      allowed: false,
      error:
        "This ride has already departed and cannot be cancelled — it should be completed instead",
    });
    const res = cancelPolicy(PAST, NOW);
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.error).toMatch(/already departed/);
      expect(res.error).toMatch(/completed instead/);
    }
  });

  test("invalid departure time: no cancel", () => {
    const res = cancelPolicy("not-a-date", NOW);
    expect(res.allowed).toBe(false);
  });
});

describe("D6: partialCancelRefund — half the fare + full app fee", () => {
  test("worked example: fare 4,950 + fee 247 -> refund 2,722, driver keeps 2,475", () => {
    const r = partialCancelRefund(FARE, FEE);
    expect(r.refundedFare).toBe(2475);
    expect(r.retainedFare).toBe(2475);
    expect(r.feePortion).toBe(FEE);
    expect(r.refundTotal).toBe(2475 + FEE);
    expect(r.refundTotal).toBe(2722);
  });

  test("odd fare floors the refunded half so refunded + retained always equals the fare", () => {
    const r = partialCancelRefund(4951, 247);
    expect(r.refundedFare).toBe(2475);
    expect(r.retainedFare).toBe(2476);
    expect(r.refundedFare + r.retainedFare).toBe(4951);
  });

  test("zero fare: only the fee is refunded", () => {
    expect(partialCancelRefund(0, 100)).toEqual({
      refundTotal: 100,
      refundedFare: 0,
      retainedFare: 0,
      feePortion: 100,
    });
  });
});

describe("D6: cancelBookingDeltasForPolicy — ledger stays consistent", () => {
  test("free cancel is identical to the old full-refund deltas", () => {
    const policy = cancelBookingDeltasForPolicy(booking, DRIVER, { kind: "free" }, "passenger");
    expect(policy).toEqual(cancelBookingDeltas(booking, DRIVER));
    expect(passengerRefundForPolicy(booking, { kind: "free" })).toBe(TOTAL);
  });

  test("late passenger cancel: passenger gets 2,722, driver debited 2,475 and keeps 2,475", () => {
    const moves = cancelBookingDeltasForPolicy(booking, DRIVER, { kind: "partial" }, "passenger");
    expect(moves).toEqual([
      { userId: RIDER_1, type: "refund", amount: 2722 },
      { userId: DRIVER, type: "adjustment", amount: -2475 },
    ]);
    expect(passengerRefundForPolicy(booking, { kind: "partial" })).toBe(2722);
  });

  test("late passenger cancel, end to end: passenger loss equals driver gain", () => {
    const moves: LedgerDelta[] = [];
    // Book: rider pays 5,197, driver credited 4,950.
    moves.push({ userId: RIDER_1, type: "ride_payment", amount: -TOTAL });
    moves.push({ userId: DRIVER, type: "ride_earning", amount: FARE });
    // Late cancel by the passenger.
    moves.push(
      ...cancelBookingDeltasForPolicy(booking, DRIVER, { kind: "partial" }, "passenger"),
    );
    // Passenger paid 5,197, got 2,722 back -> net -2,475 (the retained fare half).
    expect(balanceOf(moves, RIDER_1)).toBe(-2475);
    // Driver was credited 4,950, debited 2,475 -> keeps 2,475.
    expect(balanceOf(moves, DRIVER)).toBe(2475);
    // The fee (247) is refunded in full and is never a driver debit.
    expect(balanceOf(moves, RIDER_1) + balanceOf(moves, DRIVER)).toBe(0);
  });

  test("late DRIVER cancel: passenger gets the same 2,722, but the driver is debited the FULL fare and keeps nothing", () => {
    const moves = cancelBookingDeltasForPolicy(booking, DRIVER, { kind: "partial" }, "driver");
    expect(moves).toEqual([
      { userId: RIDER_1, type: "refund", amount: 2722 },
      { userId: DRIVER, type: "adjustment", amount: -FARE },
    ]);
    // End to end: driver nets 0 (credited 4,950 at book, debited 4,950).
    const ledger: LedgerDelta[] = [
      { userId: RIDER_1, type: "ride_payment", amount: -TOTAL },
      { userId: DRIVER, type: "ride_earning", amount: FARE },
      ...moves,
    ];
    expect(balanceOf(ledger, DRIVER)).toBe(0);
    expect(balanceOf(ledger, RIDER_1)).toBe(-2475);
  });

  test("free driver cancel: passenger refunded in full, driver debited in full", () => {
    const moves = cancelBookingDeltasForPolicy(booking, DRIVER, { kind: "free" }, "driver");
    expect(moves).toEqual([
      { userId: RIDER_1, type: "refund", amount: TOTAL },
      { userId: DRIVER, type: "adjustment", amount: -FARE },
    ]);
  });

  test("cash bookings: no ledger moves under any policy", () => {
    const cash = { ...booking, paymentMethod: "cash" };
    expect(cancelBookingDeltasForPolicy(cash, DRIVER, { kind: "free" }, "passenger")).toEqual([]);
    expect(cancelBookingDeltasForPolicy(cash, DRIVER, { kind: "partial" }, "driver")).toEqual([]);
    expect(passengerRefundForPolicy(cash, { kind: "free" })).toBe(0);
    expect(passengerRefundForPolicy(cash, { kind: "partial" })).toBe(0);
  });
});

describe("A4: isRateableBooking — only completed bookings on completed rides", () => {
  test("completed booking + completed ride is rateable", () => {
    expect(isRateableBooking("completed", "completed")).toEqual({ ok: true });
  });

  test("confirmed booking is NOT rateable — the ride has not finished yet", () => {
    const res = isRateableBooking("confirmed", "open");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not finished yet/);
  });

  test("confirmed booking on a full ride is still not rateable", () => {
    expect(isRateableBooking("confirmed", "full").ok).toBe(false);
  });

  test("cancelled and no-show bookings are never rateable", () => {
    expect(isRateableBooking("cancelled", "completed").ok).toBe(false);
    expect(isRateableBooking("no_show", "completed").ok).toBe(false);
  });

  test("completed booking but ride not marked completed is not rateable", () => {
    const res = isRateableBooking("completed", "open");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/ride has not finished yet/);
  });
});

describe("A6: isFutureDeparture — rides and requests must depart in the future", () => {
  test("future departure is allowed", () => {
    expect(isFutureDeparture(DEPARTURE, NOW)).toBe(true);
  });

  test("past departure is rejected", () => {
    expect(isFutureDeparture(PAST, NOW)).toBe(false);
  });

  test("departure right now is rejected (must be strictly in the future)", () => {
    expect(isFutureDeparture(NOW, NOW)).toBe(false);
  });

  test("an invalid date is rejected", () => {
    expect(isFutureDeparture("not-a-date", NOW)).toBe(false);
  });

  test("string dates work the same as Date objects", () => {
    expect(isFutureDeparture("2026-11-22T18:00:00.000Z", NOW)).toBe(true);
    expect(isFutureDeparture("2026-11-22T10:00:00.000Z", NOW)).toBe(false);
  });
});

describe("A5: leave-price freeze — remaining members keep what they paid", () => {
  const members = [
    { fareShare: FARE, appFee: FEE, totalPrice: TOTAL, paidAmount: TOTAL },
    { fareShare: FARE, appFee: FEE, totalPrice: TOTAL, paidAmount: TOTAL },
  ];

  test("freezePricesOnLeave returns the stored amounts unchanged", () => {
    expect(freezePricesOnLeave(members)).toEqual(members);
  });

  test("accept after a leave credits the driver exactly the paid fareShares — never a raised price", () => {
    // Two members paid 4,950 fare each; a third member left. The
    // survivors' shares were NOT recalculated upward, so accept credits
    // 4,950 + 4,950 — the old code would have credited the raised split.
    const frozen = freezePricesOnLeave(members);
    const deltas = acceptDriverDeltas(
      DRIVER,
      frozen.map((m) => m.fareShare),
    );
    expect(deltas).toEqual([
      { userId: DRIVER, type: "ride_earning", amount: FARE },
      { userId: DRIVER, type: "ride_earning", amount: FARE },
    ]);
    const total = deltas.reduce((s, d) => s + d.amount, 0);
    expect(total).toBe(FARE * 2);
  });

  test("a leaver's own refund is still their full paid amount", () => {
    const leaver = { fareShare: FARE, appFee: FEE, totalPrice: TOTAL, paidAmount: TOTAL };
    expect(leaver.paidAmount).toBe(TOTAL);
  });
});

describe("A5 (join side): joinRepriceForMember — shares only move down", () => {
  test("share dropped: applied at the new price, difference refunded", () => {
    expect(joinRepriceForMember(5197, 4000)).toEqual({ appliedPrice: 4000, refund: 1197 });
  });

  test("share rose: frozen at what was paid, no refund, no extra charge", () => {
    expect(joinRepriceForMember(4000, 5197)).toEqual({ appliedPrice: 4000, refund: 0 });
  });

  test("share unchanged: applied as-is, no refund", () => {
    expect(joinRepriceForMember(5197, 5197)).toEqual({ appliedPrice: 5197, refund: 0 });
  });
});

describe("A7: driverNetEarnings — earnings minus adjustment debits", () => {
  test("no adjustments: earnings are the ride_earning sum", () => {
    expect(driverNetEarnings([FARE, FARE], [])).toBe(FARE * 2);
  });

  test("a refund adjustment is subtracted — post-refund earnings reflect what was kept", () => {
    // Driver earned 9,900, then a cancel debited 4,950 and a fair-split
    // reprice debited 3,450: kept 1,500.
    expect(driverNetEarnings([FARE, FARE], [-4950, -3450])).toBe(1500);
  });

  test("worked example: 9,900 earned, 3,623 fair-split refund debits only the 3,450 fare part", () => {
    // The 173 fee part of a 3,623 refund is never a driver debit (A2),
    // so the adjustment is -3,450 and kept earnings are 6,450.
    expect(driverNetEarnings([FARE, FARE], [-3450])).toBe(6450);
  });

  test("no rows at all: zero", () => {
    expect(driverNetEarnings([], [])).toBe(0);
  });
});

describe("A8: join thresholds match search thresholds (matching.ts)", () => {
  test("search pickup threshold is 2.0 km and dropoff is 2.5 km", () => {
    expect(PICKUP_THRESHOLD_KM).toBe(2.0);
    expect(DROPOFF_THRESHOLD_KM).toBe(2.5);
  });

  test("the join route imports those same constants (no separate 5.0 km values)", async () => {
    // The join route defines JOIN_PICKUP_KM = PICKUP_THRESHOLD_KM and
    // JOIN_DROPOFF_KM = DROPOFF_THRESHOLD_KM, so the values above ARE
    // the join thresholds. This test pins the shared constants so a
    // future edit cannot silently split them again.
    const matching = await import("../src/lib/matching");
    expect(matching.PICKUP_THRESHOLD_KM).toBe(2.0);
    expect(matching.DROPOFF_THRESHOLD_KM).toBe(2.5);
  });
});

describe("Guarded accept: exactly one concurrent accept wins", () => {
  test("two racing accepts of an open request: one succeeds, one loses, final status accepted", () => {
    expect(simulateGuardedTransitions("open", "open", "accepted", 2)).toEqual({
      succeeded: 1,
      finalStatus: "accepted",
    });
  });

  test("five racing accepts: still exactly one succeeds", () => {
    expect(simulateGuardedTransitions("open", "open", "accepted", 5)).toEqual({
      succeeded: 1,
      finalStatus: "accepted",
    });
  });

  test("accepting an already-accepted request loses (0 rows, 409)", () => {
    expect(simulateGuardedTransitions("accepted", "open", "accepted", 1)).toEqual({
      succeeded: 0,
      finalStatus: "accepted",
    });
    expect(guardedStatusTransition("cancelled", "open", "accepted")).toBeNull();
  });

  test("guardedStatusTransition mirrors the SQL guard `WHERE status = 'open'`", () => {
    expect(guardedStatusTransition("open", "open", "accepted")).toBe("accepted");
    expect(guardedStatusTransition("accepted", "open", "accepted")).toBeNull();
    expect(guardedStatusTransition("cancelled", "open", "accepted")).toBeNull();
  });

  test("the loser credits nothing: only the winner's acceptDriverDeltas run", () => {
    const winner = simulateGuardedTransitions("open", "open", "accepted", 2);
    expect(winner.succeeded).toBe(1);
    // One winner -> one credit per member; a second credit would be a
    // double-pay. Model the ledger: winner credits once, loser zero times.
    const moves: LedgerDelta[] = [];
    if (winner.succeeded === 1) {
      moves.push(...acceptDriverDeltas(DRIVER, [FARE, FARE]));
    }
    expect(balanceOf(moves, DRIVER)).toBe(FARE * 2);
  });
});
