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
 * B6: those amounts are PER SEAT. Booking N seats charges N x the
 * per-seat price (see multiSeatAmounts in src/lib/money), and the
 * modal shows exactly the scaled total (B3).
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
 *
 * A3 race guards (Neon HTTP driver has no transactions):
 * - The seat is taken by a GUARDED update:
 *     UPDATE rides SET seats_available = seats_available - N
 *     WHERE id = $1 AND seats_available >= N
 *   The affected-row count decides success — two simultaneous bookings
 *   cannot both take the last seat, and the count can never go below
 *   zero. The old check-then-write (read seats, compute, write) is gone.
 *   The hold happens AFTER the balance check and BEFORE any money
 *   moves; if the money/booking steps then fail, the seats are released
 *   again (compensating +N). A crash between hold and booking insert
 *   can still strand held seats — the known residual risk of having
 *   no transactions; it only ever costs seats, never money.
 * - B6: a booking may take N > 1 seats (price = per-seat price x N);
 *   the guard decrements by N, and the release adds N back.
 * - A driver cannot book their own ride (409).
 * - A passenger with a confirmed booking on this ride gets 409. The
 *   route pre-checks, and the partial unique index
 *   bookings_ride_passenger_confirmed_unique enforces it even when two
 *   requests race past the pre-check (insert 23505 -> seat released,
 *   409 returned).
 * - Idempotency: an `Idempotency-Key` header (or `idempotencyKey` body
 *   field) makes a retried request replay the stored 201 instead of
 *   charging/booking twice (see src/lib/idempotency). The stored body
 *   is JSON, so replayed `createdAt` values come back as ISO strings
 *   rather than Dates — the client already tolerates both.
 */
import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, rides, user } from "@/db/schema";
import { getSessionUser, jsonError, requireRole } from "@/lib/api-helpers";
import {
  extractIdempotencyKey,
  isUniqueViolation,
  isValidIdempotencyKey,
  runIdempotent,
  type StoredResponse,
} from "@/lib/idempotency";
import { dbIdempotencyStore } from "@/lib/idempotency-db";
import { routeMatcher } from "@/lib/matching";
import {
  fairSplitRefundDeltas,
  multiSeatAmounts,
  repricedBookingAmounts,
  splitRefund,
} from "@/lib/money";
import {
  guardedDecrementN,
  isDuplicateConfirmedBooking,
  isOwnRide,
} from "@/lib/race-guards";
import { addTransaction, getBalance } from "@/lib/wallet";
import { notifyUser } from "@/lib/notify";

const bookSchema = z.object({
  paymentMethod: z.enum(["ewallet", "cash"]),
  // B6: how many seats this booking takes (1..4). The price is the
  // per-seat segment price x seats; the guarded seat decrement takes
  // exactly this many seats. Defaults to 1 — every pre-B6 client
  // books exactly one seat.
  seats: z.number().int().min(1).max(4).optional(),
  // The booking rider's own pickup/dropoff — the coords the search that
  // produced this ride used. All four or none; partial coords are
  // ignored and the rider is priced as a full-route rider.
  startLat: z.number().min(-90).max(90).optional(),
  startLng: z.number().min(-180).max(180).optional(),
  endLat: z.number().min(-90).max(90).optional(),
  endLng: z.number().min(-180).max(180).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
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
  const key = extractIdempotencyKey(request, body);
  if (key !== null && !isValidIdempotencyKey(key)) {
    return jsonError("Invalid Idempotency-Key", 400);
  }

  const outcome = await runIdempotent(
    dbIdempotencyStore(sessionUser.id, "POST /api/rides/:id/book"),
    key,
    () => doBook(rideId, sessionUser.id, parsed.data),
  );
  return NextResponse.json(outcome.response.body, {
    status: outcome.response.status,
  });
}

async function doBook(
  rideId: string,
  userId: string,
  input: z.infer<typeof bookSchema>,
): Promise<StoredResponse> {
  const err = (message: string, status: number): StoredResponse => ({
    status,
    body: { error: message },
  });

  // Passenger only (role read from the DB row, never the session copy).
  const roleRow = await requireRole(userId, "passenger");
  if (!roleRow) {
    return err("ခရီးသည် အကောင့်ဖြင့်သာ ဘွတ်ကင်လုပ်နိုင်ပါသည်။", 403);
  }

  const { paymentMethod } = input;
  // B6: seat count for this booking (1 by default).
  const seats = input.seats ?? 1;
  const isCash = paymentMethod === "cash";
  // Rider coords only count when all four are present; otherwise the
  // rider is priced as riding the driver's full route.
  const riderCoords =
    input.startLat != null &&
    input.startLng != null &&
    input.endLat != null &&
    input.endLng != null
      ? {
          startLat: input.startLat,
          startLng: input.startLng,
          endLat: input.endLat,
          endLng: input.endLng,
        }
      : null;

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!ride) return err("ခရီးစဉ် မတွေ့ပါ", 404);
  if (ride.status !== "open") {
    return err("ဤခရီးစဉ်ကို ဘွတ်ကင်လုပ်လို့ မရတော့ပါ", 409);
  }
  // A3: a driver cannot book their own ride.
  if (isOwnRide(ride.driverId, userId)) {
    return err("ကိုယ့်ခရီးစဉ်ကို ကိုယ်တိုင် ဘွတ်ကင်လုပ်၍ မရပါ", 409);
  }

  const confirmed = await db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.rideId, rideId), eq(bookings.status, "confirmed")),
    );
  // B6: seats already taken — sum the seat counts, not the booking
  // rows, since one booking may hold several seats.
  const bookedSeats = confirmed.reduce(
    (sum, b) => sum + (b.seats ?? 1),
    0,
  );
  // A3: one confirmed booking per passenger per ride (the partial
  // unique index is the backstop; this pre-check gives the clean error).
  if (isDuplicateConfirmedBooking(confirmed, rideId, userId)) {
    return err("ဤခရီးစဉ်အတွက် အတည်ပြုပြီး ဘွတ်ကင်တစ်ခု ရှိနေပါသည်", 409);
  }
  // Friendly early error; the guarded UPDATE below is the real gate —
  // the count may have changed since this read.
  if (
    bookedSeats + seats > ride.seatsTotal ||
    guardedDecrementN(ride.seatsAvailable, seats) === null
  ) {
    return err("ဤခရီးစဉ်တွင် နေရာလွတ် မရှိတော့ပါ။", 409);
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
      id: userId,
      passengerId: userId,
      startLat: riderCoords?.startLat ?? ride.startLat,
      startLng: riderCoords?.startLng ?? ride.startLng,
      endLat: riderCoords?.endLat ?? ride.endLat,
      endLng: riderCoords?.endLng ?? ride.endLng,
    },
  });
  const isFirstRider = priced.isFirstRider;
  // B6: the segment price is PER SEAT — booking N seats charges N x
  // the per-seat fare/fee/total, and the driver is credited the
  // scaled fare. The modal shows exactly these scaled amounts (B3).
  const amounts = multiSeatAmounts(
    {
      fareShare: priced.newRider.fareShare,
      appFee: priced.newRider.appCommissionPerPassenger,
      totalPrice: priced.newRider.passengerPrice,
      driverPayment: priced.newRider.fareShare,
    },
    seats,
  );
  const { fareShare, appFee, totalPrice } = amounts;
  const driverPayment = amounts.driverPayment;

  if (!isCash) {
    const balance = await getBalance(userId);
    if (balance < totalPrice) return err("လက်ကျန်ငွေ မလုံလောက်ပါ", 409);
  }

  // A3: take the seats with the guarded UPDATE — the affected-row count
  // is the atomic gate. Zero rows means another booking took the last
  // seats after our pre-check above.
  const [held] = await db
    .update(rides)
    .set({
      seatsAvailable: sql`${rides.seatsAvailable} - ${seats}`,
      status: sql<string>`CASE WHEN ${rides.seatsAvailable} - ${seats} <= 0 THEN 'full' ELSE ${rides.status} END`,
    })
    .where(and(eq(rides.id, rideId), gte(rides.seatsAvailable, seats)))
    .returning();
  if (!held) {
    return err("ဤခရီးစဉ်တွင် နေရာလွတ် မရှိတော့ပါ။", 409);
  }

  // The seats are held from here on. If the money/booking steps below
  // fail, release them again — otherwise a failed booking would strand
  // seats. (Notifications/refunds happen after the booking exists,
  // so a failure there must NOT release the seats.)
  const releaseSeat = () =>
    db
      .update(rides)
      .set({
        seatsAvailable: sql`${rides.seatsAvailable} + ${seats}`,
        status: "open",
      })
      .where(eq(rides.id, rideId));

  let booking: typeof bookings.$inferSelect;
  try {
    // 1. Money moves.
    if (!isCash) {
      await addTransaction({
        userId,
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
    [booking] = await db
      .insert(bookings)
      .values({
        rideId,
        passengerId: userId,
        seats,
        fareShare,
        appFee,
        totalPrice,
        driverPayment,
        paymentMethod,
        status: "confirmed",
      })
      .returning();
  } catch (e) {
    await releaseSeat();
    if (isUniqueViolation(e)) {
      // Raced past the pre-check: the partial unique index caught the
      // duplicate confirmed booking.
      return err("ဤခရီးစဉ်အတွက် အတည်ပြုပြီး ဘွတ်ကင်တစ်ခု ရှိနေပါသည်", 409);
    }
    throw e;
  }

  // 3. Notifications.
  const [passenger] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const passengerName = passenger?.name ?? "Passenger";
  const seatText = seats > 1 ? ` (${seats} seats)` : "";
  await notifyUser(
    ride.driverId,
    `${passengerName} booked your ride "${ride.startLabel} → ${ride.endLabel}"${seatText}`,
    "booking",
  );
  await notifyUser(
    userId,
    `Your booking for "${ride.startLabel} → ${ride.endLabel}" is confirmed. ${seats > 1 ? `${seats} seats. ` : ""}Total ${totalPrice.toLocaleString()} MMK${isCash ? " (pay cash to the driver)" : ""}.`,
    "booking",
  );

  // 4. Fair-split refunds for earlier riders (2nd+ rider only).
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
      // B6: the breakdown is PER SEAT — an earlier booking holding
      // several seats is repriced to its seat count x the new per-seat
      // breakdown, never down to a single seat's price.
      const newAmounts = multiSeatAmounts(
        repricedBookingAmounts(newBreakdown),
        oldBooking.seats ?? 1,
      );
      const split = splitRefund(
        oldBooking.fareShare,
        oldBooking.appFee,
        newAmounts.fareShare,
        newAmounts.appFee,
      );
      if (split.refundTotal <= 0) continue;

      await db
        .update(bookings)
        .set(newAmounts)
        .where(eq(bookings.id, oldBooking.id));

      // Only e-wallet riders get money back; cash riders keep the new
      // (lower) amount on record with no ledger move, as in the old app.
      // Feature B: the `refunds` response lists REAL money moves only —
      // a cash rider's repriced amount is not a refund (nothing was
      // ever paid), so it must not appear here.
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
                ? `↩ ခရီးသည်အသစ် ပါဝင်လာ၍ ပြန်အမ်းငွေ ${split.refundTotal.toLocaleString()} ကျပ် (${oldBooking.totalPrice.toLocaleString()} → ${newAmounts.totalPrice.toLocaleString()})`
                : `↩ Since new Passenger Joined — ${split.farePortion.toLocaleString()} Kyats Refund`,
            referenceId: rideId,
          });
        }
        await notifyUser(
          oldBooking.passengerId,
          `${passengerName} joined your ride! Your cost ${oldBooking.totalPrice.toLocaleString()} → ${newAmounts.totalPrice.toLocaleString()} MMK, ${split.refundTotal.toLocaleString()} MMK refunded.`,
          "refund",
        );
        refunds.push({ passengerId: oldBooking.passengerId, refund: split.refundTotal });
      }
    }
  }

  return { status: 201, body: { booking, refunds } };
}
