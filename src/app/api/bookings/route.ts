/**
 * GET /api/bookings — the signed-in passenger's bookings, newest first,
 * each with its nested ride (labels, coords, departure, driver info).
 * The /my-rides Passenger tab and /dashboard counts depend on this.
 *
 * D3: the nested ride carries the driver's phone (driverPhone) — but
 * only while the booking is 'confirmed' or 'completed'. The viewer IS
 * the passenger of every booking here, so they are a party to it; a
 * cancelled / no-show booking is over and the contact goes with it
 * (see src/lib/contact-privacy.ts). The key is dropped, not nulled,
 * when it must not be shown.
 */
import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, rides, user } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import {
  canSeeCounterpartyPhone,
  serializeWithCounterpartyPhone,
} from "@/lib/contact-privacy";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const mine = await db
    .select()
    .from(bookings)
    .where(eq(bookings.passengerId, sessionUser.id))
    .orderBy(desc(bookings.createdAt));

  if (mine.length === 0) return NextResponse.json({ bookings: [] });

  const rideIds = [...new Set(mine.map((b) => b.rideId))];
  const rideRows = await db
    .select()
    .from(rides)
    .where(inArray(rides.id, rideIds));
  const rideById = new Map(rideRows.map((r) => [r.id, r]));

  const driverIds = [...new Set(rideRows.map((r) => r.driverId))];
  const driverUsers =
    driverIds.length > 0
      ? await db.select().from(user).where(inArray(user.id, driverIds))
      : [];
  const driverById = new Map(driverUsers.map((u) => [u.id, u]));

  return NextResponse.json({
    bookings: mine.map((b) => {
      const ride = rideById.get(b.rideId);
      const driver = ride ? driverById.get(ride.driverId) : undefined;
      const rideOut = ride
        ? serializeWithCounterpartyPhone(
            {
              ...ride,
              driverName: driver?.name ?? "Driver",
              driverCarModel: ride.carModel,
              driverCarPlate: ride.carPlate,
              driverPhone:
                (driver as { phone?: string | null } | undefined)?.phone ??
                null,
            },
            "driverPhone",
            // The viewer is the passenger of this booking (a party);
            // the phone is visible only while the booking is live.
            canSeeCounterpartyPhone(true, b.status),
          )
        : null;
      return {
        ...b,
        passengerName: sessionUser.name ?? "Passenger",
        ride: rideOut,
      };
    }),
  });
}
