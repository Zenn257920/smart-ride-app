import test from "node:test";
import assert from "node:assert/strict";
import { RouteMatcher } from "../src/js/matching.js";

test("shared ride pricing splits the route price by each passenger distance", () => {
  const matcher = new RouteMatcher();
  const breakdowns = matcher.calculateFairPriceBreakdown(6500, [10, 2]);

  assert.equal(breakdowns.length, 2);
  assert.equal(breakdowns[0].fareShare, 4000);
  assert.equal(breakdowns[0].appCommissionPerPassenger, 200);
  assert.equal(breakdowns[0].passengerPrice, 4200);
  assert.equal(breakdowns[1].fareShare, 2500);
  assert.equal(breakdowns[1].appCommissionPerPassenger, 125);
  assert.equal(breakdowns[1].passengerPrice, 2625);
});

test("single passenger keeps the full distance-based cost with app tax", () => {
  const matcher = new RouteMatcher();
  const breakdowns = matcher.calculateFairPriceBreakdown(6500, [10]);

  assert.equal(breakdowns[0].fareShare, 6500);
  assert.equal(breakdowns[0].appCommissionPerPassenger, 325);
  assert.equal(breakdowns[0].passengerPrice, 6825);
});
