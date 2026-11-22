/**
 * POST /api/ride-requests/:id/leave — mirrors the old app's
 * leaveRideRequest (database.js 1811-1847). A joiner leaves an open
 * request: their paid_amount is refunded in full (ledger 'refund'),
 * their row is marked 'left', and the remaining members are notified.
 *
 * A5: remaining members' prices are FROZEN at what they prepaid — the
 * old code recalculated the fair split over the survivors, which
 * RAISED their recorded totalPrice without anyone paying the
 * difference, and accept then credited the driver the raised
 * (never-paid) fareShares. No recalculation happens here any more
 * (see freezePricesOnLeave in src/lib/money); at accept the driver is
 * credited exactly the stored (paid) fareShares.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requestPassengers, rideRequests } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { freezePricesOnLeave } from "@/lib/money";
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

  // A5: prices are FROZEN — the remaining members keep exactly the
  // fareShare / appFee / totalPrice they prepaid (freezePricesOnLeave
  // returns the stored amounts unchanged). No recalculation, no extra
  // charge, and accept later credits the driver exactly these paid
  // fareShares. Only the survivors are told someone left.
  const remaining = members.filter((m) => m.id !== leaver.id);
  freezePricesOnLeave(
    remaining.map((m) => ({
      fareShare: m.fareShare,
      appFee: m.appFee,
      totalPrice: m.totalPrice,
      paidAmount: m.paidAmount ?? m.totalPrice,
    })),
  );
  const leaverName = sessionUser.name ?? "A passenger";
  for (const member of remaining) {
    await notifyUser(
      member.passengerId,
      `${leaverName} left the "${rideRequest.startLabel} → ${rideRequest.endLabel}" ride request. Your price stays at ${member.totalPrice.toLocaleString()} Kyats — no extra charge.`,
      "left",
    );
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
