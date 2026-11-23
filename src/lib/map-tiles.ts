/**
 * Tile providers for the Leaflet map (src/components/RideMap.tsx).
 *
 * Why this exists: the map's only client-side call to OSM infrastructure
 * is the tile layer. `tile.openstreetmap.org` is unreachable from
 * Myanmar ISPs without a VPN, and with no fallback the map was a grey
 * grid. So RideMap probes the providers below in priority order and
 * uses the first one that answers, then swaps providers at runtime if
 * tiles start failing. Leaflet itself is bundled via npm and the
 * geocode / route APIs run server-side on Vercel, so neither is
 * affected by this.
 *
 * No API keys, accounts, or paid services are involved. CARTO has
 * started asking for keys on some accounts, so an optional key is
 * supported via NEXT_PUBLIC_CARTO_KEY — without a key the URL is used
 * as-is, and a 403 just makes the probe fail and fall through to Esri.
 */

export interface TileProvider {
  id: "carto" | "esri" | "osm";
  name: string;
  /**
   * URL template. CARTO + OSM use {z}/{x}/{y}; Esri uses {z}/{y}/{x}
   * (note the swapped order). CARTO also uses {s} (subdomain) and {r}
   * (retina "@2x", replaced by Leaflet at runtime).
   */
  url: string;
  attribution: string;
}

/** Probe point: central Yangon, the map's home turf. */
export const YANGON_PROBE = { lat: 16.8, lng: 96.15, zoom: 13 } as const;

/** Consecutive tile errors before the map swaps to the next provider. */
export const TILE_ERROR_SWAP_THRESHOLD = 3;

function cartoUrl(): string {
  const base =
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const key = process.env.NEXT_PUBLIC_CARTO_KEY;
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}

/** Providers in priority order: first working probe wins. */
export function tileProviders(): TileProvider[] {
  return [
    {
      id: "carto",
      name: "CARTO Voyager",
      url: cartoUrl(),
      attribution: "© OpenStreetMap contributors © CARTO",
    },
    {
      id: "esri",
      name: "Esri World Street Map",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      attribution:
        "Esri, HERE, Garmin, OpenStreetMap contributors, and the GIS user community",
    },
    {
      id: "osm",
      name: "OpenStreetMap",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
    },
  ];
}

/** Slippy-map tile coordinates for a lat/lng at a zoom level. */
export function tileXY(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
      n,
  );
  return { x, y };
}

/**
 * Concrete URL of one probe tile for a provider (Yangon centre, z=13
 * by default). {s} is pinned to "a" and {r} to "" — the probe is a
 * plain image load, not a Leaflet layer.
 */
export function probeTileUrl(
  provider: TileProvider,
  lat: number = YANGON_PROBE.lat,
  lng: number = YANGON_PROBE.lng,
  zoom: number = YANGON_PROBE.zoom,
): string {
  const { x, y } = tileXY(lat, lng, zoom);
  return provider.url
    .replace("{s}", "a")
    .replace("{r}", "")
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** Minimal image interface the probe needs — injectable for tests. */
export interface ProbeImage {
  src: string;
  onload: ((ev: Event) => void) | null;
  onerror: ((ev: Event | string) => void) | null;
}

export type ImageFactory = () => ProbeImage;

/**
 * True if one probe tile loads from this provider within the timeout.
 * A slow/blocked host resolves false instead of hanging the map.
 */
export function probeProvider(
  provider: TileProvider,
  imageFactory: ImageFactory = () => new Image(),
  timeoutMs = 3000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    let img: ProbeImage;
    try {
      img = imageFactory();
    } catch {
      clearTimeout(timer);
      finish(false);
      return;
    }
    img.onload = () => {
      clearTimeout(timer);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    try {
      img.src = probeTileUrl(provider);
    } catch {
      clearTimeout(timer);
      finish(false);
    }
  });
}

/**
 * First provider whose probe tile loads, in priority order. If none
 * answers, returns the last provider (OSM) anyway — a grey grid with
 * markers is still better than no map object at all, and OSM is the
 * one most likely to recover.
 */
export async function selectTileProvider(
  imageFactory: ImageFactory = () => new Image(),
  timeoutMs = 3000,
): Promise<TileProvider> {
  const providers = tileProviders();
  for (const provider of providers) {
    if (await probeProvider(provider, imageFactory, timeoutMs)) {
      return provider;
    }
  }
  return providers[providers.length - 1];
}

/**
 * Runtime fallback decision, used by RideMap's `tileerror` handler:
 * after TILE_ERROR_SWAP_THRESHOLD consecutive tile errors, return the
 * next provider in the list (or null when already on the last one).
 * A successful tile load resets the counter — callers track that.
 */
export function fallbackProvider(
  providers: TileProvider[],
  currentIndex: number,
  consecutiveErrors: number,
): TileProvider | null {
  if (consecutiveErrors < TILE_ERROR_SWAP_THRESHOLD) return null;
  return providers[currentIndex + 1] ?? null;
}
