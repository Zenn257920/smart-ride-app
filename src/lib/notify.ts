/** Insert one notification row for a user. Best-effort: never throws. */
import { db } from "@/db";
import { notifications } from "@/db/schema";

export async function notifyUser(
  userId: string,
  message: string,
  type: string,
) {
  try {
    await db.insert(notifications).values({
      userId,
      message,
      type,
      read: false,
    });
  } catch {
    // Notifications must never break the operation they accompany.
  }
}
