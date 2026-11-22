/**
 * GET  /api/rides — list open rides (future departures first), enriched
 *      with driver name/car and the driver's average rating.
 * POST /api/rides — offer a ride (driver only). Price comes from
 *      routeMatcher.calculatePriceFromCoords, falling back to 7500 MMK
 *      when coordinates are missing.
 */
import { NextResponse } from "next/server";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, drivers, ratings, rides, user } from "@/db/schema";
import { getSessionUser, jsonError, parseDate } from "@/lib/api-helpers";
import { routeMatcher } from "@/lib/matching";

const offerRideSchema = z.object({
  startLabel: z.string().min(1),
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  endLabel: z.string().min(1),
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  departureTime: z.string().min(1),
  seatsTotal: z.number().int().min(1).max(4),
  carModel: z.string().min(1).optional(),
  carPlate: z.string().min(1).optional(),
  routeCoordinates: z
    .array(z.tuple([z.number(), z.number()]))
    .optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("mine") === "1") {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return jsonError("Unauthorized", 401);
    const myRides = await db
      .select()
      .from(rides)
      .where(eq(rides.driverId, sessionUser.id))
      .orderBy(sql`${rides.departureTime} desc`);
    const rideIds = myRides.map((r) => r.id);
    const passengerMap = new Map<string, Array<{ id: string; name: string }>>();
    if (rideIds.length > 0) {
      const confirmed = await db
        .select()
        .from(bookings)
        .where(
          and(
            inArray(bookings.rideId, rideIds),
            eq(bookings.status, "confirmed"),
          ),
        );
      const pIds = [...new Set(confirmed.map((b) => b.passengerId))];
      const pUsers =
        pIds.length > 0
          ? await db.select().from(user).where(inArray(user.id, pIds))
          : [];
      const nameById = new Map(pUsers.map((u) => [u.id, u.name]));
      for (const b of confirmed) {
        const list = passengerMap.get(b.rideId) ?? [];
        list.push({ id: b.passengerId, name: nameById.get(b.passengerId) ?? "Passenger" });
        passengerMap.set(b.rideId, list);
      }
    }
    return NextResponse.json({
      rides: myRides.map((r) => ({
        ...r,
        driverName: sessionUser.name ?? "Driver",
        passengers: passengerMap.get(r.id) ?? [],
      })),
    });
  }

  const now = new Date();
  const openRides = await db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.status, "open"),
        gt(rides.seatsAvailable, 0),
        gt(rides.departureTime, now),
      ),
    )
    .orderBy(asc(rides.departureTime));

  if (openRides.length === 0) return NextResponse.json({ rides: [] });

  const driverIds = [...new Set(openRides.map((r) => r.driverId))];
  const driverRows = await db
    .select()
    .from(drivers)
    .where(inArray(drivers.userId, driverIds));
  const driverUsers = await db
    .select()
    .from(user)
    .where(inArray(user.id, driverIds));
  const ratingRows = await db
    .select({
      driverId: ratings.driverId,
      average: sql<string>`coalesce(avg(${ratings.stars}), 0)`,
      count: sql<string>`count(*)`,
    })
    .from(ratings)
    .where(inArray(ratings.driverId, driverIds))
    .groupBy(ratings.driverId);

  const driverById = new Map(driverRows.map((d) => [d.userId, d]));
  const userById = new Map(driverUsers.map((u) => [u.id, u]));
  const ratingByDriver = new Map(
    ratingRows.map((r) => [
      r.driverId,
      {
        average: Math.round(Number(r.average) * 10) / 10,
        count: Number(r.count),
      },
    ]),
  );

  return NextResponse.json({
    rides: openRides.map((r) => {
      const rating = ratingByDriver.get(r.driverId) ?? { average: 0, count: 0 };
      return {
        ...r,
        driverName: userById.get(r.driverId)?.name ?? "Driver",
        driverCarModel: driverById.get(r.driverId)?.carModel ?? r.carModel,
        driverCarPlate: driverById.get(r.driverId)?.carPlate ?? r.carPlate,
        avgRating: rating.average,
        ratingCount: rating.count,
      };
    }),
  });
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = offerRideSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const data = parsed.data;

  const departureTime = parseDate(data.departureTime);
  if (!departureTime) return jsonError("Invalid departureTime", 400);

  // Driver only: the user must have a drivers row (see /api/driver/register).
  const [driver] = await db
    .select()
    .from(drivers)
    .where(eq(drivers.userId, sessionUser.id))
    .limit(1);
  if (!driver) {
    return jsonError("driver registration required", 409);
  }

  const priced = routeMatcher.calculatePriceFromCoords(
    data.startLat,
    data.startLng,
    data.endLat,
    data.endLng,
  );
  const price = priced ? priced.price : 7500;
  const distanceKm = priced ? priced.distanceKm : 0;

  const [ride] = await db
    .insert(rides)
    .values({
      driverId: sessionUser.id,
      startLabel: data.startLabel,
      startLat: data.startLat,
      startLng: data.startLng,
      endLabel: data.endLabel,
      endLat: data.endLat,
      endLng: data.endLng,
      departureTime,
      seatsTotal: data.seatsTotal,
      seatsAvailable: data.seatsTotal,
      carModel: data.carModel ?? driver.carModel,
      carPlate: data.carPlate ?? driver.carPlate,
      price,
      distanceKm,
      routeCoordinates: data.routeCoordinates ?? null,
      status: "open",
    })
    .returning();

  return NextResponse.json({ ride }, { status: 201 });
}
