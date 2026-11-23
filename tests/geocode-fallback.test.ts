/**
 * Auto-geocode on submit (2026-11-23).
 *
 * LocationField only sets coordinates when the user taps a suggestion,
 * so typing a place name and submitting errored with "pick both a
 * start and a destination". Find-ride's search() already fixed this
 * inline (batch 1): it geocodes a typed label when coords are null
 * and uses the first hit. The same fallback now lives in
 * src/lib/geocode-fallback.ts and is used by the ride-requests create
 * form + join modal and the offer-ride form. The Yangon gazetteer
 * (src/lib/yangon-places.ts) must resolve the reported case,
 * "လှည်းတန်း", from its Burmese name.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTypedLocation } from "../src/lib/geocode-fallback";
import { localMatches } from "../src/lib/yangon-places";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("resolveTypedLocation — typed label, no suggestion tap", () => {
  const stub = async (q: string) =>
    q === "လှည်းတန်း"
      ? [
          {
            label: "Hledan (လှည်းတန်း), Yangon, Myanmar",
            lat: 16.8247068,
            lng: 96.124767,
          },
        ]
      : [];

  test("existing coords win — the geocoder is not called", async () => {
    let called = false;
    const r = await resolveTypedLocation(
      "လှည်းတန်း",
      { lat: 1, lng: 2 },
      async () => {
        called = true;
        return [];
      },
    );
    expect(r.coords).toEqual({ lat: 1, lng: 2 });
    expect(r.label).toBeNull();
    expect(called).toBe(false);
  });

  test("typed Burmese label resolves to the first hit", async () => {
    const r = await resolveTypedLocation("လှည်းတန်း", null, stub);
    expect(r.coords).toEqual({ lat: 16.8247068, lng: 96.124767 });
    expect(r.label).toContain("လှည်းတန်း");
  });

  test("empty label and unknown place resolve nothing", async () => {
    expect(await resolveTypedLocation("  ", null, stub)).toEqual({
      coords: null,
      label: null,
    });
    expect(await resolveTypedLocation("xyz-no-such-place", null, stub)).toEqual({
      coords: null,
      label: null,
    });
  });

  test("geocoder failure resolves nothing (caller shows the field error)", async () => {
    const r = await resolveTypedLocation("လှည်းတန်း", null, async () => {
      throw new Error("geocode down");
    });
    expect(r).toEqual({ coords: null, label: null });
  });
});

describe("Yangon gazetteer — လှည်းတန်း", () => {
  test("Burmese name resolves to Hledan", () => {
    const hits = localMatches("လှည်းတန်း");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].lat).toBeCloseTo(16.8247068, 4);
    expect(hits[0].lng).toBeCloseTo(96.124767, 4);
    expect(hits[0].label).toContain("Hledan");
  });

  test("English name resolves too, case-insensitively", () => {
    expect(localMatches("Hledan").length).toBeGreaterThan(0);
    expect(localMatches("hledan").length).toBeGreaterThan(0);
  });

  test("unknown place returns no local hits", () => {
    expect(localMatches("zzzz-no-such-place")).toEqual([]);
  });
});

describe("auto-geocode is wired into the submit paths", () => {
  test("ride-requests create + join resolve typed labels", () => {
    const p = src("app/ride-requests/page.tsx");
    expect(p).toContain("resolveTypedLocation");
    expect(p).not.toContain("Please pick both a start and a destination");
    expect(p).not.toContain("Please pick your own start and destination");
  });

  test("offer-ride resolves typed labels", () => {
    expect(src("app/offer-ride/page.tsx")).toContain("resolveTypedLocation");
  });

  test("find-ride still auto-geocodes typed labels (no regression)", () => {
    const f = src("app/find-ride/page.tsx");
    expect(f).toContain("geocode(startLabel");
    expect(f).toContain("geocode(endLabel");
  });
});
