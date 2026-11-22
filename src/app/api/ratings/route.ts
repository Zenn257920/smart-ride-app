/**
 * POST /api/ratings — { bookingId, stars 1-5, comment? }. The rater must
 * own the booking, the booking must be confirmed/completed, and there is
 * at most one rating per booking (upsert by booking_id).
 * GET  /api/drivers/:id/rating — { average, count } for a driver.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { bookings, ratings, rides } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";

const ratingSchema = z.object({
  bookingId: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  const parsed = ratingSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { bookingId, stars, comment } = parsed.data;

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return jsonError("Booking not found", 404);
  if (booking.passengerId !== sessionUser.id) {
    return jsonError("You can only rate your own bookings", 403);
  }
  if (booking.status !== "confirmed" && booking.status !== "completed") {
    return jsonError("Only confirmed or completed bookings can be rated", 409);
  }

  const [ride] = await db
    .select()
    .from(rides)
    .where(eq(rides.id, booking.rideId))
    .limit(1);
  if (!ride) return jsonError("Ride not found", 404);

  const [existing] = await db
    .select()
    .from(ratings)
    .where(eq(ratings.bookingId, bookingId))
    .limit(1);

  let rating;
  if (existing) {
    [rating] = await db
      .update(ratings)
      .set({ stars, comment: comment ?? null })
      .where(eq(ratings.id, existing.id))
      .returning();
  } else {
    [rating] = await db
      .insert(ratings)
      .values({
        bookingId,
        rideId: booking.rideId,
        raterId: sessionUser.id,
        driverId: ride.driverId,
        stars,
        comment: comment ?? null,
      })
      .returning();
  }

  return NextResponse.json({ rating }, { status: 201 });
}
