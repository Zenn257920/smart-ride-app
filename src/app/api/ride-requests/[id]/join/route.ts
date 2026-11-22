/**
 * POST /api/ride-requests/:id/join — mirrors the old app's joinRideRequest
 * (database.js 1669-1810).
 *
 * Checks: request exists and is 'open'; not your own request; not already
 * joined. When both sides have GPS coords: bearing diff <= 65°, pickup and
 * dropoff point-to-segment distances <= 5.0 km each, pickupT < dropoffT.
 *
 * The segment breakdown is recomputed over creator + all joiners (incl.
 * the new joiner) BEFORE any money moves, so an insufficient balance fails
 * cleanly with no rollback needed. The joiner pays their new share
 * (ledger 'prepayment'); existing members whose share dropped are refunded
 * the difference (ledger 'refund' + notification) and their rows are
 * updated to the new share. A member whose share rises is NOT charged
 * extra — only the recorded share is updated, as in the old app.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requestPassengers, rideRequests, user } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";
import { recalcRequestBreakdown } from "@/lib/ride-requests";
import { serializeRideRequest } from "@/lib/ride-request-privacy";
import { addTransaction, getBalance } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";

const joinSchema = z.object({
  startLabel: z.string().min(1),
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLabel: z.string().min(1),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
});

const JOIN_PICKUP_KM = 5.0;
const JOIN_DROPOFF_KM = 5.0;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const data = parsed.data;

  const [rideRequest] = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, requestId))
    .limit(1);
  if (!rideRequest) return jsonError("Cannot Find Ride Request", 404);
  if (rideRequest.status !== "open") {
    return jsonError("Already Accepted/Canceled this request", 409);
  }
  if (rideRequest.passengerId === sessionUser.id) {
    return jsonError("ကိုယ့် Request ကိုယ် ပါဝင်၍ မရပါ။", 409);
  }

  const existingMembers = await db
    .select()
    .from(requestPassengers)
    .where(
      and(
        eq(requestPassengers.requestId, requestId),
        eq(requestPassengers.status, "joined"),
      ),
    );
  if (existingMembers.some((m) => m.passengerId === sessionUser.id)) {
    return jsonError("Already in this Request", 409);
  }

  // GPS compatibility checks (only when both sides have coords).
  const joinerHasGPS = data.startLat != null && data.endLat != null;
  const requestHasGPS =
    rideRequest.startLat != null && rideRequest.endLat != null;
  if (joinerHasGPS && requestHasGPS) {
    const jBearing = routeMatcher._bearing(
      data.startLat,
      data.startLng,
      data.endLat,
      data.endLng,
    );
    const rBearing = routeMatcher._bearing(
      rideRequest.startLat as number,
      rideRequest.startLng as number,
      rideRequest.endLat as number,
      rideRequest.endLng as number,
    );
    const bearingDiff = routeMatcher._bearingDiff(jBearing, rBearing);
    if (bearingDiff > routeMatcher.BEARING_MAX_DIFF_DEG) {
      return jsonError(
        `❌ Diff Direction (${Math.round(bearingDiff)}° Diff) Find same direction request`,
        409,
      );
    }
    const pu = routeMatcher._pointToSegment(
      data.startLng,
      data.startLat,
      rideRequest.startLng as number,
      rideRequest.startLat as number,
      rideRequest.endLng as number,
      rideRequest.endLat as number,
    );
    const dr = routeMatcher._pointToSegment(
      data.endLng,
      data.endLat,
      rideRequest.startLng as number,
      rideRequest.startLat as number,
      rideRequest.endLng as number,
      rideRequest.endLat as number,
    );
    if (
      pu.distance > JOIN_PICKUP_KM ||
      dr.distance > JOIN_DROPOFF_KM ||
      pu.t >= dr.t
    ) {
      const pKm = Math.round(pu.distance * 10) / 10;
      const dKm = Math.round(dr.distance * 10) / 10;
      return jsonError(
        `❌ distance route — Pickup ${pKm} km · Dropoff ${dKm} km (${JOIN_PICKUP_KM} km Different)။ Find same route request`,
        409,
      );
    }
  }

  // Recompute the fair split over creator + joiners + the new joiner.
  const allMembers = [
    ...existingMembers.map((m) => ({
      passengerId: m.passengerId,
      startLat: m.startLat,
      startLng: m.startLng,
      endLat: m.endLat,
      endLng: m.endLng,
    })),
    {
      passengerId: sessionUser.id,
      startLat: data.startLat,
      startLng: data.startLng,
      endLat: data.endLat,
      endLng: data.endLng,
    },
  ];
  const breakdowns = recalcRequestBreakdown(allMembers, {
    startLat: rideRequest.startLat,
    startLng: rideRequest.startLng,
    endLat: rideRequest.endLat,
    endLng: rideRequest.endLng,
  });
  const joinerBD = breakdowns[breakdowns.length - 1];
  const joinerPrice = joinerBD ? joinerBD.passengerPrice : 0;

  if (joinerPrice > 0) {
    const balance = await getBalance(sessionUser.id);
    if (balance < joinerPrice) {
      return jsonError(
        `Insufficient Balance in Wallet! Require Balance: ${joinerPrice.toLocaleString()} Kyats | Remain Balance: ${balance.toLocaleString()} Kyats`,
        409,
      );
    }
  }

  // Ordered sequential writes (no db.transaction() — Neon HTTP driver).
  const [joinerRow] = await db
    .insert(requestPassengers)
    .values({
      requestId,
      passengerId: sessionUser.id,
      startLabel: data.startLabel,
      startLat: data.startLat,
      startLng: data.startLng,
      endLabel: data.endLabel,
      endLat: data.endLat,
      endLng: data.endLng,
      fareShare: joinerBD?.fareShare ?? 0,
      appFee: joinerBD?.appCommissionPerPassenger ?? 0,
      totalPrice: joinerPrice,
      paidAmount: joinerPrice,
      status: "joined",
    })
    .returning();

  if (joinerPrice > 0) {
    await addTransaction({
      userId: sessionUser.id,
      type: "prepayment",
      amount: -joinerPrice,
      description: `Ride Join: ${rideRequest.startLabel} → ${rideRequest.endLabel} (Pre Cash)`,
      referenceId: requestId,
    });
  }

  // Refund existing members whose share dropped; update all rows to the
  // new breakdown (mirrors old _applyJoinRefunds).
  const refunds: Array<{ passengerId: string; refund: number }> = [];
  for (let i = 0; i < existingMembers.length; i++) {
    const member = existingMembers[i];
    const bd = breakdowns[i];
    if (!bd) continue;
    const previousPaid = member.paidAmount ?? member.totalPrice;
    const newPrice = bd.passengerPrice;
    const refundDiff = previousPaid - newPrice;

    await db
      .update(requestPassengers)
      .set({
        fareShare: bd.fareShare,
        appFee: bd.appCommissionPerPassenger,
        totalPrice: newPrice,
        paidAmount: newPrice,
      })
      .where(eq(requestPassengers.id, member.id));

    if (refundDiff > 0) {
      await addTransaction({
        userId: member.passengerId,
        type: "refund",
        amount: refundDiff,
        description: `New Passenger Joined and Refund: ${rideRequest.startLabel} → ${rideRequest.endLabel} (-${refundDiff.toLocaleString()} Kyats)`,
        referenceId: requestId,
      });
      const [joiner] = await db
        .select()
        .from(user)
        .where(eq(user.id, sessionUser.id))
        .limit(1);
      await notifyUser(
        member.passengerId,
        `${joiner?.name ?? "A passenger"} was Joined! Your Cost ${previousPaid.toLocaleString()} → ${newPrice.toLocaleString()} Kyats, ${refundDiff.toLocaleString()} Kyats Refund`,
        "refund",
      );
      refunds.push({ passengerId: member.passengerId, refund: refundDiff });
    }
  }

  // Creator's displayed estimate follows their new share (old behaviour).
  const creatorIdx = existingMembers.findIndex(
    (m) => m.passengerId === rideRequest.passengerId,
  );
  const creatorBD = creatorIdx >= 0 ? breakdowns[creatorIdx] : undefined;
  if (creatorBD) {
    await db
      .update(rideRequests)
      .set({ estimatedPrice: creatorBD.passengerPrice })
      .where(eq(rideRequests.id, requestId));
  }

  const [joinerUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);
  await notifyUser(
    rideRequest.passengerId,
    `${joinerUser?.name ?? "A passenger"} was Joined Your "${rideRequest.startLabel} → ${rideRequest.endLabel}" Ride Request`,
    "joined",
  );

  // C2: the response goes to the new member, who may see the phone.
  return NextResponse.json(
    {
      request: serializeRideRequest(rideRequest, {
        isCreator: false,
        isMember: true,
        isAcceptedDriver: false,
      }),
      passenger: joinerRow,
      refunds,
    },
    { status: 201 },
  );
}
