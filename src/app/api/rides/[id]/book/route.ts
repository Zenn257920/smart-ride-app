/**
 * POST /api/rides/:id/book — mirrors the old app's bookRide
 * (database.js 1061-1307).
 *
 * Pricing (same as the old code — simple split, NOT the segment split):
 * first rider pays the full ride price; rider N pays
 * floor(price / totalPassengers). appFee = floor(fareShare * 5%).
 * totalPrice (what the passenger pays) = fareShare + appFee.
 * driverPayment = fareShare (first rider: the full price).
 *
 * e-wallet: totalPrice is deducted from the passenger ledger
 * ('ride_payment') and driverPayment is credited to the driver
 * ('ride_earning'). Cash: no ledger moves, booking only.
 * No app-owner ledger row is created — commission lives in app_fee.
 *
 * When a 2nd+ rider joins, the fair segment split is recomputed over ALL
 * confirmed passengers and earlier e-wallet riders are refunded the
 * difference (ledger 'refund' + booking totalPrice/fareShare/app_fee
 * updated, driver ledger 'adjustment' -refund).
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, rides, user } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";
import { addTransaction, getBalance } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";

const bookSchema = z.object({
  paymentMethod: z.enum(["ewallet", "cash"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { paymentMethod } = parsed.data;
  const isCash = paymentMethod === "cash";

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!ride) return jsonError("Ride not found", 404);
  if (ride.status !== "open") {
    return jsonError("This ride is no longer open for booking", 409);
  }

  const confirmed = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.rideId, rideId), eq(bookings.status, "confirmed")),
    );
  const bookedSeats = confirmed.length;
  if (bookedSeats >= ride.seatsTotal || ride.seatsAvailable <= 0) {
    return jsonError("ဤခရီးစဉ်တွင် နေရာလွတ် မရှိတော့ပါ။", 409);
  }

  const basePrice = ride.price ?? routeMatcher.DEFAULT_PRICE;
  const totalPassengers = bookedSeats + 1;
  const isFirstRider = totalPassengers === 1;
  const fareShare = isFirstRider
    ? basePrice
    : Math.floor(basePrice / totalPassengers);
  const appFee = Math.floor(fareShare * routeMatcher.APP_TAX_RATE);
  const driverPayment = fareShare;
  const totalPrice = fareShare + appFee;

  if (!isCash) {
    const balance = await getBalance(sessionUser.id);
    if (balance < totalPrice) return jsonError("Insufficient Balance", 409);
  }

  // Ordered sequential writes (no db.transaction() — Neon HTTP driver).
  // 1. Money moves.
  if (!isCash) {
    await addTransaction({
      userId: sessionUser.id,
      type: "ride_payment",
      amount: -totalPrice,
      description: `ခရီးစဉ်ခ ${fareShare.toLocaleString()} + App အခွန် ${appFee.toLocaleString()} ကျပ် (5%)`,
      referenceId: rideId,
    });
    await addTransaction({
      userId: ride.driverId,
      type: "ride_earning",
      amount: driverPayment,
      description: `ခရီးသည်ခ ${fareShare.toLocaleString()} ကျပ် ရရှိ (App အခွန် ${appFee.toLocaleString()} ကျပ် နုတ်)`,
      referenceId: rideId,
    });
  }

  // 2. Booking row.
  const [booking] = await db
    .insert(bookings)
    .values({
      rideId,
      passengerId: sessionUser.id,
      seats: 1,
      fareShare,
      appFee,
      totalPrice,
      driverPayment,
      paymentMethod,
      status: "confirmed",
    })
    .returning();

  // 3. Seat count / full status.
  const seatsAvailable = Math.max(0, ride.seatsTotal - totalPassengers);
  await db
    .update(rides)
    .set({
      seatsAvailable,
      status: seatsAvailable === 0 ? "full" : "open",
    })
    .where(eq(rides.id, rideId));

  // 4. Notifications.
  const [passenger] = await db
    .select()
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);
  const passengerName = passenger?.name ?? "Passenger";
  await notifyUser(
    ride.driverId,
    `${passengerName} booked your ride "${ride.startLabel} → ${ride.endLabel}"`,
    "booking",
  );
  await notifyUser(
    sessionUser.id,
    `Your booking for "${ride.startLabel} → ${ride.endLabel}" is confirmed. Total ${totalPrice.toLocaleString()} MMK${isCash ? " (pay cash to the driver)" : ""}.`,
    "booking",
  );

  // 5. Fair-split refunds for earlier riders (2nd+ rider only).
  const refunds: Array<{ passengerId: string; refund: number }> = [];
  if (!isFirstRider && confirmed.length > 0) {
    const allPassengers = [
      ...confirmed.map((b) => ({
        id: b.passengerId,
        passengerId: b.passengerId,
        startLat: ride.startLat,
        startLng: ride.startLng,
        endLat: ride.endLat,
        endLng: ride.endLng,
      })),
      {
        id: sessionUser.id,
        passengerId: sessionUser.id,
        startLat: ride.startLat,
        startLng: ride.startLng,
        endLat: ride.endLat,
        endLng: ride.endLng,
      },
    ];
    const allDistances = allPassengers.map(
      () => ride.distanceKm || 10,
    );
    const totalRouteKm =
      ride.distanceKm || allDistances.reduce((a, b) => Math.max(a, b), 0);
    const segmentData = routeMatcher.buildSegmentData(
      allPassengers,
      {
        startLat: ride.startLat,
        startLng: ride.startLng,
        endLat: ride.endLat,
        endLng: ride.endLng,
        routeCoordinates:
          (ride.routeCoordinates as Array<[number, number]> | null) ??
          undefined,
      },
      totalRouteKm,
    );
    const fairBreakdowns = segmentData
      ? routeMatcher.calculateFairPriceBreakdown(0, allDistances, {
          segmentData,
        })
      : routeMatcher.calculateFairPriceBreakdown(0, allDistances);

    for (let i = 0; i < confirmed.length; i++) {
      const oldBooking = confirmed[i];
      const newFairPrice = fairBreakdowns[i].passengerPrice;
      const refundAmount = oldBooking.totalPrice - newFairPrice;
      if (refundAmount <= 0) continue;

      await db
        .update(bookings)
        .set({
          totalPrice: newFairPrice,
          fareShare: fairBreakdowns[i].fareShare,
          appFee: fairBreakdowns[i].appCommissionPerPassenger,
        })
        .where(eq(bookings.id, oldBooking.id));

      // Only e-wallet riders get money back; cash riders keep the new
      // (lower) amount on record with no ledger move, as in the old app.
      if (oldBooking.paymentMethod !== "cash") {
        await addTransaction({
          userId: oldBooking.passengerId,
          type: "refund",
          amount: refundAmount,
          description: `↩ ခရီးသည်အသစ် ပါဝင်လာ၍ ပြန်အမ်းငွေ ${refundAmount.toLocaleString()} ကျပ် (${oldBooking.totalPrice.toLocaleString()} → ${newFairPrice.toLocaleString()})`,
          referenceId: rideId,
        });
        await addTransaction({
          userId: ride.driverId,
          type: "adjustment",
          amount: -refundAmount,
          description: `↩ Since new Passenger Joined — ${refundAmount.toLocaleString()} Kyats Refund`,
          referenceId: rideId,
        });
        await notifyUser(
          oldBooking.passengerId,
          `${passengerName} joined your ride! Your cost ${oldBooking.totalPrice.toLocaleString()} → ${newFairPrice.toLocaleString()} MMK, ${refundAmount.toLocaleString()} MMK refunded.`,
          "refund",
        );
      }
      refunds.push({ passengerId: oldBooking.passengerId, refund: refundAmount });
    }
  }

  return NextResponse.json({ booking, refunds }, { status: 201 });
}
