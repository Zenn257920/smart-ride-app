/**
 * D3 — counterparty phone visibility for confirmed bookings.
 *
 * Follows the C2 rule from src/lib/ride-request-privacy.ts: a phone
 * number is included ONLY for a party to that confirmed booking, and
 * the key is DROPPED (not nulled) from the response otherwise, so a
 * leaked value cannot hide behind `null`.
 *
 *   - Passenger side: the booking's passenger sees the DRIVER's phone,
 *     but only while the booking is 'confirmed' or 'completed' — a
 *     cancelled / no-show booking is over, and the contact goes with it.
 *   - Driver side: the ride's driver sees each CONFIRMED passenger's
 *     phone on the passenger list (driver dashboard / ?mine=1 offers).
 *     Cancelled passengers are never in those lists at all.
 *
 * Search / open-ride lists never carry a phone: a stranger browsing
 * rides is not a party to any booking on them, so there is nothing to
 * include — RideCard only renders a phone when the field is present
 * in the data it was given.
 */

/** Booking statuses where the two parties are still in contact. */
export const CONTACT_VISIBLE_BOOKING_STATUSES = [
  "confirmed",
  "completed",
] as const;

/**
 * True when the viewer is a party to the booking (its passenger, or
 * the driver of its ride) AND the booking is in a contact-visible
 * status. Both conditions are required: being a party to a cancelled
 * booking does not entitle the viewer to the counterparty's phone.
 */
export function canSeeCounterpartyPhone(
  isParty: boolean,
  bookingStatus: string,
): boolean {
  return (
    isParty &&
    (CONTACT_VISIBLE_BOOKING_STATUSES as readonly string[]).includes(
      bookingStatus,
    )
  );
}

/**
 * Serialize one row for a viewer: returns the row unchanged when the
 * viewer may see the counterparty's phone, otherwise returns a copy
 * with the phone key removed entirely.
 */
export function serializeWithCounterpartyPhone<
  T extends Record<string, unknown>,
>(
  row: T,
  phoneKey: string,
  visible: boolean,
): T | Omit<T, typeof phoneKey> {
  if (visible) return row;
  const copy = { ...row };
  delete copy[phoneKey];
  return copy;
}
