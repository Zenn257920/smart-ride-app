/**
 * POST /api/ride-requests/:id/reject — mirrors the old app's
 * rejectRideRequest (database.js 1922-1934). Driver only.
 *
 * Records the rejection in request_rejections (request_id, driver_id) so
 * the request stops showing up for this driver (driver dashboard +
 * ?pending=1) while staying open for other drivers. The request itself is
 * untouched.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requestRejections, rideRequests } from "@/db/schema";
import { getSessionUser, jsonError, requireDriver, requireRole } from "@/lib/api-helpers";
import { serializeRideRequest } from "@/lib/ride-request-privacy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  // Driver only (role read from the DB row, never the session copy).
  const roleRow = await requireRole(sessionUser.id, "driver");
  if (!roleRow) {
    return jsonError("ယာဉ်မောင်း အကောင့်ဖြင့်သာ တောင်းဆိုမှု ငြင်းနိုင်ပါသည်။", 403);
  }

  const driver = await requireDriver(sessionUser.id);
  if (!driver) return jsonError("driver registration required", 403);

  const [rideRequest] = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.id, requestId))
    .limit(1);
  if (!rideRequest) return jsonError("Cannot find Ride Request", 404);

  const [existing] = await db
    .select()
    .from(requestRejections)
    .where(
      and(
        eq(requestRejections.requestId, requestId),
        eq(requestRejections.driverId, sessionUser.id),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(requestRejections).values({
      requestId,
      driverId: sessionUser.id,
    });
  }

  // C2: a rejecting driver is neither creator, member, nor the driver
  // who accepted the request — the creator's phone is stripped.
  return NextResponse.json({
    ok: true,
    request: serializeRideRequest(rideRequest, {
      isCreator: false,
      isMember: false,
      isAcceptedDriver: false,
    }),
  });
}
