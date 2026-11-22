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
