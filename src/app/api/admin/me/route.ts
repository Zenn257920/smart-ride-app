/**
 * GET /api/admin/me — { isAdmin } for the signed-in user. The Nav and
 * the /admin page use this to decide whether to show admin UI. It is
 * only a UI hint: every /api/admin/* route enforces the flag itself
 * via requireAdmin (DB row), so hiding the link never grants access.
 */
import { NextResponse } from "next/server";
import { getSessionUser, jsonError, requireAdmin } from "@/lib/api-helpers";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);
  const admin = await requireAdmin(sessionUser.id);
  return NextResponse.json({ isAdmin: admin != null });
}
