/**
 * POST /api/ride-requests/:id/cancel — mirrors the old app's
 * cancelRideRequest (database.js 1935-1987). Creator only, request must be
 * 'open', and departure must be >= 3h away. Every member's paid_amount is
 * refunded in full (ledger 'refund'); status -> 'cancelled'.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requestPassengers, rideRequests } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { addTransaction } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const [rideRequest] = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, requestId))
    .limit(1);
  if (!rideRequest) return jsonError("Cannot find Ride Request", 404);
  if (rideRequest.passengerId !== sessionUser.id) {
    return jsonError("Cannot cancel this request", 403);
  }
  if (rideRequest.status !== "open") {
    return jsonError("Cannot cancel this request", 409);
  }

  const hoursUntilDeparture =
    (rideRequest.departureTime.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursUntilDeparture < 3) {
    return jsonError(
      `Departure Time ${Math.round(hoursUntilDeparture * 10) / 10}h — Cannot cancel because departure time is too close! (You can cancel before 3 hours left)`,
      409,
    );
  }

  const members = await db
    .select()
    .from(requestPassengers)
    .where(
      and(
        eq(requestPassengers.requestId, requestId),
        eq(requestPassengers.status, "joined"),
      ),
    );

  let totalRefunded = 0;
  for (const member of members) {
    const refund = member.paidAmount ?? member.totalPrice;
    if (refund > 0) {
      await addTransaction({
        userId: member.passengerId,
        type: "refund",
        amount: refund,
        description: `Request cancel refund: ${rideRequest.startLabel} → ${rideRequest.endLabel}`,
        referenceId: requestId,
      });
      totalRefunded += refund;
    }
    if (member.passengerId !== sessionUser.id) {
      await notifyUser(
        member.passengerId,
        `"${rideRequest.startLabel} → ${rideRequest.endLabel}" Request cancelled${refund > 0 ? ` ${refund.toLocaleString()} Kyats Refund` : ""}`,
        "refund",
      );
    }
  }

  await db
    .update(rideRequests)
    .set({ status: "cancelled" })
    .where(eq(rideRequests.id, requestId));

  return NextResponse.json({
    request: { ...rideRequest, status: "cancelled" as const },
    totalRefunded,
  });
}
