/**
 * POST /api/rides/:id/cancel — the driver cancels their own offered ride.
 * Status -> 'cancelled'. Each confirmed e-wallet passenger is refunded
 * under the cancellation policy (src/lib/money, D6): full totalPrice
 * until 3h before departure, half the fare + full app fee inside 3h;
 * after departure no cancel at all (the ride is completed instead).
 * The driver is the canceller, so on a late cancel they are debited the
 * FULL driverPayment and keep nothing — the retained fare half is
 * forfeited. Cash bookings are cancelled with no ledger move.
 */
import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { bookings, rides } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { cancelBookingDeltasForPolicy, cancelPolicy, passengerRefundForPolicy } from "@/lib/money";
import { addTransaction } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";

export async function POST(
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
  if (ride.driverId !== sessionUser.id) {
    return jsonError("Only the driver can cancel this ride", 403);
  }
  if (ride.status === "cancelled") {
    return jsonError("Ride is already cancelled", 409);
  }
  // D1: a completed ride is settled — it can no longer be cancelled
  // for refunds (A4: cancelling after departure used to refund in full).
  if (ride.status === "completed") {
    return jsonError("Ride is already completed and cannot be cancelled", 409);
  }
  // A4 + D6: after departure there is no cancel at all — the ride
  // should be completed instead. Before that, free full refund until
  // 3h before departure, partial refund inside 3h (see src/lib/money).
  const gated = cancelPolicy(ride.departureTime);
  if (!gated.allowed) return jsonError(gated.error, 409);
  const policy = { kind: gated.kind };

  const confirmed = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.rideId, rideId), eq(bookings.status, "confirmed")),
    );

  // GUARDED cancel (Batch 5c leftover from Batch 5a, same pattern as
  // the guarded accept and the guarded booking cancel): only an
  // 'open' or 'full' ride becomes 'cancelled', and the affected-row
  // count decides. Two concurrent driver cancels both pass the
  // status checks above, but only the first UPDATE matches a row —
  // the loser gets 0 rows and a 409, and refunds nothing, so
  // passengers can never be refunded twice for one ride. The D6
  // cancellation-policy refund logic below is unchanged.
  const [cancelledRide] = await db
    .update(rides)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(rides.id, rideId),
        or(eq(rides.status, "open"), eq(rides.status, "full")),
      ),
    )
    .returning();
  if (!cancelledRide) {
    return jsonError("Ride is already cancelled or completed", 409);
  }

  const refunded: Array<{ passengerId: string; refund: number }> = [];
  for (const booking of confirmed) {
    await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, booking.id));

    if (booking.paymentMethod !== "cash") {
      // D6: passenger gets the policy refund; the cancelling driver is
      // debited the FULL driverPayment on a late cancel (keeps nothing)
      // and exactly driverPayment on a free cancel (see
      // cancelBookingDeltasForPolicy with canceller "driver").
      const refund = passengerRefundForPolicy(booking, policy);
      for (const delta of cancelBookingDeltasForPolicy(booking, ride.driverId, policy, "driver")) {
        await addTransaction({
          userId: delta.userId,
          type: delta.type,
          amount: delta.amount,
          description:
            delta.type === "refund"
              ? policy.kind === "partial"
                ? `Ride cancelled by driver — late-cancel partial refund ${refund.toLocaleString()} Kyats (half fare + full app fee)`
                : `Ride cancelled by driver — refund ${booking.totalPrice.toLocaleString()} Kyats`
              : policy.kind === "partial"
                ? `Cancelled passenger refund ${booking.driverPayment.toLocaleString()} ကျပ် (driver keeps nothing on a late driver cancel)`
                : `Cancelled passenger refund ${booking.driverPayment.toLocaleString()} ကျပ်`,
          referenceId: rideId,
        });
      }
      refunded.push({
        passengerId: booking.passengerId,
        refund,
      });
    }
    await notifyUser(
      booking.passengerId,
      `Your ride "${ride.startLabel} → ${ride.endLabel}" was cancelled by the driver.${booking.paymentMethod === "cash" ? "" : policy.kind === "partial" ? ` Late cancel — ${passengerRefundForPolicy(booking, policy).toLocaleString()} MMK refunded (half the fare + full app fee).` : ` ${booking.totalPrice.toLocaleString()} MMK refunded.`}`,
      "cancelled",
    );
  }

  return NextResponse.json({
    ride: { ...ride, status: "cancelled" as const },
    refunded,
    refundPolicy: policy.kind,
  });
}
