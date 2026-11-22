import { describe, expect, test } from "vitest";
import { RouteMatcher, routeMatcher } from "../src/lib/matching";
import type { SegmentData } from "../src/lib/matching";

// Sanity: the shared singleton is a RouteMatcher with the spec constants.
describe("routeMatcher singleton", () => {
  test("exports the same constants as the class", () => {
    expect(routeMatcher).toBeInstanceOf(RouteMatcher);
    expect(routeMatcher.BASE_FARE).toBe(1500);
    expect(routeMatcher.RATE_PER_KM).toBe(500);
    expect(routeMatcher.DEFAULT_PRICE).toBe(7500);
    expect(routeMatcher.APP_TAX_RATE).toBe(0.05);
    expect(routeMatcher.APP_COMMISSION_RATE).toBe(0.05);
    expect(routeMatcher.DRIVER_BONUS_RATE).toBe(0);
    expect(routeMatcher.PICKUP_THRESHOLD_KM).toBe(2.0);
    expect(routeMatcher.DROPOFF_THRESHOLD_KM).toBe(2.5);
    expect(routeMatcher.BEARING_MAX_DIFF_DEG).toBe(65);
    expect(routeMatcher.TIME_WINDOW_MINUTES).toBe(120);
    expect(routeMatcher.POLYLINE_PICKUP_THRESHOLD_KM).toBe(2.0);
    expect(routeMatcher.POLYLINE_DROPOFF_THRESHOLD_KM).toBe(2.0);
  });
});

// ============================================================
// Backward compatibility — old format (no segmentData) still works
// ============================================================

test("backward compat: shared ride pricing without segmentData uses individual distance", () => {
  const matcher = new RouteMatcher();
  const breakdowns = matcher.calculateFairPriceBreakdown(6500, [10, 2]);

  expect(breakdowns.length).toBe(2);
  // Passenger A: 10km → BASE(1500) + 10*500 = 6500
  expect(breakdowns[0].fareShare).toBe(6500);
  expect(breakdowns[0].appCommissionPerPassenger).toBe(325);
  expect(breakdowns[0].passengerPrice).toBe(6825);
  // Passenger B: 2km → BASE(1500) + 2*500 = 2500
  expect(breakdowns[1].fareShare).toBe(2500);
  expect(breakdowns[1].appCommissionPerPassenger).toBe(125);
  expect(breakdowns[1].passengerPrice).toBe(2625);
});

test("backward compat: single passenger keeps the full distance-based cost with app tax", () => {
  const matcher = new RouteMatcher();
  const breakdowns = matcher.calculateFairPriceBreakdown(6500, [10]);

  expect(breakdowns[0].fareShare).toBe(6500);
  expect(breakdowns[0].appCommissionPerPassenger).toBe(325);
  expect(breakdowns[0].passengerPrice).toBe(6825);
});

// ============================================================
// Segment-based pricing — fully overlapping routes
// ============================================================

test("segment: two passengers same route — split equally", () => {
  const matcher = new RouteMatcher();
  // Both passengers ride the full 10km route
  const segmentData: SegmentData = {
    totalRouteKm: 10,
    passengers: [
      { id: "A", startT: 0.0, endT: 1.0 },
      { id: "B", startT: 0.0, endT: 1.0 },
    ],
  };
  const breakdowns = matcher.calculateFairPriceBreakdown(0, [10, 10], {
    segmentData,
  });

  expect(breakdowns.length).toBe(2);
  // Each gets 10km / 2 riders = 5km equivalent
  // 5km → BASE(1500) + 5*500 = 4000
  expect(breakdowns[0].equivalentKm).toBe(5);
  expect(breakdowns[0].fareShare).toBe(4000);
  expect(breakdowns[1].equivalentKm).toBe(5);
  expect(breakdowns[1].fareShare).toBe(4000);
  // Weight should be 50% each
  expect(breakdowns[0].weightPercent).toBe(50);
  expect(breakdowns[1].weightPercent).toBe(50);
});

// ============================================================
// Segment-based pricing — partial overlap (the main use case!)
//
// Example from the user:
//   Passenger A: လှိုင် → ဗိုလ်တထောင် (10km full route, T: 0.0 → 1.0)
//   Passenger B: လှည်းတန်း → မြေနီကုန်း (5km, T: 0.5 → 1.0)
//
// Segments:
//   [0.0 → 0.5] = 5km — A alone
//   [0.5 → 1.0] = 5km — A + B shared
// ============================================================

test("segment: partial overlap — Passenger A full route, B joins halfway", () => {
  const matcher = new RouteMatcher();
  const segmentData: SegmentData = {
    totalRouteKm: 10,
    passengers: [
      { id: "A", startT: 0.0, endT: 1.0 }, // full 10km
      { id: "B", startT: 0.5, endT: 1.0 }, // joins at 50% mark, rides 5km
    ],
  };
  const breakdowns = matcher.calculateFairPriceBreakdown(0, [10, 5], {
    segmentData,
  });

  expect(breakdowns.length).toBe(2);

  // Passenger A:
  //   Solo segment [0→0.5] = 5km, pays 100% → 5km
  //   Shared segment [0.5→1.0] = 5km / 2 → 2.5km
  //   Total equivalent = 7.5km
  expect(breakdowns[0].equivalentKm).toBe(7.5);
  // 7.5km → BASE(1500) + 7.5*500 = 1500 + 3750 = 5250
  expect(breakdowns[0].fareShare).toBe(5250);

  // Passenger B:
  //   Shared segment [0.5→1.0] = 5km / 2 → 2.5km
  //   Total equivalent = 2.5km
  expect(breakdowns[1].equivalentKm).toBe(2.5);
  // 2.5km → BASE(1500) + 2.5*500 = 1500 + 1250 = 2750
  expect(breakdowns[1].fareShare).toBe(2750);

  // Combined driver earnings = 5250 + 2750 = 8000 (less than 10km solo fare of 6500+6500)
  // App tax = 5% each
  expect(breakdowns[0].appCommissionPerPassenger).toBe(
    Math.floor(5250 * 0.05),
  );
  expect(breakdowns[1].appCommissionPerPassenger).toBe(
    Math.floor(2750 * 0.05),
  );
});

// ============================================================
// Segment-based pricing — three passengers, staggered
//
//   A: [0.0 → 1.0]  full route (10km)
//   B: [0.2 → 0.7]  joins at 20%, leaves at 70%
//   C: [0.5 → 1.0]  joins at 50%, rides to end
//
// Segments:
//   [0.0 → 0.2] = 2km — A alone
//   [0.2 → 0.5] = 3km — A + B
//   [0.5 → 0.7] = 2km — A + B + C
//   [0.7 → 1.0] = 3km — A + C
// ============================================================

test("segment: three passengers staggered", () => {
  const matcher = new RouteMatcher();
  const segmentData: SegmentData = {
    totalRouteKm: 10,
    passengers: [
      { id: "A", startT: 0.0, endT: 1.0 },
      { id: "B", startT: 0.2, endT: 0.7 },
      { id: "C", startT: 0.5, endT: 1.0 },
    ],
  };
  const breakdowns = matcher.calculateFairPriceBreakdown(0, [10, 5, 5], {
    segmentData,
  });

  expect(breakdowns.length).toBe(3);

  // A: 2 (solo) + 3/2 (shared w/ B) + 2/3 (shared w/ B+C) + 3/2 (shared w/ C)
  //  = 2 + 1.5 + 0.667 + 1.5 = 5.667
  const aEquiv = 2 + 3 / 2 + 2 / 3 + 3 / 2;
  expect(breakdowns[0].equivalentKm).toBe(Math.round(aEquiv * 10) / 10);

  // B: 3/2 (shared w/ A) + 2/3 (shared w/ A+C) = 1.5 + 0.667 = 2.167
  const bEquiv = 3 / 2 + 2 / 3;
  expect(breakdowns[1].equivalentKm).toBe(Math.round(bEquiv * 10) / 10);

  // C: 2/3 (shared w/ A+B) + 3/2 (shared w/ A) = 0.667 + 1.5 = 2.167
  const cEquiv = 2 / 3 + 3 / 2;
  expect(breakdowns[2].equivalentKm).toBe(Math.round(cEquiv * 10) / 10);

  // Total equivalent should equal totalRouteKm (10)
  const totalEquiv = aEquiv + bEquiv + cEquiv;
  expect(Math.abs(totalEquiv - 10)).toBeLessThan(0.001);
});

// ============================================================
// Edge case: no overlap at all (sequential rides)
// ============================================================

test("segment: no overlap — sequential passengers", () => {
  const matcher = new RouteMatcher();
  // A rides first half, B rides second half
  const segmentData: SegmentData = {
    totalRouteKm: 10,
    passengers: [
      { id: "A", startT: 0.0, endT: 0.5 },
      { id: "B", startT: 0.5, endT: 1.0 },
    ],
  };
  const breakdowns = matcher.calculateFairPriceBreakdown(0, [5, 5], {
    segmentData,
  });

  // Each passenger pays for their own 5km, no sharing
  expect(breakdowns[0].equivalentKm).toBe(5);
  expect(breakdowns[1].equivalentKm).toBe(5);
  expect(breakdowns[0].fareShare).toBe(breakdowns[1].fareShare);
});

// ============================================================
// Edge case: empty passengers
// ============================================================

test("empty passengers returns empty array", () => {
  const matcher = new RouteMatcher();
  const breakdowns = matcher.calculateFairPriceBreakdown(0, []);
  expect(breakdowns.length).toBe(0);
});

// ============================================================
// Edge case: single passenger with segmentData
// ============================================================

test("segment: single passenger pays full route", () => {
  const matcher = new RouteMatcher();
  const segmentData: SegmentData = {
    totalRouteKm: 10,
    passengers: [{ id: "A", startT: 0.0, endT: 1.0 }],
  };
  const breakdowns = matcher.calculateFairPriceBreakdown(0, [10], {
    segmentData,
  });

  expect(breakdowns.length).toBe(1);
  expect(breakdowns[0].equivalentKm).toBe(10);
  // 10km → BASE(1500) + 10*500 = 6500
  expect(breakdowns[0].fareShare).toBe(6500);
  expect(breakdowns[0].weightPercent).toBe(100);
});

// ============================================================
// A1 + A2 money fixes (2026-11-22) — ledger helpers + shared pricing
// ============================================================

import {
  acceptDriverDeltas,
  cancelBookingDeltas,
  fairSplitRefundDeltas,
  repricedBookingAmounts,
  splitRefund,
  type LedgerDelta,
} from "../src/lib/money";

/** Sum of ledger moves for one user — balance = SUM(amount). */
function balanceOf(moves: LedgerDelta[], userId: string): number {
  return moves
    .filter((m) => m.userId === userId)
    .reduce((sum, m) => sum + m.amount, 0);
}

// Worked example from the review: 13.8 km ride, base price 8,400.
// Driver route runs due north; the "half" rider boards at the midpoint.
const RIDE_COORDS = {
  startLat: 16.8,
  startLng: 96.1,
  endLat: 16.924,
  endLng: 96.1,
};
const FULL_RIDER = {
  id: "rider-1",
  passengerId: "rider-1",
  ...RIDE_COORDS,
};
const HALF_RIDER = {
  id: "rider-2",
  passengerId: "rider-2",
  startLat: 16.862, // midpoint of the route (T = 0.5)
  startLng: 96.1,
  endLat: 16.924,
  endLng: 96.1,
};
const BASE_PRICE = 8400;
const ROUTE_KM = 13.8;
const DEPARTURE = "2026-11-23T10:00:00.000Z";

describe("A2: booking charge equals search price", () => {
  test("2nd rider, full route — review worked example: search 5,197 == booking 5,197 (not the old 4,410 simple split)", () => {
    const matcher = new RouteMatcher();
    const priced = matcher.priceNewBooking({
      basePrice: BASE_PRICE,
      distanceKm: ROUTE_KM,
      ride: RIDE_COORDS,
      existingPassengers: [FULL_RIDER],
      newRider: FULL_RIDER,
    });
    // Each rider's equivalent km is 13.8 / 2 = 6.9 → fare 1,500 + 6.9*500
    expect(priced.newRider.equivalentKm).toBe(6.9);
    expect(priced.newRider.fareShare).toBe(4950);
    expect(priced.newRider.appCommissionPerPassenger).toBe(247);
    expect(priced.newRider.passengerPrice).toBe(5197);
    // Old simple split charged floor(8400 / 2) + 5% = 4,410 — must not happen.
    expect(priced.newRider.passengerPrice).not.toBe(4410);

    const matches = matcher.findOptimalMatches(
      { ...FULL_RIDER, departureTime: DEPARTURE },
      [
        {
          ...RIDE_COORDS,
          id: "ride-1",
          price: BASE_PRICE,
          distanceKm: ROUTE_KM,
          departureTime: DEPARTURE,
          passengers: [FULL_RIDER],
        },
      ],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].discountedPrice).toBe(5197);
    expect(matches[0].fareShare).toBe(4950);
    expect(matches[0].appCommissionPerPassenger).toBe(247);
    // Booking and search agree exactly for the same inputs.
    expect(priced.newRider.passengerPrice).toBe(matches[0].discountedPrice);
    expect(priced.newRider.fareShare).toBe(matches[0].fareShare);
  });

  test("2nd rider, partial route (boards halfway) — search price == booking price", () => {
    const matcher = new RouteMatcher();
    const priced = matcher.priceNewBooking({
      basePrice: BASE_PRICE,
      distanceKm: ROUTE_KM,
      ride: RIDE_COORDS,
      existingPassengers: [FULL_RIDER],
      newRider: HALF_RIDER,
    });
    // Half rider rides the shared second half: 6.9 / 2 = 3.45 equiv km
    expect(priced.newRider.fareShare).toBe(3225);
    expect(priced.newRider.appCommissionPerPassenger).toBe(161);
    expect(priced.newRider.passengerPrice).toBe(3386);

    const matches = matcher.findOptimalMatches(
      { ...HALF_RIDER, departureTime: DEPARTURE },
      [
        {
          ...RIDE_COORDS,
          id: "ride-1",
          price: BASE_PRICE,
          distanceKm: ROUTE_KM,
          departureTime: DEPARTURE,
          passengers: [FULL_RIDER],
        },
      ],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].discountedPrice).toBe(priced.newRider.passengerPrice);
    expect(matches[0].fareShare).toBe(priced.newRider.fareShare);
    expect(matches[0].appCommissionPerPassenger).toBe(
      priced.newRider.appCommissionPerPassenger,
    );
  });

  test("1st rider still pays the full listed price + 5%", () => {
    const matcher = new RouteMatcher();
    const priced = matcher.priceNewBooking({
      basePrice: BASE_PRICE,
      distanceKm: ROUTE_KM,
      ride: RIDE_COORDS,
      existingPassengers: [],
      newRider: FULL_RIDER,
    });
    expect(priced.isFirstRider).toBe(true);
    expect(priced.newRider.fareShare).toBe(8400);
    expect(priced.newRider.appCommissionPerPassenger).toBe(420);
    expect(priced.newRider.passengerPrice).toBe(8820);
  });
});

describe("A2: refund never debits the driver the app-fee portion", () => {
  test("review worked example: refund 3,623 = 3,450 fare + 173 fee", () => {
    // First rider was 8,400 fare + 420 fee = 8,820; fair split is
    // 4,950 + 247 = 5,197.
    const split = splitRefund(8400, 420, 4950, 247);
    expect(split.refundTotal).toBe(3623);
    expect(split.farePortion).toBe(3450);
    expect(split.feePortion).toBe(173);
    expect(split.farePortion + split.feePortion).toBe(split.refundTotal);
  });

  test("no refund when the new price is not lower", () => {
    expect(splitRefund(8400, 420, 8400, 420)).toEqual({
      refundTotal: 0,
      farePortion: 0,
      feePortion: 0,
    });
    expect(splitRefund(4000, 200, 5000, 250)).toEqual({
      refundTotal: 0,
      farePortion: 0,
      feePortion: 0,
    });
  });

  test("full booking flow (review example): driver ends at the sum of final fare shares, not 8,977", () => {
    const driver = "driver-1";
    const rider1 = "rider-1";
    const rider2 = "rider-2";
    const moves: LedgerDelta[] = [];

    // Rider 1 books first: pays 8,820, driver credited 8,400.
    moves.push({ userId: rider1, type: "ride_payment", amount: -8820 });
    moves.push({ userId: driver, type: "ride_earning", amount: 8400 });

    // Rider 2 books at the SEARCH price 5,197 (fare 4,950), not 4,410.
    const priced = routeMatcher.priceNewBooking({
      basePrice: BASE_PRICE,
      distanceKm: ROUTE_KM,
      ride: RIDE_COORDS,
      existingPassengers: [FULL_RIDER],
      newRider: FULL_RIDER,
    });
    expect(priced.newRider.passengerPrice).toBe(5197);
    moves.push({ userId: rider2, type: "ride_payment", amount: -5197 });
    moves.push({ userId: driver, type: "ride_earning", amount: 4950 });

    // Fair-split refund to rider 1: driver debited the fare part only.
    const split = splitRefund(8400, 420, 4950, 247);
    moves.push(
      ...fairSplitRefundDeltas(rider1, driver, split, false),
    );

    // Driver: 8,400 + 4,950 - 3,450 = 9,900 = 4,950 + 4,950.
    // The old code debited the whole 3,623 and left 8,977 (and with the
    // old 4,410 charge, 8,977 vs the review's fee-fix-only figure 9,150).
    expect(balanceOf(moves, driver)).toBe(9900);
    expect(balanceOf(moves, driver)).toBe(4950 + 4950);
    // Rider 1 net paid the fair price 5,197; rider 2 paid 5,197.
    expect(balanceOf(moves, rider1)).toBe(-5197);
    expect(balanceOf(moves, rider2)).toBe(-5197);
    // App's implicit take: (8,820 + 5,197 - 3,623) - 9,900 = 494 = 247 + 247.
    const paid = 8820 + 5197 - 3623;
    expect(paid - balanceOf(moves, driver)).toBe(494);
  });

  test("repriced booking keeps driverPayment equal to the fareShare actually held", () => {
    const amounts = repricedBookingAmounts({
      fareShare: 4950,
      appCommissionPerPassenger: 247,
      passengerPrice: 5197,
    });
    expect(amounts).toEqual({
      fareShare: 4950,
      appFee: 247,
      totalPrice: 5197,
      driverPayment: 4950,
    });
    // A later cancel debits driverPayment — if it stayed at the old
    // 8,400 the driver would be over-debited by 3,450.
    expect(amounts.driverPayment).toBe(amounts.fareShare);
  });

  test("cash bookings produce no ledger deltas on cancel or refund", () => {
    expect(
      cancelBookingDeltas(
        { passengerId: "r1", totalPrice: 5197, driverPayment: 4950, paymentMethod: "cash" },
        "driver-1",
      ),
    ).toEqual([]);
    expect(
      fairSplitRefundDeltas("r1", "driver-1", splitRefund(8400, 420, 4950, 247), true),
    ).toEqual([]);
  });
});

describe("A1: accept-then-cancel leaves the driver balance unchanged", () => {
  test("two members prepaid 5,197 each; accept credits the driver, cancel reverses it exactly", () => {
    const driver = "driver-1";
    const rider1 = "rider-1";
    const rider2 = "rider-2";
    const moves: LedgerDelta[] = [];

    // Join: each member prepaid totalPrice 5,197 (fare 4,950 + fee 247).
    for (const rider of [rider1, rider2]) {
      moves.push({ userId: rider, type: "prepayment", amount: -5197 });
    }

    // Accept (A1 fix): driver credited fareShare per member.
    moves.push(...acceptDriverDeltas(driver, [4950, 4950]));
    expect(balanceOf(moves, driver)).toBe(9900);

    // Driver cancels the whole ride: each booking refunded in full and
    // the driver debited exactly driverPayment (fareShare).
    for (const rider of [rider1, rider2]) {
      moves.push(
        ...cancelBookingDeltas(
          { passengerId: rider, totalPrice: 5197, driverPayment: 4950, paymentMethod: "ewallet" },
          driver,
        ),
      );
    }

    // Driver back to 0, both passengers fully refunded.
    expect(balanceOf(moves, driver)).toBe(0);
    expect(balanceOf(moves, rider1)).toBe(0);
    expect(balanceOf(moves, rider2)).toBe(0);
  });

  test("single passenger cancel by the passenger also nets the driver to zero", () => {
    const driver = "driver-1";
    const rider = "rider-1";
    const moves: LedgerDelta[] = [
      { userId: rider, type: "prepayment", amount: -8820 },
      ...acceptDriverDeltas(driver, [8400]),
      ...cancelBookingDeltas(
        { passengerId: rider, totalPrice: 8820, driverPayment: 8400, paymentMethod: "ewallet" },
        driver,
      ),
    ];
    expect(balanceOf(moves, driver)).toBe(0);
    expect(balanceOf(moves, rider)).toBe(0);
  });

  test("accept credits fareShare only — the app fee is never credited to the driver", () => {
    const deltas = acceptDriverDeltas("driver-1", [4950, 4950]);
    expect(deltas).toEqual([
      { userId: "driver-1", type: "ride_earning", amount: 4950 },
      { userId: "driver-1", type: "ride_earning", amount: 4950 },
    ]);
    expect(balanceOf(deltas, "driver-1")).toBe(9900);
    // Zero/negative shares are skipped — no phantom credit.
    expect(acceptDriverDeltas("driver-1", [0, -100])).toEqual([]);
  });
});
