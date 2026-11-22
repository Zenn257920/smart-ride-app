/**
 * GET /api/admin/drivers — admin only. Lists every registered driver
 * with their user name/email/phone, car, and verified flag, so an
 * admin can verify/unverify them (POST /api/admin/drivers/:id/verify).
 */
import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { drivers, user } from "@/db/schema";
import { getSessionUser, jsonError, requireAdmin } from "@/lib/api-helpers";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);
  if (!(await requireAdmin(sessionUser.id))) {
    return jsonError("Admin only", 403);
  }

  const rows = await db
    .select({
      id: drivers.id,
      userId: drivers.userId,
      licenseNumber: drivers.licenseNumber,
      nrcNumber: drivers.nrcNumber,
      carModel: drivers.carModel,
      carPlate: drivers.carPlate,
      carColor: drivers.carColor,
      carYear: drivers.carYear,
      verified: drivers.verified,
      createdAt: drivers.createdAt,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone,
    })
    .from(drivers)
    .leftJoin(user, eq(drivers.userId, user.id))
    .orderBy(asc(drivers.createdAt));

  return NextResponse.json({ drivers: rows });
}
