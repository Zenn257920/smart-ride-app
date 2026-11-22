import { describe, expect, test } from "vitest";
import {
  canArriveTrip,
  canStartTrip,
  isFreshDriverLocation,
  isLiveTripStatus,
  simulateGuardedTripTransitions,
  tripTransition,
  TRIP_START_EARLY_MINUTES,
} from "../src/lib/trip";

const now = new Date("2026-11-23T10:00:00+06:30");
const soon = new Date("2026-11-23T11:00:00+06:30"); // 1h away
const far = new Date("2026-11-23T15:00:00+06:30"); // 5h away
const past = new Date("2026-11-23T09:00:00+06:30"); // 1h ago

describe("D4: trip state transitions are a one-way chain", () => {
  test("scheduled -> started -> arrived, and nothing else", () => {
    expect(tripTransition("scheduled", "start")).toBe("started");
    expect(tripTransition("started", "arrive")).toBe("arrived");
    expect(tripTransition("scheduled", "arrive")).toBeNull();
    expect(tripTransition("started", "start")).toBeNull();
    expect(tripTransition("arrived", "start")).toBeNull();
    expect(tripTransition("arrived", "arrive")).toBeNull();
    expect(tripTransition("cancelled", "start")).toBeNull();
  });

  test("two racing 'Start trip' taps: exactly one wins", () => {
    expect(simulateGuardedTripTransitions("scheduled", "start", 2)).toEqual({
      succeeded: 1,
      finalStatus: "started",
    });
    expect(simulateGuardedTripTransitions("started", "start", 3)).toEqual({
      succeeded: 0,
      finalStatus: "started",
    });
  });

  test("two racing 'Arrived' taps: exactly one wins", () => {
    expect(simulateGuardedTripTransitions("started", "arrive", 2)).toEqual({
      succeeded: 1,
      finalStatus: "arrived",
    });
  });
});

describe("D4: 'Start trip' gate", () => {
  test("allowed within 2h before departure", () => {
    expect(
      canStartTrip({ status: "open", tripStatus: "scheduled", departureTime: soon }, now),
    ).toEqual({ ok: true });
    expect(
      canStartTrip({ status: "full", tripStatus: "scheduled", departureTime: soon }, now),
    ).toEqual({ ok: true });
  });

  test("allowed after departure (driver is late)", () => {
    expect(
      canStartTrip({ status: "open", tripStatus: "scheduled", departureTime: past }, now),
    ).toEqual({ ok: true });
  });

  test("refused more than 2h before departure", () => {
    const gate = canStartTrip(
      { status: "open", tripStatus: "scheduled", departureTime: far },
      now,
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.error).toContain(String(TRIP_START_EARLY_MINUTES / 60));
    }
  });

  test("refused when already started / ride not live", () => {
    expect(
      canStartTrip({ status: "open", tripStatus: "started", departureTime: soon }, now).ok,
    ).toBe(false);
    expect(
      canStartTrip({ status: "cancelled", tripStatus: "scheduled", departureTime: soon }, now).ok,
    ).toBe(false);
    expect(
      canStartTrip({ status: "completed", tripStatus: "scheduled", departureTime: soon }, now).ok,
    ).toBe(false);
  });
});

describe("D4: 'Arrived' gate and live status", () => {
  test("only a started trip can arrive", () => {
    expect(canArriveTrip("started")).toEqual({ ok: true });
    expect(canArriveTrip("scheduled").ok).toBe(false);
    expect(canArriveTrip("arrived").ok).toBe(false);
  });

  test("started and arrived are live; scheduled is not", () => {
    expect(isLiveTripStatus("started")).toBe(true);
    expect(isLiveTripStatus("arrived")).toBe(true);
    expect(isLiveTripStatus("scheduled")).toBe(false);
  });
});

describe("D4: driver location freshness", () => {
  test("fresh within 30s, stale after", () => {
    const fresh = new Date(now.getTime() - 10 * 1000);
    const stale = new Date(now.getTime() - 31 * 1000);
    expect(isFreshDriverLocation(fresh, now)).toBe(true);
    expect(isFreshDriverLocation(stale, now)).toBe(false);
    expect(isFreshDriverLocation(null, now)).toBe(false);
    expect(isFreshDriverLocation(undefined, now)).toBe(false);
  });

  test("custom max age is honoured", () => {
    const at = new Date(now.getTime() - 45 * 1000);
    expect(isFreshDriverLocation(at, now, 60)).toBe(true);
    expect(isFreshDriverLocation(at, now, 30)).toBe(false);
  });
});
