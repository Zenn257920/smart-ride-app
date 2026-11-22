/**
 * GET  /api/ride-requests — ?mine=1 (created or joined by me),
 *      ?pending=1 (open + future + not rejected by me, for drivers),
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
  user,
} from "@/db/schema";
import { getSessionUser, jsonError, parseDate } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";
import { isFutureDeparture } from "@/lib/money";
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

  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "1";
  const pending = url.searchParams.get("pending") === "1";
  const now = new Date();

  let requests;
  if (mine) {
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
    requests = open.filter((r) => !rejectedIds.has(r.id));
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
      };
    }),
  });
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

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
