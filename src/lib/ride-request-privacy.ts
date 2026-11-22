/**
 * C2 — passenger phone visibility for ride requests.
 *
 * `ride_requests.passenger_phone` is a creator snapshot that must NOT leak
 * to every logged-in user. The rule:
 *
 *   include `passengerPhone` ONLY for
 *     - the request creator,
 *     - a joined member of the request, or
 *     - the driver who accepted the request.
 *
 * Everyone else (browsing drivers, other passengers) gets the row without
 * the field at all — the key is dropped, not nulled, so a leaked value
 * cannot hide behind `null`.
 *
 * NOTE on the accepted driver in list responses: the list endpoints only
 * surface `open` requests to non-members (default / ?pending=1 / driver
 * dashboard), and `?mine=1` only returns requests the viewer created or
 * joined — so an accepted request can only reach a list viewer who is
 * already creator/member. The accepting driver sees the phone in the
 * accept response itself (they ARE the accepted driver there). No list
 * route therefore needs an accepted-driver lookup.
 */
export interface RideRequestPhoneVisibility {
  /** The viewer created the request. */
  isCreator: boolean;
  /** The viewer is a joined member of the request. */
  isMember: boolean;
  /** The viewer is the driver who accepted the request. */
  isAcceptedDriver: boolean;
}

export function canSeePassengerPhone(
  visibility: RideRequestPhoneVisibility,
): boolean {
  return (
    visibility.isCreator ||
    visibility.isMember ||
    visibility.isAcceptedDriver
  );
}

/**
 * Serialize one ride-request row for a viewer: returns the row unchanged
 * when the viewer may see the creator's phone, otherwise returns a copy
 * with `passengerPhone` removed entirely.
 */
export function serializeRideRequest<
  T extends { passengerPhone?: string | null },
>(request: T, visibility: RideRequestPhoneVisibility): T | Omit<T, "passengerPhone"> {
  if (canSeePassengerPhone(visibility)) return request;
  const copy = { ...request };
  delete copy.passengerPhone;
  return copy;
}
