/**
 * POST /api/bookings/:id/cancel — mirrors the old app's cancelBooking
 * (database.js 1351-1438).
 *
 * Booking status -> 'cancelled' and the seat is freed. E-wallet bookings
 * are refunded under the cancellation policy (src/lib/money, D6): full
 * totalPrice until 3h before departure, half the fare + full app fee
 * inside 3h; after departure no cancel at all (the ride is completed
 * instead). The driver is debited exactly the refunded fare part —
 * which is driverPayment (the fareShare credited at book/accept time)
 * on a free cancel, half of it on a late passenger cancel. Cash
 * bookings refund 0 — no money ever moved through the wallet, so there
 * is nothing to return.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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
  const { id: bookingId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return jsonError("Booking not found", 404);
  if (booking.passengerId !== sessionUser.id) {
    return jsonError("Only the passenger can cancel this booking", 403);
  }
  if (booking.status === "cancelled") {
    return jsonError("Already Cancel this Ride", 409);
  }
  // D1: a completed ride is settled — its bookings can no longer be
  // cancelled for a refund (and a no-show fare is forfeited, not refunded).
  if (booking.status === "completed" || booking.status === "no_show") {
    return jsonError("This booking is already completed and cannot be cancelled", 409);
  }

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, booking.rideId))
    .limit(1);

  // A4 + D6: cancellation policy. After departure there is no cancel at
  // all — the ride should be completed, not cancelled. Before that,
  // free full refund until 3h before departure, partial refund
  // (half the fare + full app fee) inside 3h (see src/lib/money).
  let policy: { kind: "free" | "partial" } = { kind: "free" };
  if (ride) {
    const gated = cancelPolicy(ride.departureTime);
    if (!gated.allowed) return jsonError(gated.error, 409);
    policy = { kind: gated.kind };
  }

  // A3: the cancel transition is GUARDED — only a 'confirmed' booking
  // can become 'cancelled', and the affected-row count decides. Two
  // concurrent cancels of the same booking used to both pass the
  // status check above and refund twice; now the loser gets 0 rows
  // and a 409 instead of a second refund.
  const [cancelled] = await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(
      and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")),
    )
    .returning();
  if (!cancelled) {
    return jsonError("Already Cancel this Ride", 409);
  }

  // Free the seat (and reopen a ride that had filled up).
  if (ride) {
    await db
      .update(rides)
      .set({
        seatsAvailable: Math.min(
          ride.seatsTotal,
          ride.seatsAvailable + (booking.seats || 1),
        ),
        status: ride.status === "full" ? "open" : ride.status,
      })
      .where(eq(rides.id, ride.id));
  }

  let refunded = 0;
  if (booking.paymentMethod !== "cash") {
    // D6: refund under the policy — full totalPrice when free, half the
    // fare + full app fee when late. The driver is debited exactly the
    // refunded fare part (see cancelBookingDeltasForPolicy).
    refunded = passengerRefundForPolicy(booking, policy);
    if (ride) {
      for (const delta of cancelBookingDeltasForPolicy(booking, ride.driverId, policy, "passenger")) {
        await addTransaction({
          userId: delta.userId,
          type: delta.type,
          amount: delta.amount,
          description:
            delta.type === "refund"
              ? policy.kind === "partial"
                ? `Late ride cancel — partial refund ${refunded.toLocaleString()} Kyats (half fare + full app fee)`
                : `Ride Cancle Refund ${booking.totalPrice.toLocaleString()} Kyats`
              : policy.kind === "partial"
                ? `Late cancel — passenger refunded ${refunded.toLocaleString()} ကျပ်, driver keeps the other half of the fare`
                : `Cancled Passenger refund ${booking.driverPayment.toLocaleString()} ကျပ်`,
          referenceId: booking.rideId,
        });
      }
      await notifyUser(
        ride.driverId,
        `A passenger cancelled their booking on "${ride.startLabel} → ${ride.endLabel}".${policy.kind === "partial" ? " (Late cancel — you keep half the fare.)" : ""}`,
        "cancelled",
      );
    } else {
      // No ride row left — refund the passenger under the policy, no driver to debit.
      await addTransaction({
        userId: sessionUser.id,
        type: "refund",
        amount: refunded,
        description: `Ride Cancle Refund ${refunded.toLocaleString()} Kyats`,
        referenceId: booking.rideId,
      });
    }
  }

  return NextResponse.json({
    booking: { ...booking, status: "cancelled" as const },
    refunded,
    refundPolicy: policy.kind,
    note:
      booking.paymentMethod === "cash"
        ? "Cash booking — no wallet refund (no payment was taken)."
        : policy.kind === "partial"
          ? "Late cancellation (inside 3 hours before departure): refund is half the fare plus the full app fee; the driver keeps the other half of the fare."
          : undefined,
  });
}
