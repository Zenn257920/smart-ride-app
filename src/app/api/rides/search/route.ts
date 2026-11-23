/**
 * GET /api/rides/search?startLat&startLng&endLat&endLng&departureTime
 *     &startLabel&endLabel — server-side matching. Loads open rides with
 * free seats, runs routeMatcher.findOptimalMatches and returns the top 5,
 * enriched with match score and the new rider's fair fare.
 *
 * Unified matching: the same search ALSO returns `requestMatches` —
 * open, future ride_requests on the same route/time that the searcher
 * can join (a request and an offer are two sides of the same trip).
 * A request matches when RouteMatcher scores it > 30 against the
 * searched trip AND its departure is within ±60 minutes
 * (REQUEST_MATCH_TIME_WINDOW_MINUTES in src/lib/request-matching —
 * tighter than the matcher's own 120-minute window). Excluded: the
 * searcher's own requests, requests they already joined, non-open or
 * past-departure requests, and full requests (4 joined members — the
 * accept-created ride has seats_total 4).
 *
 * C3: auth is required (the find-ride page is behind AuthGuard and
 * fetches with credentials: include, so the session cookie is sent),
 * and each IP gets 30 req/min. Not cached — results depend on live
 * seats and bookings.
 */
import { NextResponse } from "next/server";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, requestPassengers, rideRequests, rides, user } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";
import { rateLimitResponse } from "@/lib/rate-limit";
import {
  isRequestFull,
  scoreRequestsAgainstTrip,
} from "@/lib/request-matching";
import { serializeRideRequest } from "@/lib/ride-request-privacy";

const searchQuerySchema = z.object({
  startLat: z.coerce.number().min(-90).max(90),
  startLng: z.coerce.number().min(-180).max(180),
  endLat: z.coerce.number().min(-90).max(90),
  endLng: z.coerce.number().min(-180).max(180),
  departureTime: z.string().optional(),
  startLabel: z.string().optional(),
  endLabel: z.string().optional(),
});

export async function GET(request: Request) {
  const limited = rateLimitResponse(request, "search");
  if (limited) return limited;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const url = new URL(request.url);
  const parsed = searchQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const q = parsed.data;

  const departureTime = q.departureTime
    ? new Date(q.departureTime)
    : undefined;
  if (departureTime && Number.isNaN(departureTime.getTime())) {
    return jsonError("Invalid departureTime", 400);
  }

  const openRides = await db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.status, "open"),
        gt(rides.seatsAvailable, 0),
        gt(rides.departureTime, new Date()),
      ),
    )
    .orderBy(asc(rides.departureTime));

  // Unified matching: joinable open requests on the same route/time.
  // Runs even when there are no offered rides — a request match must
  // not depend on an offer existing.
  const requestMatches = await findJoinableRequests({
    userId: sessionUser.id,
    startLat: q.startLat,
    startLng: q.startLng,
    endLat: q.endLat,
    endLng: q.endLng,
    departureTime: departureTime?.toISOString(),
  });

  if (openRides.length === 0) {
    return NextResponse.json({ matches: [], requestMatches });
  }

  // Confirmed bookings per ride, so the matcher can price the new rider
  // against the passengers already on board. Bookings store no coordinates,
  // so each existing passenger is treated as riding the driver's full route
  // (matching.ts falls back to the ride's own coords for such passengers).
  const rideIds = openRides.map((r) => r.id);
  const confirmed = await db
    .select()
    .from(bookings)
    .where(
      and(
        inArray(bookings.rideId, rideIds),
        eq(bookings.status, "confirmed"),
      ),
    );
  const bookingsByRide = new Map<string, typeof confirmed>();
  for (const b of confirmed) {
    const list = bookingsByRide.get(b.rideId) ?? [];
    list.push(b);
    bookingsByRide.set(b.rideId, list);
  }

  const driverIds = [...new Set(openRides.map((r) => r.driverId))];
  const driverUsers = await db
    .select()
    .from(user)
    .where(inArray(user.id, driverIds));
  const userById = new Map(driverUsers.map((u) => [u.id, u]));

  const matches = routeMatcher.findOptimalMatches(
    {
      startLat: q.startLat,
      startLng: q.startLng,
      endLat: q.endLat,
      endLng: q.endLng,
      departureTime: departureTime?.toISOString(),
    },
    openRides.map((r) => ({
      id: r.id,
      startLat: r.startLat,
      startLng: r.startLng,
      endLat: r.endLat,
      endLng: r.endLng,
      departureTime: r.departureTime.toISOString(),
      price: r.price ?? undefined,
      distanceKm: r.distanceKm ?? undefined,
      routeCoordinates: (r.routeCoordinates as Array<[number, number]> | null) ?? undefined,
      passengers: (bookingsByRide.get(r.id) ?? []).map((b) => ({
        id: b.passengerId,
        passengerId: b.passengerId,
        startLat: r.startLat,
        startLng: r.startLng,
        endLat: r.endLat,
        endLng: r.endLng,
      })),
    })),
  );

  const rideById = new Map(openRides.map((r) => [r.id, r]));

  return NextResponse.json({
    requestMatches,
    matches: matches.map((m) => {
      const ride = rideById.get(m.id as string);
      return {
        ride: ride ?? null,
        driverName: ride ? (userById.get(ride.driverId)?.name ?? "Driver") : null,
        carModel: ride?.carModel ?? null,
        carPlate: ride?.carPlate ?? null,
        seatsAvailable: ride?.seatsAvailable ?? 0,
        departureTime: ride?.departureTime ?? null,
        matchScore: m.matchScore,
        matchPercentage: m.matchPercentage,
        fareShare: m.fareShare,
        appCommissionPerPassenger: m.appCommissionPerPassenger,
        discountedPrice: m.discountedPrice,
        savings: m.savings,
        savingsPercentage: m.savingsPercentage,
        passengerDistanceKm: m.passengerDistanceKm,
        totalPassengers: m.totalPassengers,
        isFirstRider: m.isFirstRider,
      };
    }),
  });
}

/**
 * Open, future ride requests the searcher can join on the searched
 * route/time, best match first (top 5). The searcher is the
 * "passenger" side and each request the "driver" side of the matcher
 * — the corridor is symmetric here (same A → B, same direction), so
 * scoring request-vs-searched-trip is the same comparison as
 * searched-trip-vs-offer.
 *
 * Excluded: the searcher's own requests, requests they already
 * joined, and full requests (4 joined members). Serialized like the
 * ride-requests list (C2: the viewer is neither creator nor member
 * of these rows, so passengerPhone is stripped).
 */
async function findJoinableRequests(input: {
  userId: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  departureTime?: string;
}) {
  const open = await db
    .select()
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.status, "open"),
        gt(rideRequests.departureTime, new Date()),
      ),
    )
    .orderBy(asc(rideRequests.departureTime));
  if (open.length === 0) return [];

  const ids = open.map((r) => r.id);
  const members = await db
    .select()
    .from(requestPassengers)
    .where(
      and(
        inArray(requestPassengers.requestId, ids),
        eq(requestPassengers.status, "joined"),
      ),
    );
  const membersByRequest = new Map<string, typeof members>();
  for (const m of members) {
    const list = membersByRequest.get(m.requestId) ?? [];
    list.push(m);
    membersByRequest.set(m.requestId, list);
  }
  const memberUserIds = [...new Set(members.map((m) => m.passengerId))];
  const memberUsers =
    memberUserIds.length > 0
      ? await db.select().from(user).where(inArray(user.id, memberUserIds))
      : [];
  const userById = new Map(memberUsers.map((u) => [u.id, u]));

  const joinable = open.filter((r) => {
    if (r.passengerId === input.userId) return false;
    const joined = membersByRequest.get(r.id) ?? [];
    if (joined.some((m) => m.passengerId === input.userId)) return false;
    if (isRequestFull(joined.length)) return false;
    return true;
  });

  const scored = scoreRequestsAgainstTrip(
    joinable,
    {
      startLat: input.startLat,
      startLng: input.startLng,
      endLat: input.endLat,
      endLng: input.endLng,
      departureTime: input.departureTime,
    },
  ).slice(0, 5);

  return scored.map(({ request, matchScore, matchPercentage }) => {
    const reqMembers = membersByRequest.get(request.id) ?? [];
    return {
      ...serializeRideRequest(request, {
        isCreator: false,
        isMember: false,
        isAcceptedDriver: false,
      }),
      passengers: reqMembers.map((m) => ({
        ...m,
        passengerName: userById.get(m.passengerId)?.name ?? "Passenger",
      })),
      memberCount: reqMembers.length,
      seatsLeft: 4 - reqMembers.length,
      matchScore,
      matchPercentage,
    };
  });
}
