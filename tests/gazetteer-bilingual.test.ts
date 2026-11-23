/**
 * Bilingual gazetteer (2026-11-23).
 *
 * Nominatim's Burmese handling is inconsistent — verified live:
 * "သင်္ဃန်းကျွန်း" returns zero results while "Thingangyun" resolves,
 * even though OSM has the Burmese name. So the local gazetteer
 * (src/lib/yangon-places.ts) is the bilingual guarantee: EVERY entry
 * must resolve via localMatches in BOTH scripts, without depending
 * on the Nominatim fallback.
 */
import { describe, expect, test } from "vitest";
import { localMatches, YANGON_PLACES } from "../src/lib/yangon-places";

function containsPlace(
  hits: Array<{ lat: number; lng: number }>,
  lat: number,
  lng: number,
): boolean {
  return hits.some(
    (h) => Math.abs(h.lat - lat) < 0.0001 && Math.abs(h.lng - lng) < 0.0001,
  );
}

describe("Yangon gazetteer — every entry resolves in both scripts", () => {
  test("gazetteer size", () => {
    expect(YANGON_PLACES.length).toBe(45);
  });

  test.each(
    YANGON_PLACES.map((p) => [p.en, p.my, p.lat, p.lng] as const),
  )("resolves %s (%s) in both scripts", (en, my, lat, lng) => {
    // English full name + lowercase; Burmese name. The entry must be
    // AMONG the hits (a name can be a substring of another entry,
    // e.g. "Hlaing" also matches "Hlaing Thar Yar").
    expect(containsPlace(localMatches(en), lat, lng)).toBe(true);
    expect(containsPlace(localMatches(en.toLowerCase()), lat, lng)).toBe(
      true,
    );
    expect(containsPlace(localMatches(my), lat, lng)).toBe(true);
  });
});

describe("regression — သင်္ဃန်းကျွန်း / Thingangyun", () => {
  test("Burmese name resolves (Nominatim returns nothing live for it)", () => {
    const hits = localMatches("သင်္ဃန်းကျွန်း");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].lat).toBeCloseTo(16.8319649, 4);
    expect(hits[0].lng).toBeCloseTo(96.1973169, 4);
    expect(hits[0].label).toContain("Thingangyun");
  });

  test("English name resolves, case-insensitively", () => {
    for (const q of ["Thingangyun", "thingangyun", "THINGANGYUN"]) {
      expect(containsPlace(localMatches(q), 16.8319649, 96.1973169)).toBe(
        true,
      );
    }
  });

  test("Seikkyi Kanaungto stays absent — no invented coordinates", () => {
    // Nominatim returns zero results for it in every spelling tried.
    expect(localMatches("Seikkyi Kanaungto")).toEqual([]);
    expect(localMatches("ဆိပ်ကြီးခနောင်တို")).toEqual([]);
    expect(YANGON_PLACES.some((p) => p.en.includes("Seikkyi"))).toBe(false);
  });
});
