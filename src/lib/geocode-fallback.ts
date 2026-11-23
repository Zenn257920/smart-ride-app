/**
 * Auto-geocode a typed place name on submit.
 *
 * LocationField only sets coordinates when the user taps a suggestion,
 * so typing a name and submitting left coords null and every form
 * errored with "pick both a start and a destination". Find-ride's
 * search() already fixes this inline (batch 1, 2026-11-22): it
 * geocodes a typed label when coords are null and uses the first hit.
 * This helper is the same pattern for the other forms
 * (ride-requests create + join, offer-ride) — resolve the typed label
 * with /api/geocode and use the first hit; only when nothing matches
 * does the caller show a "pick a place" error naming the field.
 */
export interface GeocodeHitLike {
  label: string;
  lat: number;
  lng: number;
}

export interface LatLngLike {
  lat: number;
  lng: number;
}

export async function resolveTypedLocation(
  label: string,
  existing: LatLngLike | null,
  geocodeFn: (q: string) => Promise<GeocodeHitLike[]>,
): Promise<{ coords: LatLngLike | null; label: string | null }> {
  if (existing) return { coords: existing, label: null };
  const q = label.trim();
  if (!q) return { coords: null, label: null };
  try {
    const hits = await geocodeFn(q);
    const first = hits[0];
    if (first) {
      return {
        coords: { lat: first.lat, lng: first.lng },
        label: first.label,
      };
    }
  } catch {
    /* no match — the caller reports the missing field */
  }
  return { coords: null, label: null };
}
