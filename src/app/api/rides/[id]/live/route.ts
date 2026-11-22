/**
 * GET /api/rides/:id/live — D4: the passenger live view. Returns the
 * trip state and the driver's latest position for ONE ride.
 *
 * Scoped to the ride's parties only: the driver, or a passenger with
 * a 'confirmed' or 'completed' booking on the ride. Anyone else gets
 * 403 — a stranger must not be able to track a driver. The location
 * is only meaningful while the trip is 'started'/'arrived'; before
 * that the fields are null and `fresh` is false.
 */
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, rides, user } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { isFreshDriverLocation, isLiveTripStatus } from "@/lib/trip";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!ride) return jsonError("Ride not found", 404);

  const isDriver = ride.driverId === sessionUser.id;
  let isPassenger = false;
  if (!isDriver) {
    const [mine] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.rideId, rideId),
          eq(bookings.passengerId, sessionUser.id),
          inArray(bookings.status, ["confirmed", "completed"]),
        ),
      )
      .limit(1);
    isPassenger = !!mine;
  }
  if (!isDriver && !isPassenger) {
    return jsonError("Only the driver and passengers of this ride can view it live", 403);
  }

  const [driver] = await db
    .select()
    .from(user)
    .where(eq(user.id, ride.driverId))
    .limit(1);

  return NextResponse.json({
    rideId: ride.id,
    status: ride.status,
    tripStatus: ride.tripStatus,
    isLive: isLiveTripStatus(ride.tripStatus),
    driverName: driver?.name ?? "Driver",
    driverLat: ride.driverLat ?? null,
    driverLng: ride.driverLng ?? null,
    driverLocationAt: ride.driverLocationAt ?? null,
    locationFresh: isFreshDriverLocation(ride.driverLocationAt),
    departureTime: ride.departureTime,
    startLabel: ride.startLabel,
    startLat: ride.startLat,
    startLng: ride.startLng,
    endLabel: ride.endLabel,
    endLat: ride.endLat,
    endLng: ride.endLng,
    routeCoordinates: ride.routeCoordinates ?? null,
  });
}
