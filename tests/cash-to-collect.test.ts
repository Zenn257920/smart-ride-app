import { describe, expect, test } from "vitest";
import {
  cashToCollectByRide,
  cashToCollectForRide,
  cashToCollectTotal,
  type CashToCollectBooking,
} from "../src/lib/money";

const b = (
  overrides: Partial<CashToCollectBooking>,
): CashToCollectBooking => ({
  rideId: "ride-1",
  paymentMethod: "cash",
  status: "confirmed",
  totalPrice: 5197,
  ...overrides,
});

describe("cash to collect (Feature B)", () => {
  test("counts confirmed and completed cash bookings", () => {
    expect(
      cashToCollectForRide([
        b({ totalPrice: 5197 }),
        b({ status: "completed", totalPrice: 8820 }),
      ]),
    ).toBe(5197 + 8820);
  });

  test("excludes cancelled and no-show cash bookings", () => {
    expect(
      cashToCollectForRide([
        b({ totalPrice: 5197 }),
        b({ status: "cancelled", totalPrice: 5197 }),
        b({ status: "no_show", totalPrice: 5197 }),
      ]),
    ).toBe(5197);
  });

  test("excludes e-wallet bookings (already paid through the wallet)", () => {
    expect(
      cashToCollectForRide([
        b({ totalPrice: 5197 }),
        b({ paymentMethod: "ewallet", totalPrice: 8820 }),
      ]),
    ).toBe(5197);
  });

  test("empty / no cash bookings collect nothing", () => {
    expect(cashToCollectForRide([])).toBe(0);
    expect(
      cashToCollectForRide([b({ paymentMethod: "ewallet" })]),
    ).toBe(0);
  });

  test("groups by ride and omits rides with no collectable cash", () => {
    const grouped = cashToCollectByRide([
      b({ rideId: "ride-1", totalPrice: 5197 }),
      b({ rideId: "ride-1", status: "completed", totalPrice: 3000 }),
      b({ rideId: "ride-2", totalPrice: 8820 }),
      b({ rideId: "ride-3", status: "cancelled", totalPrice: 9999 }),
      b({ rideId: "ride-3", paymentMethod: "ewallet", totalPrice: 9999 }),
    ]);
    expect(grouped).toEqual([
      { rideId: "ride-1", count: 2, amount: 8197 },
      { rideId: "ride-2", count: 1, amount: 8820 },
    ]);
  });

  test("total is the sum of the per-ride amounts", () => {
    const bookings = [
      b({ rideId: "ride-1", totalPrice: 5197 }),
      b({ rideId: "ride-2", status: "completed", totalPrice: 8820 }),
      b({ rideId: "ride-2", status: "cancelled", totalPrice: 1000 }),
    ];
    expect(cashToCollectTotal(bookings)).toBe(5197 + 8820);
    expect(cashToCollectTotal(bookings)).toBe(
      cashToCollectByRide(bookings).reduce((s, r) => s + r.amount, 0),
    );
  });
});
