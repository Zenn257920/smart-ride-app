import { describe, expect, test } from "vitest";
import { heldPrepaymentTotal } from "../src/lib/money";

describe("D8a: held prepayments are only the open requests' money", () => {
  test("one open request: its prepayment is held", () => {
    expect(
      heldPrepaymentTotal(
        [{ referenceId: "req-1", amount: -8400 }],
        ["req-1"],
      ),
    ).toBe(8400);
  });

  test("accepted / cancelled requests are not held any more", () => {
    expect(
      heldPrepaymentTotal(
        [
          { referenceId: "req-open", amount: -5000 },
          { referenceId: "req-accepted", amount: -6000 },
          { referenceId: "req-cancelled", amount: -7000 },
        ],
        ["req-open"],
      ),
    ).toBe(5000);
  });

  test("a refunded prepayment (refund row) is not double-counted", () => {
    // After a request cancel the refund row (+amount) exists alongside
    // the original prepayment (-amount); neither counts as held because
    // the request is no longer open.
    expect(
      heldPrepaymentTotal(
        [
          { referenceId: "req-1", amount: -8000 },
          { referenceId: "req-1", amount: 8000 },
        ],
        [],
      ),
    ).toBe(0);
  });

  test("rows with no request id, and positive rows, are ignored", () => {
    expect(
      heldPrepaymentTotal(
        [
          { referenceId: null, amount: -9000 },
          { referenceId: "req-1", amount: 9000 },
        ],
        ["req-1"],
      ),
    ).toBe(0);
  });

  test("several open requests add up; empty list holds nothing", () => {
    expect(
      heldPrepaymentTotal(
        [
          { referenceId: "req-1", amount: -3000 },
          { referenceId: "req-2", amount: -4500 },
        ],
        ["req-1", "req-2"],
      ),
    ).toBe(7500);
    expect(heldPrepaymentTotal([], ["req-1"])).toBe(0);
  });
});
