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

const querySchema = z.object({
  q: z.string().min(1),
});

const USER_AGENT =
  "SmartRide/1.0 (contact: kkaunghtetzanthar@gmail.com)";

/**
 * Small built-in gazetteer of major Yangon places. Coordinates were taken
 * from live Nominatim lookups (Nov 2026), so common Burmese/English names
 * resolve instantly even when the live Nominatim search is slow or misses
 * them. Local hits are returned first, then live Nominatim results.
 */
const YANGON_PLACES: Array<{ en: string; my: string; lat: number; lng: number }> = [
  { en: "Sule Pagoda", my: "ဆူးလေဘုရား", lat: 16.7744095, lng: 96.1587656 },
  { en: "Shwedagon Pagoda", my: "ရွှေတိဂုံဘုရား", lat: 16.7990633, lng: 96.1494229 },
  { en: "Bogyoke Aung San Market", my: "ဗိုလ်ချုပ်အောင်ဆန်းဈေး", lat: 16.7802627, lng: 96.1555892 },
  { en: "Yangon International Airport", my: "ရန်ကုန်အပြည်ပြည်ဆိုင်ရာလေဆိပ်", lat: 16.9122626, lng: 96.1368079 },
  { en: "Yangon Central Railway Station", my: "ရန်ကုန်ဘူတာကြီး", lat: 16.7816106, lng: 96.1612804 },
  { en: "Inya Lake", my: "အင်းယားကန်", lat: 16.8386348, lng: 96.1380135 },
  { en: "Kandawgyi Lake", my: "ကန်တော်ကြီး", lat: 16.7964603, lng: 96.1609604 },
  { en: "Hledan", my: "လှည်းတန်း", lat: 16.8247068, lng: 96.124767 },
  { en: "Junction City", my: "ဂျန်းရှင်းစီးတီး", lat: 16.7790486, lng: 96.1542957 },
  { en: "Myanmar Plaza", my: "မြန်မာပလာဇာ", lat: 16.8278821, lng: 96.1552589 },
  { en: "Insein", my: "အင်းစိန်", lat: 16.8879884, lng: 96.1066695 },
  { en: "Hlaing Thar Yar", my: "လှိုင်သာယာ", lat: 16.7969813, lng: 96.0311769 },
  { en: "North Okkalapa", my: "မြောက်ဥက္ကလာပ", lat: 16.9170016, lng: 96.1669251 },
  { en: "South Okkalapa", my: "တောင်ဥက္ကလာပ", lat: 16.8470123, lng: 96.1801647 },
  { en: "Tamwe", my: "တာမွေ", lat: 16.8062992, lng: 96.1769272 },
  { en: "Yankin", my: "ရန်ကင်း", lat: 16.8375171, lng: 96.1642915 },
  { en: "Bahan", my: "ဗဟန်း", lat: 16.8061396, lng: 96.1512582 },
  { en: "Kamayut", my: "ကမာရွတ်", lat: 16.8237948, lng: 96.1320589 },
  { en: "Sanchaung", my: "စမ်းချောင်း", lat: 16.8061661, lng: 96.1321384 },
  { en: "Dala", my: "ဒလ", lat: 16.757471, lng: 96.1525092 },
  { en: "Kyauktada", my: "ကျောက်တံတား", lat: 16.774106, lng: 96.1619839 },
  { en: "Pabedan", my: "ပန်းဘဲတန်း", lat: 16.7759583, lng: 96.1561493 },
  { en: "Ahlone", my: "အလုံ", lat: 16.786798, lng: 96.1287706 },
  { en: "Thanlyin", my: "သန်လျင်", lat: 16.7648126, lng: 96.2509473 },
];

function localMatches(q: string): Array<{ label: string; lat: number; lng: number }> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const myNeedle = q.trim();
  return YANGON_PLACES.filter(
    (p) => p.en.toLowerCase().includes(needle) || p.my.includes(myNeedle),
  ).map((p) => ({
    label: `${p.en} (${p.my}), Yangon, Myanmar`,
    lat: p.lat,
    lng: p.lng,
  }));
}

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
