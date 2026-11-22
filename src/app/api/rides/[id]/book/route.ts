/**
 * POST /api/rides/:id/book — mirrors the old app's bookRide
 * (database.js 1061-1307).
 *
 * Pricing (A2 fix — same segment split search shows, NOT the old simple
 * split): the price comes from routeMatcher.priceNewBooking, the exact
 * function findOptimalMatches uses. First rider pays the full ride price;
 * rider N pays their fair segment breakdown over everyone on board.
 * appFee = floor(fareShare * 5%). totalPrice (what the passenger pays)
 * = fareShare + appFee. driverPayment = fareShare (first rider: the
 * full price).
 *
 * The rider's own pickup/dropoff coords may be sent (the client sends
 * the coords it searched with) so the segment split uses the same inputs
 * as search. Without them the rider is treated as riding the driver's
 * full route, exactly as search treats a booking's passengers.
 *
 * e-wallet: totalPrice is deducted from the passenger ledger
 * ('ride_payment') and driverPayment is credited to the driver
 * ('ride_earning'). Cash: no ledger moves, booking only.
 * No app-owner ledger row is created — commission lives in app_fee.
 *
 * When a 2nd+ rider joins, the fair segment split is recomputed over ALL
 * confirmed passengers (the same breakdowns that priced this booking)
 * and earlier e-wallet riders are refunded the difference (ledger
 * 'refund' + booking totalPrice/fareShare/app_fee/driverPayment
 * updated). The driver is debited ONLY the fare portion of each refund
 * (see splitRefund in src/lib/money) — never the app-fee part — and
 * driverPayment is updated to the new fareShare so a later cancel
 * debits exactly what the driver still holds.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, rides, user } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";
import {
  fairSplitRefundDeltas,
  repricedBookingAmounts,
  splitRefund,
} from "@/lib/money";
import { addTransaction, getBalance } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";

const bookSchema = z.object({
  paymentMethod: z.enum(["ewallet", "cash"]),
  // The booking rider's own pickup/dropoff — the coords the search that
  // produced this ride used. All four or none; partial coords are
  // ignored and the rider is priced as a full-route rider.
  startLat: z.number().min(-90).max(90).optional(),
  startLng: z.number().min(-180).max(180).optional(),
  endLat: z.number().min(-90).max(90).optional(),
  endLng: z.number().min(-180).max(180).optional(),
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
  // Rider coords only count when all four are present; otherwise the
  // rider is priced as riding the driver's full route.
  const riderCoords =
    parsed.data.startLat != null &&
    parsed.data.startLng != null &&
    parsed.data.endLat != null &&
    parsed.data.endLng != null
      ? {
          startLat: parsed.data.startLat,
          startLng: parsed.data.startLng,
          endLat: parsed.data.endLat,
          endLng: parsed.data.endLng,
        }
      : null;

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

  // A2: price with the SAME segment breakdown search shows — the shared
  // priceNewBooking used by findOptimalMatches. Existing passengers are
  // full-route riders (bookings store no coords); the new rider uses
  // their own coords when sent, else the full route too.
  const basePrice = ride.price ?? routeMatcher.DEFAULT_PRICE;
  const rideCoords = {
    startLat: ride.startLat,
    startLng: ride.startLng,
    endLat: ride.endLat,
    endLng: ride.endLng,
    routeCoordinates:
      (ride.routeCoordinates as Array<[number, number]> | null) ?? undefined,
  };
  const priced = routeMatcher.priceNewBooking({
    basePrice,
    distanceKm: ride.distanceKm ?? undefined,
    ride: rideCoords,
    existingPassengers: confirmed.map((b) => ({
      id: b.passengerId,
      passengerId: b.passengerId,
      startLat: ride.startLat,
      startLng: ride.startLng,
      endLat: ride.endLat,
      endLng: ride.endLng,
    })),
    newRider: {
      id: sessionUser.id,
      passengerId: sessionUser.id,
      startLat: riderCoords?.startLat ?? ride.startLat,
      startLng: riderCoords?.startLng ?? ride.startLng,
      endLat: riderCoords?.endLat ?? ride.endLat,
      endLng: riderCoords?.endLng ?? ride.endLng,
    },
  });
  const isFirstRider = priced.isFirstRider;
  const { fareShare, appCommissionPerPassenger: appFee, passengerPrice: totalPrice } =
    priced.newRider;
  const driverPayment = fareShare;

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
  const seatsAvailable = Math.max(0, ride.seatsTotal - (bookedSeats + 1));
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
  // Reuses the SAME breakdowns that priced this booking (priced.*),
  // so the refund matches the price search showed. The driver is
  // debited only the fare portion of each refund (splitRefund) — the
  // app-fee part is absorbed by the app, never by the driver — and the
  // repriced booking's driverPayment is set to its new fareShare.
  const refunds: Array<{ passengerId: string; refund: number }> = [];
  if (!isFirstRider && confirmed.length > 0) {
    for (let i = 0; i < confirmed.length; i++) {
      const oldBooking = confirmed[i];
      const newBreakdown = priced.breakdowns[i];
      if (!newBreakdown) continue;
      const split = splitRefund(
        oldBooking.fareShare,
        oldBooking.appFee,
        newBreakdown.fareShare,
        newBreakdown.appCommissionPerPassenger,
      );
      if (split.refundTotal <= 0) continue;

      await db
        .update(bookings)
        .set(repricedBookingAmounts(newBreakdown))
        .where(eq(bookings.id, oldBooking.id));

      // Only e-wallet riders get money back; cash riders keep the new
      // (lower) amount on record with no ledger move, as in the old app.
      if (oldBooking.paymentMethod !== "cash") {
        for (const delta of fairSplitRefundDeltas(
          oldBooking.passengerId,
          ride.driverId,
          split,
          false,
        )) {
          await addTransaction({
            userId: delta.userId,
            type: delta.type,
            amount: delta.amount,
            description:
              delta.type === "refund"
                ? `↩ ခရီးသည်အသစ် ပါဝင်လာ၍ ပြန်အမ်းငွေ ${split.refundTotal.toLocaleString()} ကျပ် (${oldBooking.totalPrice.toLocaleString()} → ${newBreakdown.passengerPrice.toLocaleString()})`
                : `↩ Since new Passenger Joined — ${split.farePortion.toLocaleString()} Kyats Refund`,
            referenceId: rideId,
          });
        }
        await notifyUser(
          oldBooking.passengerId,
          `${passengerName} joined your ride! Your cost ${oldBooking.totalPrice.toLocaleString()} → ${newBreakdown.passengerPrice.toLocaleString()} MMK, ${split.refundTotal.toLocaleString()} MMK refunded.`,
          "refund",
        );
      }
      refunds.push({ passengerId: oldBooking.passengerId, refund: split.refundTotal });
    }
  }

  return NextResponse.json({ booking, refunds }, { status: 201 });
}
