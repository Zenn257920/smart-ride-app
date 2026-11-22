import { describe, expect, test } from "vitest";
import {
  acceptDriverDeltas,
  cancelBookingDeltas,
  canCompleteRide,
  settleRideCompletion,
  type LedgerDelta,
} from "../src/lib/money";

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
const RIDER_2 = "rider-2";
const FARE = 4950;
const FEE = 247;
const TOTAL = 5197;

const PAST = new Date("2026-11-22T10:00:00.000Z");
const FUTURE = new Date("2026-11-23T10:00:00.000Z");
const NOW = new Date("2026-11-22T12:00:00.000Z");

describe("D1: canCompleteRide gate", () => {
  test("open ride past departure can be completed", () => {
    expect(canCompleteRide({ status: "open", departureTime: PAST }, NOW)).toEqual({ ok: true });
  });

  test("full ride past departure can be completed", () => {
    expect(canCompleteRide({ status: "full", departureTime: PAST }, NOW)).toEqual({ ok: true });
  });

  test("complete before departure is rejected", () => {
    const res = canCompleteRide({ status: "open", departureTime: FUTURE }, NOW);
    expect(res).toEqual({ ok: false, error: "Ride has not departed yet" });
  });

  test("already-completed ride cannot be completed again", () => {
    expect(canCompleteRide({ status: "completed", departureTime: PAST }, NOW)).toEqual({
      ok: false,
      error: "Ride is already completed",
    });
  });

  test("cancelled ride cannot be completed", () => {
    const res = canCompleteRide({ status: "cancelled", departureTime: PAST }, NOW);
    expect(res.ok).toBe(false);
  });
});

describe("D1: settleRideCompletion splits rode vs no-show, moves no money", () => {
  const confirmed = [
    { id: "b1", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" },
    { id: "b2", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" },
  ];

  test("happy path: all confirmed bookings complete, deltas empty", () => {
    const res = settleRideCompletion(confirmed, []);
    expect(res.completedIds).toEqual(["b1", "b2"]);
    expect(res.noShowIds).toEqual([]);
    expect(res.deltas).toEqual([]);
  });

  test("no-show booking goes to noShowIds, the other still completes", () => {
    const res = settleRideCompletion(confirmed, ["b2"]);
    expect(res.completedIds).toEqual(["b1"]);
    expect(res.noShowIds).toEqual(["b2"]);
    expect(res.deltas).toEqual([]);
  });

  test("already-cancelled bookings are skipped, unknown no-show ids ignored", () => {
    const mixed = [
      ...confirmed,
      { id: "b3", paymentMethod: "ewallet", driverPayment: FARE, status: "cancelled" },
    ];
    const res = settleRideCompletion(mixed, ["b3", "does-not-exist"]);
    expect(res.completedIds).toEqual(["b1", "b2"]);
    expect(res.noShowIds).toEqual([]);
    expect(res.deltas).toEqual([]);
  });

  test("cash bookings settle the same way, with no ledger moves", () => {
    const cash = [
      { id: "b1", paymentMethod: "cash", driverPayment: FARE, status: "confirmed" },
    ];
    const res = settleRideCompletion(cash, []);
    expect(res.completedIds).toEqual(["b1"]);
    expect(res.deltas).toEqual([]);
  });
});

describe("D1: no double-credit — driver total after accept -> complete is unchanged", () => {
  test("direct booking: book credits the driver, complete credits nothing more", () => {
    const moves: LedgerDelta[] = [];
    // Book: rider pays 5,197, driver credited 4,950.
    moves.push({ userId: RIDER_1, type: "ride_payment", amount: -TOTAL });
    moves.push({ userId: DRIVER, type: "ride_earning", amount: FARE });
    expect(balanceOf(moves, DRIVER)).toBe(FARE);

    // Complete: settlement produces no deltas.
    const settlement = settleRideCompletion(
      [{ id: "b1", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" }],
      [],
    );
    moves.push(...settlement.deltas);
    expect(balanceOf(moves, DRIVER)).toBe(FARE);
    expect(balanceOf(moves, RIDER_1)).toBe(-TOTAL);
  });

  test("ride-request flow: prepay + accept credits the driver, complete adds nothing", () => {
    const moves: LedgerDelta[] = [];
    // Create/join: each member prepays 5,197.
    for (const rider of [RIDER_1, RIDER_2]) {
      moves.push({ userId: rider, type: "prepayment", amount: -TOTAL });
    }
    // Accept: driver credited fareShare per member.
    moves.push(...acceptDriverDeltas(DRIVER, [FARE, FARE]));
    expect(balanceOf(moves, DRIVER)).toBe(FARE * 2);

    // Complete both bookings: no further deltas.
    const settlement = settleRideCompletion(
      [
        { id: "b1", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" },
        { id: "b2", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" },
      ],
      [],
    );
    moves.push(...settlement.deltas);
    expect(balanceOf(moves, DRIVER)).toBe(FARE * 2);
    expect(balanceOf(moves, RIDER_1)).toBe(-TOTAL);
    expect(balanceOf(moves, RIDER_2)).toBe(-TOTAL);
    // App's implicit take is still just the two fees: 247 + 247.
    const paid = TOTAL * 2;
    expect(paid - balanceOf(moves, DRIVER)).toBe(FEE * 2);
  });

  test("completing twice is impossible at the ledger level: a second settle finds nothing confirmed", () => {
    const first = settleRideCompletion(
      [{ id: "b1", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" }],
      [],
    );
    expect(first.completedIds).toEqual(["b1"]);
    // After the first completion the booking is 'completed', so a
    // second settle over the same row settles nothing.
    const second = settleRideCompletion(
      [{ id: "b1", paymentMethod: "ewallet", driverPayment: FARE, status: "completed" }],
      [],
    );
    expect(second.completedIds).toEqual([]);
    expect(second.deltas).toEqual([]);
  });
});

describe("D1: no-show handling — driver keeps the fare, passenger is not refunded", () => {
  test("no-show e-wallet passenger: no refund delta, driver keeps fareShare", () => {
    const moves: LedgerDelta[] = [];
    // Request flow: prepay, then accept credits the driver.
    moves.push({ userId: RIDER_1, type: "prepayment", amount: -TOTAL });
    moves.push({ userId: RIDER_2, type: "prepayment", amount: -TOTAL });
    moves.push(...acceptDriverDeltas(DRIVER, [FARE, FARE]));
    expect(balanceOf(moves, DRIVER)).toBe(FARE * 2);

    // Complete with rider-2 as no-show: no deltas at all.
    const settlement = settleRideCompletion(
      [
        { id: "b1", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" },
        { id: "b2", paymentMethod: "ewallet", driverPayment: FARE, status: "confirmed" },
      ],
      ["b2"],
    );
    expect(settlement.noShowIds).toEqual(["b2"]);
    moves.push(...settlement.deltas);

    // Driver keeps BOTH fares (rider-2's fare is forfeited, not refunded).
    expect(balanceOf(moves, DRIVER)).toBe(FARE * 2);
    // Rider-2 gets nothing back; rider-1 paid the fair price.
    expect(balanceOf(moves, RIDER_2)).toBe(-TOTAL);
    expect(balanceOf(moves, RIDER_1)).toBe(-TOTAL);
  });

  test("no-show differs from cancel: cancel refunds in full and debits the driver", () => {
    // Same starting point (accept credited the driver 4,950), but a
    // cancel reverses it — the no-show path above does not.
    const moves: LedgerDelta[] = [
      { userId: RIDER_1, type: "prepayment", amount: -TOTAL },
      ...acceptDriverDeltas(DRIVER, [FARE]),
      ...cancelBookingDeltas(
        { passengerId: RIDER_1, totalPrice: TOTAL, driverPayment: FARE, paymentMethod: "ewallet" },
        DRIVER,
      ),
    ];
    expect(balanceOf(moves, DRIVER)).toBe(0);
    expect(balanceOf(moves, RIDER_1)).toBe(0);
  });
});
