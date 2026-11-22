/**
 * POST /api/bookings/:id/cancel — mirrors the old app's cancelBooking
 * (database.js 1351-1438).
 *
 * Booking status -> 'cancelled' and the seat is freed. E-wallet bookings
 * refund the full totalPrice to the passenger ledger ('refund') and debit
 * the driver by driverPayment ('adjustment') — which is exactly the
 * fareShare the driver was credited at book/accept time (see
 * src/lib/money: driverPayment always equals the credited fareShare, so
 * this reverses the credit and never the app-fee part). Cash bookings
 * refund 0 — no money ever moved through the wallet, so there is nothing
 * to return.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, rides } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { cancelBookingDeltas } from "@/lib/money";
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

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, booking.rideId))
    .limit(1);

  await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(eq(bookings.id, bookingId));

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
    refunded = booking.totalPrice;
    if (ride) {
      // Amounts come from cancelBookingDeltas (src/lib/money): passenger
      // +totalPrice, driver -driverPayment (fare only, never the fee part).
      for (const delta of cancelBookingDeltas(booking, ride.driverId)) {
        await addTransaction({
          userId: delta.userId,
          type: delta.type,
          amount: delta.amount,
          description:
            delta.type === "refund"
              ? `Ride Cancle Refund ${booking.totalPrice.toLocaleString()} Kyats`
              : `Cancled Passenger refund ${booking.driverPayment.toLocaleString()} ကျပ်`,
          referenceId: booking.rideId,
        });
      }
      await notifyUser(
        ride.driverId,
        `A passenger cancelled their booking on "${ride.startLabel} → ${ride.endLabel}".`,
        "cancelled",
      );
    } else {
      // No ride row left — refund the passenger, no driver to debit.
      await addTransaction({
        userId: sessionUser.id,
        type: "refund",
        amount: booking.totalPrice,
        description: `Ride Cancle Refund ${booking.totalPrice.toLocaleString()} Kyats`,
        referenceId: booking.rideId,
      });
    }
  }

  return NextResponse.json({
    booking: { ...booking, status: "cancelled" as const },
    refunded,
    note:
      booking.paymentMethod === "cash"
        ? "Cash booking — no wallet refund (no payment was taken)."
        : undefined,
  });
}
