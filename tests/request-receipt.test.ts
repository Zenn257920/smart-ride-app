import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRequestReceipt } from "../src/lib/receipt";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

// ---------------------------------------------------------------------------
// Receipt builder (pure): the join/create receipt renders the paid amount
// and the before/after balance from a mocked API response.
// ---------------------------------------------------------------------------

const JOIN_RESPONSE = {
  request: {
    startLabel: "Hledan",
    endLabel: "Bahan",
    departureTime: "2026-11-24T03:12:00.000Z",
    estimatedPrice: 3409,
    prepaidAmount: 3409,
  },
  passenger: {
    fareShare: 2200,
    appFee: 110,
    totalPrice: 2310,
    paidAmount: 2310,
  },
  refunds: [{ passengerId: "creator", refund: 1099 }],
  memberCount: 2,
};

const CREATE_RESPONSE = {
  request: {
    startLabel: "Hledan",
    endLabel: "Bahan",
    departureTime: "2026-11-24T03:12:00.000Z",
    estimatedPrice: 3409,
    prepaidAmount: 3409,
  },
  passenger: {
    fareShare: 3247,
    appFee: 162,
    totalPrice: 3409,
    paidAmount: 3409,
  },
};

describe("buildRequestReceipt (join)", () => {
  test("renders the paid amount, the fare/fee split and before/after balance", () => {
    // Wallet was 100,000 before the join; 2,310 was prepaid.
    const receipt = buildRequestReceipt("join", JOIN_RESPONSE, 97_690);
    expect(receipt).not.toBeNull();
    expect(receipt!.totalPaid).toBe(2310);
    expect(receipt!.fareShare).toBe(2200);
    expect(receipt!.appFee).toBe(110);
    expect(receipt!.balanceAfter).toBe(97_690);
    expect(receipt!.balanceBefore).toBe(100_000);
    expect(receipt!.memberCount).toBe(2);
    expect(receipt!.startLabel).toBe("Hledan");
    expect(receipt!.endLabel).toBe("Bahan");
    expect(receipt!.kind).toBe("join");
  });

  test("totalPaid falls back to totalPrice when paidAmount is absent", () => {
    const { paidAmount, ...passenger } = JOIN_RESPONSE.passenger;
    void paidAmount;
    const receipt = buildRequestReceipt(
      "join",
      { ...JOIN_RESPONSE, passenger },
      97_690,
    );
    expect(receipt!.totalPaid).toBe(2310);
    expect(receipt!.balanceBefore).toBe(100_000);
  });

  test("returns null with no passenger row to price from", () => {
    expect(buildRequestReceipt("join", { request: {} }, 1000)).toBeNull();
    expect(buildRequestReceipt("join", null, 1000)).toBeNull();
  });
});

describe("buildRequestReceipt (create)", () => {
  test("prepaid amount and before/after balance for the creator", () => {
    // Wallet was 100,000; creating prepaid the full 3,409 estimate.
    const receipt = buildRequestReceipt("create", CREATE_RESPONSE, 96_591);
    expect(receipt).not.toBeNull();
    expect(receipt!.totalPaid).toBe(3409);
    expect(receipt!.fareShare).toBe(3247);
    expect(receipt!.appFee).toBe(162);
    expect(receipt!.balanceAfter).toBe(96_591);
    expect(receipt!.balanceBefore).toBe(100_000);
    expect(receipt!.memberCount).toBe(1);
    expect(receipt!.kind).toBe("create");
  });
});

// ---------------------------------------------------------------------------
// Money rules at the route level (source assertions — the repo's vitest
// runs without a database, so routes are asserted by what they do).
//
// Already covered elsewhere (do NOT duplicate): joinRepriceForMember
// math (down -> exact refund, up -> frozen, equal -> 0) in
// cancellation-policy.test.ts; expiryRefundDeltas amounts (full refund
// per member, zero skipped) in unified-matching.test.ts;
// acceptDriverDeltas (fareShare per member, zero skipped) in
// pricing.test.ts / settlement.test.ts.
// ---------------------------------------------------------------------------

describe("join prepays the joiner immediately", () => {
  test("join route writes a prepayment of exactly the joiner's new share", () => {
    const route = src("app/api/ride-requests/[id]/join/route.ts");
    expect(route).toContain('type: "prepayment"');
    expect(route).toContain("amount: -joinerPrice");
    // The stored row records what was actually paid.
    expect(route).toContain("paidAmount: joinerPrice");
  });

  test("create route prepays the creator the full estimated price", () => {
    const route = src("app/api/ride-requests/route.ts");
    expect(route).toContain('type: "prepayment"');
    expect(route).toContain("amount: -estimatedPrice");
  });
});

describe("driver is credited NOTHING at join/create — only at accept", () => {
  test("join route has no driver credit", () => {
    const route = src("app/api/ride-requests/[id]/join/route.ts");
    expect(route).not.toContain("ride_earning");
    expect(route).not.toContain("acceptDriverDeltas");
  });

  test("create route has no driver credit", () => {
    const route = src("app/api/ride-requests/route.ts");
    expect(route).not.toContain("ride_earning");
    expect(route).not.toContain("acceptDriverDeltas");
  });

  test("accept route IS the only place the driver is credited (fareShare per member)", () => {
    const route = src("app/api/ride-requests/[id]/accept/route.ts");
    expect(route).toContain("acceptDriverDeltas");
    expect(route).toContain("createdBookings.map((b) => b.fareShare)");
  });
});

describe("a later join refunds earlier members the exact difference", () => {
  test("join route reprices members, refunds the drop, and notifies them", () => {
    const route = src("app/api/ride-requests/[id]/join/route.ts");
    expect(route).toContain("joinRepriceForMember");
    expect(route).toContain('type: "refund"');
    expect(route).toContain("amount: refundDiff");
    expect(route).toContain("Your Cost");
    // The response reports the refunds (the UI can show them).
    expect(route).toContain("refunds,");
  });

  test("a member whose share ROSE is frozen — the join route never charges extra", () => {
    const route = src("app/api/ride-requests/[id]/join/route.ts");
    // refundDiff === 0 and newPrice > previousPaid: no row update, no
    // charge, no refund — the comment documents the freeze.
    expect(route).toContain("refundDiff === 0");
    expect(route).toContain("frozen at what was paid");
  });
});

describe("expiry refunds every member in full exactly once", () => {
  test("expiry is gated on a guarded open -> expired flip", () => {
    const expiry = src("lib/request-expiry.ts");
    expect(expiry).toContain('eq(rideRequests.status, "open")');
    expect(expiry).toContain("if (!flipped) continue;");
    // Only the read that flips refunds; a second read matches 0 rows.
    expect(expiry).toContain("expiryRefundDeltas(members)");
  });
});

// ---------------------------------------------------------------------------
// Receipt wiring (UI): the pages show the receipt instead of the old
// one-line notices, and leave/cancel notices show the refund amount.
// ---------------------------------------------------------------------------

describe("receipt wiring", () => {
  test("both join entry points render the receipt from the response + fresh balance", () => {
    for (const page of ["app/find-ride/page.tsx", "app/ride-requests/page.tsx"]) {
      const s = src(page);
      expect(s).toContain("RequestReceipt");
      expect(s).toContain('buildRequestReceipt("join"');
      expect(s).toContain('"/api/wallet/balance"');
    }
  });

  test("create shows the receipt (not the old amount-less notice)", () => {
    const page = src("app/ride-requests/page.tsx");
    expect(page).toContain('buildRequestReceipt("create"');
    expect(page).not.toContain(
      'setNotice("Ride request created — the prepayment was taken from your wallet.")',
    );
    expect(page).not.toContain(
      'setNotice("You joined the ride request — fares were recalculated for everyone sharing.")',
    );
  });

  test("join response carries memberCount for the receipt", () => {
    const route = src("app/api/ride-requests/[id]/join/route.ts");
    expect(route).toContain("memberCount: existingMembers.length + 1");
  });

  test("leave/cancel notices show the refunded amount from the response", () => {
    const page = src("app/ride-requests/page.tsx");
    expect(page).toContain("data.refunded");
    expect(page).toContain("totalRefunded");
    expect(page).toContain("ပြန်အမ်းပါမည်");
    const cancel = src("app/api/ride-requests/[id]/cancel/route.ts");
    expect(cancel).toContain("refunded,");
    const leave = src("app/api/ride-requests/[id]/leave/route.ts");
    expect(leave).toContain("refunded: refundAmount");
  });

  test("receipt component shows breakdown, balances and next steps (amounts only, no phones)", () => {
    const comp = src("components/RequestReceipt.tsx");
    expect(comp).toContain("fmtMMK(receipt.fareShare)");
    expect(comp).toContain("fmtMMK(receipt.appFee)");
    expect(comp).toContain("fmtMMK(receipt.totalPaid)");
    expect(comp).toContain("fmtMMK(receipt.balanceBefore)");
    expect(comp).toContain("fmtMMK(receipt.balanceAfter)");
    expect(comp).toContain("ယာဉ်မောင်း လက်ခံဖို့ စောင့်နေပါတယ်");
    expect(comp).toContain("ပြန်အမ်းပါမည်");
    expect(comp).toContain("တောင်းဆိုမှု ကြည့်မယ်");
    expect(comp).not.toContain("passengerPhone");
    expect(comp).not.toContain("Phone");
  });
});
