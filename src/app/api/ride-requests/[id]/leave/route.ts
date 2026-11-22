/**
 * POST /api/ride-requests/:id/leave — mirrors the old app's
 * leaveRideRequest (database.js 1811-1847). A joiner leaves an open
 * request: their paid_amount is refunded in full (ledger 'refund'), their
 * row is marked 'left', and the split is recalculated for the remaining
 * members (recorded shares updated, nobody charged extra).
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requestPassengers, rideRequests } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { recalcRequestBreakdown } from "@/lib/ride-requests";
import { serializeRideRequest } from "@/lib/ride-request-privacy";
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
  if (!rideRequest) return jsonError("Ride Request cannot find", 404);
  if (rideRequest.status !== "open") {
    return jsonError("Cannot Repair this request", 409);
  }
  if (rideRequest.passengerId === sessionUser.id) {
    return jsonError(
      "The creator cannot leave — cancel the request instead",
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
  const leaver = members.find((m) => m.passengerId === sessionUser.id);
  if (!leaver) return jsonError("You are not part of this request", 409);

  const refundAmount = leaver.paidAmount ?? leaver.totalPrice;
  if (refundAmount > 0) {
    await addTransaction({
      userId: sessionUser.id,
      type: "refund",
      amount: refundAmount,
      description: `Request leave refund: ${rideRequest.startLabel} → ${rideRequest.endLabel}`,
      referenceId: requestId,
    });
    await notifyUser(
      sessionUser.id,
      `Since leave from Request ${refundAmount.toLocaleString()} Kyats Refund`,
      "refund",
    );
  }

  await db
    .update(requestPassengers)
    .set({ status: "left" })
    .where(eq(requestPassengers.id, leaver.id));

  // Recalculate the split for those who remain (shares only — no charges).
  const remaining = members.filter((m) => m.id !== leaver.id);
  if (remaining.length > 0) {
    const breakdowns = recalcRequestBreakdown(
      remaining.map((m) => ({
        passengerId: m.passengerId,
        startLat: m.startLat,
        startLng: m.startLng,
        endLat: m.endLat,
        endLng: m.endLng,
      })),
      {
        startLat: rideRequest.startLat,
        startLng: rideRequest.startLng,
        endLat: rideRequest.endLat,
        endLng: rideRequest.endLng,
      },
    );
    for (let i = 0; i < remaining.length; i++) {
      const bd = breakdowns[i];
      if (!bd) continue;
      await db
        .update(requestPassengers)
        .set({
          fareShare: bd.fareShare,
          appFee: bd.appCommissionPerPassenger,
          totalPrice: bd.passengerPrice,
        })
        .where(eq(requestPassengers.id, remaining[i].id));
    }
    const creatorIdx = remaining.findIndex(
      (m) => m.passengerId === rideRequest.passengerId,
    );
    if (creatorIdx >= 0 && breakdowns[creatorIdx]) {
      await db
        .update(rideRequests)
        .set({ estimatedPrice: breakdowns[creatorIdx].passengerPrice })
        .where(eq(rideRequests.id, requestId));
    }
  }

  // C2: the caller just left, so they are no longer a member (and the
  // creator cannot leave) — the creator's phone is stripped.
  return NextResponse.json({
    request: serializeRideRequest(rideRequest, {
      isCreator: false,
      isMember: false,
      isAcceptedDriver: false,
    }),
    refunded: refundAmount,
  });
}
