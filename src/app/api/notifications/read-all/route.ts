/**
 * POST /api/notifications/read-all — mark all my unread notifications
 * as read.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";

export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.userId, sessionUser.id),
        eq(notifications.read, false),
      ),
    );

  return NextResponse.json({ ok: true });
}
