/**
 * POST /api/rides/:id/trip — D4: the driver moves the trip through its
 * in-trip states: { action: "start" } (scheduled -> started) or
 * { action: "arrive" } (started -> arrived).
 *
 * Rules (see src/lib/trip.ts):
 * - Only the ride's driver, only for rides still 'open'/'full'.
 * - "Start trip" only within 2 hours before departure (a driver may
 *   leave a little early for pickup, but may not start a trip days
 *   ahead); starting after departure is allowed — the driver may be
 *   late. "Arrived" only after "Start trip".
 * - The transition is GUARDED (conditional UPDATE on the current
 *   trip_status, affected-row count decides — same pattern as the
 *   guarded accept/cancel): two concurrent "Start trip" taps start
 *   the trip once and notify passengers once.
 * - Passengers with confirmed bookings are notified on both steps,
 *   so the in-app bell (D7) covers trip events too.
 * - 'arrived' is a trip state, not a settlement: the ride stays
 *   open/full until the driver marks it completed (D1).
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, rides } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { canArriveTrip, canStartTrip, tripTransition } from "@/lib/trip";
import { notifyUser } from "@/lib/notify";

const tripSchema = z.object({
  action: z.enum(["start", "arrive"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = tripSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { action } = parsed.data;

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!ride) return jsonError("Ride not found", 404);
  if (ride.driverId !== sessionUser.id) {
    return jsonError("Only the driver can update the trip", 403);
  }

  const next = tripTransition(ride.tripStatus, action);
  if (next === null) {
    return jsonError(
      action === "start"
        ? ride.tripStatus === "started"
          ? "Trip has already started"
          : `Trip is already ${ride.tripStatus}`
        : ride.tripStatus === "arrived"
          ? "Trip has already arrived"
          : "Trip has not started yet",
      409,
    );
  }
  if (action === "start") {
    const gate = canStartTrip(ride);
    if (!gate.ok) return jsonError(gate.error, 409);
  } else {
    const gate = canArriveTrip(ride.tripStatus);
    if (!gate.ok) return jsonError(gate.error, 409);
  }

  // Guarded transition: only the current trip_status becomes `next`.
  // A concurrent tap that already moved the trip gets 0 rows here.
  const [updated] = await db
    .update(rides)
    .set({ tripStatus: next })
    .where(
      and(
        eq(rides.id, rideId),
        eq(rides.tripStatus, ride.tripStatus),
      ),
    )
    .returning();
  if (!updated) {
    return jsonError("Trip was already updated — please refresh", 409);
  }

  const confirmed = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.rideId, rideId), eq(bookings.status, "confirmed")),
    );
  for (const booking of confirmed) {
    await notifyUser(
      booking.passengerId,
      action === "start"
        ? `Your driver has started the trip "${ride.startLabel} → ${ride.endLabel}". You can follow the trip live in My Rides.`
        : `Your driver has arrived at "${ride.endLabel}".`,
      "trip",
    );
  }

  return NextResponse.json({ ride: updated, tripStatus: next });
}
