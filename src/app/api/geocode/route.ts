/**
 * GET /api/geocode?q= — server proxy to Nominatim (keeps clients off
 * direct third-party calls). Returns [{ label, lat, lng }], Myanmar only.
 *
 * C3: auth is required (every caller — find-ride, offer-ride,
 * ride-requests — sits behind AuthGuard, so no public page calls this),
 * each IP gets 30 req/min, and successful results are cached 10 min in
 * memory (keyed by the normalised query) so repeated typing doesn't
 * hammer Nominatim (1 req/s policy — a blocked Vercel IP would break
 * search for everyone). Cache + counters reset on redeploy.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { geocodeCache, rateLimitResponse } from "@/lib/rate-limit";
import { localMatches } from "@/lib/yangon-places";

const querySchema = z.object({
  q: z.string().min(1),
});

const USER_AGENT =
  "SmartRide/1.0 (contact: kkaunghtetzanthar@gmail.com)";

export async function GET(request: Request) {
  const limited = rateLimitResponse(request, "geocode");
  if (limited) return limited;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const cacheKey = parsed.data.q.trim().toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) return NextResponse.json(cached);
  // Cache successful results (local-only fallbacks included) so a
  // retyped query never re-hits Nominatim within the TTL.
  const respond = (result: Array<{ label: string; lat: number; lng: number }>) => {
    geocodeCache.set(cacheKey, result);
    return NextResponse.json(result);
  };

  const local = localMatches(parsed.data.q);

  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=mm&q=${encodeURIComponent(parsed.data.q)}`;
  let res: Response;
  try {
    res = await fetch(nominatimUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch {
    // Live search down — local gazetteer hits are still useful.
    if (local.length > 0) return respond(local);
    return jsonError("Geocoding service unavailable", 502);
  }
  if (!res.ok) {
    if (local.length > 0) return respond(local);
    return jsonError("Geocoding service unavailable", 502);
  }

  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  const live = data.map((place) => ({
    label: place.display_name,
    lat: Number(place.lat),
    lng: Number(place.lon),
  }));
  // Local hits first; drop live hits that duplicate a local place (~300m).
  const merged = [...local];
  for (const hit of live) {
    const dup = local.some(
      (l) => Math.abs(l.lat - hit.lat) < 0.003 && Math.abs(l.lng - hit.lng) < 0.003,
    );
    if (!dup) merged.push(hit);
  }
  return respond(merged);
}
