import { describe, expect, test } from "vitest";
import {
  canSeeCounterpartyPhone,
  serializeWithCounterpartyPhone,
} from "../src/lib/contact-privacy";

describe("D3: counterparty phone is visible only to a party to a live booking", () => {
  test("passenger sees the driver phone on a confirmed booking", () => {
    expect(canSeeCounterpartyPhone(true, "confirmed")).toBe(true);
  });

  test("passenger still sees it on a completed booking", () => {
    expect(canSeeCounterpartyPhone(true, "completed")).toBe(true);
  });

  test("no phone on a cancelled or no-show booking, even for a party", () => {
    expect(canSeeCounterpartyPhone(true, "cancelled")).toBe(false);
    expect(canSeeCounterpartyPhone(true, "no_show")).toBe(false);
  });

  test("a stranger sees nothing, whatever the booking status", () => {
    expect(canSeeCounterpartyPhone(false, "confirmed")).toBe(false);
    expect(canSeeCounterpartyPhone(false, "completed")).toBe(false);
  });
});

describe("D3: the phone key is dropped, not nulled, when hidden", () => {
  test("visible: row is returned unchanged", () => {
    const row = { id: "r1", driverPhone: "09123456789" };
    expect(serializeWithCounterpartyPhone(row, "driverPhone", true)).toEqual(row);
  });

  test("hidden: the key is gone entirely (not null)", () => {
    const row = { id: "r1", driverPhone: "09123456789" };
    const out = serializeWithCounterpartyPhone(row, "driverPhone", false);
    expect("driverPhone" in out).toBe(false);
    expect(out).toEqual({ id: "r1" });
  });

  test("hidden: the original row is not mutated", () => {
    const row = { id: "r1", passengerPhone: "09987654321" };
    serializeWithCounterpartyPhone(row, "passengerPhone", false);
    expect(row.passengerPhone).toBe("09987654321");
  });
});
