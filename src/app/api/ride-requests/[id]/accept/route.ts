/**
 * POST /api/ride-requests/:id/accept — mirrors the old app's
 * acceptRideRequest (database.js 1848-1921). Driver only.
 *
 * Request status -> 'accepted' and an offered ride is created from it
 * (seats_total 4, seats_available = 4 - passenger count, price/distance
 * from the request coords). A confirmed booking is created for the creator
 * and every joiner with their request_passengers amounts
 * (payment_method 'ewallet', driverPayment = fare_share each), and the
 * creator + joiners are notified.
 *
 * Money (A1 fix): members already paid their prepayment when
 * creating/joining the request, so accept moves no passenger money —
 * but it DOES credit the driver fareShare per member ('ride_earning').
 * Before this fix the driver was never credited here while both cancel
 * routes debited -driverPayment as if paid, so cancelling an
 * accepted-request ride drove the driver's balance negative. Now the
 * cancel paths reverse exactly what accept credited (see src/lib/money).
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  requestPassengers,
  rideRequests,
  rides,
} from "@/db/schema";
import { getSessionUser, jsonError, requireDriver } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";
import { serializeRideRequest } from "@/lib/ride-request-privacy";
import { acceptDriverDeltas } from "@/lib/money";
import { notifyUser } from "@/lib/notify";
import { addTransaction } from "@/lib/wallet";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const driver = await requireDriver(sessionUser.id);
  if (!driver) return jsonError("driver registration required", 403);

  const [rideRequest] = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, requestId))
    .limit(1);
  if (!rideRequest) return jsonError("Cannot find Ride Request", 404);
  if (rideRequest.status !== "open") {
    return jsonError("Already Accepted/Canceled this request", 409);
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
  if (members.length === 0) {
    return jsonError("This request has no passengers", 409);
  }

  const priced = routeMatcher.calculatePriceFromCoords(
    rideRequest.startLat,
    rideRequest.startLng,
    rideRequest.endLat,
    rideRequest.endLng,
  );
  const price = priced ? priced.price : 7500;
  const distanceKm = priced ? priced.distanceKm : 0;

  await db
    .update(rideRequests)
    .set({ status: "accepted" })
    .where(eq(rideRequests.id, requestId));

  const seatsAvailable = Math.max(0, 4 - members.length);
  const [ride] = await db
    .insert(rides)
    .values({
      driverId: sessionUser.id,
      startLabel: rideRequest.startLabel,
      startLat: rideRequest.startLat,
      startLng: rideRequest.startLng,
      endLabel: rideRequest.endLabel,
      endLat: rideRequest.endLat,
      endLng: rideRequest.endLng,
      departureTime: rideRequest.departureTime,
      seatsTotal: 4,
      seatsAvailable,
      carModel: driver.carModel,
      carPlate: driver.carPlate,
      price,
      distanceKm,
      status: seatsAvailable === 0 ? "full" : "open",
    })
    .returning();

  const createdBookings = [];
  for (const member of members) {
    const [booking] = await db
      .insert(bookings)
      .values({
        rideId: ride.id,
        passengerId: member.passengerId,
        seats: 1,
        fareShare: member.fareShare,
        appFee: member.appFee,
        totalPrice: member.totalPrice,
        driverPayment: member.fareShare,
        paymentMethod: "ewallet",
        status: "confirmed",
      })
      .returning();
    createdBookings.push(booking);
  }

  // A1: credit the driver the fare part of each member's prepaid amount.
  // The 5% app fee stays with the app (it was collected in the
  // prepayment); the driver is credited fareShare only, matching
  // booking.driverPayment, so a later cancel reverses exactly this.
  for (const delta of acceptDriverDeltas(
    sessionUser.id,
    createdBookings.map((b) => b.fareShare),
  )) {
    await addTransaction({
      userId: delta.userId,
      type: delta.type,
      amount: delta.amount,
      description: `ခရီးသည်ခ ${delta.amount.toLocaleString()} ကျပ် ရရှိ (ride request လက်ခံခြင်း)`,
      referenceId: ride.id,
    });
  }

  const driverName = sessionUser.name ?? "Driver";
  for (const member of members) {
    await notifyUser(
      member.passengerId,
      `${driverName} (${driver.carModel} - ${driver.carPlate}) accepted your "${rideRequest.startLabel} → ${rideRequest.endLabel}" ride request`,
      "accepted",
    );
  }

  // C2: the response goes to the driver who just accepted the request,
  // who may see the creator's phone.
  return NextResponse.json(
    {
      request: serializeRideRequest(
        { ...rideRequest, status: "accepted" as const },
        { isCreator: false, isMember: false, isAcceptedDriver: true },
      ),
      ride,
      bookings: createdBookings,
    },
    { status: 201 },
  );
}
