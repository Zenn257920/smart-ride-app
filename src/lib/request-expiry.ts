/**
 * Lazy expiry of overdue ride requests — NO cron, NO Vercel cron.
 *
 * Called at the start of every GET /api/ride-requests (all variants)
 * and GET /api/driver/dashboard, i.e. on reads that surface requests.
 * A request whose departureTime has passed with status still 'open'
 * (no driver accepted it) is marked 'expired' and every joined
 * member's prepaid amount is refunded in full ('refund' ledger rows
 * for each member's paidAmount, via expiryRefundDeltas in
 * src/lib/money — the same full-refund rule as request cancel; no new
 * money rules, no driver debit because no driver was ever credited).
 *
 * EXACTLY-ONCE: the status flip is a GUARDED conditional update
 * (`WHERE id = ? AND status = 'open'`, same pattern as accept's
 * guarded update) — only the read that flips open -> expired refunds.
 * A second read finds status 'expired', the guarded update matches 0
 * rows, and no refund rows are written. A request that was already
 * refunded therefore cannot be refunded again, even under concurrent
 * reads (the loser of the race matches 0 rows).
 *
 * Held prepayments (heldPrepaymentTotal in src/lib/money) key on open
 * requests, so an expired request automatically drops out of held
 * totals — no extra bookkeeping.
 *
 * Best-effort per request: a failure expiring one request never
 * blocks the list read or the expiry of the others.
 */
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { requestPassengers, rideRequests } from "@/db/schema";
import { expiryRefundDeltas } from "@/lib/money";
import { notifyUser } from "@/lib/notify";
import { addTransaction } from "@/lib/wallet";

/** Expire every overdue open request; returns the expired request ids. */
export async function expireOverdueRequests(now: Date = new Date()): Promise<string[]> {
  const overdue = await db
    .select()
    .from(rideRequests)
    .where(
      and(eq(rideRequests.status, "open"), lte(rideRequests.departureTime, now)),
    );
  const expiredIds: string[] = [];
  for (const req of overdue) {
    try {
      // Guarded flip: only an 'open' row becomes 'expired'. A
      // concurrent read (or a second read) matches 0 rows here and
      // refunds nothing — this is the exactly-once gate.
      const [flipped] = await db
        .update(rideRequests)
        .set({ status: "expired" })
        .where(
          and(eq(rideRequests.id, req.id), eq(rideRequests.status, "open")),
        )
        .returning();
      if (!flipped) continue;

      const members = await db
        .select()
        .from(requestPassengers)
        .where(
          and(
            eq(requestPassengers.requestId, req.id),
            eq(requestPassengers.status, "joined"),
          ),
        );
      for (const delta of expiryRefundDeltas(members)) {
        await addTransaction({
          userId: delta.userId,
          type: delta.type,
          amount: delta.amount,
          description: `Request expired refund: ${req.startLabel} → ${req.endLabel}`,
          referenceId: req.id,
        });
      }
      for (const member of members) {
        await notifyUser(
          member.passengerId,
          `"${req.startLabel} → ${req.endLabel}" တောင်းဆိုမှု သက်တမ်းကုန်သွားပြီ — ယာဉ်မောင်း လက်မခံခဲ့လို့ ${(member.paidAmount ?? member.totalPrice).toLocaleString()} ကျပ် ပြန်အမ်းပေးလိုက်ပါပြီ။`,
          "refund",
        );
      }
      expiredIds.push(req.id);
    } catch {
      // One bad request must not block the list read or other expiries.
      continue;
    }
  }
  return expiredIds;
}
