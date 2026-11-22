/**
 * GET /api/drivers/:id/rating — { average, count } for a driver.
 * average is 0 when the driver has no ratings yet.
 */
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ratings } from "@/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: driverId } = await params;

  const [row] = await db
    .select({
      average: sql<string>`coalesce(avg(${ratings.stars}), 0)`,
      count: sql<string>`count(*)`,
    })
    .from(ratings)
    .where(eq(ratings.driverId, driverId));

  return NextResponse.json({
    average: Math.round(Number(row?.average ?? 0) * 10) / 10,
    count: Number(row?.count ?? 0),
  });
}
