/**
 * Map tile providers (2026-11-23).
 *
 * tile.openstreetmap.org is unreachable from Myanmar ISPs without a
 * VPN, so the map must probe CARTO -> Esri -> OSM and fall back at
 * runtime on repeated tile errors. These tests cover the provider
 * list, the probe selection, and the fallback decision — all pure
 * functions in src/lib/map-tiles.ts (the Leaflet wiring in RideMap
 * is a few lines on top of them).
 */
import { describe, expect, test } from "vitest";
import {
  TILE_ERROR_SWAP_THRESHOLD,
  fallbackProvider,
  probeProvider,
  probeTileUrl,
  selectTileProvider,
  tileProviders,
  tileXY,
  type ProbeImage,
  type TileProvider,
} from "../src/lib/map-tiles";

describe("tileProviders — list is well-formed", () => {
  test("priority order is CARTO, Esri, OSM", () => {
    const ids = tileProviders().map((p) => p.id);
    expect(ids).toEqual(["carto", "esri", "osm"]);
  });

  test("every URL has {z}/{x}/{y} placeholders and non-empty attribution", () => {
    for (const p of tileProviders()) {
      expect(p.url).toContain("{z}");
      expect(p.url).toContain("{x}");
      expect(p.url).toContain("{y}");
      expect(p.attribution.trim().length).toBeGreaterThan(0);
    }
  });

  test("Esri uses {z}/{y}/{x} order", () => {
    const esri = tileProviders().find((p) => p.id === "esri")!;
    expect(esri.url.indexOf("{y}")).toBeLessThan(esri.url.indexOf("{x}"));
  });

  test("CARTO URL has no key without the env var", () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    delete process.env.NEXT_PUBLIC_CARTO_KEY;
    try {
      expect(tileProviders()[0].url).not.toContain("?key=");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
  });

  test("CARTO URL gains ?key= only when the env var is set", () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    process.env.NEXT_PUBLIC_CARTO_KEY = "testkey123";
    try {
      expect(tileProviders()[0].url).toContain("?key=testkey123");
      // The other providers never get a key.
      expect(tileProviders()[1].url).not.toContain("key=");
      expect(tileProviders()[2].url).not.toContain("key=");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CARTO_KEY;
      else process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
  });
});

describe("probe tile URLs — Yangon centre, z=13", () => {
  test("tileXY for central Yangon", () => {
    expect(tileXY(16.8, 96.15, 13)).toEqual({ x: 6283, y: 3708 });
  });

  test("OSM probe URL", () => {
    const osm = tileProviders().find((p) => p.id === "osm")!;
    expect(probeTileUrl(osm)).toBe(
      "https://tile.openstreetmap.org/13/6283/3708.png",
    );
  });

  test("Esri probe URL keeps {z}/{y}/{x} order", () => {
    const esri = tileProviders().find((p) => p.id === "esri")!;
    expect(probeTileUrl(esri)).toBe(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/13/3708/6283",
    );
  });

  test("CARTO probe URL pins subdomain and drops {r}", () => {
    const carto = tileProviders().find((p) => p.id === "carto")!;
    expect(probeTileUrl(carto)).toBe(
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/13/6283/3708.png",
    );
  });
});

/** Mock image: reacts to the src assignment the probe performs. */
class MockImage implements ProbeImage {
  onload: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event | string) => void) | null = null;
  private _src = "";
  constructor(
    private behaviour: "load" | "error" | "hang",
    private seen: string[],
  ) {}
  set src(v: string) {
    this._src = v;
    this.seen.push(v);
    if (this.behaviour === "load")
      queueMicrotask(() => this.onload?.(new Event("load")));
    else if (this.behaviour === "error")
      queueMicrotask(() => this.onerror?.(new Event("error")));
    // "hang" never fires — the probe timeout decides.
  }
  get src(): string {
    return this._src;
  }
}

/** Factory handing out mock images in order; records probe URLs. */
function factoryFor(
  behaviours: Array<"load" | "error" | "hang">,
  seen: string[] = [],
) {
  let i = 0;
  return () => {
    const behaviour = behaviours[Math.min(i, behaviours.length - 1)];
    i += 1;
    return new MockImage(behaviour, seen);
  };
}

describe("selectTileProvider — first working provider wins", () => {
  test("picks CARTO when it loads", async () => {
    const seen: string[] = [];
    const provider = await selectTileProvider(
      factoryFor(["load"], seen),
      100,
    );
    expect(provider.id).toBe("carto");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("cartocdn");
  });

  test("falls through to Esri when CARTO fails", async () => {
    const seen: string[] = [];
    const provider = await selectTileProvider(
      factoryFor(["error", "load"], seen),
      100,
    );
    expect(provider.id).toBe("esri");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("cartocdn");
    expect(seen[1]).toContain("arcgisonline");
  });

  test("falls through to OSM when CARTO and Esri fail", async () => {
    const provider = await selectTileProvider(
      factoryFor(["error", "error", "load"]),
      100,
    );
    expect(provider.id).toBe("osm");
  });

  test("returns OSM as last resort when nothing loads", async () => {
    const provider = await selectTileProvider(
      factoryFor(["error", "error", "error"]),
      100,
    );
    expect(provider.id).toBe("osm");
  });

  test("a hanging provider times out and falls through", async () => {
    const provider = await selectTileProvider(
      factoryFor(["hang", "load"]),
      10,
    );
    expect(provider.id).toBe("esri");
  });
});

describe("probeProvider — timeout", () => {
  test("resolves false when the image never fires", async () => {
    const osm = tileProviders().find((p) => p.id === "osm")!;
    await expect(
      probeProvider(osm, factoryFor(["hang"]), 10),
    ).resolves.toBe(false);
  });
});

describe("fallbackProvider — runtime tileerror swap", () => {
  const providers: TileProvider[] = tileProviders();

  test("no swap below the threshold", () => {
    expect(
      fallbackProvider(providers, 0, TILE_ERROR_SWAP_THRESHOLD - 1),
    ).toBeNull();
    expect(fallbackProvider(providers, 0, 0)).toBeNull();
  });

  test("swaps to the next provider at the threshold", () => {
    expect(fallbackProvider(providers, 0, TILE_ERROR_SWAP_THRESHOLD)).toBe(
      providers[1],
    );
    expect(fallbackProvider(providers, 1, TILE_ERROR_SWAP_THRESHOLD)).toBe(
      providers[2],
    );
  });

  test("no swap past the last provider", () => {
    expect(fallbackProvider(providers, 2, TILE_ERROR_SWAP_THRESHOLD)).toBeNull();
    expect(fallbackProvider(providers, 2, 99)).toBeNull();
  });
});
