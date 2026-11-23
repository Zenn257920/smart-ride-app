/**
 * Map tile providers (2026-11-23).
 *
 * tile.openstreetmap.org is unreachable from Myanmar ISPs without a
 * VPN, so the map must probe its providers and fall back at runtime
 * on repeated tile errors. Keyless CARTO tiles return an HTTP 200
 * "API KEY REQUIRED" watermark image — a successful load the probe
 * cannot detect — so CARTO is in the list ONLY when
 * NEXT_PUBLIC_CARTO_KEY is set; without a key the list is Esri ->
 * OSM. These tests cover the provider list, the probe selection, and
 * the fallback decision — all pure functions in src/lib/map-tiles.ts
 * (the Leaflet wiring in RideMap is a few lines on top of them).
 */
import { describe, expect, test } from "vitest";
import {
  TILE_ERROR_SWAP_THRESHOLD,
  TILE_STALL_SWAP_MS,
  fallbackProvider,
  probeProvider,
  probeTileUrl,
  selectTileProvider,
  shouldSwapOnStall,
  tileProviders,
  tileXY,
  type ProbeImage,
  type TileProvider,
} from "../src/lib/map-tiles";

describe("tileProviders — list is well-formed", () => {
  test("without a key the list is Esri first, OSM last — no CARTO", () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    delete process.env.NEXT_PUBLIC_CARTO_KEY;
    try {
      const ids = tileProviders().map((p) => p.id);
      expect(ids).toEqual(["esri", "osm"]);
      expect(ids).not.toContain("carto");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
  });

  test("with a key CARTO is first, with ?key= appended", () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    process.env.NEXT_PUBLIC_CARTO_KEY = "testkey123";
    try {
      const providers = tileProviders();
      expect(providers.map((p) => p.id)).toEqual(["carto", "esri", "osm"]);
      expect(providers[0].url).toContain("?key=testkey123");
      // The other providers never get a key.
      expect(providers[1].url).not.toContain("key=");
      expect(providers[2].url).not.toContain("key=");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CARTO_KEY;
      else process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
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

  test("CARTO probe URL pins subdomain, drops {r}, keeps ?key=", () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    process.env.NEXT_PUBLIC_CARTO_KEY = "testkey123";
    try {
      const carto = tileProviders().find((p) => p.id === "carto")!;
      expect(probeTileUrl(carto)).toBe(
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/13/6283/3708.png?key=testkey123",
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CARTO_KEY;
      else process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
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
  test("keyless: picks Esri when it loads", async () => {
    const seen: string[] = [];
    const provider = await selectTileProvider(
      factoryFor(["load"], seen),
      100,
    );
    expect(provider.id).toBe("esri");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("arcgisonline");
    expect(seen[0]).not.toContain("cartocdn");
  });

  test("keyless: falls through to OSM when Esri fails", async () => {
    const seen: string[] = [];
    const provider = await selectTileProvider(
      factoryFor(["error", "load"], seen),
      100,
    );
    expect(provider.id).toBe("osm");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("arcgisonline");
    expect(seen[1]).toContain("tile.openstreetmap.org");
  });

  test("keyless: returns OSM as last resort when nothing loads", async () => {
    const provider = await selectTileProvider(
      factoryFor(["error", "error"]),
      100,
    );
    expect(provider.id).toBe("osm");
  });

  test("keyless: a hanging provider times out and falls through", async () => {
    const provider = await selectTileProvider(
      factoryFor(["hang", "load"]),
      10,
    );
    expect(provider.id).toBe("osm");
  });

  test("keyed: picks CARTO when it loads", async () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    process.env.NEXT_PUBLIC_CARTO_KEY = "testkey123";
    try {
      const seen: string[] = [];
      const provider = await selectTileProvider(
        factoryFor(["load"], seen),
        100,
      );
      expect(provider.id).toBe("carto");
      expect(seen).toHaveLength(1);
      expect(seen[0]).toContain("cartocdn");
      expect(seen[0]).toContain("?key=testkey123");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CARTO_KEY;
      else process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
  });

  test("keyed: falls through to Esri when CARTO fails", async () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    process.env.NEXT_PUBLIC_CARTO_KEY = "testkey123";
    try {
      const seen: string[] = [];
      const provider = await selectTileProvider(
        factoryFor(["error", "load"], seen),
        100,
      );
      expect(provider.id).toBe("esri");
      expect(seen).toHaveLength(2);
      expect(seen[0]).toContain("cartocdn");
      expect(seen[1]).toContain("arcgisonline");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CARTO_KEY;
      else process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
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
  // Keyless list is [esri, osm]; compute inside each test so a
  // leaked env var from another test cannot change the list here.
  test("no swap below the threshold", () => {
    const providers: TileProvider[] = tileProviders();
    expect(providers.map((p) => p.id)).toEqual(["esri", "osm"]);
    expect(
      fallbackProvider(providers, 0, TILE_ERROR_SWAP_THRESHOLD - 1),
    ).toBeNull();
    expect(fallbackProvider(providers, 0, 0)).toBeNull();
  });

  test("swaps to the next provider at the threshold", () => {
    const providers: TileProvider[] = tileProviders();
    expect(fallbackProvider(providers, 0, TILE_ERROR_SWAP_THRESHOLD)).toBe(
      providers[1],
    );
  });

  test("no swap past the last provider", () => {
    const providers: TileProvider[] = tileProviders();
    expect(fallbackProvider(providers, 1, TILE_ERROR_SWAP_THRESHOLD)).toBeNull();
    expect(fallbackProvider(providers, 1, 99)).toBeNull();
  });

  test("keyed list swaps CARTO -> Esri -> OSM", () => {
    const prev = process.env.NEXT_PUBLIC_CARTO_KEY;
    process.env.NEXT_PUBLIC_CARTO_KEY = "testkey123";
    try {
      const providers: TileProvider[] = tileProviders();
      expect(providers.map((p) => p.id)).toEqual(["carto", "esri", "osm"]);
      expect(fallbackProvider(providers, 0, TILE_ERROR_SWAP_THRESHOLD)).toBe(
        providers[1],
      );
      expect(fallbackProvider(providers, 1, TILE_ERROR_SWAP_THRESHOLD)).toBe(
        providers[2],
      );
      expect(fallbackProvider(providers, 2, TILE_ERROR_SWAP_THRESHOLD)).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CARTO_KEY;
      else process.env.NEXT_PUBLIC_CARTO_KEY = prev;
    }
  });
});

describe("shouldSwapOnStall — hung-tile watchdog", () => {
  // Live verification showed Esri serving 1–2 tiles of an 8-tile
  // viewport and then nothing for 60s: hung requests never fire
  // tileerror, so the error-based fallback cannot see the stall.
  // The watchdog swaps only on zero progress with tiles outstanding.
  test("never swaps a fully loaded map (0 pending)", () => {
    expect(shouldSwapOnStall(0, 999999)).toBe(false);
    expect(shouldSwapOnStall(0, TILE_STALL_SWAP_MS)).toBe(false);
  });

  test("no swap while tiles are still arriving", () => {
    expect(shouldSwapOnStall(4, 0)).toBe(false);
    expect(shouldSwapOnStall(4, 1000)).toBe(false);
    expect(shouldSwapOnStall(8, TILE_STALL_SWAP_MS - 1)).toBe(false);
  });

  test("swaps when tiles are pending and nothing progressed for the threshold", () => {
    expect(shouldSwapOnStall(1, TILE_STALL_SWAP_MS)).toBe(true);
    expect(shouldSwapOnStall(8, TILE_STALL_SWAP_MS + 5000)).toBe(true);
    expect(shouldSwapOnStall(6, 60000)).toBe(true);
  });

  test("stall threshold is 15s — slow-but-progressing loads never trip it", () => {
    expect(TILE_STALL_SWAP_MS).toBe(15000);
  });
});
