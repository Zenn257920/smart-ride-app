/**
 * GET /api/notifications — my notifications, newest first, with
 * unreadCount.
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSessionUser, jsonError } from "@/lib/api-helpers";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, sessionUser.id))
    .orderBy(desc(notifications.createdAt));

  const unreadCount = rows.filter((n) => !n.read).length;
  return NextResponse.json({ notifications: rows, unreadCount });
}
