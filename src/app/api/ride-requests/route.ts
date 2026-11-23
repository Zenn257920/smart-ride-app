/**
 * GET  /api/ride-requests — ?mine=1 (created or joined by me),
 *      ?pending=1 (open + future + not rejected by me, for drivers),
 *      ?startLat&startLng&endLat&endLng&departureTime (driver only:
 *      open future requests scored against that trip, best-first —
 *      the offer-ride form's "matching requests" list),
 *      default: all open future requests.
 * POST /api/ride-requests — mirrors the old app's createRideRequest
 *      (database.js 1498-1577). estimatedPrice via
 *      calculatePriceFromCoords, else 7500 + 5% = 7875. Requires
 *      completed-balance >= estimatedPrice, then deducts the prepayment
 *      (ledger 'prepayment') and creates the request (status 'open') plus
 *      the creator's request_passengers row
 *      (fare_share = base, app_fee, total_price = paid_amount = estimated).
 */
import { NextResponse } from "next/server";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  requestPassengers,
  requestRejections,
  rideRequests,
  rides,
  user,
} from "@/db/schema";
import { getSessionUser, jsonError, parseDate, requireRole } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";
import { isFutureDeparture } from "@/lib/money";
import { expireOverdueRequests } from "@/lib/request-expiry";
import {
  scorePendingRequests,
  scoreRequestsAgainstTrip,
  sortPendingByMatch,
} from "@/lib/request-matching";
import { serializeRideRequest } from "@/lib/ride-request-privacy";
import { addTransaction, getBalance } from "@/lib/wallet";

const createRequestSchema = z.object({
  startLabel: z.string().min(1),
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLabel: z.string().min(1),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  departureTime: z.string().min(1),
});

export async function GET(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  // Lazy expiry (no cron): overdue open requests are expired + refunded
  // before any variant reads them, so no list ever shows a request
  // whose departure has already passed.
  await expireOverdueRequests();

  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "1";
  const pending = url.searchParams.get("pending") === "1";
  // Driver-scored variant (offer-ride form): all four coords present.
  const scoredParams = parseScoredQuery(url.searchParams);
  const now = new Date();

  // matchScore / matched ride per request id, filled by the
  // pending and scored variants below; empty for mine/default.
  const matchByRequestId = new Map<
    string,
    { matchScore: number | null; matchedRide: { id: string; startLabel: string; endLabel: string } | null }
  >();

  let requests;
  if (scoredParams) {
    // Driver only (role read from the DB row, never the session copy).
    const roleRow = await requireRole(sessionUser.id, "driver");
    if (!roleRow) {
      return jsonError("ယာဉ်မောင်း အကောင့်ဖြင့်သာ ကိုက်ညီသော တောင်းဆိုမှုများ ကြည့်နိုင်ပါသည်။", 403);
    }
    const rejectedRows = await db
      .select()
      .from(requestRejections)
      .where(eq(requestRejections.driverId, sessionUser.id));
    const rejectedIds = new Set(rejectedRows.map((r) => r.requestId));
    const open = await db
      .select()
      .from(rideRequests)
      .where(
        and(
          eq(rideRequests.status, "open"),
          gt(rideRequests.departureTime, now),
        ),
      )
      .orderBy(asc(rideRequests.departureTime));
    const candidates = open.filter((r) => !rejectedIds.has(r.id));
    const scored = scoreRequestsAgainstTrip(candidates, {
      startLat: scoredParams.startLat,
      startLng: scoredParams.startLng,
      endLat: scoredParams.endLat,
      endLng: scoredParams.endLng,
      departureTime: scoredParams.departureTime,
    });
    requests = scored.map((s) => s.request);
    for (const s of scored) {
      matchByRequestId.set(s.request.id, {
        matchScore: s.matchScore,
        matchedRide: null,
      });
    }
  } else if (mine) {
    const myRows = await db
      .select()
      .from(requestPassengers)
      .where(
        and(
          eq(requestPassengers.passengerId, sessionUser.id),
          eq(requestPassengers.status, "joined"),
        ),
      );
    const ids = [...new Set(myRows.map((r) => r.requestId))];
    const created = await db
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.passengerId, sessionUser.id))
      .orderBy(asc(rideRequests.departureTime));
    const joined =
      ids.length > 0
        ? await db
            .select()
            .from(rideRequests)
            .where(inArray(rideRequests.id, ids))
            .orderBy(asc(rideRequests.departureTime))
        : [];
    const byId = new Map<string, (typeof created)[number]>();
    for (const r of [...created, ...joined]) byId.set(r.id, r);
    requests = [...byId.values()].sort(
      (a, b) => a.departureTime.getTime() - b.departureTime.getTime(),
    );
  } else if (pending) {
    // Driver only (role read from the DB row, never the session copy).
    const roleRow = await requireRole(sessionUser.id, "driver");
    if (!roleRow) {
      return jsonError("ယာဉ်မောင်း အကောင့်ဖြင့်သာ စောင့်ဆိုင်းနေသော တောင်းဆိုမှုများ ကြည့်နိုင်ပါသည်။", 403);
    }
    const rejectedRows = await db
      .select()
      .from(requestRejections)
      .where(eq(requestRejections.driverId, sessionUser.id));
    const rejectedIds = new Set(rejectedRows.map((r) => r.requestId));
    const open = await db
      .select()
      .from(rideRequests)
      .where(
        and(
          eq(rideRequests.status, "open"),
          gt(rideRequests.departureTime, now),
        ),
      )
      .orderBy(asc(rideRequests.departureTime));
    const chronological = open.filter((r) => !rejectedIds.has(r.id));
    // Unified matching: score each open request against the driver's
    // own offered rides that can still take riders (open, future,
    // seats left) and sort best-first. Drivers with no such rides
    // keep the chronological order (all scores null).
    const myRides = await db
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.driverId, sessionUser.id),
          eq(rides.status, "open"),
          gt(rides.seatsAvailable, 0),
          gt(rides.departureTime, now),
        ),
      );
    const scoredMap = scorePendingRequests(chronological, myRides);
    requests = sortPendingByMatch(chronological, scoredMap);
    for (const r of requests) {
      const m = scoredMap.get(r);
      if (m) matchByRequestId.set(r.id, m);
    }
  } else {
    requests = await db
      .select()
      .from(rideRequests)
      .where(
        and(
          eq(rideRequests.status, "open"),
          gt(rideRequests.departureTime, now),
        ),
      )
      .orderBy(asc(rideRequests.departureTime));
  }

  const requestIds = requests.map((r) => r.id);
  const members =
    requestIds.length > 0
      ? await db
          .select()
          .from(requestPassengers)
          .where(
            and(
              inArray(requestPassengers.requestId, requestIds),
              eq(requestPassengers.status, "joined"),
            ),
          )
      : [];
  const memberUserIds = [...new Set(members.map((m) => m.passengerId))];
  const memberUsers =
    memberUserIds.length > 0
      ? await db.select().from(user).where(inArray(user.id, memberUserIds))
      : [];
  const userById = new Map(memberUsers.map((u) => [u.id, u]));
  const membersByRequest = new Map<string, typeof members>();
  for (const m of members) {
    const list = membersByRequest.get(m.requestId) ?? [];
    list.push(m);
    membersByRequest.set(m.requestId, list);
  }

  // C2: passengerPhone is included ONLY for the creator, a joined member,
  // or the driver who accepted the request. List responses only surface
  // open requests to non-members (and ?mine=1 only to creator/members),
  // so the accepted-driver case cannot arise here — see
  // src/lib/ride-request-privacy.ts.
  return NextResponse.json({
    requests: requests.map((r) => {
      const members = membersByRequest.get(r.id) ?? [];
      const match = matchByRequestId.get(r.id);
      return {
        ...serializeRideRequest(r, {
          isCreator: r.passengerId === sessionUser.id,
          isMember: members.some((m) => m.passengerId === sessionUser.id),
          isAcceptedDriver: false,
        }),
        passengers: members.map((m) => ({
          ...m,
          passengerName: userById.get(m.passengerId)?.name ?? "Passenger",
        })),
        // Only the pending / scored variants set these; mine/default
        // leave them null so the UI falls back to chronological display.
        matchScore: match?.matchScore ?? null,
        matchedRide: match?.matchedRide ?? null,
      };
    }),
  });
}

/**
 * Parse the driver-scored variant's query (?startLat&startLng&endLat&
 * endLng&departureTime). Returns null when the coords are absent (the
 * plain list variants) or invalid (400-style: callers send all four
 * coords or none; a half-filled set is treated as absent so the list
 * still works, and the offer-ride form only fetches once it has a
 * complete route).
 */
function parseScoredQuery(params: URLSearchParams): {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  departureTime?: string;
} | null {
  const raw = {
    startLat: params.get("startLat"),
    startLng: params.get("startLng"),
    endLat: params.get("endLat"),
    endLng: params.get("endLng"),
  };
  if (Object.values(raw).every((v) => v == null)) return null;
  const nums = {
    startLat: Number(raw.startLat),
    startLng: Number(raw.startLng),
    endLat: Number(raw.endLat),
    endLng: Number(raw.endLng),
  };
  if (Object.values(nums).some((n) => Number.isNaN(n))) return null;
  if (
    Math.abs(nums.startLat) > 90 ||
    Math.abs(nums.endLat) > 90 ||
    Math.abs(nums.startLng) > 180 ||
    Math.abs(nums.endLng) > 180
  ) {
    return null;
  }
  const departureTime = params.get("departureTime") ?? undefined;
  return { ...nums, departureTime };
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  // Passenger only (role read from the DB row, never the session copy).
  const roleRow = await requireRole(sessionUser.id, "passenger");
  if (!roleRow) {
    return jsonError("ခရီးသည် အကောင့်ဖြင့်သာ တောင်းဆိုမှု ဖန်တီးနိုင်ပါသည်။", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = createRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const data = parsed.data;

  const departureTime = parseDate(data.departureTime);
  if (!departureTime) return jsonError("Invalid departureTime", 400);
  // A6: ride requests cannot be created in the past.
  if (!isFutureDeparture(departureTime)) {
    return jsonError("Departure time must be in the future", 400);
  }

  const priced = routeMatcher.calculatePriceFromCoords(
    data.startLat,
    data.startLng,
    data.endLat,
    data.endLng,
  );
  const baseFare = priced ? priced.price : routeMatcher.DEFAULT_PRICE;
  const appTax = priced
    ? priced.appTax
    : Math.floor(baseFare * routeMatcher.APP_TAX_RATE);
  const estimatedPrice = priced ? priced.passengerCost : baseFare + appTax;

  const balance = await getBalance(sessionUser.id);
  if (balance < estimatedPrice) {
    return jsonError(
      `Wallet Balance Insufficient! Need: ${estimatedPrice.toLocaleString()} Kyats | Remain Balance: ${balance.toLocaleString()} Kyats`,
      409,
    );
  }

  // Ordered sequential writes (no db.transaction() — Neon HTTP driver).
  const [rideRequest] = await db
    .insert(rideRequests)
    .values({
      passengerId: sessionUser.id,
      passengerName: sessionUser.name ?? null,
      passengerPhone:
        (sessionUser as { phone?: string | null }).phone ?? null,
      startLabel: data.startLabel,
      startLat: data.startLat,
      startLng: data.startLng,
      endLabel: data.endLabel,
      endLat: data.endLat,
      endLng: data.endLng,
      departureTime,
      estimatedPrice,
      prepaidAmount: estimatedPrice,
      status: "open",
    })
    .returning();

  await addTransaction({
    userId: sessionUser.id,
    type: "prepayment",
    amount: -estimatedPrice,
    description: `Ride Request: ${data.startLabel} → ${data.endLabel} (Pre-cash)`,
    referenceId: rideRequest.id,
  });

  const [creatorRow] = await db
    .insert(requestPassengers)
    .values({
      requestId: rideRequest.id,
      passengerId: sessionUser.id,
      startLabel: data.startLabel,
      startLat: data.startLat,
      startLng: data.startLng,
      endLabel: data.endLabel,
      endLat: data.endLat,
      endLng: data.endLng,
      fareShare: baseFare,
      appFee: appTax,
      totalPrice: estimatedPrice,
      paidAmount: estimatedPrice,
      status: "joined",
    })
    .returning();

  // C2: the response goes to the creator, who may see their own phone.
  return NextResponse.json(
    {
      request: serializeRideRequest(rideRequest, {
        isCreator: true,
        isMember: true,
        isAcceptedDriver: false,
      }),
      passenger: creatorRow,
    },
    { status: 201 },
  );
}
