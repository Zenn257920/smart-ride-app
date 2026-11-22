/**
 * GET /api/driver/dashboard — driver + vehicle info, stats (active rides,
 * available seats, total earnings = completed 'ride_earning' rows MINUS
 * completed 'adjustment' debits, total passengers), offered rides with
 * passenger lists, pending ride requests (status 'open', future departure,
 * not rejected by this driver), and wallet balance.
 *
 * Rejections live in the request_rejections table (request_id, driver_id)
 * — see POST /api/ride-requests/:id/reject.
 */
import { NextResponse } from "next/server";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  drivers,
  requestRejections,
  requestPassengers,
  rideRequests,
  rides,
  user,
  walletTransactions,
} from "@/db/schema";
import { getSessionUser, jsonError, requireDriver } from "@/lib/api-helpers";
import { driverNetEarnings } from "@/lib/money";
import { serializeRideRequest } from "@/lib/ride-request-privacy";
import { getBalance } from "@/lib/wallet";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const driver = await requireDriver(sessionUser.id);
  if (!driver) return jsonError("driver registration required", 404);

  const now = new Date();

  const offeredRides = await db
    .select()
    .from(rides)
    .where(eq(rides.driverId, sessionUser.id))
    .orderBy(asc(rides.departureTime));

  // A7: "active" is open + full — a full ride still has passengers on
  // board and is very much active. (Full rides contribute 0 available
  // seats, so availableSeats is unchanged by the wider count.)
  const activeRides = offeredRides.filter(
    (r) => r.status === "open" || r.status === "full",
  );
  const availableSeats = activeRides.reduce(
    (sum, r) => sum + r.seatsAvailable,
    0,
  );

  const rideIds = offeredRides.map((r) => r.id);
  const rideBookings =
    rideIds.length > 0
      ? await db
          .select()
          .from(bookings)
          .where(inArray(bookings.rideId, rideIds))
      : [];
  const confirmedBookings = rideBookings.filter(
    (b) => b.status === "confirmed",
  );
  const totalPassengers = confirmedBookings.length;

  const passengerIds = [
    ...new Set(confirmedBookings.map((b) => b.passengerId)),
  ];
  const passengerUsers =
    passengerIds.length > 0
      ? await db.select().from(user).where(inArray(user.id, passengerIds))
      : [];
  const passengerById = new Map(passengerUsers.map((u) => [u.id, u]));  const bookingsByRide = new Map<string, typeof confirmedBookings>();
  for (const b of confirmedBookings) {
    const list = bookingsByRide.get(b.rideId) ?? [];
    list.push(b);
    bookingsByRide.set(b.rideId, list);
  }

  const earnings = await db
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, sessionUser.id),
        eq(walletTransactions.type, "ride_earning"),
        eq(walletTransactions.status, "completed"),
      ),
    );
  // A7: total earnings must reflect what the driver actually KEPT —
  // refund / fair-split / cancel 'adjustment' debits are subtracted.
  // Summing ride_earning alone overstated earnings after any refund.
  // (Adjustments are only ever driver debits: cancelBookingDeltas and
  // fairSplitRefundDeltas in src/lib/money.)
  const adjustments = await db
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, sessionUser.id),
        eq(walletTransactions.type, "adjustment"),
        eq(walletTransactions.status, "completed"),
      ),
    );
  const totalEarnings = driverNetEarnings(
    earnings.map((t) => t.amount),
    adjustments.map((t) => t.amount),
  );

  // Pending requests: open + future + not rejected by this driver.
  const rejectedRows = await db
    .select()
    .from(requestRejections)
    .where(eq(requestRejections.driverId, sessionUser.id));
  const rejectedIds = new Set(rejectedRows.map((r) => r.requestId));
  const openRequests = await db
    .select()
    .from(rideRequests)
    .where(
      and(
        eq(rideRequests.status, "open"),
        gt(rideRequests.departureTime, now),
      ),
    )
    .orderBy(asc(rideRequests.departureTime));
  const pendingRequests = openRequests.filter(
    (r) => !rejectedIds.has(r.id),
  );

  const pendingRequestIds = pendingRequests.map((r) => r.id);
  const pendingMembers =
    pendingRequestIds.length > 0
      ? await db
          .select()
          .from(requestPassengers)
          .where(
            and(
              inArray(requestPassengers.requestId, pendingRequestIds),
              eq(requestPassengers.status, "joined"),
            ),
          )
      : [];
  const membersByRequest = new Map<string, typeof pendingMembers>();
  for (const m of pendingMembers) {
    const list = membersByRequest.get(m.requestId) ?? [];
    list.push(m);
    membersByRequest.set(m.requestId, list);
  }

  const balance = await getBalance(sessionUser.id);

  return NextResponse.json({
    driver,
    driverName: sessionUser.name ?? "Driver",
    stats: {
      activeRides: activeRides.length,
      availableSeats,
      totalEarnings,
      totalPassengers,
    },
    offeredRides: offeredRides.map((r) => ({
      ...r,
      passengers: (bookingsByRide.get(r.id) ?? []).map((b) => ({
        ...b,
        passengerName: passengerById.get(b.passengerId)?.name ?? "Passenger",
        // D3: the viewer IS the driver of this ride and these are
        // confirmed bookings, so each passenger's phone is visible to
        // them (see src/lib/contact-privacy.ts). The phone is NOT
        // included on the public ride lists — only here, scoped to the
        // ride's own driver.
        passengerPhone:
          (passengerById.get(b.passengerId) as { phone?: string | null } | undefined)?.phone ??
          undefined,
      })),
    })),
    // C2: a browsing driver is neither creator, member, nor the driver
    // who accepted the request (these are open requests), so the
    // creator's phone is stripped — unless this driver created or joined
    // the request as a passenger, in which case they may see it.
    pendingRequests: pendingRequests.map((r) => {
      const members = membersByRequest.get(r.id) ?? [];
      return {
        ...serializeRideRequest(r, {
          isCreator: r.passengerId === sessionUser.id,
          isMember: members.some((m) => m.passengerId === sessionUser.id),
          isAcceptedDriver: false,
        }),
        passengers: members,
      };
    }),
    balance,
  });
}
