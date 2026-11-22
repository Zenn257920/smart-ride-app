/**
 * POST /api/admin/drivers/:id/verify — admin only. Body:
 * { verified: boolean }. Sets drivers.verified for the driver row
 * (:id is the drivers.id). Until this is true the driver dashboard
 * shows "Not verified yet". Unverifying is the same call with false.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { drivers } from "@/db/schema";
import { getSessionUser, jsonError, requireAdmin } from "@/lib/api-helpers";
import { notifyUser } from "@/lib/notify";

const verifySchema = z.object({
  verified: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: driverId } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);
  if (!(await requireAdmin(sessionUser.id))) {
    return jsonError("Admin only", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const [updated] = await db
    .update(drivers)
    .set({ verified: parsed.data.verified })
    .where(eq(drivers.id, driverId))
    .returning();
  if (!updated) return jsonError("Driver not found", 404);

  await notifyUser(
    updated.userId,
    parsed.data.verified
      ? "Your driver account was verified. Your rides now show as verified."
      : "Your driver verification was removed.",
    "verified",
  );

  return NextResponse.json({ driver: updated });
}
