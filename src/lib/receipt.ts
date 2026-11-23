/**
 * Receipt data for ride-request create / join.
 *
 * The server money rules are already correct (prepay at create/join,
 * driver credited only at accept, refunds on reprice/leave/cancel/
 * expiry) — but the UI used to show a single generic line and discard
 * the response. This module turns the API response + a fresh wallet
 * balance into everything the receipt needs, in pure functions so it
 * is unit-testable without a database or a browser.
 *
 * Balance before = balance after + total paid: the prepayment is the
 * only money that moved in the create/join call, so the pre-call
 * balance is recovered exactly without a second endpoint.
 */

export interface RequestReceiptData {
  kind: "join" | "create";
  startLabel: string;
  endLabel: string;
  departureTime: string | null;
  /** Fare part of the share (goes to the driver at accept). */
  fareShare: number;
  /** 5% app fee (stays with the app; never a driver credit). */
  appFee: number;
  /** What was actually taken from the wallet in this call. */
  totalPaid: number;
  /** Fresh wallet balance AFTER the prepayment. */
  balanceAfter: number;
  /** Wallet balance BEFORE the prepayment (= after + paid). */
  balanceBefore: number;
  /** Riders sharing the request after this call. */
  memberCount: number;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Build receipt data from a create/join API response plus the fresh
 * balance. Returns null when the response has no passenger row to
 * price from (the caller then falls back to a plain notice).
 */
export function buildRequestReceipt(
  kind: "join" | "create",
  response: unknown,
  balanceAfter: number,
): RequestReceiptData | null {
  if (typeof response !== "object" || response === null) return null;
  const r = response as Record<string, unknown>;
  const req = (r.request ?? {}) as Record<string, unknown>;
  const p = r.passenger as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;

  const totalPaid =
    num(p.paidAmount ?? p.paid_amount ?? p.totalPrice ?? p.total_price) ??
    num(req.prepaidAmount ?? req.prepaid_amount ?? req.estimatedPrice ?? req.estimated_price) ??
    0;
  const fareShare = num(p.fareShare ?? p.fare_share) ?? 0;
  const appFee = num(p.appFee ?? p.app_fee) ?? 0;
  const memberCount = num(r.memberCount ?? r.member_count) ?? 1;
  const departure = req.departureTime ?? req.departure_time;
  return {
    kind,
    startLabel: str(req.startLabel ?? req.start_label),
    endLabel: str(req.endLabel ?? req.end_label),
    departureTime: typeof departure === "string" ? departure : null,
    fareShare,
    appFee,
    totalPaid,
    balanceAfter,
    balanceBefore: balanceAfter + totalPaid,
    memberCount,
  };
}

/** Shape of the create-request API response (for the receipt builder). */
export interface CreateRequestResponse {
  request?: Record<string, unknown>;
  passenger?: Record<string, unknown>;
}

/** Shape of the join-request API response (for the receipt builder). */
export interface JoinRequestResponse {
  request?: Record<string, unknown>;
  passenger?: Record<string, unknown>;
  refunds?: Array<{ passengerId: string; refund: number }>;
  memberCount?: number;
}
