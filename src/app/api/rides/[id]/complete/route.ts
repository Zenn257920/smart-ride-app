/**
 * POST /api/rides/:id/complete — D1: driver marks a ride completed.
 *
 * Body: { noShowBookingIds?: string[] } — confirmed bookings of this
 * ride whose passenger did not show up.
 *
 * Rules (see src/lib/money, "D1 — complete-ride settlement"):
 * - Only the ride's driver, only for rides still 'open'/'full', and
 *   only AFTER the departure time (canCompleteRide). A second call
 *   fails because the ride is then 'completed'.
 * - Settlement credits NOTHING: the driver was already credited
 *   fareShare at book/accept time for every e-wallet booking, and cash
 *   never touches the ledger. Completion is a status transition only
 *   (ride -> 'completed', rode bookings -> 'completed'), so it can
 *   never double-pay the driver. settleRideCompletion returns the
 *   (always empty) delta list as the guard.
 * - No-show rule: a no-show passenger is NOT refunded — the driver
 *   keeps the fareShare already credited, because the seat was held
 *   and the driver turned up. The booking is marked 'no_show' (not
 *   'completed') so it can never be cancelled or rated afterwards.
 *   This differs deliberately from cancel (full refund), which is
 *   only possible BEFORE departure.
 * - The app fee stays where it always was: bookings.app_fee per
 *   booking. No second fee is recorded anywhere.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, rides } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { canCompleteRide, settleRideCompletion } from "@/lib/money";
import { notifyUser } from "@/lib/notify";

const completeSchema = z.object({
  noShowBookingIds: z.array(z.string().min(1)).max(10).optional().default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = completeSchema.safeParse(body ?? {});
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
    return jsonError("Only the driver can complete this ride", 403);
  }

  const gate = canCompleteRide(ride);
  if (!gate.ok) return jsonError(gate.error, 409);

  const confirmed = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.rideId, rideId), eq(bookings.status, "confirmed")),
    );

  // Settlement: status split only — deltas is always [] (driver already
  // credited at book/accept; see the money.ts state machine). If this
  // ever stops being empty, the route must apply the deltas here.
  const settlement = settleRideCompletion(confirmed, parsed.data.noShowBookingIds);
  if (settlement.deltas.length > 0) {
    return jsonError("Settlement produced unexpected ledger moves — refusing to complete", 500);
  }

  await db
    .update(rides)
    .set({ status: "completed" })
    .where(eq(rides.id, rideId));

  for (const bookingId of settlement.completedIds) {
    await db
      .update(bookings)
      .set({ status: "completed" })
      .where(eq(bookings.id, bookingId));
  }
  for (const bookingId of settlement.noShowIds) {
    await db
      .update(bookings)
      .set({ status: "no_show" })
      .where(eq(bookings.id, bookingId));
  }

  for (const booking of confirmed) {
    const rode = settlement.completedIds.includes(booking.id);
    await notifyUser(
      booking.passengerId,
      rode
        ? `Your ride "${ride.startLabel} → ${ride.endLabel}" is completed. Thanks for riding — you can now rate your driver.`
        : `Your ride "${ride.startLabel} → ${ride.endLabel}" is completed. You were marked as a no-show, so your fare was not refunded.`,
      "completed",
    );
  }

  return NextResponse.json({
    ride: { ...ride, status: "completed" as const },
    completed: settlement.completedIds,
    noShow: settlement.noShowIds,
    // Explicitly reported so callers (and future readers) can see that
    // completion moved no money: the driver already held fareShare.
    driverCreditedAtCompletion: 0,
    note: "Driver was already credited at booking/accept time; completion moves no money. No-show fares are not refunded.",
  });
}
