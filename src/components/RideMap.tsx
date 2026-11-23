"use client";

import { useEffect, useRef } from "react";
import type { LatLng } from "@/lib/api";
import { YANGON } from "@/lib/api";
import {
  fallbackProvider,
  probeProvider,
  selectTileProvider,
  shouldSwapOnMissingLoad,
  shouldSwapOnStall,
  tileProviders,
  type TileProvider,
} from "@/lib/map-tiles";

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: "green" | "mint" | "dark";
}

interface RideMapProps {
  center?: LatLng;
  markers?: MapMarker[];
  routeCoordinates?: Array<[number, number]>;
  onPick?: (lat: number, lng: number) => void;
  height?: number;
  // D4: when false, marker updates redraw the markers but do NOT
  // re-fit the viewport — used by the passenger live view, where the
  // driver marker moves every poll and re-fitting would yank the map
  // under the user's fingers. Defaults to true (search / dashboard).
  autoFit?: boolean;
}

export default function RideMap({
  center = YANGON,
  markers = [],
  routeCoordinates,
  onPick,
  height = 320,
  autoFit = true,
}: RideMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const layerRef = useRef<unknown>(null);
  const propsRef = useRef({ center, markers, routeCoordinates, onPick });
  propsRef.current = { center, markers, routeCoordinates, onPick };

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let layer: import("leaflet").LayerGroup | null = null;
    let tileLayer: import("leaflet").TileLayer | null = null;
    let Lmod: typeof import("leaflet") | null = null;
    // Tile-provider fallback state: providers in priority order, the
    // index of the one in use, and the current consecutive-error streak
    // (a successful tile load resets it).
    const providers = tileProviders();
    let providerIndex = 0;
    let consecutiveErrors = 0;
    // Stall watchdog state: how many tiles are still outstanding and
    // when the last one made any progress. Hung requests never fire
    // `tileerror`, so the error-based fallback above cannot see a
    // stalled provider — the watchdog below swaps on zero progress.
    let pendingTiles = 0;
    let lastProgressAt = 0;
    let swapping = false;
    // Missing-load watchdog state: when the current tile layer was
    // added and whether its `load` event has ever fired. The pending
    // counter can be blinded (a layer added while its container had
    // zero area requests no tiles, so pending sits at 0 and `load`
    // never fires) — see shouldSwapOnMissingLoad in map-tiles.ts.
    let layerAddedAt = 0;
    let loadFired = false;
    // invalidateSize timers: a delayed re-check after setup, and the
    // debounced window-resize re-check (see below).
    let sizeTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    // Adds (or swaps in) a tile layer for one provider. Removing the
    // old layer also drops its attribution — Leaflet's attribution
    // control re-reads attributions from the layers on the map.
    function addTileLayer(provider: TileProvider) {
      if (!Lmod || !map) return;
      const L = Lmod;
      if (tileLayer) {
        map.removeLayer(tileLayer);
        tileLayer = null;
      }
      consecutiveErrors = 0;
      // A fresh grace period starts with each layer.
      pendingTiles = 0;
      lastProgressAt = Date.now();
      layerAddedAt = Date.now();
      loadFired = false;
      const options: import("leaflet").TileLayerOptions = {
        attribution: provider.attribution,
        maxZoom: 19,
      };
      if (provider.id === "carto") options.subdomains = "abcd";
      tileLayer = L.tileLayer(provider.url, options);
      tileLayer.on("tileloadstart", () => {
        pendingTiles += 1;
      });
      tileLayer.on("tileerror", () => {
        pendingTiles = Math.max(0, pendingTiles - 1);
        lastProgressAt = Date.now();
        consecutiveErrors += 1;
        const next = fallbackProvider(
          providers,
          providerIndex,
          consecutiveErrors,
        );
        if (next && !cancelled) {
          providerIndex += 1;
          addTileLayer(next);
        }
      });
      tileLayer.on("tileload", () => {
        pendingTiles = Math.max(0, pendingTiles - 1);
        lastProgressAt = Date.now();
        consecutiveErrors = 0;
      });
      tileLayer.on("load", () => {
        // Authoritative: the visible tile set is complete. Also resets
        // any pending count leaked by tiles pruned mid-flight (pan/zoom
        // removes them without a load/error event).
        pendingTiles = 0;
        lastProgressAt = Date.now();
        loadFired = true;
      });
      tileLayer.addTo(map);
    }

    // Stall watchdog: if tiles are outstanding but nothing has loaded
    // or errored for TILE_STALL_SWAP_MS, the provider is hung — probe
    // the next providers in order and swap to the first one whose
    // probe tile loads. A provider whose probe fails (e.g. OSM blocked
    // in Myanmar) is never selected, so a slow-but-working provider is
    // never abandoned for a blocked one; when nothing better answers
    // we stay put and re-arm, so the map recovers on its own when
    // connectivity returns. The second trigger covers a layer whose
    // `load` event never fired at all (pending counter blinded — e.g.
    // added while the container had zero area): a healthy layer fires
    // `load` within seconds, so 20s without it means the visible set
    // never completed. Once `load` has fired, the visible set is
    // complete and no swap is needed.
    async function checkStall() {
      if (cancelled || swapping || !map || !tileLayer) return;
      const stalled =
        shouldSwapOnStall(pendingTiles, Date.now() - lastProgressAt) ||
        shouldSwapOnMissingLoad(Date.now() - layerAddedAt, loadFired);
      if (!stalled) {
        return;
      }
      swapping = true;
      try {
        for (let i = providerIndex + 1; i < providers.length; i++) {
          if (cancelled) return;
          if (await probeProvider(providers[i])) {
            if (cancelled || !map) return;
            providerIndex = i;
            addTileLayer(providers[i]);
            return;
          }
        }
        // Nothing better answered: stay, and re-arm both grace periods
        // so we don't probe in a tight loop.
        lastProgressAt = Date.now();
        layerAddedAt = Date.now();
      } finally {
        swapping = false;
      }
    }
    const stallTimer = setInterval(() => {
      void checkStall();
    }, 5000);

    // The map container can still be settling when this effect runs
    // (dynamic import + auth gating + font/layout shifts): Leaflet
    // only requests tiles for the size it sees at creation, and a
    // later growth fires no Leaflet event — the map stays half-blank
    // with its small tile set already `load`ed, which also blinds the
    // stall watchdog (pendingTiles is 0). Leaflet already handles
    // window resize itself; this debounced listener is a backstop so
    // a resize during the probe delay is not missed either.
    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!cancelled && map) map.invalidateSize();
      }, 150);
    }
    window.addEventListener("resize", onResize);

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !divRef.current) return;
      Lmod = L;
      map = L.map(divRef.current, { scrollWheelZoom: true }).setView(
        [propsRef.current.center.lat, propsRef.current.center.lng],
        13,
      );
      layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;
      if (propsRef.current.onPick) {
        map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
          propsRef.current.onPick?.(e.latlng.lat, e.latlng.lng);
        });
      }
      draw();
      // Tiles: tile.openstreetmap.org is unreachable from Myanmar ISPs
      // without a VPN, so probe the providers in order and use the
      // first one that answers. Markers/route above are already drawn —
      // only the tiles wait on the probe.
      const provider = await selectTileProvider();
      if (cancelled || !map) return;
      providerIndex = Math.max(
        0,
        providers.findIndex((p) => p.id === provider.id),
      );
      addTileLayer(provider);
      // The container may have grown while the probe was running —
      // re-read its size now so Leaflet requests the full tile set
      // for the final layout, not the size at creation time. A second
      // check 500ms later covers layout still settling (fonts, grid);
      // invalidateSize is a no-op when the size did not change.
      map.invalidateSize();
      sizeTimer = setTimeout(() => {
        if (!cancelled && map) map.invalidateSize();
      }, 500);
    })();

    function draw() {
      if (!Lmod || !map || !layer) return;
      const L = Lmod;
      layer.clearLayers();
      const { markers: mk, routeCoordinates: rc, center: c } = propsRef.current;
      const bounds: Array<[number, number]> = [];
      if (rc && rc.length > 1) {
        L.polyline(rc, { color: "#1E4927", weight: 4, opacity: 0.85 }).addTo(layer);
        bounds.push(...rc);
      }
      for (const m of mk) {
        const color = m.color === "mint" ? "#C5EDCB" : m.color === "dark" ? "#14351c" : "#1E4927";
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:${m.color === "mint" ? "#1E4927" : "#fff"};border:2px solid #fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)">${m.label ? m.label.charAt(0) : "●"}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([m.lat, m.lng], { icon }).addTo(layer);
        if (m.label) {
          L.marker([m.lat, m.lng], { icon }).bindTooltip(m.label, { direction: "top", offset: [0, -16] }).addTo(layer);
        }
        bounds.push([m.lat, m.lng]);
      }
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.setView([c.lat, c.lng], 13);
      }
    }

    return () => {
      cancelled = true;
      clearInterval(stallTimer);
      if (sizeTimer) clearTimeout(sizeTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      if (map) map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers/route when props change.
  useEffect(() => {
    const map = mapRef.current as import("leaflet").Map | null;
    const layer = layerRef.current as import("leaflet").LayerGroup | null;
    if (!map || !layer) return;
    void import("leaflet").then((L) => {
      layer.clearLayers();
      const bounds: Array<[number, number]> = [];
      if (routeCoordinates && routeCoordinates.length > 1) {
        L.polyline(routeCoordinates, { color: "#1E4927", weight: 4, opacity: 0.85 }).addTo(layer);
        bounds.push(...routeCoordinates);
      }
      for (const m of markers) {
        const color = m.color === "mint" ? "#C5EDCB" : m.color === "dark" ? "#14351c" : "#1E4927";
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:${m.color === "mint" ? "#1E4927" : "#fff"};border:2px solid #fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)">${m.label ? m.label.charAt(0) : "●"}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(layer);
        if (m.label) marker.bindTooltip(m.label, { direction: "top", offset: [0, -16] });
        bounds.push([m.lat, m.lng]);
      }
      // D4: live views pass autoFit={false} so a moving driver marker
      // does not re-centre the map on every poll.
      if (!autoFit) return;
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
      else if (bounds.length === 1) map.setView(bounds[0], 14);
    });
  }, [markers, routeCoordinates, autoFit]);

  return (
    <div className="min-w-0 overflow-hidden rounded-[20px] ring-1 ring-forest/10 dark:ring-mint/10">
      <div ref={divRef} style={{ height }} className="w-full" aria-label="Map" />
      {onPick ? (
        <p className="bg-mint-soft px-4 py-2 text-xs text-forest dark:bg-forest-soft dark:text-mint">
          Tap the map to pick a location.
        </p>
      ) : null}
    </div>
  );
}
