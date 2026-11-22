/**
 * GET /api/rides/search?startLat&startLng&endLat&endLng&departureTime
 *     &startLabel&endLabel — server-side matching. Loads open rides with
 * free seats, runs routeMatcher.findOptimalMatches and returns the top 5,
 * enriched with match score and the new rider's fair fare.
 */
import { NextResponse } from "next/server";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, rides, user } from "@/db/schema";
import { jsonError } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";

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

  if (openRides.length === 0) return NextResponse.json({ matches: [] });

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
