/**
 * POST /api/driver/register — upsert the drivers row for a driver-role
 * user (vehicle profile). This does NOT convert a passenger account
 * into a driver: one account = one role, chosen once at signup. A
 * passenger calling this gets 403 and must open a separate driver
 * account instead.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { drivers } from "@/db/schema";
import { getSessionUser, jsonError, requireRole } from "@/lib/api-helpers";

const registerSchema = z.object({
  licenseNumber: z.string().min(1),
  nrcNumber: z.string().min(1),
  carModel: z.string().min(1),
  carPlate: z.string().min(1),
  carColor: z.string().min(1),
  carYear: z.number().int().min(1980).max(2100).optional(),
});

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  // Driver role only (read from the DB row, never the session copy).
  // This route no longer converts passengers into drivers.
  const roleRow = await requireRole(sessionUser.id, "driver");
  if (!roleRow) {
    return jsonError("ယာဉ်မောင်း အကောင့်ဖြင့်သာ ယာဉ်မောင်း စာရင်းသွင်းနိုင်ပါသည်။ ယာဉ်မောင်း အကောင့်အသစ် သပ်သပ် ဖွင့်ပါ။", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const data = parsed.data;

  const [existing] = await db
    .select()
    .from(drivers)
    .where(eq(drivers.userId, sessionUser.id))
    .limit(1);

  let driver;
  if (existing) {
    [driver] = await db
      .update(drivers)
      .set({
        licenseNumber: data.licenseNumber,
        nrcNumber: data.nrcNumber,
        carModel: data.carModel,
        carPlate: data.carPlate,
        carColor: data.carColor,
        carYear: data.carYear ?? null,
      })
      .where(eq(drivers.userId, sessionUser.id))
      .returning();
  } else {
    [driver] = await db
      .insert(drivers)
      .values({
        userId: sessionUser.id,
        licenseNumber: data.licenseNumber,
        nrcNumber: data.nrcNumber,
        carModel: data.carModel,
        carPlate: data.carPlate,
        carColor: data.carColor,
        carYear: data.carYear ?? null,
        verified: false,
      })
      .returning();
  }

  return NextResponse.json({ driver }, { status: 201 });
}
