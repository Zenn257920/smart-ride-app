/**
 * POST /api/driver/register — upsert the drivers row for the signed-in
 * user and set user.user_type = 'driver'.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { drivers, user } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";

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

  await db
    .update(user)
    .set({ user_type: "driver" })
    .where(eq(user.id, sessionUser.id));

  return NextResponse.json({ driver }, { status: 201 });
}
