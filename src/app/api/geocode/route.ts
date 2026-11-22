/**
 * GET /api/geocode?q= — server proxy to Nominatim (keeps clients off
 * direct third-party calls). Returns [{ label, lat, lng }], Myanmar only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-helpers";

const querySchema = z.object({
  q: z.string().min(1),
});

const USER_AGENT =
  "SmartRide/1.0 (contact: kkaunghtetzanthar@gmail.com)";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=mm&q=${encodeURIComponent(parsed.data.q)}`;
  let res: Response;
  try {
    res = await fetch(nominatimUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch {
    return jsonError("Geocoding service unavailable", 502);
  }
  if (!res.ok) return jsonError("Geocoding service unavailable", 502);

  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return NextResponse.json(
    data.map((place) => ({
      label: place.display_name,
      lat: Number(place.lat),
      lng: Number(place.lon),
    })),
  );
}
