/**
 * GET /api/route?start=lng,lat&end=lng,lat — server proxy to OSRM.
 * Returns { coordinates: [[lat, lng], ...], distanceKm, durationMin }.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-helpers";

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
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }
  const { start, end } = parsed.data;

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

  return NextResponse.json({
    // OSRM returns [lng, lat]; the app uses [lat, lng] (Leaflet order).
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: Math.round(((route.distance ?? 0) / 1000) * 10) / 10,
    durationMin: Math.round((route.duration ?? 0) / 60),
  });
}
