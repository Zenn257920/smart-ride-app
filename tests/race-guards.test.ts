import { describe, expect, test } from "vitest";
import {
  extractIdempotencyKey,
  isValidIdempotencyKey,
  memoryIdempotencyStore,
  runIdempotent,
  IN_FLIGHT_ERROR,
  type StoredResponse,
} from "../src/lib/idempotency";
import {
  guardedDecrement,
  isDuplicateConfirmedBooking,
  isOwnRide,
  simulateGuardedDecrements,
  withdrawWouldOverdraw,
} from "../src/lib/race-guards";
import { createRateLimiter, createTtlCache } from "../src/lib/rate-limit";

describe("A3: guarded seat decrement can never go below zero", () => {
  test("one seat, two racing attempts: exactly one succeeds, zero left", () => {
    const res = simulateGuardedDecrements(1, 2);
    expect(res).toEqual({ succeeded: 1, finalSeats: 0 });
  });

  test("three seats, five racing attempts: three succeed, zero left", () => {
    const res = simulateGuardedDecrements(3, 5);
    expect(res).toEqual({ succeeded: 3, finalSeats: 0 });
  });

  test("zero seats: no attempt succeeds, count stays zero (never negative)", () => {
    const res = simulateGuardedDecrements(0, 3);
    expect(res).toEqual({ succeeded: 0, finalSeats: 0 });
  });

  test("guardedDecrement mirrors the SQL guard `WHERE seats_available > 0`", () => {
    expect(guardedDecrement(2)).toBe(1);
    expect(guardedDecrement(1)).toBe(0);
    expect(guardedDecrement(0)).toBeNull();
    expect(guardedDecrement(-1)).toBeNull();
  });

  test("a plain check-then-write would overbook — the guard is what stops it", () => {
    // Two requests both read seats=1 before either writes: both pass
    // the check, so a check-then-write books twice. The guarded update
    // only lets the first through (proven by the simulations above).
    const bothPassedTheReadCheck = 1 > 0 && 1 > 0;
    expect(bothPassedTheReadCheck).toBe(true);
    expect(simulateGuardedDecrements(1, 2).succeeded).toBe(1);
  });
});

describe("A3: duplicate confirmed booking is rejected", () => {
  const existing = [
    { rideId: "ride-1", passengerId: "rider-1", status: "confirmed" },
    { rideId: "ride-1", passengerId: "rider-2", status: "cancelled" },
    { rideId: "ride-2", passengerId: "rider-1", status: "confirmed" },
  ];

  test("same passenger, same ride, confirmed -> duplicate", () => {
    expect(isDuplicateConfirmedBooking(existing, "ride-1", "rider-1")).toBe(true);
  });

  test("cancelled booking does not block a re-book", () => {
    expect(isDuplicateConfirmedBooking(existing, "ride-1", "rider-2")).toBe(false);
  });

  test("same passenger on a different ride is fine", () => {
    expect(isDuplicateConfirmedBooking(existing, "ride-3", "rider-1")).toBe(false);
  });

  test("a different passenger on the same ride is fine", () => {
    expect(isDuplicateConfirmedBooking(existing, "ride-2", "rider-2")).toBe(false);
  });
});

describe("A3: driver cannot book their own ride", () => {
  test("driver id equals booking user id -> own ride", () => {
    expect(isOwnRide("driver-1", "driver-1")).toBe(true);
  });

  test("any other user may book", () => {
    expect(isOwnRide("driver-1", "rider-9")).toBe(false);
  });
});

describe("A3: idempotency — double-submit charges once", () => {
  // Ledger model: balance = SUM(amount), as in the real wallet.
  function runDoubleSubmit() {
    const ledger: number[] = [];
    const store = memoryIdempotencyStore();
    const charge = async (): Promise<StoredResponse> => {
      ledger.push(-5197); // ride_payment
      ledger.push(4950); // ride_earning (different user, same ledger model)
      return { status: 201, body: { booking: { id: "b1" } } };
    };
    return { ledger, store, charge };
  }

  test("same key twice: the charge runs once, second call replays the stored 201", async () => {
    const { ledger, store, charge } = runDoubleSubmit();
    const first = await runIdempotent(store, "key-1", charge);
    const second = await runIdempotent(store, "key-1", charge);
    expect(first.replayed).toBe(false);
    expect(first.response.status).toBe(201);
    expect(second.replayed).toBe(true);
    expect(second.response).toEqual(first.response);
    expect(ledger).toEqual([-5197, 4950]);
  });

  test("different keys are different operations: both charge", async () => {
    const { ledger, store, charge } = runDoubleSubmit();
    await runIdempotent(store, "key-1", charge);
    await runIdempotent(store, "key-2", charge);
    expect(ledger).toEqual([-5197, 4950, -5197, 4950]);
  });

  test("withdraw double-submit with the same key withdraws once", async () => {
    const ledger: number[] = [50_000];
    const store = memoryIdempotencyStore();
    let runs = 0;
    const withdraw = async (): Promise<StoredResponse> => {
      runs++;
      ledger.push(-10_000);
      return { status: 201, body: { balance: 40_000 } };
    };
    const first = await runIdempotent(store, "wd-1", withdraw);
    const second = await runIdempotent(store, "wd-1", withdraw);
    expect(runs).toBe(1);
    expect(ledger).toEqual([50_000, -10_000]);
    expect(second.replayed).toBe(true);
    expect(second.response.body).toEqual({ balance: 40_000 });
    expect(first.response.body).toEqual(second.response.body);
  });

  test("a failed (4xx) result is NOT stored: the retry re-runs", async () => {
    const store = memoryIdempotencyStore();
    let runs = 0;
    const attempt = async (): Promise<StoredResponse> => {
      runs++;
      return runs === 1
        ? { status: 409, body: { error: "Insufficient Balance" } }
        : { status: 201, body: { ok: true } };
    };
    const first = await runIdempotent(store, "key-9", attempt);
    expect(first.response.status).toBe(409);
    expect(first.replayed).toBe(false);
    const second = await runIdempotent(store, "key-9", attempt);
    expect(second.response.status).toBe(201);
    expect(second.replayed).toBe(false);
    expect(runs).toBe(2);
  });

  test("a duplicate arriving while the first is in flight gets 409, not a second charge", async () => {
    const store = memoryIdempotencyStore();
    expect(await store.claim("key-inflight")).toBe(true);
    let runs = 0;
    const res = await runIdempotent(store, "key-inflight", async () => {
      runs++;
      return { status: 201, body: {} };
    });
    expect(res.response.status).toBe(409);
    expect(res.response.body).toEqual({ error: IN_FLIGHT_ERROR });
    expect(runs).toBe(0);
  });

  test("a crashed attempt releases the claim so the retry can proceed", async () => {
    const store = memoryIdempotencyStore();
    let runs = 0;
    const flaky = async (): Promise<StoredResponse> => {
      runs++;
      if (runs === 1) throw new Error("boom");
      return { status: 201, body: { ok: true } };
    };
    await expect(runIdempotent(store, "key-crash", flaky)).rejects.toThrow("boom");
    const retry = await runIdempotent(store, "key-crash", flaky);
    expect(retry.response.status).toBe(201);
    expect(retry.replayed).toBe(false);
    expect(runs).toBe(2);
  });

  test("no key: plain passthrough, every call runs", async () => {
    let runs = 0;
    const fn = async (): Promise<StoredResponse> => {
      runs++;
      return { status: 201, body: {} };
    };
    await runIdempotent(null, null, fn);
    await runIdempotent(memoryIdempotencyStore(), null, fn);
    expect(runs).toBe(2);
  });
});

describe("A3: idempotency key extraction + validation", () => {
  test("header wins over the body field", () => {
    const req = new Request("http://x/", {
      headers: { "Idempotency-Key": "header-key-123" },
    });
    expect(extractIdempotencyKey(req, { idempotencyKey: "body-key-123" })).toBe(
      "header-key-123",
    );
  });

  test("body field is the fallback, absent key is null", () => {
    const req = new Request("http://x/");
    expect(extractIdempotencyKey(req, { idempotencyKey: "body-key-123" })).toBe(
      "body-key-123",
    );
    expect(extractIdempotencyKey(req, {})).toBeNull();
  });

  test("keys must be 8-128 token chars", () => {
    expect(isValidIdempotencyKey("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("has space in it")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(129))).toBe(false);
  });
});

describe("A3: withdraw post-write overdraw guard", () => {
  test("balance 50,000, withdraw 10,000 -> fine", () => {
    expect(withdrawWouldOverdraw(50_000, 10_000)).toBe(false);
  });

  test("balance 5,000, withdraw 10,000 -> overdraws", () => {
    expect(withdrawWouldOverdraw(5_000, 10_000)).toBe(true);
  });

  test("post-write check: balance already negative after a racing withdrawal -> overdrawn", () => {
    // Two 40,000 withdrawals raced past the pre-check on a 50,000
    // balance; after the second insert the balance reads -30,000.
    expect(withdrawWouldOverdraw(-30_000, 0)).toBe(true);
    expect(withdrawWouldOverdraw(10_000, 0)).toBe(false);
  });
});

describe("C3: per-IP fixed-window rate limiter", () => {
  const LIMIT = { windowMs: 60_000, max: 30 };

  test("30 requests allowed, 31st blocked with a retry-after", () => {
    const limiter = createRateLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) {
      const res = limiter.check("geocode:1.2.3.4", LIMIT, now);
      expect(res.allowed).toBe(true);
    }
    const blocked = limiter.check("geocode:1.2.3.4", LIMIT, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    expect(blocked.remaining).toBe(0);
  });

  test("the window resets after expiry", () => {
    const limiter = createRateLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) limiter.check("ip-a", LIMIT, now);
    expect(limiter.check("ip-a", LIMIT, now).allowed).toBe(false);
    const after = limiter.check("ip-a", LIMIT, now + 60_001);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(29);
  });

  test("different IPs have independent counters", () => {
    const limiter = createRateLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) limiter.check("ip-a", LIMIT, now);
    expect(limiter.check("ip-a", LIMIT, now).allowed).toBe(false);
    expect(limiter.check("ip-b", LIMIT, now).allowed).toBe(true);
  });
});

describe("C3: TTL cache for geocode/route results", () => {
  test("value is returned before expiry, gone after", () => {
    const cache = createTtlCache<string>(10 * 60 * 1000);
    const now = 5_000_000;
    cache.set("sule", "hit", now);
    expect(cache.get("sule", now + 9 * 60 * 1000)).toBe("hit");
    expect(cache.get("sule", now + 10 * 60 * 1000 + 1)).toBeUndefined();
  });

  test("different keys are independent", () => {
    const cache = createTtlCache<number>(60_000);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    expect(cache.get("a", 1000)).toBe(1);
    expect(cache.get("b", 1000)).toBe(2);
    expect(cache.get("c", 1000)).toBeUndefined();
  });
});
