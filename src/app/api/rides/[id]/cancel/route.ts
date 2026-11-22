/**
 * POST /api/rides/:id/cancel — the driver cancels their own offered ride.
 * Status -> 'cancelled'. Each confirmed e-wallet passenger is refunded in
 * full (ledger 'refund') and their booking is cancelled; the driver ledger
 * takes back that booking's driverPayment ('adjustment') — which is
 * exactly the fareShare the driver was credited at book/accept time
 * (see src/lib/money), so this reverses the credit and never the
 * app-fee part. Cash bookings are cancelled with no ledger move.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
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

  const confirmed = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.rideId, rideId), eq(bookings.status, "confirmed")),
    );

  await db
    .update(rides)
    .set({ status: "cancelled" })
    .where(eq(rides.id, rideId));

  const refunded: Array<{ passengerId: string; refund: number }> = [];
  for (const booking of confirmed) {
    await db
      .update(bookings)
      .set({ status: "cancelled" })
      .where(eq(bookings.id, booking.id));

    if (booking.paymentMethod !== "cash") {
      // Amounts come from cancelBookingDeltas (src/lib/money): passenger
      // +totalPrice, driver -driverPayment (fare only, never the fee part).
      for (const delta of cancelBookingDeltas(booking, ride.driverId)) {
        await addTransaction({
          userId: delta.userId,
          type: delta.type,
          amount: delta.amount,
          description:
            delta.type === "refund"
              ? `Ride cancelled by driver — refund ${booking.totalPrice.toLocaleString()} Kyats`
              : `Cancelled passenger refund ${booking.driverPayment.toLocaleString()} ကျပ်`,
          referenceId: rideId,
        });
      }
      refunded.push({
        passengerId: booking.passengerId,
        refund: booking.totalPrice,
      });
    }
    await notifyUser(
      booking.passengerId,
      `Your ride "${ride.startLabel} → ${ride.endLabel}" was cancelled by the driver.${booking.paymentMethod === "cash" ? "" : ` ${booking.totalPrice.toLocaleString()} MMK refunded.`}`,
      "cancelled",
    );
  }

  return NextResponse.json({
    ride: { ...ride, status: "cancelled" as const },
    refunded,
  });
}
