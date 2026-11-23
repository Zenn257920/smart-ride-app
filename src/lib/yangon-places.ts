/**
 * Built-in gazetteer of major Yangon places, used by GET /api/geocode.
 * Coordinates were taken from live Nominatim lookups (Nov 2026), so
 * common Burmese/English names resolve instantly even when the live
 * Nominatim search is slow or misses them. Local hits are returned
 * first, then live Nominatim results.
 */

/** One gazetteer entry: English name, Burmese name, coordinates. */
export interface YangonPlace {
  en: string;
  my: string;
  lat: number;
  lng: number;
}

export const YANGON_PLACES: YangonPlace[] = [
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
  // Townships + landmarks added 2026-11-23 — coordinates from live
  // Nominatim lookups (English queries, countrycodes=mm, first
  // boundary/administrative hit). Nominatim's Burmese handling is
  // inconsistent (e.g. "သင်္ဃန်းကျွန်း" returns nothing live), so the
  // gazetteer is the bilingual guarantee for these names.
  { en: "Mingaladon", my: "မင်္ဂလာဒုံ", lat: 16.9338331, lng: 96.1312105 },
  { en: "Shwepyitha", my: "ရွှေပြည်သာ", lat: 16.9532724, lng: 96.0795114 },
  { en: "Mayangone", my: "မရမ်းကုန်း", lat: 16.8660884, lng: 96.1171103 },
  { en: "Hlaing", my: "လှိုင်", lat: 16.8430511, lng: 96.1234366 },
  { en: "Thingangyun", my: "သင်္ဃန်းကျွန်း", lat: 16.8319649, lng: 96.1973169 },
  { en: "Thaketa", my: "သာကေတ", lat: 16.7980403, lng: 96.2072005 },
  { en: "Dawbon", my: "ဒေါပုံ", lat: 16.7826249, lng: 96.1877755 },
  { en: "Pazundaung", my: "ပုဇွန်တောင်", lat: 16.7778706, lng: 96.1756085 },
  // Botataung + Mingalar Taung Nyunt: Nominatim returns no township
  // boundary for these (even with a "Township" suffix) — the only
  // result is a feature inside the township (Botataung Pagoda /
  // a courthouse in Mingalar Taung Nyunt), so its coordinates stand
  // in as the township's representative point.
  { en: "Botataung", my: "ဗိုလ်တစ်ထောင်", lat: 16.7678308, lng: 96.1718413 },
  { en: "Dagon", my: "ဒဂုံ", lat: 16.7923726, lng: 96.1443386 },
  { en: "Lanmadaw", my: "လမ်းမတော်", lat: 16.7789664, lng: 96.1417274 },
  { en: "Latha", my: "လသာ", lat: 16.7763082, lng: 96.1504591 },
  { en: "Seikkan", my: "ဆိပ်ကမ်း", lat: 16.7711884, lng: 96.1501676 },
  { en: "Mingalar Taung Nyunt", my: "မင်္ဂလာတောင်ညွန့်", lat: 16.7905944, lng: 96.1656183 },
  { en: "Kyimyindaing", my: "ကြည့်မြင်တိုင်", lat: 16.8129125, lng: 96.121305 },
  { en: "Dagon Seikkan", my: "ဒဂုံဆိပ်ကမ်း", lat: 16.8457159, lng: 96.275932 },
  { en: "North Dagon", my: "မြောက်ဒဂုံ", lat: 16.8719395, lng: 96.1921582 },
  { en: "South Dagon", my: "တောင်ဒဂုံ", lat: 16.851808, lng: 96.2367562 },
  { en: "East Dagon", my: "အရှေ့ဒဂုံ", lat: 16.9011301, lng: 96.2118353 },
  // Yangon University: the 5th Nominatim hit is the real main campus
  // (Kamayut); the first hits are other universities (Medicine 1, YTU).
  { en: "Yangon University", my: "ရန်ကုန်တက္ကသိုလ်", lat: 16.830365, lng: 96.1355512 },
  // Aung Mingalar: the 3rd hit is the station node itself; the first
  // two are express-company offices inside the station.
  { en: "Aung Mingalar Highway Bus Station", my: "အောင်မင်္ဂလာ အဝေးပြေးကားဝင်း", lat: 16.9305179, lng: 96.1558296 },
  // Seikkyi Kanaungto is deliberately absent: Nominatim returns zero
  // results for it in every spelling tried ("Seikkyi Kanaungto",
  // "Seikkyi Kanaung To", + "Township") — never invent coordinates.
];

/** Local gazetteer hits for a query (Burmese substring or English substring). */
export function localMatches(q: string): Array<{ label: string; lat: number; lng: number }> {
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
