/**
 * C2 — passenger phone must not leak from ride-request responses.
 *
 * The list endpoint used to spread the whole ride_requests row (`...r`),
 * so every logged-in user could read every creator's `passengerPhone`.
 * These tests pin the serializer rule: the phone is included ONLY for
 * the creator, a joined member, or the driver who accepted the request.
 */
import { describe, expect, test } from "vitest";
import {
  canSeePassengerPhone,
  serializeRideRequest,
} from "../src/lib/ride-request-privacy";

const REQUEST = {
  id: "req-1",
  passengerId: "creator-1",
  passengerName: "Demo Passenger",
  passengerPhone: "09123456789",
  startLabel: "Hledan",
  endLabel: "Sule",
  status: "open",
};

const NOBODY = { isCreator: false, isMember: false, isAcceptedDriver: false };

describe("canSeePassengerPhone", () => {
  test("nobody by default", () => {
    expect(canSeePassengerPhone(NOBODY)).toBe(false);
  });

  test("creator, member, and accepted driver each see it", () => {
    expect(
      canSeePassengerPhone({ ...NOBODY, isCreator: true }),
    ).toBe(true);
    expect(canSeePassengerPhone({ ...NOBODY, isMember: true })).toBe(true);
    expect(
      canSeePassengerPhone({ ...NOBODY, isAcceptedDriver: true }),
    ).toBe(true);
  });
});

describe("serializeRideRequest", () => {
  test("strips passengerPhone entirely for a non-member browser", () => {
    const out = serializeRideRequest(REQUEST, NOBODY);
    expect("passengerPhone" in out).toBe(false);
    expect(out).toEqual({
      id: "req-1",
      passengerId: "creator-1",
      passengerName: "Demo Passenger",
      startLabel: "Hledan",
      endLabel: "Sule",
      status: "open",
    });
  });

  test("keeps passengerPhone for the creator", () => {
    const out = serializeRideRequest(REQUEST, {
      ...NOBODY,
      isCreator: true,
    });
    expect(out).toEqual(REQUEST);
  });

  test("keeps passengerPhone for a joined member", () => {
    const out = serializeRideRequest(REQUEST, {
      ...NOBODY,
      isMember: true,
    });
    expect(out).toEqual(REQUEST);
  });

  test("keeps passengerPhone for the driver who accepted it", () => {
    const out = serializeRideRequest(REQUEST, {
      ...NOBODY,
      isAcceptedDriver: true,
    });
    expect(out).toEqual(REQUEST);
  });

  test("does not mutate the original row", () => {
    const copy = { ...REQUEST };
    serializeRideRequest(copy, NOBODY);
    expect(copy.passengerPhone).toBe("09123456789");
  });
});

describe("list-response shape (mirrors GET /api/ride-requests)", () => {
  // The list route maps each row through serializeRideRequest with
  // isCreator / isMember derived from the viewer and the joined members.
  // Simulate that mapping for a viewer who created nothing and joined
  // nothing: no row in the response may carry a phone field.
  const viewerId = "some-other-user";
  const rows = [
    REQUEST,
    { ...REQUEST, id: "req-2", passengerId: "creator-2" },
  ];
  const memberIdsByRequest = new Map<string, string[]>([
    ["req-1", ["creator-1", "joiner-1"]],
    ["req-2", ["creator-2"]],
  ]);

  test("no passengerPhone key anywhere in the list for a non-member", () => {
    const serialized = rows.map((r) =>
      serializeRideRequest(r, {
        isCreator: r.passengerId === viewerId,
        isMember: (memberIdsByRequest.get(r.id) ?? []).includes(viewerId),
        isAcceptedDriver: false,
      }),
    );
    expect(JSON.stringify(serialized)).not.toContain("passengerPhone");
    expect(JSON.stringify(serialized)).not.toContain("09123456789");
  });

  test("creator still sees their own phone in the list", () => {
    const out = serializeRideRequest(rows[0], {
      isCreator: true,
      isMember: true,
      isAcceptedDriver: false,
    });
    expect("passengerPhone" in out).toBe(true);
  });
});
