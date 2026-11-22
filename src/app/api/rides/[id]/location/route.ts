/**
 * POST /api/rides/:id/location — D4: the driver posts their position
 * while a trip is under way. The client posts every ~10s from the
 * driver dashboard while a trip is 'started'.
 *
 * The update is conditional on trip_status = 'started' — a location
 * posted before the trip starts (or after it arrived) is rejected
 * with 409 instead of silently storing a stale point. Only the latest
 * position is kept on the rides row (see src/lib/trip.ts); the
 * passenger live view reads it from GET /api/rides/:id/live.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { rides } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = locationSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!ride) return jsonError("Ride not found", 404);
  if (ride.driverId !== sessionUser.id) {
    return jsonError("Only the driver can update the location", 403);
  }

  const [updated] = await db
    .update(rides)
    .set({
      driverLat: parsed.data.lat,
      driverLng: parsed.data.lng,
      driverLocationAt: new Date(),
    })
    .where(
      and(eq(rides.id, rideId), eq(rides.tripStatus, "started")),
    )
    .returning();
  if (!updated) {
    return jsonError(
      ride.tripStatus === "scheduled"
        ? "Trip has not started yet — start the trip before sharing your location"
        : `Trip is already ${ride.tripStatus}`,
      409,
    );
  }

  return NextResponse.json({
    rideId,
    driverLat: updated.driverLat,
    driverLng: updated.driverLng,
    driverLocationAt: updated.driverLocationAt,
  });
}
