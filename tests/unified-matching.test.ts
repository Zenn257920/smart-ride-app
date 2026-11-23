import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RouteMatcher } from "../src/lib/matching";
import { expiryRefundDeltas } from "../src/lib/money";
import {
  isRequestFull,
  isWithinRequestMatchWindow,
  MAX_REQUEST_MEMBERS,
  REQUEST_MATCH_MIN_SCORE,
  REQUEST_MATCH_TIME_WINDOW_MINUTES,
  scorePendingRequests,
  scoreRequestAgainstTrip,
  scoreRequestsAgainstTrip,
  shouldExpireRequest,
  sortPendingByMatch,
} from "../src/lib/request-matching";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

// Hledan -> Sule Pagoda (same direction for request and trip).
const HLEDAN = { lat: 16.8247, lng: 96.1248 };
const SULE = { lat: 16.7745, lng: 96.1587 };
const matcher = new RouteMatcher();

function trip(departure: string, start = HLEDAN, end = SULE) {
  return {
    startLat: start.lat,
    startLng: start.lng,
    endLat: end.lat,
    endLng: end.lng,
    departureTime: departure,
  };
}

describe("unified matching constants", () => {
  test("request-match window is ±60 minutes (tighter than search's 120)", () => {
    expect(REQUEST_MATCH_TIME_WINDOW_MINUTES).toBe(60);
    expect(matcher.TIME_WINDOW_MINUTES).toBe(120);
  });

  test("score threshold matches search (> 30)", () => {
    expect(REQUEST_MATCH_MIN_SCORE).toBe(30);
  });

  test("a request holds at most 4 members (accept creates a 4-seat ride)", () => {
    expect(MAX_REQUEST_MEMBERS).toBe(4);
    expect(isRequestFull(3)).toBe(false);
    expect(isRequestFull(4)).toBe(true);
    expect(isRequestFull(5)).toBe(true);
  });
});

describe("request-match time window", () => {
  test("60 minutes apart is inside, 61 minutes is outside", () => {
    const base = "2026-11-24T10:00:00.000Z";
    expect(
      isWithinRequestMatchWindow(base, "2026-11-24T11:00:00.000Z"),
    ).toBe(true);
    expect(
      isWithinRequestMatchWindow(base, "2026-11-24T11:01:00.000Z"),
    ).toBe(false);
    expect(
      isWithinRequestMatchWindow(base, "2026-11-24T09:00:00.000Z"),
    ).toBe(true);
  });

  test("a missing time never blocks a match (matcher convention)", () => {
    expect(isWithinRequestMatchWindow(null, "2026-11-24T10:00:00.000Z")).toBe(true);
    expect(isWithinRequestMatchWindow("2026-11-24T10:00:00.000Z", undefined)).toBe(true);
  });
});

describe("scoreRequestAgainstTrip", () => {
  test("same route 30 minutes apart scores above the threshold", () => {
    const score = scoreRequestAgainstTrip(
      matcher,
      trip("2026-11-24T10:00:00.000Z"),
      trip("2026-11-24T10:30:00.000Z"),
    );
    expect(score).toBeGreaterThan(REQUEST_MATCH_MIN_SCORE);
  });

  test("same route 90 minutes apart scores 0 — the 60-minute gate bites before the matcher's 120", () => {
    // RouteMatcher alone would still score this (its window is 120),
    // so a bare calculateMatchScore must NOT be used for requests.
    expect(
      matcher.calculateMatchScore(
        trip("2026-11-24T10:00:00.000Z"),
        trip("2026-11-24T11:30:00.000Z"),
      ),
    ).toBeGreaterThan(REQUEST_MATCH_MIN_SCORE);
    expect(
      scoreRequestAgainstTrip(
        matcher,
        trip("2026-11-24T10:00:00.000Z"),
        trip("2026-11-24T11:30:00.000Z"),
      ),
    ).toBe(0);
  });

  test("opposite direction scores 0", () => {
    expect(
      scoreRequestAgainstTrip(
        matcher,
        trip("2026-11-24T10:00:00.000Z"),
        trip("2026-11-24T10:00:00.000Z", SULE, HLEDAN),
      ),
    ).toBe(0);
  });
});

describe("scoreRequestsAgainstTrip", () => {
  test("keeps only matches above 30, best-first", () => {
    const scored = scoreRequestsAgainstTrip(
      [
        { ...trip("2026-11-24T11:30:00.000Z"), id: "far-time" },
        { ...trip("2026-11-24T10:05:00.000Z"), id: "near" },
        { ...trip("2026-11-24T10:00:00.000Z", SULE, HLEDAN), id: "opposite" },
      ],
      trip("2026-11-24T10:00:00.000Z"),
    );
    expect(scored.map((s) => s.request.id)).toEqual(["near"]);
    expect(scored[0].matchScore).toBeGreaterThan(30);
    expect(scored[0].matchPercentage).toBe(scored[0].matchScore);
  });
});

describe("pending list sorted by match", () => {
  const rideA = {
    id: "ride-a",
    startLabel: "Hledan",
    endLabel: "Sule",
    ...trip("2026-11-24T10:00:00.000Z"),
  };
  const rideB = {
    id: "ride-b",
    startLabel: "Sule",
    endLabel: "Hledan",
    ...trip("2026-11-24T10:00:00.000Z", SULE, HLEDAN),
  };

  test("each request keeps its best ride; unmatched requests score null", () => {
    const requests = [
      { ...trip("2026-11-24T10:00:00.000Z"), id: "fits-a" },
      { ...trip("2026-11-24T10:00:00.000Z", SULE, HLEDAN), id: "fits-b" },
      { ...trip("2026-11-24T10:00:00.000Z", { lat: 16.9, lng: 96.3 }, { lat: 16.95, lng: 96.35 }), id: "fits-none" },
    ];
    const map = scorePendingRequests(requests, [rideA, rideB]);
    expect(map.get(requests[0])?.matchedRide?.id).toBe("ride-a");
    expect(map.get(requests[0])?.matchScore).toBeGreaterThan(30);
    expect(map.get(requests[1])?.matchedRide?.id).toBe("ride-b");
    expect(map.get(requests[2])?.matchScore).toBeNull();
    expect(map.get(requests[2])?.matchedRide).toBeNull();
  });

  test("best-first; unmatched keep chronological order; no rides keeps order", () => {
    const requests = [
      { ...trip("2026-11-24T10:00:00.000Z", { lat: 16.9, lng: 96.3 }, { lat: 16.95, lng: 96.35 }), id: "no-match-1" },
      { ...trip("2026-11-24T10:00:00.000Z"), id: "match" },
      { ...trip("2026-11-24T10:05:00.000Z", { lat: 16.91, lng: 96.31 }, { lat: 16.96, lng: 96.36 }), id: "no-match-2" },
    ];
    const map = scorePendingRequests(requests, [rideA]);
    expect(sortPendingByMatch(requests, map).map((r) => r.id)).toEqual([
      "match",
      "no-match-1",
      "no-match-2",
    ]);
    const noRides = scorePendingRequests(requests, []);
    expect(sortPendingByMatch(requests, noRides).map((r) => r.id)).toEqual([
      "no-match-1",
      "match",
      "no-match-2",
    ]);
  });
});

describe("lazy expiry", () => {
  test("only an open request past its departure expires", () => {
    const now = new Date("2026-11-24T12:00:00.000Z");
    expect(shouldExpireRequest("open", "2026-11-24T11:00:00.000Z", now)).toBe(true);
    expect(shouldExpireRequest("open", "2026-11-24T12:00:00.000Z", now)).toBe(true);
    expect(shouldExpireRequest("open", "2026-11-24T13:00:00.000Z", now)).toBe(false);
    expect(shouldExpireRequest("accepted", "2026-11-24T11:00:00.000Z", now)).toBe(false);
    expect(shouldExpireRequest("expired", "2026-11-24T11:00:00.000Z", now)).toBe(false);
    expect(shouldExpireRequest("cancelled", "2026-11-24T11:00:00.000Z", now)).toBe(false);
  });

  test("expiry refunds every member's full prepaid amount, nothing else", () => {
    const deltas = expiryRefundDeltas([
      { passengerId: "creator", paidAmount: 8400, totalPrice: 8400 },
      { passengerId: "joiner", paidAmount: 4200, totalPrice: 4200 },
      { passengerId: "free", paidAmount: 0, totalPrice: 0 },
    ]);
    expect(deltas).toEqual([
      { userId: "creator", type: "refund", amount: 8400 },
      { userId: "joiner", type: "refund", amount: 4200 },
    ]);
    // A member whose row has no paidAmount falls back to totalPrice.
    expect(
      expiryRefundDeltas([{ passengerId: "x", totalPrice: 5000 }]),
    ).toEqual([{ userId: "x", type: "refund", amount: 5000 }]);
  });

  test("expiry is exactly-once: guarded open -> expired flip gates the refund", () => {
    const expiry = src("lib/request-expiry.ts");
    // The flip only matches an 'open' row (same pattern as accept's
    // guarded update) and a 0-row result skips the refund entirely.
    expect(expiry).toContain('eq(rideRequests.status, "open")');
    expect(expiry).toContain('set({ status: "expired" })');
    expect(expiry).toContain("if (!flipped) continue");
    expect(expiry).toContain("expiryRefundDeltas");
    // And the read-side mirror never re-expires a non-open row.
    expect(shouldExpireRequest("expired", "2026-11-24T11:00:00.000Z")).toBe(false);
  });

  test("expiry runs lazily at the start of every request-list read", () => {
    const list = src("app/api/ride-requests/route.ts");
    expect(list).toContain("expireOverdueRequests()");
    const dashboard = src("app/api/driver/dashboard/route.ts");
    expect(dashboard).toContain("expireOverdueRequests()");
    // No cron infra was added for this.
    expect(list).not.toContain("vercel/cron");
    expect(dashboard).not.toContain("vercel/cron");
  });
});

describe("search returns joinable requests (piece 1)", () => {
  test("GET /api/rides/search adds requestMatches scored like rides", () => {
    const route = src("app/api/rides/search/route.ts");
    expect(route).toContain("requestMatches");
    expect(route).toContain("scoreRequestsAgainstTrip");
    // The ±60-minute window lives in the shared helper the route calls.
    expect(src("lib/request-matching.ts")).toContain(
      "REQUEST_MATCH_TIME_WINDOW_MINUTES = 60",
    );
    // Exclusions: own requests, already-joined, full requests.
    expect(route).toContain("r.passengerId === input.userId");
    expect(route).toContain("isRequestFull");
    expect(route).toContain("joined.some((m) => m.passengerId === input.userId)");
    // Only open + future requests are considered.
    expect(route).toContain('eq(rideRequests.status, "open")');
    expect(route).toContain("gt(rideRequests.departureTime, new Date())");
    // Serialized like the ride-requests list (phone stripped for viewers).
    expect(route).toContain("serializeRideRequest");
    // Still returned when there are no offered rides at all.
    expect(route).toContain("return NextResponse.json({ matches: [], requestMatches })");
  });

  test("find-ride shows the request section with Join buttons", () => {
    const page = src("app/find-ride/page.tsx");
    expect(page).toContain("လမ်းကြောင်းတူ တောင်းဆိုမှုများ");
    expect(page).toContain("requestMatches");
    expect(page).toContain("`/api/ride-requests/${req.id}/join`");
  });
});

describe("request creation checks offers first (piece 2)", () => {
  test("create form searches offered rides before creating, never blocks", () => {
    const page = src("app/ride-requests/page.tsx");
    expect(page).toContain("/api/rides/search?");
    expect(page).toContain("ဒီ ride ရှိနေပြီ — Book လုပ်မလား?");
    expect(page).toContain("Book လုပ်မယ်");
    // The "create anyway" path skips the check via force=true.
    expect(page).toContain("createRequest(e, true)");
    expect(page).toContain("force = false");
    expect(page).toContain("BookingModal");
  });
});

describe("offer creation shows matching requests (piece 3)", () => {
  test("GET /api/ride-requests scored variant is driver-only, best-first", () => {
    const route = src("app/api/ride-requests/route.ts");
    expect(route).toContain("parseScoredQuery");
    expect(route).toContain('requireRole(sessionUser.id, "driver")');
    expect(route).toContain("scoreRequestsAgainstTrip");
    expect(route).toContain("matchScore");
  });

  test("offer-ride form fetches matching requests and accepts via the existing endpoint", () => {
    const page = src("app/offer-ride/page.tsx");
    expect(page).toContain("/api/ride-requests?");
    expect(page).toContain("ဒီလမ်းကြောင်းနဲ့ ကိုက်တဲ့ တောင်းဆိုမှုများ");
    expect(page).toContain("`/api/ride-requests/${req.id}/accept`");
  });
});

describe("driver pending list sorted by match (piece 4)", () => {
  test("?pending=1 scores against the driver's own open rides", () => {
    const route = src("app/api/ride-requests/route.ts");
    expect(route).toContain("scorePendingRequests");
    expect(route).toContain("sortPendingByMatch");
    expect(route).toContain("matchedRide");
  });

  test("driver dashboard carries the same scoring and shows the reason", () => {
    const route = src("app/api/driver/dashboard/route.ts");
    expect(route).toContain("scorePendingRequests");
    expect(route).toContain("sortPendingByMatch");
    const page = src("app/driver/dashboard/page.tsx");
    expect(page).toContain("ride နဲ့");
    expect(page).toContain("% ကိုက်တယ်");
    expect(page).toContain("matchedRide");
  });
});

describe("join capacity (accept-created ride has 4 seats)", () => {
  test("join refuses a 5th member with 409", () => {
    const route = src("app/api/ride-requests/[id]/join/route.ts");
    expect(route).toContain("MAX_REQUEST_MEMBERS");
    expect(route).toContain("existingMembers.length >= MAX_REQUEST_MEMBERS");
    expect(route).toContain("already full (4 riders)");
    expect(route).toContain("409");
  });
});

describe("notifications for the new connections (piece 6)", () => {
  test("publishing an offer notifies matching request members", () => {
    const route = src("app/api/rides/route.ts");
    expect(route).toContain("notifyMatchingRequests");
    expect(route).toContain("မင်းလမ်းကြောင်းမှာ ride အသစ်ရှိပြီ");
    expect(route).toContain("scoreRequestsAgainstTrip");
    // Every joined member (creator + joiners), not just the creator.
    expect(route).toContain("requestPassengers");
  });

  test("accept still creates the ride + bookings + driver credit and notifies ALL members", () => {
    const accept = src("app/api/ride-requests/[id]/accept/route.ts");
    expect(accept).toContain("seatsTotal: 4");
    expect(accept).toContain("acceptDriverDeltas");
    expect(accept).toContain("paymentMethod: \"ewallet\"");
    expect(accept).toContain("driverPayment: member.fareShare");
    // One notification per member, in a loop over all members.
    expect(accept).toContain("for (const member of members)");
    expect(accept).toContain("notifyUser(");
    // Guarded accept so the driver is never double-credited.
    expect(accept).toContain('eq(rideRequests.status, "open")');
  });
});
