/**
 * GET /api/route?start=lng,lat&end=lng,lat — server proxy to OSRM.
 * Returns { coordinates: [[lat, lng], ...], distanceKm, durationMin }.
 *
 * C3: auth is required (every caller — find-ride, offer-ride,
 * ride-requests, driver dashboard — sits behind AuthGuard), each IP
 * gets 60 req/min, and successful results are cached 10 min in memory
 * (keyed by the endpoints rounded to 5dp) so map moves and price
 * previews don't re-hit OSRM for the same route. Cache + counters
 * reset on redeploy.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, jsonError } from "@/lib/api-helpers";
import { rateLimitResponse, routeCache } from "@/lib/rate-limit";

const coordSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "Expected lng,lat")
  .transform((s) => {
    const [lng, lat] = s.split(",").map(Number);
    return { lng, lat };
  });

const querySchema = z.object({
  start: coordSchema,
  end: coordSchema,
});

export async function GET(request: Request) {
  const limited = rateLimitResponse(request, "route");
  if (limited) return limited;
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("Unauthorized", 401);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { start, end } = parsed.data;

  const cacheKey = `${start.lng.toFixed(5)},${start.lat.toFixed(5)};${end.lng.toFixed(5)},${end.lat.toFixed(5)}`;
  const cached = routeCache.get(cacheKey);
  if (cached !== undefined) return NextResponse.json(cached);

  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
  let res: Response;
  try {
    res = await fetch(osrmUrl, {
      headers: { "User-Agent": "SmartRide/1.0" },
    });
  } catch {
    return jsonError("Routing service unavailable", 502);
  }
  if (!res.ok) return jsonError("Routing service unavailable", 502);

  const data = (await res.json()) as {
    code?: string;
    routes?: Array<{
      geometry?: { coordinates?: Array<[number, number]> };
      distance?: number;
      duration?: number;
    }>;
  };
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates) {
    return jsonError("No route found", 404);
  }

  const result = {
    // OSRM returns [lng, lat]; the app uses [lat, lng] (Leaflet order).
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: Math.round(((route.distance ?? 0) / 1000) * 10) / 10,
    durationMin: Math.round((route.duration ?? 0) / 60),
  };
  routeCache.set(cacheKey, result);
  return NextResponse.json(result);
}
