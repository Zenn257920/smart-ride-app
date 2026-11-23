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
